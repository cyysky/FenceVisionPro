/**
 * ProjectsService unit tests. We mock PrismaService and AiService
 * to avoid hitting a real database, and we mock QuotesService so
 * the promote-to-quote tests can assert on the linkage without
 * re-running the whole quote transaction.
 */
import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { ProjectsService, sniffMimeType } from './projects.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { QuotesService } from '../quotes/quotes.service';
import { ProjectStatus, Role } from '@prisma/client';

describe('sniffMimeType', () => {
  it('detects PNG by signature', () => {
    const png = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    expect(sniffMimeType(png)).toBe('image/png');
  });
  it('detects JPEG by signature', () => {
    const jpg = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    expect(sniffMimeType(jpg)).toBe('image/jpeg');
  });
  it('detects WEBP by RIFF/WEBP signature', () => {
    const webp = Buffer.alloc(12);
    Buffer.from('RIFF').copy(webp, 0);
    Buffer.from('WEBP').copy(webp, 8);
    expect(sniffMimeType(webp)).toBe('image/webp');
  });
  it('detects PDF by %PDF- signature', () => {
    expect(sniffMimeType(Buffer.from('%PDF-1.4'))).toBe('application/pdf');
  });
  it('returns null for unknown bytes', () => {
    expect(sniffMimeType(Buffer.from('hello world'))).toBeNull();
  });
});

describe('ProjectsService', () => {
  let svc: ProjectsService;
  let prisma: any;
  let ai: any;
  let quotes: any;

  beforeEach(async () => {
    prisma = {
      project: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      projectDocument: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      projectFenceSelection: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      projectMeasurement: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      projectVisualization: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
      },
      quote: { update: jest.fn() },
      dealer: { findUnique: jest.fn() },
    };
    ai = {
      generateFenceImage: jest.fn(),
      generateThreeJsScene: jest.fn(),
      imageModel: 'mock-image',
    };
    quotes = { create: jest.fn() };

    const mod = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
        { provide: QuotesService, useValue: quotes },
      ],
    }).compile();
    svc = mod.get(ProjectsService);
  });

  const staffA = { sub: 'u-A', role: Role.DEALER_STAFF, dealerId: 'wA' } as any;
  const ownerA = { sub: 'u-A2', role: Role.DEALER_OWNER, dealerId: 'wA' } as any;
  const staffB = { sub: 'u-B', role: Role.DEALER_STAFF, dealerId: 'wB' } as any;
  const admin  = { sub: 'u-0', role: Role.ADMIN, dealerId: null } as any;

  // -------------------------------------------------------------------------
  // findOne / ownership
  // -------------------------------------------------------------------------

  describe('findOne (ownership)', () => {
    it("throws ForbiddenException when a non-admin user from dealer A requests dealer B's project", async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wB' });
      await expect(svc.findOne('p1', staffA)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the project when the user owns it', async () => {
      prisma.project.findUnique
        .mockResolvedValueOnce({ id: 'p1', dealerId: 'wA' })
        .mockResolvedValueOnce({
          id: 'p1', dealerId: 'wA',
          documents: [], selections: [], measurements: [], visualizations: [],
        });
      const out = await svc.findOne('p1', staffA);
      expect(out.id).toBe('p1');
      expect(out.documents).toEqual([]);
    });

    it('returns the project when the user is admin regardless of dealerId', async () => {
      prisma.project.findUnique
        .mockResolvedValueOnce({ id: 'p2', dealerId: 'wB' })
        .mockResolvedValueOnce({
          id: 'p2', dealerId: 'wB',
          documents: [], selections: [], measurements: [], visualizations: [],
        });
      const out = await svc.findOne('p2', admin);
      expect(out.id).toBe('p2');
    });

    it('throws NotFoundException for an unknown project id', async () => {
      prisma.project.findUnique.mockResolvedValue(null);
      await expect(svc.findOne('missing', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // uploadDocument
  // -------------------------------------------------------------------------

  describe('uploadDocument', () => {
    it('rejects files larger than 25 MB', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      // 26 MB of valid PNG bytes
      const tooBig = Buffer.alloc(26 * 1024 * 1024, 0);
      const file = {
        originalname: 'big.png',
        buffer: tooBig,
        size: tooBig.length,
        mimetype: 'image/png',
      };
      await expect(svc.uploadDocument('p1', ownerA, file, { kind: 'SITE_PHOTO' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects mime types not in the allowlist', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      const buf = Buffer.from('GIF89a');
      const file = {
        originalname: 'thing.gif', buffer: buf, size: buf.length, mimetype: 'image/gif',
      };
      await expect(svc.uploadDocument('p1', ownerA, file, { kind: 'OTHER' }))
        .rejects.toThrow(/Unsupported mime type/);
    });

    it('rejects files whose magic bytes do not match the declared mime type', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      // Content is plain text but claimed to be PNG.
      const buf = Buffer.from('this is not a png');
      const file = {
        originalname: 'fake.png', buffer: buf, size: buf.length, mimetype: 'image/png',
      };
      await expect(svc.uploadDocument('p1', ownerA, file, { kind: 'SITE_PHOTO' }))
        .rejects.toThrow(/do not match any allowed format|match/);
    });

    it('extracts widthPx/heightPx for a valid PNG', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      // Tiny valid 1x1 PNG.
      const png1x1 = Buffer.from(
        '89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4' +
        '890000000D49444154789C63F8FFFF3F0005FE02FED0E29B3F0000000049454E44' +
        'AE426082',
        'hex',
      );
      // Pad to satisfy minimum size
      const file = {
        originalname: 'pixel.png',
        buffer: png1x1,
        size: png1x1.length,
        mimetype: 'image/png',
      };
      prisma.projectDocument.create.mockImplementation(({ data }: any) => ({
        id: 'd1',
        projectId: data.projectId,
        kind: data.kind,
        originalFilename: data.originalFilename,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        widthPx: data.widthPx,
        heightPx: data.heightPx,
        uploadedById: data.uploadedById,
        uploadedAt: new Date(),
        caption: data.caption,
      }));
      const out = await svc.uploadDocument('p1', ownerA, file, { kind: 'SITE_PHOTO', caption: 'Front yard' });
      expect(out.mimeType).toBe('image/png');
      expect(out.widthPx).toBe(1);
      expect(out.heightPx).toBe(1);
      expect(out.caption).toBe('Front yard');
      // The blob itself is not returned on the metadata select, but
      // the create call should have received it.
      const createArg = prisma.projectDocument.create.mock.calls[0][0];
      expect(Buffer.isBuffer(createArg.data.data)).toBe(true);
      expect(createArg.data.data.equals(png1x1)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // generateVisualization
  // -------------------------------------------------------------------------

  describe('generateVisualization', () => {
    it('persists AI_IMAGE bytes and metadata when aiService.generateFenceImage returns a path', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      // Write a real temp file under a temp data dir so the service
      // can read it back. We override DATA_DIR for this test so we
      // never touch the repo's real data/ directory.
      const fs = require('fs/promises') as typeof import('fs/promises');
      const tmpData = path.join(os.tmpdir(), `fvp-spec-${Date.now()}`);
      const prevDataDir = process.env.DATA_DIR;
      process.env.DATA_DIR = tmpData;
      try {
        await fs.mkdir(path.join(tmpData, 'renders'), { recursive: true });
      } finally {
        // No-op - we restore in afterEach below.
      }
      const filename = `test-ai-${Date.now()}.png`;
      const absPath = path.join(tmpData, 'renders', filename);
      const bytes = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3]);
      await fs.writeFile(absPath, bytes);
      ai.generateFenceImage.mockResolvedValue({ relPath: `renders/${filename}`, url: `/static/renders/${filename}` });
      prisma.projectVisualization.create.mockImplementation(({ data }: any) => ({
        id: 'v1',
        projectId: data.projectId,
        kind: data.kind,
        mimeType: data.mimeType,
        prompt: data.prompt,
        modelUsed: data.modelUsed,
        widthPx: data.widthPx,
        heightPx: data.heightPx,
        generatedAt: new Date(),
      }));
      const out = await svc.generateVisualization('p1', ownerA, {
        kind: 'AI_IMAGE', style: 'Privacy', color: 'Black', heightFt: 6, panelCount: 10,
      });
      expect(out.kind).toBe('AI_IMAGE');
      expect(out.mimeType).toBe('image/png');
      // The bytes were passed through to Prisma.
      const createArg = prisma.projectVisualization.create.mock.calls[0][0];
      expect(Buffer.isBuffer(createArg.data.data)).toBe(true);
      expect(createArg.data.data.equals(bytes)).toBe(true);
      expect(createArg.data.prompt).toContain('Privacy');
      // The temp file should have been cleaned up.
      await expect(fs.access(absPath)).rejects.toBeTruthy();
      // Clean up the tmp dir + restore env.
      await fs.rm(tmpData, { recursive: true, force: true }).catch(() => { /* ignore */ });
      if (prevDataDir === undefined) delete process.env.DATA_DIR;
      else process.env.DATA_DIR = prevDataDir;
    });

    it('persists AI_3D_SNAPSHOT source code as application/javascript', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      const code = '(function(){ var x = 1; })();';
      ai.generateThreeJsScene.mockResolvedValue({ code, model: 'mock-code' });
      prisma.projectVisualization.create.mockImplementation(({ data }: any) => ({
        id: 'v2',
        projectId: data.projectId,
        kind: data.kind,
        mimeType: data.mimeType,
        prompt: data.prompt,
        modelUsed: data.modelUsed,
        widthPx: data.widthPx,
        heightPx: data.heightPx,
        generatedAt: new Date(),
      }));
      const out = await svc.generateVisualization('p1', ownerA, {
        kind: 'AI_3D_SNAPSHOT', style: 'Picket', color: 'White', heightFt: 4, gateCount: 1,
      });
      expect(out.kind).toBe('AI_3D_SNAPSHOT');
      const createArg = prisma.projectVisualization.create.mock.calls[0][0];
      expect(createArg.data.mimeType).toBe('application/javascript');
      // The data column is a Buffer of the source code.
      expect(Buffer.isBuffer(createArg.data.data)).toBe(true);
      expect(createArg.data.data.toString('utf8')).toBe(code);
    });
  });

  // -------------------------------------------------------------------------
  // promoteToQuote
  // -------------------------------------------------------------------------

  describe('promoteToQuote', () => {
    it('creates a Quote with derived segments and links it to the project', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', status: ProjectStatus.DRAFT });
      prisma.projectFenceSelection.findMany.mockResolvedValue([
        { id: 's1', projectId: 'p1', productId: 'prod-1', designId: null, linearMeters: 12, heightFt: 6, panelCount: 5, gateCount: 1, notes: null, sortOrder: 0 },
        { id: 's2', projectId: 'p1', productId: 'prod-2', designId: 'design-1', linearMeters: 8, heightFt: 4, panelCount: null, gateCount: 0, notes: null, sortOrder: 1 },
      ]);
      quotes.create.mockResolvedValue({ id: 'q1' });
      prisma.quote.update.mockResolvedValue({ id: 'q1', projectId: 'p1' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: ProjectStatus.QUOTED });

      const out = await svc.promoteToQuote('p1', ownerA, { customerEmail: 'cust@example.com' });
      expect(out).toEqual({ quoteId: 'q1' });

      // QuotesService.create received one segment per selection.
      const createArg = quotes.create.mock.calls[0];
      expect(createArg[0]).toBe('wA');                            // dealerId
      expect(createArg[1]).toBe(ownerA.sub);                     // userId
      const dto = createArg[2];
      expect(dto.fenceSegments).toHaveLength(2);
      expect(dto.fenceSegments[0]).toMatchObject({
        x1: 0, y1: 0, x2: 12, y2: 0, lengthM: 12,
        productId: 'prod-1', heightOption: '6',
      });
      expect(dto.fenceSegments[1]).toMatchObject({
        x2: 8, lengthM: 8, productId: 'prod-2', heightOption: '4',
      });

      // The new quote was linked back to the project and the
      // project status was flipped to QUOTED.
      expect(prisma.quote.update).toHaveBeenCalledWith({
        where: { id: 'q1' }, data: { projectId: 'p1' },
      });
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' }, data: { status: ProjectStatus.QUOTED },
      });
    });

    it('sets project.status = QUOTED', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', status: ProjectStatus.SUBMITTED });
      prisma.projectFenceSelection.findMany.mockResolvedValue([
        { id: 's1', productId: 'prod-1', linearMeters: 5, heightFt: 5, designId: null, panelCount: null, gateCount: null, sortOrder: 0, notes: null },
      ]);
      quotes.create.mockResolvedValue({ id: 'q9' });
      prisma.quote.update.mockResolvedValue({ id: 'q9' });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: ProjectStatus.QUOTED });

      await svc.promoteToQuote('p1', ownerA, { customerEmail: 'cust@example.com' });
      const updateCall = prisma.project.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe(ProjectStatus.QUOTED);
    });

    it('refuses to promote a project with no fence selections', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', status: ProjectStatus.DRAFT });
      prisma.projectFenceSelection.findMany.mockResolvedValue([]);
      await expect(svc.promoteToQuote('p1', ownerA, { customerEmail: 'a@b.com' }))
        .rejects.toThrow(/at least one fence selection/i);
    });

    it('refuses to promote when the project has no customer email and none is provided', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1', dealerId: 'wA', status: ProjectStatus.DRAFT, customerEmail: null,
      });
      prisma.projectFenceSelection.findMany.mockResolvedValue([
        { id: 's1', productId: 'p', linearMeters: 1, heightFt: 4, designId: null, panelCount: null, gateCount: null, sortOrder: 0, notes: null },
      ]);
      await expect(svc.promoteToQuote('p1', ownerA, {}))
        .rejects.toThrow(/customer email/i);
    });

    it('blocks non-owner non-admin from promoting', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wB', status: ProjectStatus.DRAFT });
      await expect(svc.promoteToQuote('p1', staffA, { customerEmail: 'a@b.com' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // -------------------------------------------------------------------------
  // list / create / update / softDelete
  // -------------------------------------------------------------------------

  describe('list', () => {
    it('scopes dealers to their tenant and returns rows + total', async () => {
      prisma.project.findMany.mockResolvedValue([{ id: 'p1' }]);
      prisma.project.count.mockResolvedValue(1);
      const out = await svc.list(staffA, { q: '  smith  ', take: 5, skip: 10, status: 'DRAFT' });
      expect(out).toEqual({ rows: [{ id: 'p1' }], total: 1 });
      const findArg = prisma.project.findMany.mock.calls[0][0];
      expect(findArg.where.dealerId).toBe('wA');
      expect(findArg.where.status).toBe('DRAFT');
      expect(findArg.where.OR).toEqual([
        { customerName: { contains: 'smith', mode: 'insensitive' } },
        { customerEmail: { contains: 'smith', mode: 'insensitive' } },
        { notes: { contains: 'smith', mode: 'insensitive' } },
      ]);
      expect(findArg.take).toBe(5);
      expect(findArg.skip).toBe(10);
      expect(prisma.project.count).toHaveBeenCalledWith({ where: findArg.where });
    });

    it('lets admin see every row and clamps take/skip', async () => {
      prisma.project.findMany.mockResolvedValue([]);
      prisma.project.count.mockResolvedValue(0);
      await svc.list(admin, { take: 9999, skip: -3 });
      const arg = prisma.project.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({});
      expect(arg.take).toBe(500);
      expect(arg.skip).toBe(0);
    });
  });

  describe('create', () => {
    it('pins dealer users to their own tenant even when a dealerId is supplied', async () => {
      prisma.project.create.mockResolvedValue({ id: 'p1' });
      await svc.create(ownerA, {
        customerName: 'Jane', installScope: 'FULL', dealerId: 'wB',
      });
      expect(prisma.project.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ dealerId: 'wA', installScope: 'FULL', status: ProjectStatus.DRAFT }),
      });
    });

    it('rejects an admin creating with an unknown dealerId', async () => {
      prisma.dealer.findUnique.mockResolvedValue(null);
      await expect(svc.create(admin, { customerName: 'X', installScope: 'FULL', dealerId: 'nope' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a caller with no tenant', async () => {
      await expect(svc.create(admin, { customerName: 'X', installScope: 'PARTIAL' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('update', () => {
    const dto = { customerName: 'New', totalLinearMeters: 42 };
    it('applies a partial update after ownership check', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', submittedAt: null });
      prisma.project.update.mockResolvedValue({ id: 'p1' });
      await svc.update('p1', staffA, dto);
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'p1' },
        data: expect.objectContaining({ customerName: 'New', totalLinearMeters: 42 }),
      });
    });

    it('stamps submittedAt only on the first SUBMITTED transition', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', submittedAt: null });
      prisma.project.update.mockResolvedValue({});
      await svc.update('p1', ownerA, { status: ProjectStatus.SUBMITTED });
      const data = prisma.project.update.mock.calls[0][0].data;
      expect(data.status).toBe(ProjectStatus.SUBMITTED);
      expect(data.submittedAt).toBeInstanceOf(Date);
    });

    it('does not re-stamp submittedAt when already submitted', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', submittedAt: new Date('2026-01-01') });
      prisma.project.update.mockResolvedValue({});
      await svc.update('p1', ownerA, { status: ProjectStatus.SUBMITTED });
      expect(prisma.project.update.mock.calls[0][0].data.submittedAt).toBeUndefined();
    });
  });

  describe('softDelete', () => {
    it('flips an active project to CANCELLED', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', status: ProjectStatus.DRAFT });
      prisma.project.update.mockResolvedValue({ id: 'p1', status: ProjectStatus.CANCELLED });
      await expect(svc.softDelete('p1', ownerA)).resolves.toMatchObject({ status: ProjectStatus.CANCELLED });
    });

    it('is a no-op for an already-cancelled project', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA', status: ProjectStatus.CANCELLED });
      await svc.softDelete('p1', ownerA);
      expect(prisma.project.update).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  describe('document lifecycle', () => {
    it('lists documents with metadata only', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectDocument.findMany.mockResolvedValue([{ id: 'd1' }]);
      const out = await svc.listDocuments('p1', staffA);
      expect(out).toEqual([{ id: 'd1' }]);
      expect(prisma.projectDocument.findMany).toHaveBeenCalledWith({
        where: { projectId: 'p1' },
        orderBy: [{ uploadedAt: 'desc' }],
        select: expect.any(Object),
      });
    });

    it('returns the raw blob for the owning tenant', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectDocument.findUnique.mockResolvedValue({ id: 'd1', projectId: 'p1', data: Buffer.from('x') });
      await expect(svc.getDocumentBlob('p1', 'd1', staffA)).resolves.toMatchObject({ projectId: 'p1' });
    });

    it('404s a missing or foreign document blob', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectDocument.findUnique.mockResolvedValue(null);
      await expect(svc.getDocumentBlob('p1', 'missing', ownerA)).rejects.toBeInstanceOf(NotFoundException);
      prisma.projectDocument.findUnique.mockResolvedValue({ id: 'd1', projectId: 'p2' });
      await expect(svc.getDocumentBlob('p1', 'd1', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes a document that belongs to the project', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectDocument.findUnique.mockResolvedValue({ id: 'd1', projectId: 'p1' });
      prisma.projectDocument.delete.mockResolvedValue({});
      await expect(svc.deleteDocument('p1', 'd1', ownerA)).resolves.toEqual({ ok: true });
      expect(prisma.projectDocument.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    });

    it('rejects an empty upload', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      const file = { originalname: 'e.png', buffer: Buffer.alloc(0), size: 0, mimetype: 'image/png' };
      await expect(svc.uploadDocument('p1', ownerA, file, { kind: 'SITE_PHOTO' }))
        .rejects.toThrow(/Empty file/);
    });

    it('keeps dimensions null for PDFs', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      const buf = Buffer.from('%PDF-1.4\n% test');
      const file = { originalname: 'doc.pdf', buffer: buf, size: buf.length, mimetype: 'application/pdf' };
      prisma.projectDocument.create.mockImplementation(({ data }: any) => data);
      const out = await svc.uploadDocument('p1', ownerA, file, { kind: 'PROPERTY_DEED' });
      expect(out.mimeType).toBe('application/pdf');
      expect(out.widthPx).toBeUndefined();
      expect(out.heightPx).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Selections + measurements
  // -------------------------------------------------------------------------

  describe('selections', () => {
    it('adds a selection to the project', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectFenceSelection.create.mockResolvedValue({ id: 's1' });
      await svc.addSelection('p1', ownerA, { productId: 'prod', linearMeters: 10, heightFt: 6 });
      expect(prisma.projectFenceSelection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: 'p1', productId: 'prod', linearMeters: 10, heightFt: 6, sortOrder: 0,
        }),
      });
    });

    it('updates only supplied selection fields', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectFenceSelection.findUnique.mockResolvedValue({ id: 's1', projectId: 'p1' });
      prisma.projectFenceSelection.update.mockResolvedValue({ id: 's1' });
      await svc.updateSelection('p1', 's1', ownerA, { linearMeters: 12 });
      expect(prisma.projectFenceSelection.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { linearMeters: 12 },
      });
    });

    it('404s updates/removals for foreign selections', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectFenceSelection.findUnique.mockResolvedValue({ id: 's1', projectId: 'p2' });
      await expect(svc.updateSelection('p1', 's1', ownerA, { linearMeters: 1 }))
        .rejects.toBeInstanceOf(NotFoundException);
    });

    it('removes a selection', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectFenceSelection.findUnique.mockResolvedValue({ id: 's1', projectId: 'p1' });
      prisma.projectFenceSelection.delete.mockResolvedValue({});
      const out = await svc.removeSelection('p1', 's1', ownerA);
      expect(out).toEqual({ ok: true });
      expect(prisma.projectFenceSelection.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    });
  });

  describe('measurements', () => {
    it('adds a measurement', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectMeasurement.create.mockResolvedValue({ id: 'm1' });
      await svc.addMeasurement('p1', ownerA, { label: 'Run A', lengthM: 20, heightFt: 6 });
      const data = prisma.projectMeasurement.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ projectId: 'p1', label: 'Run A', lengthM: 20, heightFt: 6 });
      expect(data.widthM).toBeNull();
    });

    it('updates and removes measurements', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectMeasurement.findUnique.mockResolvedValue({ id: 'm1', projectId: 'p1' });
      prisma.projectMeasurement.update.mockResolvedValue({ id: 'm1' });
      await svc.updateMeasurement('p1', 'm1', ownerA, { notes: 'sloped' });
      expect(prisma.projectMeasurement.update).toHaveBeenCalledWith({
        where: { id: 'm1' }, data: { notes: 'sloped' },
      });
    });

    it('404s unknown measurements', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectMeasurement.findUnique.mockResolvedValue(null);
      await expect(svc.removeMeasurement('p1', 'm1', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // Visualisations
  // -------------------------------------------------------------------------

  describe('visualisation list/blob', () => {
    it('lists visualisations', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectVisualization.findMany.mockResolvedValue([{ id: 'v1' }]);
      await expect(svc.listVisualizations('p1', staffA)).resolves.toEqual([{ id: 'v1' }]);
    });

    it('returns the blob for the owning tenant only', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: 'wA' });
      prisma.projectVisualization.findUnique.mockResolvedValue({ id: 'v1', projectId: 'p1' });
      await expect(svc.getVisualizationBlob('p1', 'v1', ownerA)).resolves.toMatchObject({ id: 'v1' });
      prisma.projectVisualization.findUnique.mockResolvedValue({ id: 'v1', projectId: 'p2' });
      await expect(svc.getVisualizationBlob('p1', 'v1', ownerA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('promoteToQuote guard rails', () => {
    it('refuses to promote a cancelled project', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1', dealerId: 'wA', status: ProjectStatus.CANCELLED, customerEmail: 'a@b.co',
      });
      await expect(svc.promoteToQuote('p1', admin, { customerEmail: 'a@b.co' }))
        .rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to promote a tenant-less project for a non-admin', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', dealerId: null, status: ProjectStatus.DRAFT });
      await expect(svc.promoteToQuote('p1', staffA, { customerEmail: 'a@b.co' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
