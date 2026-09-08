/**
 * AuthService tests focused on the isActive flag and password
 * comparison. We mock Prisma and bcrypt.
 */
import { AuthService } from './auth.service';
import * as bcrypt from 'bcryptjs';

describe('AuthService - login and isActive', () => {
  let svc: AuthService;
  let prisma: any;
  let jwt: any;

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    jwt = { sign: jest.fn().mockReturnValue('TOKEN') };
    svc = new AuthService(prisma, jwt);
  });

  it('returns accessToken + user on valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@x.com', fullName: 'A',
      role: 'DEALER_OWNER', dealerId: 'w1', isActive: true,
      passwordHash: await bcrypt.hash('rightpw', 4),
    });
    const out = await svc.login('a@x.com', 'rightpw');
    expect(out.accessToken).toBe('TOKEN');
    expect(out.user.email).toBe('a@x.com');
    expect(out.user.role).toBe('DEALER_OWNER');
  });

  it('rejects wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@x.com', fullName: 'A',
      role: 'DEALER_OWNER', dealerId: 'w1', isActive: true,
      passwordHash: await bcrypt.hash('rightpw', 4),
    });
    await expect(svc.login('a@x.com', 'wrongpw')).rejects.toThrow(/Invalid credentials/);
  });

  it('rejects unknown email', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(svc.login('nope@x.com', 'whatever1')).rejects.toThrow(/Invalid credentials/);
  });

  it('rejects deactivated user even with correct password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@x.com', fullName: 'A',
      role: 'DEALER_OWNER', dealerId: 'w1', isActive: false,
      passwordHash: await bcrypt.hash('rightpw', 4),
    });
    await expect(svc.login('a@x.com', 'rightpw')).rejects.toThrow(/Invalid credentials/);
  });

  it('lowercases the email on lookup', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@x.com', fullName: 'A',
      role: 'DEALER_OWNER', dealerId: 'w1', isActive: true,
      passwordHash: await bcrypt.hash('rightpw', 4),
    });
    await svc.login('A@X.COM', 'rightpw');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@x.com' } });
  });

  describe('demoLogin', () => {
    const demoUser = {
      id: 'u1', email: 'owner@yardex.local', fullName: 'Yardex Owner',
      role: 'DEALER_OWNER', dealerId: 'w1', isActive: true,
      passwordHash: 'unused',
    };

    it('issues a token for an active demo account without a password', async () => {
      prisma.user.findUnique.mockResolvedValue(demoUser);
      const out = await svc.demoLogin('owner@yardex.local');
      expect(out.accessToken).toBe('TOKEN');
      expect(out.user.email).toBe('owner@yardex.local');
      expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'owner@yardex.local' } });
    });

    it('rejects non-demo accounts', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...demoUser, email: 'real@customer.com' });
      await expect(svc.demoLogin('real@customer.com')).rejects.toThrow(/Invalid demo account/);
    });

    it('rejects unknown and inactive demo accounts', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(svc.demoLogin('nobody@yardex.local')).rejects.toThrow(/Invalid demo account/);
      prisma.user.findUnique.mockResolvedValue({ ...demoUser, isActive: false });
      await expect(svc.demoLogin('owner@yardex.local')).rejects.toThrow(/Invalid demo account/);
    });
  });
});
