import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Quote, QuoteStatus, Role } from '@prisma/client';
import { v4 as uuid } from 'uuid';

export interface FenceSegment {
  x1: number; y1: number;
  x2: number; y2: number;
  lengthM: number;
  productId?: string;
  heightOption?: string;
  colorOption?: string;
}



export interface CreateQuoteInput {
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  projectAddress?: string;
  notes?: string;
  selectedDesignId?: string;
  floorPlanWidthM?: number;
  floorPlanHeightM?: number;
  validUntil?: string;
  taxRate?: number;
  fenceSegments: FenceSegment[];
  floorPlanUrl?: string;
  renderUrl?: string;
  threeJsCode?: string;
}

// Status transition graph - prevents regression (DRAFT <- SENT) and
// illegal jumps. APPROVED and REJECTED are terminal; only an admin
// can move out of them.
const ALLOWED_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  DRAFT:    [QuoteStatus.DRAFT, QuoteStatus.SENT, QuoteStatus.EXPIRED],
  SENT:     [QuoteStatus.SENT, QuoteStatus.APPROVED, QuoteStatus.REJECTED, QuoteStatus.EXPIRED],
  APPROVED: [QuoteStatus.APPROVED, QuoteStatus.EXPIRED],
  REJECTED: [QuoteStatus.REJECTED, QuoteStatus.DRAFT, QuoteStatus.EXPIRED],
  EXPIRED:  [QuoteStatus.EXPIRED, QuoteStatus.DRAFT],
};

@Injectable()
export class QuotesService {
  constructor(private prisma: PrismaService) {}

  private nextReference(): string {
    const year = new Date().getFullYear();
    return `YARDEX-${year}-${uuid().slice(0, 8).toUpperCase()}`;
  }

  /**
   * List quotes visible to this user. Admins see everything;
   * dealer users see only their own. Supports optional
   * filters: status (single or array of statuses), search
   * (matches reference / customer name / email), and a
   * `sort` param for the dashboard's sort dropdown.
   *
   * Keeping the filtering on the server means a dealer
   * with thousands of quotes can still scroll the dashboard
   * quickly. The default ordering is newest-first.
   */
  async list(
    dealerId: string | null,
    isAdmin: boolean,
    opts: { status?: string; q?: string; sort?: string; limit?: number } = {},
  ) {
    const where: any = isAdmin ? {} : { dealerId: dealerId! };
    if (opts.status) {
      const statuses = opts.status.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      if (statuses.length === 1) where.status = statuses[0];
      else if (statuses.length > 1) where.status = { in: statuses };
    }
    if (opts.q) {
      const q = opts.q.trim();
      if (q) {
        where.OR = [
          { reference: { contains: q, mode: 'insensitive' } },
          { customerName: { contains: q, mode: 'insensitive' } },
          { customerEmail: { contains: q, mode: 'insensitive' } },
        ];
      }
    }
    const sort = opts.sort || 'newest';
    const orderBy: any =
      sort === 'oldest'      ? { createdAt: 'asc' } :
      sort === 'total-desc'  ? { total: 'desc' } :
      sort === 'total-asc'   ? { total: 'asc' } :
      sort === 'customer'    ? { customerName: 'asc' } :
                               { createdAt: 'desc' };
    return this.prisma.quote.findMany({
      where,
      orderBy,
      take: Math.min(Math.max(opts.limit ?? 200, 1), 500),
      include: { lineItems: true, selectedDesign: true },
    });
  }

  async get(id: string, dealerId: string | null, isAdmin: boolean) {
    const q = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        lineItems: { include: { product: true } },
        selectedDesign: true,
        dealer: { include: { template: true } },
      },
    });
    if (!q) throw new NotFoundException('Quote not found');
    if (!isAdmin && q.dealerId !== dealerId) {
      throw new ForbiddenException('Not your quote');
    }
    return q;
  }

  async remove(id: string, dealerId: string | null, isAdmin: boolean) {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quote not found');
    if (!isAdmin && q.dealerId !== dealerId) throw new ForbiddenException('Not your quote');
    // Only DRAFT quotes can be deleted - SENT/APPROVED quotes are part
    // of the audit trail and the customer may be looking at them.
    if (q.status !== QuoteStatus.DRAFT) {
      throw new BadRequestException(`Cannot delete ${q.status === 'APPROVED' ? 'an' : 'a'} ${q.status} quote. Use status transitions instead.`);
    }
    await this.prisma.quote.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Public read - used by customer approval link (no auth).
   * Only quotes in SENT status are visible; DRAFT/EXPIRED quotes are
   * not yet (or no longer) meant for the customer.
   */
  async getPublic(id: string) {
    const q = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        lineItems: true,
        selectedDesign: true,
        dealer: { select: { name: true, logoUrl: true, template: true } },
      },
    });
    if (!q) throw new NotFoundException('Quote not found');
    // The customer can see SENT (awaiting decision), APPROVED
    // (already approved - read-only view), and REJECTED
    // (declined - to confirm their decision took effect).
    if (q.status !== QuoteStatus.SENT && q.status !== QuoteStatus.APPROVED && q.status !== QuoteStatus.REJECTED) {
      throw new BadRequestException('Quote is not available for customer view');
    }
    return {
      id: q.id,
      reference: q.reference,
      customerName: q.customerName,
      projectAddress: q.projectAddress,
      status: q.status,
      validUntil: q.validUntil,
      // approvedAt is shown on the public "this quote has been
      // approved" banner. It's not PII - the customer just signed
      // the quote and wants to see the timestamp.
      approvedAt: q.approvedAt,
      lineItems: q.lineItems.map(li => ({
        description: li.description,
        quantity: Number(li.quantity),
        unitPrice: Number(li.unitPrice),
        lineTotal: Number(li.lineTotal),
        heightOption: li.heightOption,
        colorOption: li.colorOption,
      })),
      subtotal: Number(q.subtotal),
      taxRate: Number(q.taxRate),
      taxAmount: Number(q.taxAmount),
      total: Number(q.total),
      selectedDesign: q.selectedDesign ? { id: q.selectedDesign.id, name: q.selectedDesign.name, overlayUrl: q.selectedDesign.overlayUrl } : null,
      renderUrl: q.renderUrl,
      threeJsCode: q.threeJsCode || null,
      // Per-line-item AI renders (customer-facing). Empty strings
      // in the array mean the dealer hasn't generated that one
      // yet - the UI shows a placeholder.
      aiImageUrls: q.aiImageUrls || [],
      aiOverviewImageUrl: q.aiOverviewImageUrl || null,
      // Vision-model analyses of customer-uploaded house photos.
      // The customer doesn't see the raw dealer notes (they're
      // internal) - only the inferred style/color/height etc.
      photoAnalyses: Array.isArray(q.photoAnalyses) ? (q.photoAnalyses as any[]).map((a) => ({
        url: a.url, style: a.style, color: a.color, heightFt: a.heightFt, surroundings: a.surroundings, confidence: a.confidence, createdAt: a.createdAt,
      })) : [],
      // Public-safe dealer block: name + logo only. The dealer's
      // direct contact email/phone is internal PII and must not be
      // exposed to anyone holding the approval link.
      dealer: q.dealer ? {
        name: q.dealer.name,
        logoUrl: q.dealer.logoUrl,
        termsHtml: q.dealer.template?.termsHtml || null,
      } : null,
    };
  }

  async create(dealerId: string | null, createdById: string, dto: CreateQuoteInput) {
    // Admins (dealerId=null) do not own quotes. Refuse early
    // with a 403 rather than letting the Prisma transaction blow
    // up on `priceOverride.findMany({ where: { dealerId: null }})`.
    if (!dealerId) {
      throw new ForbiddenException('Only dealer users can create quotes');
    }
    // Drafts can be created with zero segments - the dealer
    // is still working on them. We only require segments when
    // sending the quote to the customer (enforced in update /
    // updateStatus below).
    return this.prisma.$transaction(async (tx) => {
      const productIds = Array.from(new Set([
        ...dto.fenceSegments.map(s => s.productId).filter(Boolean) as string[],
      ]));
      const products = productIds.length
        ? await tx.product.findMany({ where: { id: { in: productIds } } })
        : [];
      // Defensive: if for any reason dealerId is null inside
      // the transaction (shouldn't happen now, but keeps the
      // service safe to call from internal contexts) skip the
      // price-override lookup rather than crash.
      const overrides = productIds.length && dealerId
        ? await tx.priceOverride.findMany({ where: { dealerId, productId: { in: productIds } } })
        : [];
      const priceMap = new Map<string, number>();
      for (const p of products) {
        const ov = overrides.find(o => o.productId === p.id);
        priceMap.set(p.id, ov ? Number(ov.price) : Number(p.basePrice));
      }

      const lineItems: any[] = [];
      const byProduct = new Map<string, { product: any; lengthM: number; seg: FenceSegment }>();
      for (const seg of dto.fenceSegments) {
        if (!seg.productId) continue;
        const p = products.find(pp => pp.id === seg.productId);
        if (!p) throw new BadRequestException(`Unknown product ${seg.productId}`);
        if (seg.lengthM <= 0) {
          throw new BadRequestException('Fence segment length must be positive');
        }
        const existing = byProduct.get(seg.productId);
        if (existing) {
          existing.lengthM += seg.lengthM;
        } else {
          byProduct.set(seg.productId, { product: p, lengthM: seg.lengthM, seg });
        }
      }
      for (const [, { product, lengthM, seg }] of byProduct) {
        const unitPrice = priceMap.get(product.id)!;
        let quantity: number;
        let description: string;
        if (product.unit === 'linear_ft' || product.unit === 'm') {
          quantity = +lengthM.toFixed(2);
          description = `${product.name} (${lengthM.toFixed(2)} m)`;
        } else {
          const coverage = 2.4;
          quantity = Math.ceil(lengthM / coverage);
          description = `${product.name} (${quantity} pcs covering ${lengthM.toFixed(2)} m)`;
        }
        const lineTotal = +(quantity * unitPrice).toFixed(2);
        lineItems.push({
          productId: product.id,
          description,
          quantity,
          unitPrice,
          lineTotal,
          heightOption: seg.heightOption,
          colorOption: seg.colorOption,
        });
      }

      // lineItems is only required when the input has segments.
      // A draft can be created with zero segments; line items
      // are derived later when the user adds segments and saves.
      const subtotal = +lineItems.reduce((s, li) => s + li.lineTotal, 0).toFixed(2);
      const taxRate = dto.taxRate ?? 0;
      const taxAmount = +(subtotal * (taxRate / 100)).toFixed(2);
      const total = +(subtotal + taxAmount).toFixed(2);

      const quote = await tx.quote.create({
        data: {
          reference: this.nextReference(),
          dealerId,
          createdById,
          customerName: dto.customerName,
          customerEmail: dto.customerEmail,
          customerPhone: dto.customerPhone,
          projectAddress: dto.projectAddress,
          notes: dto.notes,
          selectedDesignId: dto.selectedDesignId,
          floorPlanUrl: dto.floorPlanUrl,
          floorPlanWidthM: dto.floorPlanWidthM,
          floorPlanHeightM: dto.floorPlanHeightM,
          fenceSegments: dto.fenceSegments as any,
          renderUrl: dto.renderUrl,
          threeJsCode: dto.threeJsCode || null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          subtotal, taxRate, taxAmount, total,
          status: QuoteStatus.DRAFT,
          lineItems: { create: lineItems },
        },
        include: { lineItems: true, selectedDesign: true },
      });
      return quote;
    });
  }

  async updateStatus(id: string, dealerId: string | null, isAdmin: boolean, status: QuoteStatus) {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quote not found');
    if (!isAdmin && q.dealerId !== dealerId) throw new ForbiddenException('Not your quote');
    const allowed = ALLOWED_TRANSITIONS[q.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(`Cannot move quote from ${q.status} to ${status}`);
    }
    // Sending to the customer requires at least one fence
    // segment with a product reference. Without it the
    // approval page would show an empty line-items table.
    if (status === QuoteStatus.SENT) {
      const segs = (q.fenceSegments as any[]) || [];
      if (!segs.length) {
        throw new BadRequestException('Add at least one fence segment before sending to the customer');
      }
      if (!segs.some(s => s.productId)) {
        throw new BadRequestException('At least one fence segment must reference a product before sending');
      }
    }
    return this.prisma.quote.update({
      where: { id },
      data: {
        status,
        approvedAt: status === QuoteStatus.APPROVED ? new Date() : q.approvedAt,
      },
    });
  }

  async approvePublic(id: string, signatureDataUrl: string) {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quote not found');
    if (q.status !== QuoteStatus.SENT) throw new BadRequestException('Quote is not awaiting approval');
    // Sanity-cap the signature payload. The frontend canvas is small,
    // so anything > 1MB is almost certainly abuse (huge base64 DoS).
    if (typeof signatureDataUrl !== 'string' || signatureDataUrl.length > 1_500_000) {
      throw new BadRequestException('Signature payload is missing or too large');
    }
    if (!/^data:image\/\w+;base64,[A-Za-z0-9+/=._-]+$/.test(signatureDataUrl)) {
      throw new BadRequestException('Signature must be a data:image/<type>;base64 URL');
    }
    const base64 = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) throw new BadRequestException('Decoded signature is empty');
    // Server-side ink check: a real signature covers at least a
    // couple hundred non-white pixels. The frontend enforces the
    // same rule client-side, but trusting only the client means
    // a malicious link-holder can ship a 1x1 transparent PNG and
    // trick the server into "approving" a blank signature.
    const ink = this.countInkPixels(buf);
    if (ink < 200) {
      throw new BadRequestException(`Signature is empty or unreadable (only ${ink} ink pixels). Please sign before approving.`);
    }
    const filename = `sig-${id}-${Date.now()}.png`;
    const fs = await import('fs/promises');
    const path = await import('path');
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    await fs.mkdir(path.join(dataDir, 'signatures'), { recursive: true });
    await fs.writeFile(path.join(dataDir, 'signatures', filename), buf);
    const updated = await this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.APPROVED, approvedAt: new Date(), approvedSignatureUrl: `/static/signatures/${filename}` },
    });
    // Return only the public-safe view of the quote - never the raw
    // Prisma row, which leaks notes, customerEmail, customerPhone,
    // floorPlanUrl, raw fence coordinates, and the signature URL.
    return this.getPublic(id);
  }

  /**
   * Customer-facing rejection. Marks the quote REJECTED and stores
   * the reason in `notes` (dealer-visible). No signature
   * required - rejection is a withdrawal of consent, not an
   * agreement. Returns the public-safe view.
   */
  async rejectPublic(id: string, reason?: string) {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quote not found');
    if (q.status !== QuoteStatus.SENT) throw new BadRequestException('Quote is not awaiting a decision');
    const trimmed = (reason || '').trim();
    if (trimmed.length > 2000) throw new BadRequestException('Reason is too long');
    const newNotes = trimmed
      ? `${q.notes ? q.notes + '\n' : ''}[Customer declined: ${trimmed.replace(/\n/g, ' ')}]`
      : q.notes;
    await this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.REJECTED, notes: newNotes },
    });
    return this.getPublic(id);
  }

  /**
   * Dealer-driven rejection. Same state transition as
   * customer-driven, but attributed to the owner. The reason
   * (if any) goes into the notes for the audit trail.
   */
  async rejectByOwner(id: string, reason: string | undefined, isAdmin: boolean, dealerId: string | null) {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quote not found');
    if (!isAdmin && q.dealerId !== dealerId) throw new ForbiddenException('Not your quote');
    if (q.status !== QuoteStatus.SENT) throw new BadRequestException(`Cannot reject a ${q.status} quote`);
    const trimmed = (reason || '').trim();
    if (trimmed.length > 2000) throw new BadRequestException('Reason is too long');
    const newNotes = trimmed
      ? `${q.notes ? q.notes + '\n' : ''}[Dealer marked as rejected: ${trimmed.replace(/\n/g, ' ')}]`
      : q.notes;
    return this.prisma.quote.update({
      where: { id },
      data: { status: QuoteStatus.REJECTED, notes: newNotes },
    });
  }

  /**
   * Partial update of a DRAFT quote. Once a quote is SENT the line
   * items and total are frozen (the customer may already be looking
   * at the approval link) so we refuse to mutate the commercial
   * fields. We do allow light updates (notes, renderUrl) even after
   * SENT so the dealer can attach a finalised render.
   */
  async update(id: string, dealerId: string | null, isAdmin: boolean, dto: Partial<CreateQuoteInput>) {
    const q = await this.prisma.quote.findUnique({ where: { id } });
    if (!q) throw new NotFoundException('Quote not found');
    if (!isAdmin && q.dealerId !== dealerId) throw new ForbiddenException('Not your quote');

    const isDraft = q.status === QuoteStatus.DRAFT;
    if (!isDraft) {
      // Once sent, only metadata fields (notes, renderUrl,
      // threeJsCode) can be patched.
      const allowed: (keyof CreateQuoteInput)[] = ['notes', 'renderUrl', 'threeJsCode'];
      const attempted = Object.keys(dto) as (keyof CreateQuoteInput)[];
      const blocked = attempted.filter(k => !allowed.includes(k));
      if (blocked.length) {
        throw new BadRequestException(
          `Cannot edit ${blocked.join(', ')} on a ${q.status} quote. Reject or expire and create a new draft.`,
        );
      }
    }

    // If fenceSegments are being updated, recompute line items + totals.
    // This keeps the price-derivation logic in one place.
    let lineUpdate: any = undefined;
    let totals: { subtotal: number; taxAmount: number; total: number; taxRate: number } | undefined;
    const data: any = {};
    if (dto.customerName !== undefined) data.customerName = dto.customerName;
    if (dto.customerEmail !== undefined) data.customerEmail = dto.customerEmail;
    if (dto.customerPhone !== undefined) data.customerPhone = dto.customerPhone;
    if (dto.projectAddress !== undefined) data.projectAddress = dto.projectAddress;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.selectedDesignId !== undefined) data.selectedDesignId = dto.selectedDesignId;
    if (dto.floorPlanUrl !== undefined) data.floorPlanUrl = dto.floorPlanUrl;
    if (dto.floorPlanWidthM !== undefined) data.floorPlanWidthM = dto.floorPlanWidthM;
    if (dto.floorPlanHeightM !== undefined) data.floorPlanHeightM = dto.floorPlanHeightM;
    if (dto.renderUrl !== undefined) data.renderUrl = dto.renderUrl;
    if (dto.threeJsCode !== undefined) data.threeJsCode = dto.threeJsCode || null;
    if (dto.validUntil !== undefined) data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    if (dto.taxRate !== undefined) data.taxRate = dto.taxRate;

    if (dto.fenceSegments && isDraft) {
      if (!dto.fenceSegments.length) {
        throw new BadRequestException('At least one fence segment is required');
      }
      const productIds = Array.from(new Set([
        ...dto.fenceSegments.map(s => s.productId).filter(Boolean) as string[],
      ]));
      const products = productIds.length
        ? await this.prisma.product.findMany({ where: { id: { in: productIds } } })
        : [];
      const overrides = productIds.length
        ? await this.prisma.priceOverride.findMany({ where: { dealerId: q.dealerId, productId: { in: productIds } } })
        : [];
      const priceMap = new Map<string, number>();
      for (const p of products) {
        const ov = overrides.find(o => o.productId === p.id);
        priceMap.set(p.id, ov ? Number(ov.price) : Number(p.basePrice));
      }

      const byProduct = new Map<string, { product: any; lengthM: number; seg: FenceSegment }>();
      for (const seg of dto.fenceSegments) {
        if (!seg.productId) continue;
        const p = products.find(pp => pp.id === seg.productId);
        if (!p) throw new BadRequestException(`Unknown product ${seg.productId}`);
        if (seg.lengthM <= 0) throw new BadRequestException('Fence segment length must be positive');
        const existing = byProduct.get(seg.productId);
        if (existing) existing.lengthM += seg.lengthM;
        else byProduct.set(seg.productId, { product: p, lengthM: seg.lengthM, seg });
      }
      const lineItems: any[] = [];
      for (const [, { product, lengthM, seg }] of byProduct) {
        const unitPrice = priceMap.get(product.id)!;
        let quantity: number;
        let description: string;
        if (product.unit === 'linear_ft' || product.unit === 'm') {
          quantity = +lengthM.toFixed(2);
          description = `${product.name} (${lengthM.toFixed(2)} m)`;
        } else {
          const coverage = 2.4;
          quantity = Math.ceil(lengthM / coverage);
          description = `${product.name} (${quantity} pcs covering ${lengthM.toFixed(2)} m)`;
        }
        const lineTotal = +(quantity * unitPrice).toFixed(2);
        lineItems.push({
          productId: product.id,
          description,
          quantity,
          unitPrice,
          lineTotal,
          heightOption: seg.heightOption,
          colorOption: seg.colorOption,
        });
      }
      if (!lineItems.length) throw new BadRequestException('Fence segments must reference at least one product');
      data.fenceSegments = dto.fenceSegments as any;
      const subtotal = +lineItems.reduce((s, li) => s + li.lineTotal, 0).toFixed(2);
      const taxRate = dto.taxRate ?? Number(q.taxRate);
      const taxAmount = +(subtotal * (taxRate / 100)).toFixed(2);
      const total = +(subtotal + taxAmount).toFixed(2);
      data.subtotal = subtotal;
      data.taxAmount = taxAmount;
      data.total = total;
      data.taxRate = taxRate;
      lineUpdate = lineItems;
    } else if (dto.taxRate !== undefined && isDraft) {
      // No segment change, just a tax-rate tweak - recompute totals.
      const subtotal = Number(q.subtotal);
      const taxAmount = +(subtotal * (dto.taxRate / 100)).toFixed(2);
      const total = +(subtotal + taxAmount).toFixed(2);
      data.taxAmount = taxAmount;
      data.total = total;
    }

    return this.prisma.$transaction(async (tx) => {
      if (lineUpdate) {
        await tx.quoteLineItem.deleteMany({ where: { quoteId: id } });
        await tx.quoteLineItem.createMany({ data: lineUpdate.map((li: any) => ({ ...li, quoteId: id })) });
      }
      return tx.quote.update({
        where: { id },
        data,
        include: { lineItems: true, selectedDesign: true },
      });
    });
  }

  /**
   * Clone an existing quote into a fresh DRAFT for the same dealer.
   * Useful when the customer wants a variant (e.g. swap from picket
   * to privacy) without starting from scratch. The clone starts as
   * DRAFT so the dealer can edit freely. Line items are
   * recomputed (prices may have changed since the original).
   *
   * Returns a stripped-down view (no internal fields).
   */
  async clone(id: string, dealerId: string | null, isAdmin: boolean) {
    // fenceSegments is a Json column on the Quote model (not a
    // relation), so we fetch the full row.
    const src = await this.prisma.quote.findUnique({ where: { id } });
    if (!src) throw new NotFoundException('Quote not found');
    if (!isAdmin && src.dealerId !== dealerId) throw new ForbiddenException('Not your quote');
    // Segments already have x1/y1/x2/y2/lengthM; preserve the per-segment
    // productId/heightOption/colorOption as the new defaults.
    const segments = ((src.fenceSegments as any[]) || []).map(s => ({
      x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, lengthM: s.lengthM,
      productId: s.productId,
      heightOption: s.heightOption,
      colorOption: s.colorOption,
    }));
    if (!segments.length) {
      throw new BadRequestException('Cannot clone a quote with no fence segments');
    }
    return this.create(dealerId!, src.createdById, {
      customerName: src.customerName,
      customerEmail: src.customerEmail,
      customerPhone: src.customerPhone,
      projectAddress: src.projectAddress,
      notes: src.notes ? `${src.notes}\n(cloned from ${src.reference})` : `(cloned from ${src.reference})`,
      selectedDesignId: src.selectedDesignId || undefined,
      floorPlanUrl: src.floorPlanUrl || undefined,
      floorPlanWidthM: src.floorPlanWidthM || undefined,
      floorPlanHeightM: src.floorPlanHeightM || undefined,
      renderUrl: src.renderUrl || undefined,
      threeJsCode: src.threeJsCode || undefined,
      validUntil: src.validUntil ? src.validUntil.toISOString() : undefined,
      taxRate: Number(src.taxRate),
      fenceSegments: segments as any,
    });
  }


  /**
   * Count the non-white pixels in a PNG buffer. Used by
   * approvePublic to reject "signatures" that are entirely blank.
   * A 1x1 transparent PNG passes the base64-decode and length
   * checks but has zero ink, so we cross-check before persisting.
   *
   * We use the raw `zlib` module (built into Node) to inflate
   * the PNG IDAT chunks - no extra dependency needed. If the
   * decode fails for any reason (corrupt PNG, weird format) we
   * fall through to a 0 ink count, which is then caught by the
   * 200-pixel threshold.
   */
  private countInkPixels(buf: Buffer): number {
    try {
      if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return 0;
      // Parse IHDR
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      const bitDepth = buf.readUInt8(24);
      const colorType = buf.readUInt8(25);
      if (bitDepth !== 8) return 0; // only handle 8-bit RGBA/RGB
      // Concatenate all IDAT chunks
      const chunks: Buffer[] = [];
      let off = 8;
      while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        if (type === 'IDAT') chunks.push(buf.slice(off + 8, off + 8 + len));
        else if (type === 'IEND') break;
        off += 12 + len;
      }
      const zlib = require('zlib');
      const raw = zlib.inflateSync(Buffer.concat(chunks));
      const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
      if (!bpp) return 0;
      const stride = w * bpp + 1; // +1 for filter byte
      let ink = 0;
      // Sample up to 200k pixels (avoids spending seconds on huge images)
      const sampleStride = Math.max(1, Math.floor((w * h) / 200000));
      for (let y = 0; y < h; y++) {
        const rowStart = y * stride + 1; // skip filter byte
        for (let x = 0; x < w; x++) {
          if (((y * w + x) % sampleStride) !== 0) continue;
          const p = rowStart + x * bpp;
          const r = raw[p], g = raw[p + 1], b = raw[p + 2];
          // Any pixel that isn't near-white counts as ink
          if (r < 200 || g < 200 || b < 200) ink++;
        }
      }
      // Scale up the count so the threshold is meaningful
      return ink * sampleStride;
    } catch {
      return 0;
    }
  }

  /**
   * Mark all SENT quotes whose validUntil has passed as EXPIRED.
   * Returns the number of quotes expired. Idempotent - safe to call
   * from a cron or on each request.
   */
  async expireOverdue(now: Date = new Date()) {
    const result = await this.prisma.quote.updateMany({
      where: {
        status: QuoteStatus.SENT,
        validUntil: { not: null, lt: now },
      },
      data: { status: QuoteStatus.EXPIRED },
    });
    return result.count;
  }
}
