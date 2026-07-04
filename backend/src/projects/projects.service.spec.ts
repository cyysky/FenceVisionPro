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
      wholesaler: { findUnique: jest.fn() },
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

  const staffA = { sub: 'u-A', role: Role.WHOLESALER_STAFF, wholesalerId: 'wA' } as any;
  const ownerA = { sub: 'u-A2', role: Role.WHOLESALER_OWNER, wholesalerId: 'wA' } as any;
  const staffB = { sub: 'u-B', role: Role.WHOLESALER_STAFF, wholesalerId: 'wB' } as any;
  const admin  = { sub: 'u-0', role: Role.ADMIN, wholesalerId: null } as any;

  // -------------------------------------------------------------------------
  // findOne / ownership
  // -------------------------------------------------------------------------

  describe('findOne (ownership)', () => {
    it("throws ForbiddenException when a non-admin user from wholesaler A requests wholesaler B's project", async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wB' });
      await expect(svc.findOne('p1', staffA)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns the project when the user owns it', async () => {
      prisma.project.findUnique
        .mockResolvedValueOnce({ id: 'p1', wholesalerId: 'wA' })
        .mockResolvedValueOnce({
          id: 'p1', wholesalerId: 'wA',
          documents: [], selections: [], measurements: [], visualizations: [],
        });
      const out = await svc.findOne('p1', staffA);
      expect(out.id).toBe('p1');
      expect(out.documents).toEqual([]);
    });

    it('returns the project when the user is admin regardless of wholesalerId', async () => {
      prisma.project.findUnique
        .mockResolvedValueOnce({ id: 'p2', wholesalerId: 'wB' })
        .mockResolvedValueOnce({
          id: 'p2', wholesalerId: 'wB',
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
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA' });
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
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA' });
      const buf = Buffer.from('GIF89a');
      const file = {
        originalname: 'thing.gif', buffer: buf, size: buf.length, mimetype: 'image/gif',
      };
      await expect(svc.uploadDocument('p1', ownerA, file, { kind: 'OTHER' }))
        .rejects.toThrow(/Unsupported mime type/);
    });

    it('rejects files whose magic bytes do not match the declared mime type', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA' });
      // Content is plain text but claimed to be PNG.
      const buf = Buffer.from('this is not a png');
      const file = {
        originalname: 'fake.png', buffer: buf, size: buf.length, mimetype: 'image/png',
      };
      await expect(svc.uploadDocument('p1', ownerA, file, { kind: 'SITE_PHOTO' }))
        .rejects.toThrow(/do not match any allowed format|match/);
    });

    it('extracts widthPx/heightPx for a valid PNG', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA' });
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
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA' });
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
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA' });
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
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA', status: ProjectStatus.DRAFT });
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
      expect(createArg[0]).toBe('wA');                            // wholesalerId
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
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA', status: ProjectStatus.SUBMITTED });
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
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wA', status: ProjectStatus.DRAFT });
      prisma.projectFenceSelection.findMany.mockResolvedValue([]);
      await expect(svc.promoteToQuote('p1', ownerA, { customerEmail: 'a@b.com' }))
        .rejects.toThrow(/at least one fence selection/i);
    });

    it('refuses to promote when the project has no customer email and none is provided', async () => {
      prisma.project.findUnique.mockResolvedValue({
        id: 'p1', wholesalerId: 'wA', status: ProjectStatus.DRAFT, customerEmail: null,
      });
      prisma.projectFenceSelection.findMany.mockResolvedValue([
        { id: 's1', productId: 'p', linearMeters: 1, heightFt: 4, designId: null, panelCount: null, gateCount: null, sortOrder: 0, notes: null },
      ]);
      await expect(svc.promoteToQuote('p1', ownerA, {}))
        .rejects.toThrow(/customer email/i);
    });

    it('blocks non-owner non-admin from promoting', async () => {
      prisma.project.findUnique.mockResolvedValue({ id: 'p1', wholesalerId: 'wB', status: ProjectStatus.DRAFT });
      await expect(svc.promoteToQuote('p1', staffA, { customerEmail: 'a@b.com' }))
        .rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
