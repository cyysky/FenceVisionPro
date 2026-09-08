/**
 * AuthController unit tests: login failure/success hooks, /me echo,
 * and the change-password flow (bcrypt mocked).
 */
import { Test } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as throttle from './login-throttle.middleware';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

const bcryptCompare = bcrypt.compare as jest.Mock;

describe('AuthController', () => {
  let ctrl: AuthController;
  let auth: any;
  let prisma: any;
  let clearSpy: jest.SpyInstance;
  let failSpy: jest.SpyInstance;

  beforeEach(async () => {
    auth = {
      login: jest.fn(),
      hashPassword: jest.fn().mockResolvedValue('new-hash'),
    };
    prisma = {
      user: { findUnique: jest.fn(), update: jest.fn() },
    };
    clearSpy = jest.spyOn(throttle, 'clearFromReq').mockImplementation(() => {});
    failSpy = jest.spyOn(throttle, 'recordFailureFromReq').mockImplementation(() => {});
    const mod = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    ctrl = mod.get(AuthController);
  });
  afterEach(() => {
    clearSpy.mockRestore();
    failSpy.mockRestore();
  });

  describe('login', () => {
    it('clears the throttle counter on success', async () => {
      auth.login.mockResolvedValue({ accessToken: 't', user: {} });
      const out = await ctrl.login({ email: 'a@b.co', password: 'secret1' } as any, { __loginThrottle: { ip: '1.2.3.4' } });
      expect(out.accessToken).toBe('t');
      expect(clearSpy).toHaveBeenCalled();
      expect(failSpy).not.toHaveBeenCalled();
    });

    it('records a failure and rethrows on bad credentials', async () => {
      auth.login.mockRejectedValue(new Error('Invalid credentials'));
      await expect(ctrl.login({ email: 'a@b.co', password: 'wrong' } as any, { __loginThrottle: { ip: '1.2.3.4' } }))
        .rejects.toThrow('Invalid credentials');
      expect(failSpy).toHaveBeenCalled();
      expect(clearSpy).not.toHaveBeenCalled();
    });

    it('tolerates a request that bypassed the middleware (no hook)', async () => {
      auth.login.mockResolvedValue({ accessToken: 't', user: {} });
      const out = await ctrl.login({ email: 'a@b.co', password: 'secret1' } as any, {});
      expect(out.accessToken).toBe('t');
    });
  });

  describe('me', () => {
    it('echoes the JWT payload', () => {
      const u = { sub: 'u1', role: 'ADMIN' } as any;
      expect(ctrl.me(u)).toBe(u);
    });
  });

  describe('changePassword', () => {
    const req = { sub: 'u1' } as any;

    it('rejects missing/inactive users', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(ctrl.changePassword(req, { oldPassword: 'x', newPassword: 'newpass1' } as any))
        .rejects.toBeInstanceOf(ForbiddenException);
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: false, passwordHash: 'h' });
      await expect(ctrl.changePassword(req, { oldPassword: 'x', newPassword: 'newpass1' } as any))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a wrong current password', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true, passwordHash: 'h' });
      bcryptCompare.mockResolvedValue(false);
      await expect(ctrl.changePassword(req, { oldPassword: 'nope', newPassword: 'newpass1' } as any))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('hashes and persists the new password on success', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', isActive: true, passwordHash: 'h' });
      bcryptCompare.mockResolvedValue(true);
      prisma.user.update.mockResolvedValue({});
      const out = await ctrl.changePassword(req, { oldPassword: 'oldpass', newPassword: 'newpass1' } as any);
      expect(out).toEqual({ ok: true });
      expect(auth.hashPassword).toHaveBeenCalledWith('newpass1');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'u1' },
        data: { passwordHash: 'new-hash' },
      });
    });
  });
});
