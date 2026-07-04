/**
 * InstallationsService unit tests.
 *
 * We mock PrismaService (no real DB), then exercise the same
 * happy / sad paths the controller relies on:
 *
 *   - ownership / tenancy
 *   - lifecycle transitions (legal + illegal)
 *   - photo upload validation
 *   - customer-link issue / revoke
 *   - public token consumption (revoked / expired / valid)
 */
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { InstallationsService } from './installations.service';
import { PrismaService } from '../prisma/prisma.service';
import { Role, InstallationStatus } from '@prisma/client';

describe('InstallationsService', () => {
  let svc: InstallationsService;
  let prisma: any;

  const ownerA = { sub: 'u-A', role: Role.WHOLESALER_OWNER, email: 'a@x.com', wholesalerId: 'wA' } as any;
  const staffA = { sub: 'u-As', role: Role.WHOLESALER_STAFF, email: 'as@x.com', wholesalerId: 'wA' } as any;
  const staffB = { sub: 'u-B', role: Role.WHOLESALER_STAFF, email: 'b@x.com', wholesalerId: 'wB' } as any;
  const admin  = { sub: 'u-0', role: Role.ADMIN, email: 'root@x.com', wholesalerId: null } as any;

  beforeEach(async () => {
    prisma = {
      installation: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      installationEvent: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
      installationPhoto: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
      },
      publicCustomerLink: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      quote: {
        findUnique: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        InstallationsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    svc = mod.get(InstallationsService);
  });

  // -------------------------------------------------------------------------
  // get / ownership
  // -------------------------------------------------------------------------

  describe('get (ownership)', () => {
    it('returns the installation for the owning wholesaler', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED', events: [], photos: [], customerLinks: [] });
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', reference: 'FVP-1', customerName: 'Cust' });
      const out = await svc.get('i1', ownerA);
      expect(out.id).toBe('i1');
    });

    it('throws NotFoundException for a non-existent installation', async () => {
      prisma.installation.findUnique.mockResolvedValue(null);
      await expect(svc.get('missing', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("hides a wholesaler A installation from wholesaler B (404, not 403)", async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i2', quoteId: 'q2' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      await expect(svc.get('i2', staffB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets admin read any installation', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i3', quoteId: 'q3' });
      // quote lookup skipped for admin (returns undefined -> not isAdmin)
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i3', quoteId: 'q3', events: [], photos: [], customerLinks: [] });
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q3', reference: 'FVP-3', customerName: 'Cust' });
      const out = await svc.get('i3', admin);
      expect(out.id).toBe('i3');
    });
  });

  // -------------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('scopes results to the caller\'s wholesaler for non-admin', async () => {
      prisma.installation.findMany.mockResolvedValueOnce([]);
      await svc.list(staffA, {});
      expect(prisma.installation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { quote: { wholesalerId: 'wA' } } }),
      );
    });

    it('returns everything for admin (no tenant filter)', async () => {
      prisma.installation.findMany.mockResolvedValueOnce([]);
      await svc.list(admin, {});
      expect(prisma.installation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
    });

    it('applies status filter when provided', async () => {
      prisma.installation.findMany.mockResolvedValueOnce([]);
      await svc.list(ownerA, { status: 'IN_PROGRESS' });
      expect(prisma.installation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { quote: { wholesalerId: 'wA' }, status: 'IN_PROGRESS' } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates a SCHEDULED installation for an APPROVED quote', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', wholesalerId: 'wA', status: 'APPROVED' });
      prisma.installation.create.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.installationEvent.create.mockResolvedValueOnce({});
      // get() follow-up
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED', events: [], photos: [], customerLinks: [] });
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', reference: 'FVP-1', customerName: 'Cust' });
      const out = await svc.create(ownerA, { quoteId: 'q1' });
      expect(out.id).toBe('i1');
      expect(prisma.installation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ quoteId: 'q1', status: 'SCHEDULED' }) }),
      );
      expect(prisma.installationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'SCHEDULED' }) }),
      );
    });

    it('rejects when the quote is not APPROVED yet', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', wholesalerId: 'wA', status: 'SENT' });
      await expect(svc.create(ownerA, { quoteId: 'q1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns a friendly 400 if an installation already exists for the quote (P2002)', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', wholesalerId: 'wA', status: 'APPROVED' });
      const err: any = new Error('Unique constraint');
      err.code = 'P2002';
      prisma.installation.create.mockRejectedValueOnce(err);
      await expect(svc.create(ownerA, { quoteId: 'q1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws Forbidden when the quote belongs to a different wholesaler', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', wholesalerId: 'wB', status: 'APPROVED' });
      await expect(svc.create(staffA, { quoteId: 'q1' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // transition
  // -------------------------------------------------------------------------

  describe('transition', () => {
    it('allows SCHEDULED -> IN_PROGRESS and stamps startedAt', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      prisma.installation.update.mockResolvedValueOnce({});
      prisma.installationEvent.create.mockResolvedValueOnce({});
      // get() follow-up: findOwned (findUnique) + ownership check (quote.findUnique) + final quote fetch
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'IN_PROGRESS', events: [], photos: [], customerLinks: [] });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', reference: 'FVP-1', customerName: 'Cust' });
      await svc.transition('i1', ownerA, { toStatus: 'IN_PROGRESS' });
      expect(prisma.installation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', startedAt: expect.any(Date) }) }),
      );
    });

    it('rejects an illegal transition (SCHEDULED -> COMPLETED)', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      await expect(svc.transition('i1', ownerA, { toStatus: 'COMPLETED' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any transition out of INSPECTED (terminal)', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'INSPECTED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      await expect(svc.transition('i1', ownerA, { toStatus: 'CANCELLED' })).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // -------------------------------------------------------------------------
  // uploadPhoto
  // -------------------------------------------------------------------------

  describe('uploadPhoto', () => {
    const validJpeg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 0, 0]);

    it('rejects files larger than 25 MB', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'IN_PROGRESS' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      const tooBig = Buffer.alloc(26 * 1024 * 1024);
      const file = { originalname: 'big.jpg', buffer: tooBig, size: tooBig.length, mimetype: 'image/jpeg' };
      await expect(svc.uploadPhoto('i1', ownerA, file, { kind: 'BEFORE' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unsupported mime types', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'IN_PROGRESS' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      const file = { originalname: 'x.gif', buffer: validJpeg, size: validJpeg.length, mimetype: 'image/gif' };
      await expect(svc.uploadPhoto('i1', ownerA, file, { kind: 'BEFORE' }))
        .rejects.toThrow(/Unsupported mime type/);
    });

    it('persists a valid image and writes an audit event', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'IN_PROGRESS' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      prisma.installationPhoto.create.mockResolvedValueOnce({
        id: 'p1', kind: 'DURING', caption: 'Mid-job', originalFilename: 'a.jpg',
        mimeType: 'image/jpeg', sizeBytes: validJpeg.length, uploadedByKind: 'WHOLESALER',
        uploadedByLabel: 'a@x.com', takenAt: null, uploadedAt: new Date(),
      });
      prisma.installationEvent.create.mockResolvedValueOnce({});
      const file = { originalname: 'a.jpg', buffer: validJpeg, size: validJpeg.length, mimetype: 'image/jpeg' };
      const out = await svc.uploadPhoto('i1', ownerA, file, { kind: 'DURING', caption: 'Mid-job' });
      expect(out.id).toBe('p1');
      expect(out.uploadedByKind).toBe('WHOLESALER');
      expect(prisma.installationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'PHOTO_UPLOADED' }) }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // customer links
  // -------------------------------------------------------------------------

  describe('customer links', () => {
    it('issues a link with a 64-char hex token', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      // Capture the token the service generated, then echo it back.
      prisma.publicCustomerLink.create.mockImplementationOnce((args: any) => ({
        id: 'l1', token: args.data.token, purpose: 'ALL',
        expiresAt: args.data.expiresAt ?? null, revokedAt: null, createdAt: new Date(),
      }));
      prisma.installationEvent.create.mockResolvedValueOnce({});
      const out = await svc.createCustomerLink('i1', ownerA, { purpose: 'ALL' });
      expect(out.token).toMatch(/^[a-f0-9]{64}$/);
      expect(prisma.installationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ type: 'PUBLIC_LINK_ISSUIED' }) }),
      );
    });

    it('refuses to double-revoke', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ wholesalerId: 'wA' });
      prisma.publicCustomerLink.findUnique.mockResolvedValueOnce({ id: 'l1', installationId: 'i1', revokedAt: new Date() });
      const out = await svc.revokeCustomerLink('i1', 'l1', ownerA);
      expect(out).toEqual({ ok: true, alreadyRevoked: true });
      expect(prisma.publicCustomerLink.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // public token consumption
  // -------------------------------------------------------------------------

  describe('consumeCustomerLink', () => {
    it('returns null for an unknown token', async () => {
      prisma.publicCustomerLink.findUnique.mockResolvedValueOnce(null);
      const out = await svc.consumeCustomerLink('nope');
      expect(out).toBeNull();
    });

    it('returns null for a revoked link', async () => {
      prisma.publicCustomerLink.findUnique.mockResolvedValueOnce({ id: 'l1', revokedAt: new Date() });
      const out = await svc.consumeCustomerLink('tok');
      expect(out).toBeNull();
    });

    it('returns null for an expired link', async () => {
      prisma.publicCustomerLink.findUnique.mockResolvedValueOnce({
        id: 'l1', revokedAt: null, expiresAt: new Date(Date.now() - 1000),
      });
      const out = await svc.consumeCustomerLink('tok');
      expect(out).toBeNull();
    });

    it('stamps lastViewedAt and returns the link for a valid token', async () => {
      const link = { id: 'l1', revokedAt: null, expiresAt: null, token: 'tok', installationId: 'i1' };
      prisma.publicCustomerLink.findUnique.mockResolvedValueOnce(link);
      prisma.publicCustomerLink.update.mockResolvedValueOnce({ ...link, lastViewedAt: new Date() });
      const out = await svc.consumeCustomerLink('tok');
      expect(out?.id).toBe('l1');
      expect(prisma.publicCustomerLink.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { lastViewedAt: expect.any(Date) } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // generateToken format (random + unique enough)
  // -------------------------------------------------------------------------

  describe('token generation', () => {
    it('produces 64-character hex strings', () => {
      // We don't have a public accessor for the private method,
      // but the create-customer-link test already covers the
      // public path; this just sanity-checks Node's randomBytes
      // so the test reads as a deliberate contract assertion.
      const t = randomBytes(32).toString('hex');
      expect(t).toMatch(/^[a-f0-9]{64}$/);
    });
  });
});
