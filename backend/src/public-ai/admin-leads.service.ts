import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PublicLeadStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';

export interface ListLeadsOpts {
  status?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Admin-side management for PublicLead rows. Lives next to the
 * public module because the only reason this service exists is to
 * give sales reps a place to convert a customer-submitted lead
 * into a Quote (and record contact attempts).
 *
 * Sits behind a JWT guard at the controller level - everything in
 * here assumes `dealerId` came from a verified token.
 */
@Injectable()
export class AdminLeadsService {
  private readonly logger = new Logger(AdminLeadsService.name);

  constructor(
    private prisma: PrismaService,
    private quotes: QuotesService,
  ) {}

  /**
   * GET /admin/leads - paginated list with optional status / date
   * filters. Status values match the PublicLeadStatus enum
   * (PENDING / READY / CONTACTED / CONVERTED / ARCHIVED / FAILED).
   */
  async list(dealerId: string | null, isAdmin: boolean, opts: ListLeadsOpts = {}) {
    const page = Math.max(1, Number(opts.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(opts.pageSize) || 25));
    const where: any = isAdmin ? {} : { convertedQuote: { dealerId: dealerId! } };
    if (opts.status) {
      const up = String(opts.status).toUpperCase();
      where.renderStatus = up;
    }
    if (opts.from || opts.to) {
      where.createdAt = {};
      if (opts.from) where.createdAt.gte = new Date(opts.from);
      if (opts.to) where.createdAt.lte = new Date(opts.to);
    }
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.publicLead.count({ where }),
      this.prisma.publicLead.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          contactedBy: { select: { id: true, fullName: true, email: true } },
          convertedQuote: { select: { id: true, reference: true, status: true } },
        },
      }),
    ]);
    return {
      total,
      page,
      pageSize,
      leads: rows.map(this.serializeLead),
    };
  }

  /**
   * GET /admin/leads/:id - full lead detail including sales-rep
   * fields (notes, contactedBy). 404 if not found.
   */
  async get(id: string, dealerId: string | null, isAdmin: boolean) {
    const lead = await this.prisma.publicLead.findUnique({
      where: { id },
      include: {
        contactedBy: { select: { id: true, fullName: true, email: true } },
        convertedQuote: { select: { id: true, reference: true, status: true } },
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    this.assertDealerAccess(lead.convertedQuoteId, dealerId, isAdmin);
    return this.serializeLead(lead);
  }

  /**
   * POST /admin/leads/:id/convert-to-quote - create a draft Quote
   * owned by the calling admin's dealer, pre-fill with the
   * customer's contact info + the AI render, and link it back to
   * the lead.
   *
   * Re-uses QuotesService.create so the line-item + reference +
   * price-override logic stays consistent with quotes created
   * from the regular UI.
   */
  async convertToQuote(id: string, dealerId: string | null, isAdmin: boolean, createdById: string) {
    if (!dealerId && !isAdmin) {
      throw new ForbiddenException('Only dealer users can convert leads');
    }
    // For admin users we still need a dealerId to own the quote -
    // fall back to the first active dealer. This is a niche path
    // and we log it so the operator can see when it happens.
    let owningDealerId = dealerId;
    if (!owningDealerId) {
      const fallbackDealer = await this.prisma.dealer.findFirst({ where: { isActive: true }, select: { id: true } });
      if (!fallbackDealer) throw new BadRequestException('No dealer available to own the new quote');
      owningDealerId = fallbackDealer.id;
      this.logger.warn(`[lead:${id}] admin convert - defaulting to dealer ${owningDealerId}`);
    }
    const lead = await this.prisma.publicLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    if (lead.renderStatus === PublicLeadStatus.CONVERTED && lead.convertedQuoteId) {
      // Idempotent: re-converting returns the existing quote so
      // the UI doesn't double-charge the customer's pipeline.
      const existing = await this.prisma.quote.findUnique({ where: { id: lead.convertedQuoteId }, select: { id: true } });
      if (existing) {
        return { quoteId: existing.id, leadId: lead.id, alreadyConverted: true };
      }
    }
    if (lead.renderStatus === PublicLeadStatus.ARCHIVED) {
      throw new BadRequestException('Cannot convert an archived lead');
    }

    const aiImageUrls = lead.renderUrl ? [lead.renderUrl] : [];
    const noteText = `Created from public AI generation lead ${lead.id}.`;
    const quote = await this.quotes.create(owningDealerId, createdById, {
      customerName: lead.firstName || 'Public lead',
      customerEmail: lead.email || 'unknown@example.invalid',
      customerPhone: lead.phone || undefined,
      notes: noteText,
      selectedDesignId: undefined,
      renderUrl: lead.renderUrl || undefined,
      fenceSegments: [],
    });

    // Stamp the AI image array onto the quote. The create() call
    // above doesn't accept aiImageUrls directly so we update it
    // post-insert (single SQL statement, no race window).
    await this.prisma.quote.update({
      where: { id: quote.id },
      data: { aiImageUrls: aiImageUrls as any },
    });

    await this.prisma.publicLead.update({
      where: { id: lead.id },
      data: {
        renderStatus: PublicLeadStatus.CONVERTED,
        convertedQuoteId: quote.id,
      },
    });

    this.logger.log(`[lead:${id}] converted to quote ${quote.id}`);
    return { quoteId: quote.id, leadId: lead.id, alreadyConverted: false };
  }

  /**
   * POST /admin/leads/:id/mark-contacted - record that a sales rep
   * reached out. Sets contactedAt, contactedById, optional notes,
   * and bumps the pipeline status to CONTACTED.
   */
  async markContacted(id: string, dealerId: string | null, isAdmin: boolean, userId: string, notes?: string) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    this.assertDealerAccess(lead.convertedQuoteId, dealerId, isAdmin);
    if (lead.renderStatus === PublicLeadStatus.ARCHIVED) {
      throw new BadRequestException('Cannot mark an archived lead as contacted');
    }
    const updated = await this.prisma.publicLead.update({
      where: { id },
      data: {
        contactedAt: new Date(),
        contactedById: userId,
        notes: notes ?? lead.notes,
        // If the lead was already converted we keep CONVERTED -
        // marking contacted is still useful audit info but the
        // pipeline state shouldn't regress.
        renderStatus: lead.renderStatus === PublicLeadStatus.CONVERTED
          ? PublicLeadStatus.CONVERTED
          : PublicLeadStatus.CONTACTED,
      },
      include: {
        contactedBy: { select: { id: true, fullName: true, email: true } },
        convertedQuote: { select: { id: true, reference: true, status: true } },
      },
    });
    return this.serializeLead(updated);
  }

  /**
   * POST /admin/leads/:id/archive - soft-delete. Sets archivedAt
   * + renderStatus=ARCHIVED. Reversible by an admin in a dedicated
   * restore tool if / when one is added.
   */
  async archive(id: string, dealerId: string | null, isAdmin: boolean) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    this.assertDealerAccess(lead.convertedQuoteId, dealerId, isAdmin);
    const updated = await this.prisma.publicLead.update({
      where: { id },
      data: { archivedAt: new Date(), renderStatus: PublicLeadStatus.ARCHIVED },
      include: {
        contactedBy: { select: { id: true, fullName: true, email: true } },
        convertedQuote: { select: { id: true, reference: true, status: true } },
      },
    });
    return this.serializeLead(updated);
  }

  /**
   * For non-admin callers, the convertedQuote's dealerId must
   * match the caller's dealerId. Admins see everything.
   */
  private async assertDealerAccess(convertedQuoteId: string | null, dealerId: string | null, isAdmin: boolean) {
    if (isAdmin || !dealerId) return;
    if (!convertedQuoteId) {
      // Not yet converted - sales reps from any dealer can pick
      // up an unconverted lead. Once it's converted the scope
      // locks down to the dealer who owns the resulting quote.
      return;
    }
    const quote = await this.prisma.quote.findUnique({ where: { id: convertedQuoteId }, select: { dealerId: true } });
    if (!quote || quote.dealerId !== dealerId) {
      throw new ForbiddenException('Lead belongs to a different dealer');
    }
  }

  private serializeLead = (lead: any) => ({
    id: lead.id,
    email: lead.email,
    phone: lead.phone,
    firstName: lead.firstName,
    yardSide: lead.yardSide,
    photoSource: lead.photoSource,
    inputPhotoPath: lead.inputPhotoPath,
    inputGalleryId: lead.inputGalleryId,
    designStyle: lead.designStyle,
    status: lead.renderStatus,
    renderUrl: lead.renderUrl,
    renderError: lead.renderError,
    generatedAt: lead.generatedAt,
    contactedAt: lead.contactedAt,
    contactedBy: lead.contactedBy || null,
    notes: lead.notes,
    convertedQuoteId: lead.convertedQuoteId,
    convertedQuote: lead.convertedQuote || null,
    archivedAt: lead.archivedAt,
    createdAt: lead.createdAt,
    updatedAt: lead.updatedAt,
  });
}
