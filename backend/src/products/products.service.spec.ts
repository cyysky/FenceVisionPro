/**
 * ProductsService unit tests. Covers price-override resolution,
 * admin CRUD, and the P2025-tolerant clearOverride path.
 */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductsService } from './products.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ProductsService', () => {
  let svc: ProductsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      product: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      priceOverride: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(ProductsService);
  });

  describe('listForDealer', () => {
    const product = (over: Partial<any>) => ({
      id: 'p1', sku: 'SKU-1', name: 'Panel', category: 'Panels', unit: 'pcs', basePrice: '100.00',
      ...over,
    });

    it('returns active products only, sorted by category then name', async () => {
      prisma.product.findMany.mockResolvedValue([product({})]);
      prisma.priceOverride.findMany.mockResolvedValue([]);
      await svc.listForDealer('d1');
      expect(prisma.product.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: [{ category: 'asc' }, { name: 'asc' }],
      });
    });

    it('falls back to basePrice when no override exists', async () => {
      prisma.product.findMany.mockResolvedValue([product({})]);
      prisma.priceOverride.findMany.mockResolvedValue([]);
      const rows = await svc.listForDealer('d1');
      expect(rows[0]).toMatchObject({ basePrice: 100, effectivePrice: 100 });
    });

    it('applies the dealer override when present', async () => {
      prisma.product.findMany.mockResolvedValue([product({})]);
      prisma.priceOverride.findMany.mockResolvedValue([{ productId: 'p1', price: '80.50' }]);
      const rows = await svc.listForDealer('d1');
      expect(rows[0].effectivePrice).toBe(80.5);
    });

    it('skips the override query for admin (dealerId null)', async () => {
      prisma.product.findMany.mockResolvedValue([product({})]);
      await svc.listForDealer(null);
      expect(prisma.priceOverride.findMany).not.toHaveBeenCalled();
      expect(prisma.product.findMany.mock.calls[0][0].where.isActive).toBe(true);
    });
  });

  describe('get', () => {
    const p = { id: 'p1', basePrice: '100' };
    it('throws 404 when the product is missing', async () => {
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(svc.get('missing', null)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('returns basePrice with no override', async () => {
      prisma.product.findUnique.mockResolvedValue(p);
      prisma.priceOverride.findUnique.mockResolvedValue(null);
      const out = await svc.get('p1', 'd1');
      expect(out).toMatchObject({ basePrice: 100, effectivePrice: 100 });
      expect(prisma.priceOverride.findUnique).toHaveBeenCalledWith({
        where: { dealerId_productId: { dealerId: 'd1', productId: 'p1' } },
      });
    });
    it('applies the override for a dealer', async () => {
      prisma.product.findUnique.mockResolvedValue(p);
      prisma.priceOverride.findUnique.mockResolvedValue({ price: '77' });
      const out = await svc.get('p1', 'd1');
      expect(out.effectivePrice).toBe(77);
    });
    it('skips the override lookup for admin', async () => {
      prisma.product.findUnique.mockResolvedValue(p);
      const out = await svc.get('p1', null);
      expect(prisma.priceOverride.findUnique).not.toHaveBeenCalled();
      expect(out.effectivePrice).toBe(100);
    });
  });

  describe('admin CRUD', () => {
    it('create delegates to prisma.product.create', async () => {
      prisma.product.create.mockResolvedValue({ id: 'p9' });
      const dto = { sku: 'S', name: 'N', category: 'C' };
      expect(await svc.create(dto)).toEqual({ id: 'p9' });
      expect(prisma.product.create).toHaveBeenCalledWith({ data: dto });
    });

    it('update delegates to prisma.product.update', async () => {
      prisma.product.update.mockResolvedValue({ id: 'p9' });
      expect(await svc.update('p9', { name: 'X' })).toEqual({ id: 'p9' });
      expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p9' }, data: { name: 'X' } });
    });

    it('setOverride upserts the price', async () => {
      prisma.priceOverride.upsert.mockResolvedValue({ id: 'o1' });
      const out = await svc.setOverride('d1', 'p1', 75);
      expect(out).toEqual({ id: 'o1' });
      expect(prisma.priceOverride.upsert).toHaveBeenCalledWith({
        where: { dealerId_productId: { dealerId: 'd1', productId: 'p1' } },
        update: { price: 75 },
        create: { dealerId: 'd1', productId: 'p1', price: 75 },
      });
    });

    it('clearOverride reports removed=true when a row is deleted', async () => {
      prisma.priceOverride.delete.mockResolvedValue({ id: 'o1' });
      await expect(svc.clearOverride('d1', 'p1')).resolves.toEqual({ ok: true, removed: true });
    });

    it('clearOverride reports removed=false on P2025 (no override)', async () => {
      const err: any = new Error('not found');
      err.code = 'P2025';
      prisma.priceOverride.delete.mockRejectedValue(err);
      await expect(svc.clearOverride('d1', 'p1')).resolves.toEqual({ ok: true, removed: false });
    });

    it('clearOverride rethrows non-P2025 errors', async () => {
      prisma.priceOverride.delete.mockRejectedValue(new Error('db down'));
      await expect(svc.clearOverride('d1', 'p1')).rejects.toThrow('db down');
    });

    it('listOverrides includes product name/basePrice ordered by name asc', async () => {
      const rows = [{ id: 'o1', product: { name: 'Panel' } }];
      prisma.priceOverride.findMany.mockResolvedValue(rows);
      const out = await svc.listOverrides('d1');
      expect(out).toBe(rows);
      expect(prisma.priceOverride.findMany).toHaveBeenCalledWith({
        where: { dealerId: 'd1' },
        include: { product: { select: { id: true, sku: true, name: true, basePrice: true } } },
        orderBy: { product: { name: 'asc' } },
      });
    });
  });
});
