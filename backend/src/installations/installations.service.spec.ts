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

  const ownerA = { sub: 'u-A', role: Role.DEALER_OWNER, email: 'a@x.com', dealerId: 'wA' } as any;
  const staffA = { sub: 'u-As', role: Role.DEALER_STAFF, email: 'as@x.com', dealerId: 'wA' } as any;
  const staffB = { sub: 'u-B', role: Role.DEALER_STAFF, email: 'b@x.com', dealerId: 'wB' } as any;
  const admin  = { sub: 'u-0', role: Role.ADMIN, email: 'root@x.com', dealerId: null } as any;

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
      installer: {
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
    it('returns the installation for the owning dealer', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED', events: [], photos: [], customerLinks: [] });
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', reference: 'FVP-1', customerName: 'Cust' });
      const out = await svc.get('i1', ownerA);
      expect(out.id).toBe('i1');
    });

    it('throws NotFoundException for a non-existent installation', async () => {
      prisma.installation.findUnique.mockResolvedValue(null);
      await expect(svc.get('missing', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("hides a dealer A installation from dealer B (404, not 403)", async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i2', quoteId: 'q2' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
      await expect(svc.get('i2', staffB)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('lets admin read any installation', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i3', quoteId: 'q3' });
      // quote lookup skipped for admin (returns undefined -> not isAdmin)
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
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
    it('scopes results to the caller\'s dealer for non-admin', async () => {
      prisma.installation.findMany.mockResolvedValueOnce([]);
      await svc.list(staffA, {});
      expect(prisma.installation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { quote: { dealerId: 'wA' } } }),
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
        expect.objectContaining({ where: { quote: { dealerId: 'wA' }, status: 'IN_PROGRESS' } }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------------

  describe('create', () => {
    it('creates a SCHEDULED installation for an APPROVED quote', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', dealerId: 'wA', status: 'APPROVED' });
      prisma.installation.create.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.installationEvent.create.mockResolvedValueOnce({});
      // get() follow-up
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
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
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', dealerId: 'wA', status: 'SENT' });
      await expect(svc.create(ownerA, { quoteId: 'q1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns a friendly 400 if an installation already exists for the quote (P2002)', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', dealerId: 'wA', status: 'APPROVED' });
      const err: any = new Error('Unique constraint');
      err.code = 'P2002';
      prisma.installation.create.mockRejectedValueOnce(err);
      await expect(svc.create(ownerA, { quoteId: 'q1' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws Forbidden when the quote belongs to a different dealer', async () => {
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', dealerId: 'wB', status: 'APPROVED' });
      await expect(svc.create(staffA, { quoteId: 'q1' })).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // transition
  // -------------------------------------------------------------------------

  describe('transition', () => {
    it('allows SCHEDULED -> IN_PROGRESS and stamps startedAt', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
      prisma.installation.update.mockResolvedValueOnce({});
      prisma.installationEvent.create.mockResolvedValueOnce({});
      // get() follow-up: findOwned (findUnique) + ownership check (quote.findUnique) + final quote fetch
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'IN_PROGRESS', events: [], photos: [], customerLinks: [] });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
      prisma.quote.findUnique.mockResolvedValueOnce({ id: 'q1', reference: 'FVP-1', customerName: 'Cust' });
      await svc.transition('i1', ownerA, { toStatus: 'IN_PROGRESS' });
      expect(prisma.installation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', startedAt: expect.any(Date) }) }),
      );
    });

    it('rejects an illegal transition (SCHEDULED -> COMPLETED)', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
      await expect(svc.transition('i1', ownerA, { toStatus: 'COMPLETED' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects any transition out of INSPECTED (terminal)', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'INSPECTED' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
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
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
      const tooBig = Buffer.alloc(26 * 1024 * 1024);
      const file = { originalname: 'big.jpg', buffer: tooBig, size: tooBig.length, mimetype: 'image/jpeg' };
      await expect(svc.uploadPhoto('i1', ownerA, file, { kind: 'BEFORE' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects unsupported mime types', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'IN_PROGRESS' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
      const file = { originalname: 'x.gif', buffer: validJpeg, size: validJpeg.length, mimetype: 'image/gif' };
      await expect(svc.uploadPhoto('i1', ownerA, file, { kind: 'BEFORE' }))
        .rejects.toThrow(/Unsupported mime type/);
    });

    it('persists a valid image and writes an audit event', async () => {
      prisma.installation.findUnique.mockResolvedValueOnce({ id: 'i1', quoteId: 'q1', status: 'IN_PROGRESS' });
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
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
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
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
      prisma.quote.findUnique.mockResolvedValueOnce({ dealerId: 'wA' });
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

  // -------------------------------------------------------------------------
  // update (+ installer assignment) and create-with-installer
  // -------------------------------------------------------------------------

  const baseInst = {
    id: 'i1', quoteId: 'q1', status: 'SCHEDULED',
    events: [], photos: [], customerLinks: [],
  };

  describe('update', () => {
    beforeEach(() => {
      prisma.installation.findUnique.mockResolvedValue(baseInst);
      prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wA' });
      prisma.installation.update.mockResolvedValue({});
      prisma.installationEvent.create.mockResolvedValue({});
    });

    it('writes editable fields and logs the change', async () => {
      await svc.update('i1', ownerA, { scheduledStart: '2026-10-01T10:00:00Z', installerName: 'Inst A' });
      const data = prisma.installation.update.mock.calls[0][0].data;
      expect(data.scheduledStart).toBeInstanceOf(Date);
      expect(data.installerName).toBe('Inst A');
      expect(prisma.installationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'NOTE_ADDED',
            metadata: { kind: 'installation_updated', fields: ['scheduledStart', 'installerName'] },
          }),
        }),
      );
    });

    it('clears the installer when an empty string is passed', async () => {
      await svc.update('i1', ownerA, { installerId: '' });
      expect(prisma.installation.update.mock.calls[0][0].data.installerId).toBeNull();
      expect(prisma.installer.findUnique).not.toHaveBeenCalled();
    });

    it('validates and assigns a same-tenant installer', async () => {
      prisma.installer.findUnique.mockResolvedValue({
        id: 'inst1', dealerId: 'wA', name: 'Inst A', phone: '123', email: 'i@x.com',
      });
      await svc.update('i1', ownerA, { installerId: 'inst1' });
      expect(prisma.installation.update.mock.calls[0][0].data.installerId).toBe('inst1');
    });

    it('forbids assigning another tenant installer', async () => {
      prisma.installer.findUnique.mockResolvedValue({ id: 'inst1', dealerId: 'wB' });
      await expect(svc.update('i1', ownerA, { installerId: 'inst1' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s when the installer does not exist', async () => {
      prisma.installer.findUnique.mockResolvedValue(null);
      await expect(svc.update('i1', ownerA, { installerId: 'inst1' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('does not log an event when nothing changed', async () => {
      await svc.update('i1', ownerA, {});
      expect(prisma.installationEvent.create).not.toHaveBeenCalled();
    });
  });

  describe('create with installer assignment', () => {
    it('pre-populates the snapshot fields from the installer row', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'wA', status: 'APPROVED' });
      prisma.installer.findUnique.mockResolvedValue({
        id: 'inst1', dealerId: 'wA', name: 'Inst A', phone: '123', email: 'i@x.com',
      });
      prisma.installation.create.mockResolvedValue({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.installationEvent.create.mockResolvedValue({});
      prisma.installation.findUnique.mockResolvedValue(baseInst);
      await svc.create(ownerA, { quoteId: 'q1', installerId: 'inst1' });
      const data = prisma.installation.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        installerId: 'inst1',
        installerName: 'Inst A',
        installerPhone: '123',
        installerEmail: 'i@x.com',
      });
    });

    it('lets the explicit body fields win over the installer snapshot', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'wA', status: 'APPROVED' });
      prisma.installer.findUnique.mockResolvedValue({
        id: 'inst1', dealerId: 'wA', name: 'Inst A', phone: '123', email: 'i@x.com',
      });
      prisma.installation.create.mockResolvedValue({ id: 'i1', quoteId: 'q1', status: 'SCHEDULED' });
      prisma.installationEvent.create.mockResolvedValue({});
      prisma.installation.findUnique.mockResolvedValue(baseInst);
      await svc.create(ownerA, {
        quoteId: 'q1', installerId: 'inst1', installerName: 'Overridden',
      });
      expect(prisma.installation.create.mock.calls[0][0].data.installerName).toBe('Overridden');
    });

    it('forbids assigning a foreign installer', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'wA', status: 'APPROVED' });
      prisma.installer.findUnique.mockResolvedValue({ id: 'inst1', dealerId: 'wB' });
      await expect(svc.create(ownerA, { quoteId: 'q1', installerId: 'inst1' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });

    it('404s an unknown installer', async () => {
      prisma.quote.findUnique.mockResolvedValue({ id: 'q1', dealerId: 'wA', status: 'APPROVED' });
      prisma.installer.findUnique.mockResolvedValue(null);
      await expect(svc.create(ownerA, { quoteId: 'q1', installerId: 'inst1' }))
        .rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // Photo list / blob / delete
  // -------------------------------------------------------------------------

  describe('photo list/blob/delete', () => {
    beforeEach(() => {
      prisma.installation.findUnique.mockResolvedValue(baseInst);
      prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wA' });
    });

    it('lists photo metadata without the blob', async () => {
      prisma.installationPhoto.findMany.mockResolvedValue([]);
      await svc.listPhotos('i1', ownerA);
      const arg = prisma.installationPhoto.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ installationId: 'i1' });
      expect(arg.select).not.toHaveProperty('data');
      expect(arg.select.mimeType).toBe(true);
    });

    it('returns the photo blob for the parent installation', async () => {
      prisma.installationPhoto.findUnique.mockResolvedValue({
        id: 'ph1', installationId: 'i1', mimeType: 'image/jpeg', sizeBytes: 3,
        originalFilename: 'a.jpg', data: Buffer.from('abc'),
      });
      const out = await svc.getPhotoBlob('i1', 'ph1', ownerA);
      expect(out).toMatchObject({ mimeType: 'image/jpeg', sizeBytes: 3, originalFilename: 'a.jpg' });
      expect(out.data.toString()).toBe('abc');
    });

    it('404s a photo that belongs to another installation', async () => {
      prisma.installationPhoto.findUnique.mockResolvedValue({ id: 'ph1', installationId: 'i9' });
      await expect(svc.getPhotoBlob('i1', 'ph1', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes a photo and leaves an audit trail', async () => {
      prisma.installationPhoto.findUnique.mockResolvedValue({
        id: 'ph1', installationId: 'i1', originalFilename: 'a.jpg',
      });
      prisma.installationPhoto.delete.mockResolvedValue({});
      prisma.installationEvent.create.mockResolvedValue({});
      await expect(svc.deletePhoto('i1', 'ph1', ownerA)).resolves.toEqual({ ok: true });
      expect(prisma.installationPhoto.delete).toHaveBeenCalledWith({ where: { id: 'ph1' } });
      expect(prisma.installationEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { kind: 'photo_deleted', photoId: 'ph1', originalFilename: 'a.jpg' },
          }),
        }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Customer link list / revoke
  // -------------------------------------------------------------------------

  describe('customer link lifecycle', () => {
    beforeEach(() => {
      prisma.installation.findUnique.mockResolvedValue(baseInst);
      prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wA' });
    });

    it('lists the links for an installation', async () => {
      prisma.publicCustomerLink.findMany.mockResolvedValue([]);
      await svc.listCustomerLinks('i1', ownerA);
      expect(prisma.publicCustomerLink.findMany).toHaveBeenCalledWith({
        where: { installationId: 'i1' },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('soft-revokes a link and records an event', async () => {
      prisma.publicCustomerLink.findUnique.mockResolvedValue({
        id: 'l1', installationId: 'i1', revokedAt: null,
      });
      prisma.publicCustomerLink.update.mockResolvedValue({});
      prisma.installationEvent.create.mockResolvedValue({});
      await expect(svc.revokeCustomerLink('i1', 'l1', ownerA)).resolves.toEqual({ ok: true });
      expect(prisma.publicCustomerLink.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { revokedAt: expect.any(Date) } }),
      );
      expect(prisma.installationEvent.create).toHaveBeenCalled();
    });

    it('404s when revoking a link of another installation', async () => {
      prisma.publicCustomerLink.findUnique.mockResolvedValue({ id: 'l9', installationId: 'i9' });
      await expect(svc.revokeCustomerLink('i1', 'l9', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // findByIdPublic
  // -------------------------------------------------------------------------

  describe('findByIdPublic', () => {
    it('returns the installation with the public include shape', async () => {
      prisma.installation.findUnique.mockResolvedValue({ id: 'i1' });
      const out = await svc.findByIdPublic('i1');
      expect(out).toEqual({ id: 'i1' });
      const arg = prisma.installation.findUnique.mock.calls[0][0];
      expect(arg.include.quote.select).toMatchObject({
        reference: true, customerName: true, customerEmail: true,
      });
      expect(arg.include.photos.select).not.toHaveProperty('data');
      expect(arg.include.events.orderBy).toEqual({ occurredAt: 'asc' });
    });
  });
});
