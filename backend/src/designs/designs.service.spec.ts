/**
 * DesignsService unit tests. Mock PrismaService; verify the active
 * filter, the eager-loaded product list, and the NotFound path.
 */
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DesignsService } from './designs.service';
import { PrismaService } from '../prisma/prisma.service';

describe('DesignsService', () => {
  let svc: DesignsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      design: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [DesignsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(DesignsService);
  });

  it('lists active designs with their products, name ascending', async () => {
    prisma.design.findMany.mockResolvedValue([{ id: 'd1' }]);
    await svc.list();
    expect(prisma.design.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      include: { designProducts: { include: { product: true } } },
    });
  });

  it('returns a design with products', async () => {
    prisma.design.findUnique.mockResolvedValue({ id: 'd1', designProducts: [] });
    const out = await svc.get('d1');
    expect(out.id).toBe('d1');
    expect(prisma.design.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      include: { designProducts: { include: { product: true } } },
    });
  });

  it('throws 404 for a missing design', async () => {
    prisma.design.findUnique.mockResolvedValue(null);
    await expect(svc.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('create delegates to prisma.design.create', async () => {
    prisma.design.create.mockResolvedValue({ id: 'd2' });
    const data = { name: 'Picket', style: 'Picket' };
    expect(await svc.create(data)).toEqual({ id: 'd2' });
    expect(prisma.design.create).toHaveBeenCalledWith({ data });
  });
});
