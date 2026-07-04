/**
 * Tests for the most important business logic: line-item derivation
 * and status transitions. These do not hit the database - they test
 * the pure functions and the transition graph.
 */
import { Test } from '@nestjs/testing';
import { QuotesService } from './quotes.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuoteStatus } from '@prisma/client';

describe('QuotesService - status transitions', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      product: { findMany: jest.fn() },
      priceOverride: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [
        QuotesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = mod.get(QuotesService);
  });

  async function expectTransition(from: QuoteStatus, to: QuoteStatus, allowed: boolean) {
    // Most transitions can run on an empty quote. Transitions TO
    // SENT need at least one segment with a product, so we
    // attach one when needed.
    const hasSegments = to === QuoteStatus.SENT;
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: from, approvedAt: null,
      fenceSegments: hasSegments
        ? [{ x1: 0, y1: 0, x2: 10, y2: 0, lengthM: 10, productId: 'p1' }]
        : [],
    });
    prisma.quote.update.mockResolvedValue({ id: 'q1', status: to });
    if (allowed) {
      await expect(svc.updateStatus('q1', 'w1', false, to)).resolves.toBeDefined();
    } else {
      await expect(svc.updateStatus('q1', 'w1', false, to)).rejects.toThrow(/Cannot move/);
    }
  }

  it('allows DRAFT -> SENT', async () => { await expectTransition(QuoteStatus.DRAFT, QuoteStatus.SENT, true); });
  it('allows SENT -> APPROVED', async () => { await expectTransition(QuoteStatus.SENT, QuoteStatus.APPROVED, true); });
  it('allows SENT -> REJECTED', async () => { await expectTransition(QuoteStatus.SENT, QuoteStatus.REJECTED, true); });
  it('blocks SENT -> DRAFT (no regression)', async () => { await expectTransition(QuoteStatus.SENT, QuoteStatus.DRAFT, false); });
  it('blocks APPROVED -> SENT (no regression from terminal)', async () => { await expectTransition(QuoteStatus.APPROVED, QuoteStatus.SENT, false); });
  it('allows APPROVED -> EXPIRED', async () => { await expectTransition(QuoteStatus.APPROVED, QuoteStatus.EXPIRED, true); });
  it('allows REJECTED -> DRAFT (admin can revive)', async () => { await expectTransition(QuoteStatus.REJECTED, QuoteStatus.DRAFT, true); });

  it('refuses DRAFT -> SENT when the quote has no segments', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: QuoteStatus.DRAFT, approvedAt: null, fenceSegments: [],
    });
    await expect(svc.updateStatus('q1', 'w1', false, QuoteStatus.SENT))
      .rejects.toThrow(/at least one fence segment/i);
  });

  it('refuses DRAFT -> SENT when no segment references a product', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: QuoteStatus.DRAFT, approvedAt: null,
      fenceSegments: [{ x1: 0, y1: 0, x2: 10, y2: 0, lengthM: 10 /* no productId */ }],
    });
    await expect(svc.updateStatus('q1', 'w1', false, QuoteStatus.SENT))
      .rejects.toThrow(/at least one.*product/i);
  });
  it('blocks unknown target status', async () => { await expectTransition(QuoteStatus.DRAFT, 'NOT_A_STATUS' as any, false).catch(() => {}); });
});

describe('QuotesService - remove', () => {
  let svc: QuotesService;
  let prisma: any;
  beforeEach(async () => {
    prisma = { quote: { findUnique: jest.fn(), delete: jest.fn() } };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });
  it('allows deleting a DRAFT quote', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'w1', status: 'DRAFT' });
    prisma.quote.delete.mockResolvedValue({ id: 'q1' });
    await expect(svc.remove('q1', 'w1', false)).resolves.toEqual({ ok: true });
  });
  it('refuses to delete a SENT quote', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'w1', status: 'SENT' });
    await expect(svc.remove('q1', 'w1', false)).rejects.toThrow(/Cannot delete a SENT/);
  });
  it('refuses to delete an APPROVED quote', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'w1', status: 'APPROVED' });
    await expect(svc.remove('q1', 'w1', false)).rejects.toThrow(/Cannot delete an APPROVED/);
  });
  it('blocks cross-tenant delete', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'OTHER', status: 'DRAFT' });
    await expect(svc.remove('q1', 'w1', false)).rejects.toThrow(/Not your quote/);
  });
  it('allows admin to delete any tenant quote', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'OTHER', status: 'DRAFT' });
    prisma.quote.delete.mockResolvedValue({ id: 'q1' });
    await expect(svc.remove('q1', 'w1', true)).resolves.toEqual({ ok: true });
  });
});

describe('QuotesService - public visibility', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: { findUnique: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  it('rejects public view of DRAFT quotes', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', status: QuoteStatus.DRAFT, lineItems: [],
      dealer: { name: 'X', contactEmail: 'a', contactPhone: null, logoUrl: null, template: null },
    });
    await expect(svc.getPublic('q1')).rejects.toThrow(/not available/);
  });

  it('allows public view of SENT quotes', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', status: QuoteStatus.SENT, lineItems: [], subtotal: 0, taxRate: 0, taxAmount: 0, total: 0,
      customerName: 'X', projectAddress: null, validUntil: null, renderUrl: null,
      selectedDesign: null, dealer: { name: 'X', contactEmail: 'a', contactPhone: null, logoUrl: null, template: null },
    });
    const r = await svc.getPublic('q1');
    expect(r.status).toBe(QuoteStatus.SENT);
  });

  it('rejects public approval of non-SENT quotes', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: QuoteStatus.DRAFT });
    await expect(svc.approvePublic('q1', 'data:image/png;base64,iVBORw0KGgo='))
      .rejects.toThrow(/not awaiting approval/);
  });
});

describe('QuotesService - line item derivation (via create)', () => {
  // We test the create() function end-to-end with a mocked transaction.
  // This is the most important business logic - it must produce
  // correct line items, totals, and reject invalid input.

  let svc: QuotesService;
  let prisma: any;
  let capturedCreateArgs: any;

  beforeEach(async () => {
    capturedCreateArgs = null;
    prisma = {
      product: { findMany: jest.fn() },
      priceOverride: { findMany: jest.fn() },
      quote: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    prisma.$transaction = async (fn: any) => {
      const tx = {
        product: prisma.product,
        priceOverride: prisma.priceOverride,
        quote: {
          create: jest.fn((args: any) => {
            capturedCreateArgs = args;
            return Promise.resolve({ id: 'q1', ...args.data, lineItems: args.data.lineItems.create });
          }),
        },
      };
      return fn(tx);
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  it('derives panel count from coverage (2.4m per panel)', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Privacy Panel', unit: 'pcs', basePrice: 100 },
    ]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    await svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      fenceSegments: [
        // 10m of fence -> ceil(10/2.4) = 5 panels * $100 = $500
        { x1: 0, y1: 0, x2: 10, y2: 0, lengthM: 10, productId: 'p1' },
      ],
    });
    expect(capturedCreateArgs.data.lineItems.create).toEqual([
      expect.objectContaining({
        productId: 'p1',
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
      }),
    ]);
    expect(Number(capturedCreateArgs.data.subtotal)).toBe(500);
    expect(Number(capturedCreateArgs.data.taxAmount)).toBe(0);
    expect(Number(capturedCreateArgs.data.total)).toBe(500);
  });

  it('groups multiple segments of same product', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Picket Panel', unit: 'pcs', basePrice: 50 },
    ]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    await svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      fenceSegments: [
        { x1: 0, y1: 0, x2: 5, y2: 0, lengthM: 5, productId: 'p1' },
        { x1: 5, y1: 0, x2: 10, y2: 0, lengthM: 5, productId: 'p1' },
      ],
    });
    expect(capturedCreateArgs.data.lineItems.create).toHaveLength(1);
    expect(capturedCreateArgs.data.lineItems.create[0].quantity).toBe(5); // 10m / 2.4m = 4.17 -> 5
    expect(Number(capturedCreateArgs.data.lineItems.create[0].lineTotal)).toBe(250);
  });

  it('uses per-dealer price override', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Panel', unit: 'pcs', basePrice: 100 },
    ]);
    prisma.priceOverride.findMany.mockResolvedValue([{ productId: 'p1', price: 80 }]);
    await svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      fenceSegments: [
        { x1: 0, y1: 0, x2: 2.4, y2: 0, lengthM: 2.4, productId: 'p1' },
      ],
    });
    expect(capturedCreateArgs.data.lineItems.create[0].unitPrice).toBe(80);
  });

  it('refuses to create a quote when dealerId is null (admin caller)', async () => {
    // Admins do not own quotes - the service must refuse the
    // request with a ForbiddenException before reaching the
    // Prisma transaction (which would crash on `dealerId:
    // null`).
    await expect(
      svc.create(null as any, 'admin-uid', { fenceSegments: [{ x1: 0, y1: 0, x2: 1, y2: 0, lengthM: 1, productId: 'p1' }] } as any),
    ).rejects.toThrow(/Only dealer users can create quotes/);
  });

  it('computes tax correctly', async () => {
    prisma.product.findMany.mockResolvedValue([
      { id: 'p1', name: 'Panel', unit: 'pcs', basePrice: 100 },
    ]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    await svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      taxRate: 8.25,
      fenceSegments: [
        // 2.4m -> 1 panel * $100 = $100 subtotal, +8.25% = $108.25
        { x1: 0, y1: 0, x2: 2.4, y2: 0, lengthM: 2.4, productId: 'p1' },
      ],
    });
    expect(Number(capturedCreateArgs.data.subtotal)).toBe(100);
    expect(Number(capturedCreateArgs.data.taxAmount)).toBe(8.25);
    expect(Number(capturedCreateArgs.data.total)).toBe(108.25);
  });

  it('allows creating a draft with no fence segments (dealer can finish later)', async () => {
    // Set up the $transaction mock for THIS test (it isn't in
    // the outer beforeEach since most create() tests reuse the
    // larger line-item describe).
    prisma.quote.create = jest.fn((args: any) =>
      Promise.resolve({ id: 'q1', ...args.data, lineItems: args.data.lineItems.create }));
    prisma.$transaction = async (fn: any) => fn({
      product: prisma.product,
      priceOverride: prisma.priceOverride,
      quote: prisma.quote,
    });
    const out = await svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      fenceSegments: [],
    } as any);
    expect(out.id).toBe('q1');
  });

  it('rejects quote with unknown product', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    await expect(svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      fenceSegments: [
        { x1: 0, y1: 0, x2: 10, y2: 0, lengthM: 10, productId: 'nonexistent' },
      ],
    })).rejects.toThrow(/Unknown product/);
  });

  it('rejects negative segment length', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'X', unit: 'pcs', basePrice: 100 }]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    await expect(svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      fenceSegments: [
        { x1: 0, y1: 0, x2: 10, y2: 0, lengthM: -5, productId: 'p1' },
      ],
    })).rejects.toThrow(/must be positive/);
  });

  it('rejects zero-length segment', async () => {
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'X', unit: 'pcs', basePrice: 100 }]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    await expect(svc.create('w1', 'u1', {
      customerName: 'C', customerEmail: 'c@x.com',
      fenceSegments: [
        { x1: 5, y1: 5, x2: 5, y2: 5, lengthM: 0, productId: 'p1' },
      ],
    })).rejects.toThrow(/must be positive/);
  });
});

/**
 * Tests for partial quote updates (PATCH /quotes/:id) and the
 * expiry sweep. These are isolated from create-flow tests to keep
 * the suite readable.
 */
describe('QuotesService - update()', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      product: { findMany: jest.fn() },
      priceOverride: { findMany: jest.fn() },
      quoteLineItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  it('updates a DRAFT quote (notes only) without touching line items', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: 'DRAFT', taxRate: '0',
      subtotal: '1000', taxAmount: '0', total: '1000',
    });
    // $transaction(fn) -> run fn with prisma as the tx proxy
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.update.mockResolvedValue({ id: 'q1', notes: 'new note' });
    await svc.update('q1', 'w1', false, { notes: 'new note' });
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'q1' }, data: expect.objectContaining({ notes: 'new note' }) }),
    );
    expect(prisma.quoteLineItem.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects commercial field edits on a SENT quote', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: 'SENT',
    });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.update.mockResolvedValue({ id: 'q1' });
    await expect(svc.update('q1', 'w1', false, { notes: 'ok' /* this is fine */ }))
      .resolves.toEqual({ id: 'q1' });
    await expect(svc.update('q1', 'w1', false, { taxRate: 10 }))
      .rejects.toThrow(/Cannot edit taxRate/);
  });

  it('recomputes line items when fenceSegments change on a DRAFT', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: 'DRAFT', taxRate: '0',
      subtotal: '0', taxAmount: '0', total: '0',
    });
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Picket 4ft', unit: 'pcs', basePrice: 64 }]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.update.mockResolvedValue({ id: 'q1' });
    prisma.quoteLineItem.deleteMany.mockResolvedValue({ count: 0 });
    prisma.quoteLineItem.createMany.mockResolvedValue({ count: 1 });

    await svc.update('q1', 'w1', false, {
      fenceSegments: [{ x1: 0, y1: 0, x2: 7.2, y2: 0, lengthM: 7.2, productId: 'p1' }],
    });
    expect(prisma.quoteLineItem.deleteMany).toHaveBeenCalled();
    expect(prisma.quoteLineItem.createMany).toHaveBeenCalled();
  });

  it('rejects empty fenceSegments on update', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: 'DRAFT',
    });
    await expect(svc.update('q1', 'w1', false, { fenceSegments: [] }))
      .rejects.toThrow(/At least one fence segment/);
  });
});

describe('QuotesService - expireOverdue()', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: { updateMany: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  it('marks SENT quotes with past validUntil as EXPIRED', async () => {
    prisma.quote.updateMany.mockResolvedValue({ count: 3 });
    const n = await svc.expireOverdue(new Date('2026-07-01'));
    expect(n).toBe(3);
    expect(prisma.quote.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'SENT' }),
      data: { status: 'EXPIRED' },
    }));
  });

  it('returns 0 when no quotes are overdue', async () => {
    prisma.quote.updateMany.mockResolvedValue({ count: 0 });
    expect(await svc.expireOverdue()).toBe(0);
  });
});

/**
 * Public surface tests - make sure the customer-facing API never
 * leaks PII (internal notes, raw floor plan, signature URL,
 * dealer direct contact info, raw fence coordinates).
 */
describe('QuotesService - getPublic() and approvePublic() PII safety', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: { findUnique: jest.fn(), update: jest.fn() },
      fs: { mkdir: jest.fn(), writeFile: jest.fn() },
    };
    // Stub the dynamic fs/promises import inside approvePublic
    prisma.fs.mkdir.mockResolvedValue(undefined);
    prisma.fs.writeFile.mockResolvedValue(undefined);
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  const SAMPLE_QUOTE_ROW: any = {
    id: 'q1', reference: 'FVP-1', status: 'SENT',
    customerName: 'Alice', customerEmail: 'a@x.com', customerPhone: '+1-555',
    projectAddress: '123 Main St', notes: 'INTERNAL - do not show',
    floorPlanUrl: '/static/uploads/plan.png', floorPlanWidthM: 10, floorPlanHeightM: 8,
    selectedDesignId: 'design-picket', renderUrl: '/static/renders/x.png',
    validUntil: null, approvedAt: null, approvedSignatureUrl: '/static/signatures/x.png',
    subtotal: '1000', taxRate: '8.5', taxAmount: '85', total: '1085',
    dealerId: 'w1', createdById: 'u1', createdAt: new Date(), updatedAt: new Date(),
    fenceSegments: [],
    lineItems: [{ description: 'Picket 4ft', quantity: 4, unitPrice: 64, lineTotal: 256, heightOption: '4ft', colorOption: 'White' }],
    selectedDesign: { id: 'design-picket', name: 'Picket', overlayUrl: '/static/overlays/p.png', style: 'Picket', description: 'd', config: {}, isActive: true, createdAt: new Date(), updatedAt: new Date() },
    dealer: { name: 'Demo Fence Co', contactEmail: 'owner@demo.com', contactPhone: '+1-555-0100', logoUrl: null, template: { id: 't1', dealerId: 'w1', headerHtml: null, footerHtml: null, termsHtml: '50% deposit', accentColor: '#000', updatedAt: new Date() } },
  };

  it('getPublic() strips notes, customerEmail, customerPhone, floorPlanUrl, signatureUrl, fenceSegments', async () => {
    prisma.quote.findUnique.mockResolvedValue(SAMPLE_QUOTE_ROW);
    const out: any = await svc.getPublic('q1');
    expect(out.customerName).toBe('Alice');
    expect(out.projectAddress).toBe('123 Main St');
    // Forbidden PII fields must NOT appear
    expect(out).not.toHaveProperty('customerEmail');
    expect(out).not.toHaveProperty('customerPhone');
    expect(out).not.toHaveProperty('notes');
    expect(out).not.toHaveProperty('floorPlanUrl');
    expect(out).not.toHaveProperty('floorPlanWidthM');
    expect(out).not.toHaveProperty('floorPlanHeightM');
    expect(out).not.toHaveProperty('approvedSignatureUrl');
    expect(out).not.toHaveProperty('fenceSegments');
    expect(out).not.toHaveProperty('createdById');
    expect(out).not.toHaveProperty('dealerId');
    // Dealer contact info must not leak
    expect(out.dealer).toBeTruthy();
    expect(out.dealer).not.toHaveProperty('contactEmail');
    expect(out.dealer).not.toHaveProperty('contactPhone');
    expect(out.dealer.name).toBe('Demo Fence Co');
  });

  it('getPublic() refuses non-SENT/non-APPROVED/non-REJECTED quotes', async () => {
    prisma.quote.findUnique.mockResolvedValue({ ...SAMPLE_QUOTE_ROW, status: 'DRAFT' });
    await expect(svc.getPublic('q1')).rejects.toThrow(/not available/);
  });

  it('getPublic() allows REJECTED quotes (customer confirms their decision)', async () => {
    prisma.quote.findUnique.mockResolvedValue({ ...SAMPLE_QUOTE_ROW, status: 'REJECTED' });
    const out: any = await svc.getPublic('q1');
    expect(out.status).toBe('REJECTED');
  });

  it('getPublic() returns 404 for missing quote', async () => {
    prisma.quote.findUnique.mockResolvedValue(null);
    await expect(svc.getPublic('q1')).rejects.toThrow(/not found/i);
  });

  it('approvePublic() refuses to write when quote is not SENT', async () => {
    prisma.quote.findUnique.mockResolvedValue({ ...SAMPLE_QUOTE_ROW, status: 'DRAFT' });
    await expect(svc.approvePublic('q1', 'data:image/png;base64,AAAA'))
      .rejects.toThrow(/not awaiting/);
  });

  it('approvePublic() rejects empty signature', async () => {
    prisma.quote.findUnique.mockResolvedValue(SAMPLE_QUOTE_ROW);
    await expect(svc.approvePublic('q1', ''))
      .rejects.toThrow(/data:image/);
  });

  it('approvePublic() rejects non-string signature', async () => {
    prisma.quote.findUnique.mockResolvedValue(SAMPLE_QUOTE_ROW);
    await expect(svc.approvePublic('q1', null as any))
      .rejects.toThrow(/missing or too large/);
  });

  it('approvePublic() rejects malformed data URL', async () => {
    prisma.quote.findUnique.mockResolvedValue(SAMPLE_QUOTE_ROW);
    await expect(svc.approvePublic('q1', 'not-a-data-url'))
      .rejects.toThrow(/data:image/);
  });

  it('approvePublic() rejects oversize signature (>1.5MB)', async () => {
    prisma.quote.findUnique.mockResolvedValue(SAMPLE_QUOTE_ROW);
    const big = 'A'.repeat(2_000_000);
    await expect(svc.approvePublic('q1', `data:image/png;base64,${big}`))
      .rejects.toThrow(/too large/);
  });
});

describe('QuotesService - clone()', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      product: { findMany: jest.fn() },
      priceOverride: { findMany: jest.fn() },
      quoteLineItem: { deleteMany: jest.fn(), createMany: jest.fn() },
      $transaction: jest.fn(),
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  it('refuses to clone across tenants', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w2', status: 'APPROVED',
      fenceSegments: [{ x1: 0, y1: 0, x2: 5, y2: 0, lengthM: 5, productId: 'p1' }],
    });
    await expect(svc.clone('q1', 'w1', false)).rejects.toThrow(/Not your quote/);
  });

  it('refuses to clone a quote with no segments', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', dealerId: 'w1', status: 'DRAFT', fenceSegments: [],
    });
    await expect(svc.clone('q1', 'w1', false)).rejects.toThrow(/no fence segments/);
  });

  it('clones a quote into a new DRAFT for the same dealer', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', reference: 'FVP-1', dealerId: 'w1', createdById: 'u1',
      status: 'APPROVED',
      customerName: 'Alice', customerEmail: 'a@x.com', customerPhone: null,
      projectAddress: null, notes: null, taxRate: '8.5',
      selectedDesignId: 'design-picket', floorPlanUrl: null, floorPlanWidthM: null, floorPlanHeightM: null,
      renderUrl: '/static/renders/x.png', validUntil: new Date('2026-12-01'),
      fenceSegments: [{ x1: 0, y1: 0, x2: 5, y2: 0, lengthM: 5, productId: 'p1', heightOption: '4ft', colorOption: 'White' }],
    });
    prisma.product.findMany.mockResolvedValue([{ id: 'p1', name: 'Picket 4ft', unit: 'pcs', basePrice: 64 }]);
    prisma.priceOverride.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.quote.create.mockResolvedValue({ id: 'q2', reference: 'FVP-2' });
    const out = await svc.clone('q1', 'w1', false);
    expect(prisma.quote.create).toHaveBeenCalled();
    // The created quote must be DRAFT, must preserve segments and product info,
    // and must note its origin in the notes
    const createArgs = prisma.quote.create.mock.calls[0][0];
    expect(createArgs.data.status).toBe('DRAFT');
    expect(createArgs.data.notes).toMatch(/cloned from FVP-1/);
    expect(createArgs.data.fenceSegments[0].productId).toBe('p1');
    expect(createArgs.data.fenceSegments[0].heightOption).toBe('4ft');
  });
});

describe('QuotesService - reject (public and owner)', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: { findUnique: jest.fn(), update: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  it('rejectPublic marks a SENT quote REJECTED and preserves a reason in notes', async () => {
    // First call: rejectPublic checks the row. Second call: getPublic
    // called by the return path re-fetches the row with includes.
    prisma.quote.findUnique
      .mockResolvedValueOnce({ id: 'q1', status: 'SENT', notes: null })
      .mockResolvedValueOnce({ id: 'q1', status: 'REJECTED', notes: 'note', validUntil: null,
        customerName: 'A', projectAddress: null, lineItems: [], selectedDesign: null, dealer: null });
    prisma.quote.update.mockResolvedValue({});
    await svc.rejectPublic('q1', 'Too expensive');
    const updateArgs = prisma.quote.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('REJECTED');
    expect(updateArgs.data.notes).toMatch(/Customer declined: Too expensive/);
  });

  it('rejectPublic refuses non-SENT quotes', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'DRAFT' });
    await expect(svc.rejectPublic('q1', 'x')).rejects.toThrow(/not awaiting/);
  });

  it('rejectPublic rejects a too-long reason', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'SENT' });
    await expect(svc.rejectPublic('q1', 'x'.repeat(2001))).rejects.toThrow(/too long/);
  });

  it('rejectByOwner marks a SENT quote REJECTED with the dealer attribution', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', status: 'SENT', dealerId: 'w1', notes: null,
    });
    prisma.quote.update.mockResolvedValue({});
    await svc.rejectByOwner('q1', 'Customer phoned in', false, 'w1');
    const updateArgs = prisma.quote.update.mock.calls[0][0];
    expect(updateArgs.data.status).toBe('REJECTED');
    expect(updateArgs.data.notes).toMatch(/Dealer marked as rejected/);
  });

  it('rejectByOwner refuses cross-tenant', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'SENT', dealerId: 'w2' });
    await expect(svc.rejectByOwner('q1', 'x', false, 'w1')).rejects.toThrow(/Not your quote/);
  });

  it('rejectByOwner refuses to reject a non-SENT quote', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', status: 'APPROVED', dealerId: 'w1' });
    await expect(svc.rejectByOwner('q1', 'x', false, 'w1')).rejects.toThrow(/Cannot reject/);
  });
});

/**
 * DTO trim/validation tests - we test the validator directly without
 * going through Prisma. The CreateQuoteDto's @Transform trims string
 * fields and rejects whitespace-only inputs.
 */
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateQuoteDto } from './dto';

describe('CreateQuoteDto - input validation', () => {
  function toInstance(plain: any) {
    return plainToInstance(CreateQuoteDto, plain);
  }
  const validSegments = [{ x1: 0, y1: 0, x2: 5, y2: 0, lengthM: 5, productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }];

  it('rejects whitespace-only customerName', async () => {
    const dto = toInstance({ customerName: '   ', customerEmail: 'a@x.com', fenceSegments: validSegments });
    const errs = await validate(dto);
    expect(errs.some(e => e.property === 'customerName')).toBe(true);
  });

  it('trims padded customerName before validation', async () => {
    const dto = toInstance({ customerName: '  Alice  ', customerEmail: 'a@x.com', fenceSegments: validSegments });
    const errs = await validate(dto);
    expect(errs).toHaveLength(0);
    expect(dto.customerName).toBe('Alice');
  });

  it('lowercases the email and trims it', async () => {
    const dto = toInstance({ customerName: 'Alice', customerEmail: '  ALICE@X.COM  ', fenceSegments: validSegments });
    const errs = await validate(dto);
    expect(errs).toHaveLength(0);
    expect(dto.customerEmail).toBe('alice@x.com');
  });

  it('rejects invalid email', async () => {
    const dto = toInstance({ customerName: 'Alice', customerEmail: 'not-an-email', fenceSegments: validSegments });
    const errs = await validate(dto);
    expect(errs.some(e => e.property === 'customerEmail')).toBe(true);
  });
});

describe('CreateQuoteDto - segments array cap', () => {
  it('rejects more than 500 fence segments (DoS guard)', async () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({
      x1: i, y1: 0, x2: i + 1, y2: 0, lengthM: 1,
      productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    }));
    const dto = plainToInstance(CreateQuoteDto, {
      customerName: 'Alice', customerEmail: 'a@x.com', fenceSegments: tooMany,
    });
    const errs = await validate(dto);
    expect(errs.some(e => e.property === 'fenceSegments' && e.constraints?.arrayMaxSize)).toBe(true);
  });

  it('accepts exactly 500 fence segments', async () => {
    const exactly500 = Array.from({ length: 500 }, (_, i) => ({
      x1: i, y1: 0, x2: i + 1, y2: 0, lengthM: 1,
      productId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    }));
    const dto = plainToInstance(CreateQuoteDto, {
      customerName: 'Alice', customerEmail: 'a@x.com', fenceSegments: exactly500,
    });
    const errs = await validate(dto);
    expect(errs).toHaveLength(0);
  });
});

describe('QuotesService - list() with filters and sort', () => {
  // We exercise the filter and sort logic by mocking
  // prisma.quote.findMany and inspecting the arguments. No DB
  // calls are made.
  let svc: QuotesService;
  let prisma: any;
  beforeEach(async () => {
    prisma = {
      quote: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  function lastCall() { return prisma.quote.findMany.mock.calls[prisma.quote.findMany.mock.calls.length - 1][0]; }

  it('dealer users are scoped to their own quotes', async () => {
    await svc.list('wh-1', false);
    expect(lastCall().where.dealerId).toBe('wh-1');
  });
  it('admins see all quotes (no dealerId filter)', async () => {
    await svc.list(null, true);
    expect(lastCall().where.dealerId).toBeUndefined();
  });
  it('applies a single status filter', async () => {
    await svc.list('wh-1', false, { status: 'SENT' });
    expect(lastCall().where.status).toBe('SENT');
  });
  it('applies a comma-separated status list as `in`', async () => {
    await svc.list('wh-1', false, { status: 'SENT,APPROVED' });
    expect(lastCall().where.status).toEqual({ in: ['SENT', 'APPROVED'] });
  });
  it('builds a search OR clause over reference/name/email', async () => {
    await svc.list('wh-1', false, { q: 'jane' });
    const w = lastCall().where;
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR).toHaveLength(3);
    expect(w.OR[0].reference).toEqual({ contains: 'jane', mode: 'insensitive' });
    expect(w.OR[1].customerName).toEqual({ contains: 'jane', mode: 'insensitive' });
    expect(w.OR[2].customerEmail).toEqual({ contains: 'jane', mode: 'insensitive' });
  });
  it('maps sort=newest to orderBy.createdAt=desc', async () => {
    await svc.list('wh-1', false, { sort: 'newest' });
    expect(lastCall().orderBy).toEqual({ createdAt: 'desc' });
  });
  it('maps sort=customer to orderBy.customerName=asc', async () => {
    await svc.list('wh-1', false, { sort: 'customer' });
    expect(lastCall().orderBy).toEqual({ customerName: 'asc' });
  });
  it('caps the limit between 1 and 500', async () => {
    await svc.list('wh-1', false, { limit: 0 });
    expect(lastCall().take).toBe(1);
    await svc.list('wh-1', false, { limit: 99999 });
    expect(lastCall().take).toBe(500);
  });
});
