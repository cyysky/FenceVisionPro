/**
 * InstallersService unit tests. We mock PrismaService (no real DB)
 * and cover ownership, CRUD, soft delete, and the admin-bypass
 * path.
 */
import { Test } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { InstallersService } from './installers.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

describe('InstallersService', () => {
  let svc: InstallersService;
  let prisma: any;

  const ownerA = { sub: 'u-A', role: Role.DEALER_OWNER, email: 'a@x.com', dealerId: 'dA' } as any;
  const staffA = { sub: 'u-As', role: Role.DEALER_STAFF, email: 'as@x.com', dealerId: 'dA' } as any;
  const ownerB = { sub: 'u-B', role: Role.DEALER_OWNER, email: 'b@x.com', dealerId: 'dB' } as any;
  const admin  = { sub: 'u-0', role: Role.ADMIN, email: 'root@x.com', dealerId: null } as any;

  beforeEach(async () => {
    prisma = {
      installer: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        InstallersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = mod.get(InstallersService);
  });

  describe('list', () => {
    it('scopes to dealer for non-admin', async () => {
      prisma.installer.findMany.mockResolvedValueOnce([]);
      await svc.list(ownerA, {});
      expect(prisma.installer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dealerId: 'dA' } }),
      );
    });
    it('returns all for admin (no where.dealerId filter)', async () => {
      prisma.installer.findMany.mockResolvedValueOnce([]);
      await svc.list(admin, {});
      const arg = prisma.installer.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
    });
    it('passes through status filter', async () => {
      prisma.installer.findMany.mockResolvedValueOnce([]);
      await svc.list(ownerA, { status: 'INACTIVE' });
      expect(prisma.installer.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { dealerId: 'dA', status: 'INACTIVE' } }),
      );
    });
  });

  describe('get (ownership)', () => {
    it('returns the installer for the owning dealer', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', name: 'A' });
      const out = await svc.get('i1', ownerA);
      expect(out.id).toBe('i1');
    });
    it('masks cross-tenant access as 404', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dB', name: 'B' });
      await expect(svc.get('i1', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
    it('admin can read any tenant', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dB', name: 'B' });
      const out = await svc.get('i1', admin);
      expect(out.id).toBe('i1');
    });
    it('throws 404 for missing installer', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce(null);
      await expect(svc.get('nope', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('pins the new installer to the caller dealer', async () => {
      prisma.installer.create.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', name: 'New' });
      const out = await svc.create(ownerA, { name: 'New' });
      expect(prisma.installer.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ dealerId: 'dA', name: 'New' }) }),
      );
      expect(out.id).toBe('i1');
    });
    it('stores phone/email exactly as provided (no defaulting to a number)', async () => {
      prisma.installer.create.mockResolvedValueOnce({ id: 'i2', dealerId: 'dA', name: 'New2' });
      await svc.create(ownerA, { name: 'New2', phone: '+60123456789', email: 'a@b.co' });
      const data = prisma.installer.create.mock.calls[0][0].data;
      expect(data.phone).toBe('+60123456789');
      expect(data.email).toBe('a@b.co');
    });
    it('omits phone/email when not provided (no fake number)', async () => {
      prisma.installer.create.mockResolvedValueOnce({ id: 'i3', dealerId: 'dA' });
      await svc.create(ownerA, { name: 'NoPhone' });
      const data = prisma.installer.create.mock.calls[0][0].data;
      expect(data.phone).toBeNull();
      expect(data.email).toBeNull();
    });
  });

  describe('update', () => {
    it('updates the editable fields', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA' });
      prisma.installer.update.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', name: 'Renamed' });
      const out = await svc.update('i1', ownerA, { name: 'Renamed' });
      expect(out.id).toBe('i1');
      const data = prisma.installer.update.mock.calls[0][0].data;
      expect(data.name).toBe('Renamed');
    });
    it('rejects update of foreign-tenant installer with 404', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dB' });
      await expect(svc.update('i1', ownerA, { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('softDelete', () => {
    it('flips ACTIVE to INACTIVE (no hard delete)', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'ACTIVE' });
      prisma.installer.update.mockResolvedValueOnce({ id: 'i1', status: 'INACTIVE' });
      const out = await svc.softDelete('i1', ownerA);
      expect(out.status).toBe('INACTIVE');
      const data = prisma.installer.update.mock.calls[0][0].data;
      expect(data.status).toBe('INACTIVE');
    });
    it('is idempotent: deleting an INACTIVE installer is a no-op', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dA', status: 'INACTIVE' });
      const out = await svc.softDelete('i1', ownerA);
      expect(out.status).toBe('INACTIVE');
      expect(prisma.installer.update).not.toHaveBeenCalled();
    });
    it('refuses soft-delete of a foreign-tenant installer', async () => {
      prisma.installer.findUnique.mockResolvedValueOnce({ id: 'i1', dealerId: 'dB', status: 'ACTIVE' });
      await expect(svc.softDelete('i1', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
