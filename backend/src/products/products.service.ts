import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Returns the product list with prices resolved for the given wholesaler.
   * Falls back to basePrice if no override exists.
   */
  async listForWholesaler(wholesalerId: string | null) {
    const products = await this.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
    const overrides = wholesalerId
      ? await this.prisma.priceOverride.findMany({ where: { wholesalerId } })
      : [];
    const map = new Map(overrides.map(o => [o.productId, Number(o.price)]));
    return products.map(p => ({
      ...p,
      basePrice: Number(p.basePrice),
      effectivePrice: map.get(p.id) ?? Number(p.basePrice),
    }));
  }

  async get(id: string, wholesalerId: string | null) {
    const p = await this.prisma.product.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Product not found');
    const override = wholesalerId
      ? await this.prisma.priceOverride.findUnique({ where: { wholesalerId_productId: { wholesalerId, productId: id } } })
      : null;
    return { ...p, basePrice: Number(p.basePrice), effectivePrice: override ? Number(override.price) : Number(p.basePrice) };
  }

  // admin
  create(data: any) { return this.prisma.product.create({ data }); }
  update(id: string, data: any) { return this.prisma.product.update({ where: { id }, data }); }
  setOverride(wholesalerId: string, productId: string, price: number) {
    return this.prisma.priceOverride.upsert({
      where: { wholesalerId_productId: { wholesalerId, productId } },
      update: { price },
      create: { wholesalerId, productId, price },
    });
  }

  /**
   * Clear the per-wholesaler price override so the product reverts
   * to its basePrice for that tenant. Returns the count of deleted
   * rows (0 if no override existed).
   */
  async clearOverride(wholesalerId: string, productId: string) {
    try {
      await this.prisma.priceOverride.delete({
        where: { wholesalerId_productId: { wholesalerId, productId } },
      });
      return { ok: true, removed: true };
    } catch (e: any) {
      // Prisma P2025 = record not found
      if (e?.code === 'P2025') return { ok: true, removed: false };
      throw e;
    }
  }

  /**
   * List every existing price override for a wholesaler. Useful for
   * the admin UI to show which products are customised.
   */
  async listOverrides(wholesalerId: string) {
    return this.prisma.priceOverride.findMany({
      where: { wholesalerId },
      include: { product: { select: { id: true, sku: true, name: true, basePrice: true } } },
      orderBy: { product: { name: 'asc' } },
    });
  }
}
