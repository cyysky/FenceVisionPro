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
      role: 'WHOLESALER_OWNER', wholesalerId: 'w1', isActive: true,
      passwordHash: await bcrypt.hash('rightpw', 4),
    });
    const out = await svc.login('a@x.com', 'rightpw');
    expect(out.accessToken).toBe('TOKEN');
    expect(out.user.email).toBe('a@x.com');
    expect(out.user.role).toBe('WHOLESALER_OWNER');
  });

  it('rejects wrong password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@x.com', fullName: 'A',
      role: 'WHOLESALER_OWNER', wholesalerId: 'w1', isActive: true,
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
      role: 'WHOLESALER_OWNER', wholesalerId: 'w1', isActive: false,
      passwordHash: await bcrypt.hash('rightpw', 4),
    });
    await expect(svc.login('a@x.com', 'rightpw')).rejects.toThrow(/Invalid credentials/);
  });

  it('lowercases the email on lookup', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1', email: 'a@x.com', fullName: 'A',
      role: 'WHOLESALER_OWNER', wholesalerId: 'w1', isActive: true,
      passwordHash: await bcrypt.hash('rightpw', 4),
    });
    await svc.login('A@X.COM', 'rightpw');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { email: 'a@x.com' } });
  });
});
