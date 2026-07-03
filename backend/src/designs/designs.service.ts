import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DesignsService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.design.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { designProducts: { include: { product: true } } },
    });
  }

  async get(id: string) {
    const d = await this.prisma.design.findUnique({
      where: { id },
      include: { designProducts: { include: { product: true } } },
    });
    if (!d) throw new NotFoundException('Design not found');
    return d;
  }

  create(data: any) { return this.prisma.design.create({ data }); }
}
