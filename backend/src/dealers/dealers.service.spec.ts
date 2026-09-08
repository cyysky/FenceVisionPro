/**
 * DealersService unit tests. Mock PrismaService + AuthService so
 * no DB or bcrypt work happens.
 */
import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { DealersService } from './dealers.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { Role } from '@prisma/client';

describe('DealersService', () => {
  let svc: DealersService;
  let prisma: any;
  let auth: any;

  beforeEach(async () => {
    prisma = {
      dealer: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
      user: { findUnique: jest.fn(), create: jest.fn() },
    };
    auth = { hashPassword: jest.fn().mockResolvedValue('hashed!') };
    const mod = await Test.createTestingModule({
      providers: [
        DealersService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuthService, useValue: auth },
      ],
    }).compile();
    svc = mod.get(DealersService);
  });

  it('lists dealers newest first', async () => {
    prisma.dealer.findMany.mockResolvedValue([{ id: 'd1' }]);
    await svc.list();
    expect(prisma.dealer.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('gets a dealer with their users (id/email/fullName/role only)', async () => {
    const row = { id: 'd1', users: [{ id: 'u1' }] };
    prisma.dealer.findUnique.mockResolvedValue(row);
    const out = await svc.get('d1');
    expect(out).toBe(row);
    expect(prisma.dealer.findUnique).toHaveBeenCalledWith({
      where: { id: 'd1' },
      include: { users: { select: { id: true, email: true, fullName: true, role: true } } },
    });
  });

  it('throws 404 for a missing dealer', async () => {
    prisma.dealer.findUnique.mockResolvedValue(null);
    await expect(svc.get('missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('create', () => {
    const input = {
      name: 'Demo Fence Co',
      slug: 'demo',
      contactEmail: 'sales@demo.com',
      contactPhone: '+60',
      ownerEmail: '  Owner@Demo.COM ',
      ownerPassword: 'password123',
      ownerName: 'Owner',
    };

    it('rejects a slug already in use', async () => {
      prisma.dealer.findUnique.mockResolvedValue({ id: 'other' });
      await expect(svc.create(input)).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.dealer.create).not.toHaveBeenCalled();
    });

    it('creates the dealer then the owner, lowercasing the email and hashing the password', async () => {
      // The padded input must become the same normalized email the
      // login path looks up (otherwise the account can never sign in).
      prisma.dealer.findUnique.mockResolvedValue(null);
      prisma.dealer.create.mockResolvedValue({ id: 'd1', slug: 'demo' });
      prisma.user.create.mockResolvedValue({ id: 'u1', email: 'owner@demo.com', fullName: 'Owner' });
      const out = await svc.create(input);
      expect(prisma.dealer.create).toHaveBeenCalledWith({
        data: {
          name: 'Demo Fence Co',
          slug: 'demo',
          contactEmail: 'sales@demo.com',
          contactPhone: '+60',
        },
      });
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 'owner@demo.com',
          passwordHash: 'hashed!',
          fullName: 'Owner',
          role: Role.DEALER_OWNER,
          dealerId: 'd1',
        },
      });
      expect(auth.hashPassword).toHaveBeenCalledWith('password123');
      expect(out).toEqual({ dealer: { id: 'd1', slug: 'demo' }, owner: { id: 'u1', email: 'owner@demo.com', fullName: 'Owner' } });
    });
  });

  describe('addStaff', () => {
    it('rejects an email that is already registered (trims + case-insensitive)', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u0' });
      await expect(svc.addStaff('d1', '  TEMP@x.com  ', 'T', 'password123'))
        .rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'temp@x.com' } });
    });

    it('creates a DEALER_STAFF user pinned to the dealer with a trimmed email', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({ id: 'u2', email: 's@x.com', fullName: 'Staff', role: Role.DEALER_STAFF });
      const out = await svc.addStaff('d1', '  S@X.COM  ', 'Staff', 'password123');
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: {
          email: 's@x.com',
          fullName: 'Staff',
          passwordHash: 'hashed!',
          role: Role.DEALER_STAFF,
          dealerId: 'd1',
        },
      });
      expect(out.role).toBe(Role.DEALER_STAFF);
    });
  });
});
