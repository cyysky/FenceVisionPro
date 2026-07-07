/**
 * Unit tests for AdminLeadsService. Focus: status filter, dealer
 * scoping, and the convert-to-quote happy path.
 */
import { Test } from '@nestjs/testing';
import { PublicLeadStatus, PublicLeadYardSide, PublicLeadPhotoSource, QuoteStatus } from '@prisma/client';
import { AdminLeadsService } from './admin-leads.service';
import { PrismaService } from '../prisma/prisma.service';
import { QuotesService } from '../quotes/quotes.service';

function makeLead(over: Partial<any> = {}) {
  return {
    id: 'lead1',
    email: 'a@b.co',
    phone: null,
    firstName: 'A',
    yardSide: PublicLeadYardSide.FRONT,
    photoSource: PublicLeadPhotoSource.GALLERY,
    inputPhotoPath: '/static/gallery/front1.jpg',
    inputGalleryId: 'front1',
    designStyle: null,
    renderStatus: PublicLeadStatus.READY,
    renderUrl: '/static/renders/x.png',
    renderError: null,
    generatedAt: new Date(),
    contactedAt: null,
    contactedById: null,
    notes: null,
    convertedQuoteId: null,
    convertedQuote: null,
    archivedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    contactedBy: null,
    ...over,
  };
}

describe('AdminLeadsService - list', () => {
  let svc: AdminLeadsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      $transaction: jest.fn(),
      publicLead: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        AdminLeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: QuotesService, useValue: {} },
      ],
    }).compile();
    svc = mod.get(AdminLeadsService);
  });

  it('scopes to convertedQuote.dealerId for non-admin callers', async () => {
    prisma.$transaction.mockResolvedValue([1, [makeLead()]]);
    await svc.list('d1', false, { status: 'READY', page: 1, pageSize: 25 });
    expect(prisma.$transaction).toHaveBeenCalled();
    // Inspect the count + findMany calls for the where filter.
    const calls = prisma.publicLead.count.mock.calls[0][0];
    expect(calls.where.renderStatus).toBe('READY');
    expect(calls.where.convertedQuote.dealerId).toBe('d1');
  });

  it('does not scope for admin callers', async () => {
    prisma.$transaction.mockResolvedValue([1, [makeLead()]]);
    await svc.list(null, true, { page: 1 });
    const calls = prisma.publicLead.count.mock.calls[0][0];
    expect(calls.where.convertedQuote).toBeUndefined();
  });

  it('clamps pageSize to 1..100 and defaults page=1', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);
    await svc.list(null, true, { pageSize: 9999 });
    const calls = prisma.publicLead.findMany.mock.calls[0][0];
    expect(calls.take).toBe(100);
    expect(calls.skip).toBe(0);
  });

  it('parses date filters into createdAt bounds', async () => {
    prisma.$transaction.mockResolvedValue([0, []]);
    await svc.list(null, true, { from: '2026-01-01', to: '2026-12-31' });
    const calls = prisma.publicLead.count.mock.calls[0][0];
    expect(calls.where.createdAt.gte).toBeInstanceOf(Date);
    expect(calls.where.createdAt.lte).toBeInstanceOf(Date);
  });
});

describe('AdminLeadsService - convertToQuote', () => {
  let svc: AdminLeadsService;
  let prisma: any;
  let quotes: any;

  beforeEach(async () => {
    prisma = {
      publicLead: { findUnique: jest.fn(), update: jest.fn() },
      quote: { findUnique: jest.fn(), update: jest.fn() },
      dealer: { findFirst: jest.fn() },
    };
    quotes = { create: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        AdminLeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: QuotesService, useValue: quotes },
      ],
    }).compile();
    svc = mod.get(AdminLeadsService);
  });

  it('refuses if the lead is already archived', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.ARCHIVED, archivedAt: new Date() }));
    await expect(svc.convertToQuote('lead1', 'd1', false, 'u1')).rejects.toThrow(/archived/i);
  });

  it('creates a DRAFT quote and links it back to the lead', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.READY, renderUrl: '/static/renders/x.png' }));
    quotes.create.mockResolvedValue({ id: 'q-new' });
    prisma.quote.update.mockResolvedValue({ id: 'q-new' });
    prisma.publicLead.update.mockResolvedValue({ id: 'lead1', renderStatus: PublicLeadStatus.CONVERTED, convertedQuoteId: 'q-new' });

    const out = await svc.convertToQuote('lead1', 'd1', false, 'u1');
    expect(out.quoteId).toBe('q-new');
    expect(out.alreadyConverted).toBe(false);
    // QuotesService.create called with customer info from the lead
    expect(quotes.create).toHaveBeenCalledWith(
      'd1',
      'u1',
      expect.objectContaining({
        customerEmail: 'a@b.co',
        customerName: 'A',
      }),
    );
    // aiImageUrls updated to [renderUrl]
    expect(prisma.quote.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { aiImageUrls: ['/static/renders/x.png'] } }),
    );
    // lead bumped to CONVERTED
    expect(prisma.publicLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ renderStatus: PublicLeadStatus.CONVERTED, convertedQuoteId: 'q-new' }) }),
    );
  });

  it('is idempotent: re-converting returns the existing quote', async () => {
    prisma.publicLead.findUnique
      .mockResolvedValueOnce(makeLead({ renderStatus: PublicLeadStatus.CONVERTED, convertedQuoteId: 'q-existing' }));
    prisma.quote.findUnique.mockResolvedValue({ id: 'q-existing' });
    const out = await svc.convertToQuote('lead1', 'd1', false, 'u1');
    expect(out.quoteId).toBe('q-existing');
    expect(out.alreadyConverted).toBe(true);
    expect(quotes.create).not.toHaveBeenCalled();
  });

  it('refuses if the lead is missing', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(null);
    await expect(svc.convertToQuote('missing', 'd1', false, 'u1')).rejects.toThrow(/not found/i);
  });
});

describe('AdminLeadsService - markContacted + archive', () => {
  let svc: AdminLeadsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      publicLead: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      quote: { findUnique: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [
        AdminLeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: QuotesService, useValue: {} },
      ],
    }).compile();
    svc = mod.get(AdminLeadsService);
  });

  it('markContacted sets contactedAt + notes and bumps status to CONTACTED', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.READY }));
    prisma.publicLead.update.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.CONTACTED, notes: 'left voicemail' }));
    const out: any = await svc.markContacted('lead1', 'd1', false, 'u1', 'left voicemail');
    expect(out.status).toBe(PublicLeadStatus.CONTACTED);
    expect(prisma.publicLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contactedById: 'u1', notes: 'left voicemail' }) }),
    );
  });

  it('markContacted does not regress CONVERTED -> CONTACTED', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.CONVERTED }));
    prisma.publicLead.update.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.CONVERTED }));
    await svc.markContacted('lead1', 'd1', false, 'u1', 'note');
    expect(prisma.publicLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ renderStatus: PublicLeadStatus.CONVERTED }) }),
    );
  });

  it('archive of an already-archived lead is idempotent (re-stamps timestamp)', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.ARCHIVED, archivedAt: new Date() }));
    prisma.publicLead.update.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.ARCHIVED, archivedAt: new Date() }));
    await svc.archive('lead1', 'd1', false);
    expect(prisma.publicLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ renderStatus: PublicLeadStatus.ARCHIVED }) }),
    );
  });

  it('archive sets archivedAt + status=ARCHIVED', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.READY }));
    prisma.publicLead.update.mockResolvedValue(makeLead({ renderStatus: PublicLeadStatus.ARCHIVED, archivedAt: new Date() }));
    await svc.archive('lead1', 'd1', false);
    expect(prisma.publicLead.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ renderStatus: PublicLeadStatus.ARCHIVED }) }),
    );
  });
});
