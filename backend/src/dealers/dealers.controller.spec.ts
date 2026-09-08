/**
 * DealersController unit tests: role + tenant scoping on every
 * staff/security path (mocked services).
 */
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DealersController } from './dealers.controller';
import { DealersService } from './dealers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '@prisma/client';

describe('DealersController', () => {
  let ctrl: DealersController;
  let svc: any;
  let prisma: any;
  let auth: any;

  const admin = { sub: 'admin', role: Role.ADMIN, dealerId: null } as any;
  const ownerA = { sub: 'oa', role: Role.DEALER_OWNER, dealerId: 'wA' } as any;
  const staffA = { sub: 'sa', role: Role.DEALER_STAFF, dealerId: 'wA' } as any;
  const ownerB = { sub: 'ob', role: Role.DEALER_OWNER, dealerId: 'wB' } as any;

  beforeEach(async () => {
    svc = {
      list: jest.fn(),
      get: jest.fn().mockResolvedValue({ id: 'wA' }),
      create: jest.fn(),
      addStaff: jest.fn(),
    };
    prisma = {
      dealer: { findUnique: jest.fn(), update: jest.fn() },
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    auth = { hashPassword: jest.fn().mockResolvedValue('h') };
    const mod = await Test.createTestingModule({
      controllers: [DealersController],
      providers: [
        { provide: DealersService, useValue: svc },
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    ctrl = mod.get(DealersController);
  });

  it('get() of a foreign dealer id for non-admin silently returns their own tenant', async () => {
    await ctrl.get('wB', staffA);
    expect(svc.get).toHaveBeenCalledWith('wA');
  });

  it('get() lets admin read any tenant', async () => {
    await ctrl.get('wB', admin);
    expect(svc.get).toHaveBeenCalledWith('wB');
  });

  it('addStaff pins a staff user to the caller tenant when ids differ', async () => {
    await ctrl.addStaff('wB', { email: 'x@y.co', fullName: 'X', password: 'password123' } as any, ownerA);
    expect(svc.addStaff).toHaveBeenCalledWith('wA', 'x@y.co', 'X', 'password123');
    await ctrl.addStaff('wA', { email: 'y@z.co', fullName: 'Y', password: 'password123' } as any, ownerA);
    expect(svc.addStaff).toHaveBeenCalledWith('wA', 'y@z.co', 'Y', 'password123');
  });

  describe('resetStaffPassword', () => {
    it('forbids resetting a user of another dealer', async () => {
      await expect(ctrl.resetStaffPassword('wB', 's1', { newPassword: 'password123' } as any, ownerA))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('404s for a missing staff user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(ctrl.resetStaffPassword('wA', 'missing', { newPassword: 'password123' } as any, ownerA))
        .rejects.toBeInstanceOf(NotFoundException);
    });
    it('forbids resetting staff that belongs to a different dealer', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wB', role: Role.DEALER_STAFF });
      await expect(ctrl.resetStaffPassword('wA', 's1', { newPassword: 'password123' } as any, ownerA))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
    it('forbids resetting an admin password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wA', role: Role.ADMIN });
      await expect(ctrl.resetStaffPassword('wA', 's1', { newPassword: 'password123' } as any, ownerA))
        .rejects.toThrow(/admin/i);
    });
    it('updates the hash and returns ok for a valid owner request', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wA', role: Role.DEALER_STAFF });
      prisma.user.update.mockResolvedValue({});
      const out = await ctrl.resetStaffPassword('wA', 's1', { newPassword: 'password123' } as any, ownerA);
      expect(out).toEqual({ ok: true });
      expect(auth.hashPassword).toHaveBeenCalledWith('password123');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { passwordHash: 'h' },
      });
    });
    it('allows admin to reset any dealer staff', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wB', role: Role.DEALER_STAFF });
      prisma.user.update.mockResolvedValue({});
      await expect(ctrl.resetStaffPassword('wB', 's1', { newPassword: 'password123' } as any, admin))
        .resolves.toEqual({ ok: true });
    });
  });

  describe('deactivateStaff', () => {
    it('deactivates the staff user and returns ok', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wA', role: Role.DEALER_STAFF });
      prisma.user.update.mockResolvedValue({});
      const out = await ctrl.deactivateStaff('wA', 's1', ownerA);
      expect(out).toEqual({ ok: true, isActive: false });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { isActive: false },
      });
    });
    it('forbids deactivating an admin', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wA', role: Role.ADMIN });
      await expect(ctrl.deactivateStaff('wA', 's1', ownerA)).rejects.toThrow(/admin/i);
    });
    it('forbids cross-dealer deactivation', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wB', role: Role.DEALER_STAFF });
      await expect(ctrl.deactivateStaff('wA', 's1', ownerA)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('reactivateStaff', () => {
    it('reactivates the staff user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wA', role: Role.DEALER_STAFF });
      prisma.user.update.mockResolvedValue({});
      const out = await ctrl.reactivateStaff('wA', 's1', ownerA);
      expect(out).toEqual({ ok: true, isActive: true });
    });
    it('allows admin to reactivate another tenant staff', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 's1', dealerId: 'wB', role: Role.DEALER_STAFF });
      prisma.user.update.mockResolvedValue({});
      await expect(ctrl.reactivateStaff('wB', 's1', admin)).resolves.toEqual({ ok: true, isActive: true });
    });
  });

  describe('update', () => {
    it('404s when the dealer is missing', async () => {
      prisma.dealer.findUnique.mockResolvedValue(null);
      await expect(ctrl.update('wA', { isActive: false } as any))
        .rejects.toBeInstanceOf(NotFoundException);
    });
    it('updates the dealer profile for an admin', async () => {
      prisma.dealer.findUnique.mockResolvedValue({ id: 'wA' });
      prisma.dealer.update.mockResolvedValue({ id: 'wA', isActive: false });
      const out = await ctrl.update('wA', { isActive: false } as any);
      expect(prisma.dealer.update).toHaveBeenCalledWith({ where: { id: 'wA' }, data: { isActive: false } });
      expect(out.isActive).toBe(false);
    });
  });
});
