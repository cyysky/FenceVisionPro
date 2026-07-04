/**
 * InvoicesService unit tests. Mock PrismaService (no real DB).
 * Cover: ownership, status transitions, number generation, and
 * the rule that you can only invoice an APPROVED quote.
 */
import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role, QuoteStatus, InvoiceStatus } from '@prisma/client';

describe('InvoicesService', () => {
  let svc: InvoicesService;
  let prisma: any;

  const ownerA = { sub: 'u-A', role: Role.DEALER_OWNER, email: 'a@x.com', dealerId: 'dA' } as any;
  const staffA = { sub: 'u-As', role: Role.DEALER_STAFF, email: 'as@x.com', dealerId: 'dA' } as any;
  const ownerB = { sub: 'u-B', role: Role.DEALER_OWNER, email: 'b@x.com', dealerId: 'dB' } as any;
  const admin  = { sub: 'u-0', role: Role.ADMIN, email: 'root@x.com', dealerId: null } as any;

  beforeEach(async () => {
    prisma = {
      invoice: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      quote: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    // Default $transaction: pass the work straight through to its
    // argument so the create() body can run against the mocked tx.
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    const mod = await Test.createTestingModule({
      providers: [
        InvoicesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = mod.get(InvoicesService);
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------
  describe('list', () => {
    it('scopes to dealer for non-admin', async () => {
      prisma.invoice.findMany.mockResolvedValueOnce([]);
      await svc.list(ownerA, {});
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dealerId: 'dA' } }),
      );
    });
    it('passes through filters', async () => {
      prisma.invoice.findMany.mockResolvedValueOnce([]);
      await svc.list(ownerA, { status: 'DRAFT', quoteId: 'q1' });
      expect(prisma.invoice.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dealerId: 'dA', status: 'DRAFT', quoteId: 'q1' } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // get / ownership
  // -------------------------------------------------------------------------
  describe('get (ownership)', () => {
    it('returns the invoice for the owning dealer', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'DRAFT', lineItems: [] });
      const out = await svc.get('i1', ownerA);
      expect(out.id).toBe('i1');
    });
    it('masks cross-tenant access as 404', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dB', lineItems: [] });
      await expect(svc.get('i1', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('admin can read any tenant', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dB', lineItems: [] });
      const out = await svc.get('i1', admin);
      expect(out.id).toBe('i1');
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------
  describe('create', () => {
    it('rejects non-APPROVED quotes with 400', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({
        id: 'q1', dealerId: 'dA', status: QuoteStatus.DRAFT,
        subtotal: 100, taxRate: 6, lineItems: [],
      });
      await expect(svc.create(ownerA, { quoteId: 'q1' })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('rejects foreign-tenant quote with 404', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({
        id: 'q1', dealerId: 'dB', status: QuoteStatus.APPROVED,
        subtotal: 100, taxRate: 6, lineItems: [],
      });
      await expect(svc.create(ownerA, { quoteId: 'q1' })).rejects.toBeInstanceOf(NotFoundException);
    });
    it('creates a DRAFT invoice with sequential number and copied line items', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({
        id: 'q1', dealerId: 'dA', status: QuoteStatus.APPROVED,
        subtotal: 200, taxRate: 6, lineItems: [
          { description: 'Panel A', quantity: 4, unitPrice: 50, lineTotal: 200 },
        ],
      });
      prisma.invoice.count.mockResolvedValueOnce(3); // 3 invoices this year so far
      prisma.invoice.create.mockResolvedValueOnce({ id: 'i1', number: 'INV-2026-0004' });
      const out = await svc.create(ownerA, { quoteId: 'q1' });
      expect(out.id).toBe('i1');
      const createArg = prisma.invoice.create.mock.calls[0][0];
      expect(createArg.data.number).toBe('INV-2026-0004');
      expect(createArg.data.status).toBe('DRAFT');
      expect(createArg.data.subtotal).toBe(200);
      // 6% of 200 = 12
      expect(createArg.data.tax).toBe(12);
      expect(createArg.data.total).toBe(212);
      expect(createArg.data.lineItems.create).toHaveLength(1);
    });
    it('uses taxPercent override when provided', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({
        id: 'q1', dealerId: 'dA', status: QuoteStatus.APPROVED,
        subtotal: 100, taxRate: 6, lineItems: [],
      });
      prisma.invoice.count.mockResolvedValueOnce(0);
      prisma.invoice.create.mockResolvedValueOnce({ id: 'i1' });
      await svc.create(ownerA, { quoteId: 'q1', taxPercent: 10 });
      const createArg = prisma.invoice.create.mock.calls[0][0];
      expect(createArg.data.tax).toBe(10);
      expect(createArg.data.total).toBe(110);
    });
    it('admin can create an invoice for any tenant', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({
        id: 'q1', dealerId: 'dB', status: QuoteStatus.APPROVED,
        subtotal: 100, taxRate: 0, lineItems: [],
      });
      prisma.invoice.count.mockResolvedValueOnce(0);
      prisma.invoice.create.mockResolvedValueOnce({ id: 'i1', number: 'INV-2026-0001' });
      const out = await svc.create(admin, { quoteId: 'q1' });
      expect(out.id).toBe('i1');
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------
  describe('update', () => {
    it('rejects updates on a non-DRAFT invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'SENT', lineItems: [] });
      await expect(svc.update('i1', ownerA, { notes: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('updates notes / dueAt on a DRAFT invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'DRAFT', lineItems: [] });
      prisma.invoice.update.mockResolvedValueOnce({ id: 'i1', notes: 'n' });
      await svc.update('i1', ownerA, { notes: 'n' });
      const arg = prisma.invoice.update.mock.calls[0][0];
      expect(arg.data.notes).toBe('n');
    });
  });

  // -------------------------------------------------------------------------
  // transition
  // -------------------------------------------------------------------------
  describe('transition', () => {
    it('DRAFT -> SENT is allowed and stamps issuedAt', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'DRAFT', issuedAt: null, lineItems: [] });
      prisma.invoice.update.mockResolvedValueOnce({ id: 'i1', status: 'SENT' });
      const out = await svc.transition('i1', ownerA, { to: 'SENT' });
      expect(out.status).toBe('SENT');
      const arg = prisma.invoice.update.mock.calls[0][0];
      expect(arg.data.status).toBe('SENT');
      expect(arg.data.issuedAt).toBeInstanceOf(Date);
    });
    it('DRAFT -> PAID is illegal', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'DRAFT', lineItems: [] });
      await expect(svc.transition('i1', ownerA, { to: 'PAID' })).rejects.toBeInstanceOf(BadRequestException);
    });
    it('SENT -> PAID is allowed and stamps paidAt', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'SENT', paidAt: null, lineItems: [] });
      prisma.invoice.update.mockResolvedValueOnce({ id: 'i1', status: 'PAID' });
      await svc.transition('i1', ownerA, { to: 'PAID' });
      const arg = prisma.invoice.update.mock.calls[0][0];
      expect(arg.data.status).toBe('PAID');
      expect(arg.data.paidAt).toBeInstanceOf(Date);
    });
    it('SENT -> VOID is allowed', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'SENT', lineItems: [] });
      prisma.invoice.update.mockResolvedValueOnce({ id: 'i1', status: 'VOID' });
      await svc.transition('i1', ownerA, { to: 'VOID' });
    });
    it('DRAFT -> VOID is allowed', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'DRAFT', lineItems: [] });
      prisma.invoice.update.mockResolvedValueOnce({ id: 'i1', status: 'VOID' });
      await svc.transition('i1', ownerA, { to: 'VOID' });
    });
    it('PAID is terminal', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'PAID', lineItems: [] });
      await expect(svc.transition('i1', ownerA, { to: 'VOID' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // remove
  // -------------------------------------------------------------------------
  describe('remove', () => {
    it('refuses to delete a non-DRAFT invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'SENT', lineItems: [] });
      await expect(svc.remove('i1', ownerA)).rejects.toBeInstanceOf(BadRequestException);
    });
    it('deletes a DRAFT invoice', async () => {
      prisma.invoice.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'DRAFT', lineItems: [] });
      prisma.invoice.delete.mockResolvedValueOnce({ id: 'i1' });
      const out = await svc.remove('i1', ownerA);
      expect(out).toEqual({ ok: true });
      expect(prisma.invoice.delete).toHaveBeenCalledWith({ where: { id: 'i1' } });
    });
  });
});
