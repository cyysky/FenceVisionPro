import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { Role, QuoteStatus, InvoiceStatus } from '@prisma/client';
import { InvoiceStatusLiteral, INVOICE_TRANSITIONS } from './dto';

/**
 * Invoice service.
 *
 * Invoices are derived from a Quote. The workflow is:
 *   - Create from an APPROVED quote (line items + subtotal copy
 *     verbatim, tax is recomputed from the optional taxPercent
 *     or the quote's existing tax rate).
 *   - Status moves forward only, via POST /invoices/:id/transition.
 *   - Only DRAFT invoices are deletable.
 *
 * The `number` is generated as INV-<year>-<NNNN> per dealer. We
 * compute it from a count + 1 of the dealer's existing invoices
 * inside a transaction so two concurrent calls can't collide on
 * the unique index.
 */
@Injectable()
export class InvoicesService {
  constructor(private prisma: PrismaService) {}

  private authCtx(u: JwtPayload) {
    const isAdmin = u.role === Role.ADMIN;
    return { dealerId: u.dealerId, isAdmin };
  }

  async list(u: JwtPayload, opts: { status?: InvoiceStatusLiteral; quoteId?: string } = {}) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const where: any = isAdmin ? {} : { dealerId: dealerId! };
    if (opts.status) where.status = opts.status;
    if (opts.quoteId) where.quoteId = opts.quoteId;
    return this.prisma.invoice.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { lineItems: true } },
        quote: { select: { id: true, reference: true, customerName: true } },
      },
    });
  }

  async get(id: string, u: JwtPayload) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: {
        lineItems: { orderBy: { position: 'asc' } },
        quote: { select: { id: true, reference: true, customerName: true, customerEmail: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (!isAdmin && invoice.dealerId !== dealerId) {
      throw new NotFoundException('Invoice not found');
    }
    return invoice;
  }

  /**
   * Materialise a new invoice from an APPROVED quote. The quote
   * must belong to the caller's tenant (or be any quote if admin).
   */
  async create(u: JwtPayload, dto: { quoteId: string; dueAt?: string; notes?: string; taxPercent?: number }) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const quote = await this.prisma.quote.findUnique({
      where: { id: dto.quoteId },
      include: { lineItems: { orderBy: { id: 'asc' } } },
    });
    if (!quote) throw new NotFoundException('Quote not found');
    if (!isAdmin && quote.dealerId !== dealerId) {
      throw new NotFoundException('Quote not found');
    }
    if (quote.status !== QuoteStatus.APPROVED) {
      throw new BadRequestException('Only APPROVED quotes can be invoiced');
    }

    const subtotal = Number(quote.subtotal);
    const taxPercent = dto.taxPercent ?? Number(quote.taxRate);
    const tax = +(subtotal * (taxPercent / 100)).toFixed(2);
    const total = +(subtotal + tax).toFixed(2);

    // Retry the whole transaction on number collisions. A different
    // dealer's parallel create can land on the same per-dealer suffix.
    // Postgres aborts the transaction on the first P2002, so we have to
    // retry the entire block, not just the failing statement.
    const year = new Date().getFullYear();
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    let lastErr: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          // Re-count inside the transaction so concurrent creates don't
          // produce the same suffix. Bump by `attempt` so a collision
          // from a different dealer's parallel create can be retried
          // with a new suffix on the next loop.
          const baseCount = await tx.invoice.count({
            where: { dealerId: quote.dealerId, createdAt: { gte: yearStart, lt: yearEnd } },
          });
          const number = `INV-${year}-${String(baseCount + attempt + 1).padStart(4, '0')}`;

          return tx.invoice.create({
            data: {
              dealerId: quote.dealerId,
              quoteId: quote.id,
              number,
              status: InvoiceStatus.DRAFT,
              subtotal,
              tax,
              total,
              dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
              notes: dto.notes ?? null,
              lineItems: {
                create: quote.lineItems.map((li, idx) => ({
                  description: li.description,
                  quantity: li.quantity,
                  unitPrice: li.unitPrice,
                  total: li.lineTotal,
                  position: idx,
                })),
              },
            },
            include: { lineItems: { orderBy: { position: 'asc' } } },
          });
        });
      } catch (e: any) {
        if (e?.code === 'P2002' || /current transaction is aborted/i.test(String(e?.message))) {
          lastErr = e;
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
  }

  /**
   * Edit only the safe-to-change fields on a DRAFT invoice.
   * Recomputing line items after creation is intentionally out
   * of scope (the user can re-create from the quote).
   */
  async update(id: string, u: JwtPayload, dto: { dueAt?: string; notes?: string }) {
    const existing = await this.get(id, u);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot edit a ${existing.status} invoice`);
    }
    const data: any = {};
    if (dto.dueAt !== undefined) data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
    if (dto.notes !== undefined) data.notes = dto.notes;
    return this.prisma.invoice.update({ where: { id: existing.id }, data });
  }

  async transition(id: string, u: JwtPayload, dto: { to: InvoiceStatusLiteral; note?: string }) {
    const existing = await this.get(id, u);
    const allowed = INVOICE_TRANSITIONS[existing.status as InvoiceStatusLiteral] || [];
    if (!allowed.includes(dto.to)) {
      throw new BadRequestException(`Cannot move invoice from ${existing.status} to ${dto.to}`);
    }
    const now = new Date();
    const data: any = { status: dto.to };
    if (dto.to === 'SENT' && !existing.issuedAt) data.issuedAt = now;
    if (dto.to === 'PAID' && !existing.paidAt) data.paidAt = now;
    return this.prisma.invoice.update({ where: { id: existing.id }, data });
  }

  /**
   * Delete a DRAFT invoice. Once sent, the invoice is part of
   * the audit trail and cannot be removed.
   */
  async remove(id: string, u: JwtPayload) {
    const existing = await this.get(id, u);
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException(`Cannot delete a ${existing.status} invoice`);
    }
    await this.prisma.invoice.delete({ where: { id: existing.id } });
    return { ok: true };
  }
}
