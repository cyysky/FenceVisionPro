import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns the product list with prices resolved for the given dealer.
   * Falls back to basePrice if no override exists.
   */
  async listForDealer(dealerId: string | null) {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    const overrides = dealerId
      ? await this.prisma.priceOverride.findMany({ where: { dealerId } })
      : [];
    const map = new Map(overrides.map(o => [o.productId, Number(o.price)]));
    return products.map(p => ({
      ...p,
      basePrice: Number(p.basePrice),
      effectivePrice: map.get(p.id) ?? Number(p.basePrice),
    }));
  }

  async get(id: string, dealerId: string | null) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Product not found');
    const override = dealerId
      ? await this.prisma.priceOverride.findUnique({ where: { dealerId_productId: { dealerId, productId: id } } })
      : null;
    return { ...p, basePrice: Number(p.basePrice), effectivePrice: override ? Number(override.price) : Number(p.basePrice) };
  }

  // admin
  create(data: any) { return this.prisma.product.create({ data }); }
  update(id: string, data: any) { return this.prisma.product.update({ where: { id }, data }); }
  setOverride(dealerId: string, productId: string, price: number) {
    return this.prisma.priceOverride.upsert({
      where: { dealerId_productId: { dealerId, productId } },
      update: { price },
      create: { dealerId, productId, price },
    });
  }

  /**
   * Clear the per-dealer price override so the product reverts
   * to its basePrice for that tenant. Returns the count of deleted
   * rows (0 if no override existed).
   */
  async clearOverride(dealerId: string, productId: string) {
    try {
      await this.prisma.priceOverride.delete({
        where: { dealerId_productId: { dealerId, productId } },
      });
      return { ok: true, removed: true };
    } catch (e: any) {
      // Prisma P2025 = record not found
      if (e?.code === 'P2025') return { ok: true, removed: false };
      throw e;
    }
  }

  /**
   * List every existing price override for a dealer. Useful for
   * the admin UI to show which products are customised.
   */
  async listOverrides(dealerId: string) {
    return this.prisma.priceOverride.findMany({
      where: { dealerId },
      include: { product: { select: { id: true, sku: true, name: true, basePrice: true } } },
      orderBy: { product: { name: 'asc' } },
    });
  }
}
