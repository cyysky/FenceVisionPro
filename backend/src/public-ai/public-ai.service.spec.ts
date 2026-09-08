/**
 * Unit tests for PublicAiService. Focuses on the parts that have
 * real logic and don't need the network:
 *  - config endpoint returns the gallery + style list
 *  - submit validates email/phone, photoSource, yard/gallery match
 *  - getStatus returns the right shape
 *  - getResult strips sales-pipeline fields
 *
 * The background render worker (runRender) is tested directly with
 * real temp files so the vision step and READY/FAILED persist paths
 * are exercised without any network.
 */
import { Test } from '@nestjs/testing';
import { PublicLead, PublicLeadStatus, PublicLeadYardSide, PublicLeadPhotoSource } from '@prisma/client';
import { PublicAiService } from './public-ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { promises as fs } from 'fs';
import { join } from 'path';

describe('PublicAiService - getConfig', () => {
  let svc: PublicAiService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      design: { findMany: jest.fn().mockResolvedValue([
        { style: 'Privacy' },
        { style: 'Picket' },
        { style: 'Privacy' }, // dup - should be deduped
      ]) },
      publicLead: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const ai = { analysePhotoPath: jest.fn(), generateFenceImage: jest.fn(), imageModel: 'z-image-turbo' } as any;
    const storage = { saveBuffer: jest.fn() } as any;
    const mod = await Test.createTestingModule({
      providers: [
        PublicAiService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    svc = mod.get(PublicAiService);
  });

  it('returns 18 gallery items (9 front, 9 back) and a deduped style list', async () => {
    const cfg = await svc.getConfig();
    expect(cfg.gallery).toHaveLength(18);
    expect(cfg.gallery.filter(g => g.yardSide === 'FRONT')).toHaveLength(9);
    expect(cfg.gallery.filter(g => g.yardSide === 'BACK')).toHaveLength(9);
    expect(cfg.styles).toEqual(['Privacy', 'Picket']);
  });

  it('falls back to the hardcoded style list when the DB is empty', async () => {
    prisma.design.findMany.mockRejectedValue(new Error('no DB'));
    const cfg = await svc.getConfig();
    expect(cfg.styles.length).toBeGreaterThanOrEqual(4);
    expect(cfg.styles).toContain('Privacy');
    expect(cfg.styles).toContain('Picket');
  });
});

describe('PublicAiService - submit validation', () => {
  let svc: PublicAiService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      design: { findMany: jest.fn().mockResolvedValue([]) },
      publicLead: {
        create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'lead1', ...data })),
        update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
        findUnique: jest.fn(),
      },
    };
    const ai = { imageModel: 'z-image-turbo' } as any;
    const storage = { saveBuffer: jest.fn() } as any;
    const mod = await Test.createTestingModule({
      providers: [
        PublicAiService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    svc = mod.get(PublicAiService);
  });

  const file: any = { buffer: Buffer.from('x'), originalname: 'p.jpg', mimetype: 'image/jpeg', size: 1024 };

  it('refuses when neither email nor phone is supplied', async () => {
    await expect(svc.submit({ photoSource: 'GALLERY', galleryId: 'front1', yardSide: 'FRONT' } as any))
      .rejects.toThrow(/email or phone/i);
  });

  it('refuses UPLOADED without a file', async () => {
    await expect(svc.submit({ photoSource: 'UPLOADED', yardSide: 'FRONT', email: 'a@b.co' } as any))
      .rejects.toThrow(/file/i);
  });

  it('refuses GALLERY without a galleryId', async () => {
    await expect(svc.submit({ photoSource: 'GALLERY', yardSide: 'FRONT', email: 'a@b.co' } as any))
      .rejects.toThrow(/galleryId/i);
  });

  it('refuses an unknown galleryId', async () => {
    await expect(svc.submit({ photoSource: 'GALLERY', yardSide: 'FRONT', galleryId: 'nope', email: 'a@b.co' } as any))
      .rejects.toThrow(/Unknown galleryId/i);
  });

  it('refuses when gallery yard side mismatches the chosen yardSide', async () => {
    await expect(svc.submit({ photoSource: 'GALLERY', yardSide: 'BACK', galleryId: 'front1', email: 'a@b.co' } as any))
      .rejects.toThrow(/front1 is a front yard photo/i);
  });

  it('creates a lead + queues a background render for a valid GALLERY submit', async () => {
    const out = await svc.submit({ photoSource: 'GALLERY', yardSide: 'FRONT', galleryId: 'front1', email: 'a@b.co' } as any);
    expect(out.id).toBe('lead1');
    expect(out.status).toBe(PublicLeadStatus.PENDING);
    // background render runs setImmediate - we don't wait for it
  });

  it('accepts upload when file is supplied', async () => {
    (svc as any).storage.saveBuffer = jest.fn().mockResolvedValue({ url: '/static/uploads/leads/lead1/photo.jpg', absPath: '/tmp/photo.jpg' });
    await svc.submit({ photoSource: 'UPLOADED', yardSide: 'FRONT', email: 'a@b.co' } as any, file);
    expect((svc as any).storage.saveBuffer).toHaveBeenCalled();
  });
});

describe('PublicAiService - getStatus / getResult', () => {
  let svc: PublicAiService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      design: { findMany: jest.fn() },
      publicLead: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [
        PublicAiService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: {} as any },
        { provide: StorageService, useValue: {} as any },
      ],
    }).compile();
    svc = mod.get(PublicAiService);
  });

  it('returns a minimal status payload', async () => {
    prisma.publicLead.findUnique.mockResolvedValue({
      id: 'lead1', renderStatus: PublicLeadStatus.READY, renderUrl: '/static/renders/x.png', renderError: null,
    });
    const out = await svc.getStatus('lead1');
    expect(out).toEqual({ id: 'lead1', status: 'READY', renderUrl: '/static/renders/x.png', error: null });
  });

  it('throws 404 when the lead is missing', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(null);
    await expect(svc.getStatus('missing')).rejects.toThrow(/Lead not found/);
  });

  it('getResult strips sales-pipeline fields', async () => {
    prisma.publicLead.findUnique.mockResolvedValue({
      id: 'lead1',
      email: 'a@b.co',
      phone: null,
      firstName: 'A',
      yardSide: PublicLeadYardSide.FRONT,
      photoSource: PublicLeadPhotoSource.GALLERY,
      inputPhotoPath: '/static/gallery/front1.jpg',
      inputGalleryId: 'front1',
      designStyle: 'Privacy',
      renderStatus: PublicLeadStatus.READY,
      renderUrl: '/static/renders/x.png',
      renderPrompt: 'p',
      renderModelUsed: 'z-image-turbo',
      renderError: null,
      generatedAt: new Date(),
      contactedAt: new Date(),
      contactedById: 'u1',
      notes: 'INTERNAL - should not appear',
      convertedQuoteId: 'q1',
      convertedQuote: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any);
    const out: any = await svc.getResult('lead1');
    expect(out.id).toBe('lead1');
    expect(out.email).toBe('a@b.co');
    expect(out.renderUrl).toBe('/static/renders/x.png');
    // Sales-rep-only fields must be stripped:
    expect(out.notes).toBeUndefined();
    expect(out.contactedById).toBeUndefined();
    expect(out.convertedQuoteId).toBeUndefined();
  });
});

describe('PublicAiService - runRender (background worker)', () => {
  let svc: PublicAiService;
  let prisma: any;
  let ai: any;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(join(process.cwd(), '.public-ai-test-'));
    ai = {
      analysePhotoPath: jest.fn(),
      generateFenceImage: jest.fn(),
      imageModel: 'z-image-turbo',
    };
    prisma = {
      design: { findMany: jest.fn().mockResolvedValue([]) },
      publicLead: {
        create: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }: any) => Promise.resolve({ id: where.id, ...data })),
        findUnique: jest.fn().mockResolvedValue({
          id: 'lead1',
          renderStatus: PublicLeadStatus.PENDING,
          photoSource: PublicLeadPhotoSource.UPLOADED,
          inputPhotoPath: '/static/uploads/leads/lead1/photo.jpg',
          designStyle: 'Picket',
          firstName: 'Ada',
          yardSide: PublicLeadYardSide.BACK,
        }),
      },
    };
    const storage = { saveBuffer: jest.fn() } as any;
    const mod = await Test.createTestingModule({
      providers: [
        PublicAiService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: ai },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    svc = mod.get(PublicAiService);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('renders an uploaded photo: vision + generate + READY persist', async () => {
    const photo = join(tmpDir, 'photo.jpg');
    await fs.writeFile(photo, Buffer.from('fake-jpeg'));
    ai.analysePhotoPath.mockResolvedValue({
      style: 'Picket', color: 'White', heightFt: 5,
      surroundings: 'Green lawn', notes: 'wide driveway',
    });
    ai.generateFenceImage.mockResolvedValue({ url: '/static/renders/lead1.png' });

    await (svc as any).runRender('lead1', photo);

    expect(ai.analysePhotoPath).toHaveBeenCalledWith(photo);
    const genArg = ai.generateFenceImage.mock.calls[0][0];
    expect(genArg).toMatchObject({
      style: 'Picket',
      color: 'Black',
      heightFt: 6,
      surroundings: 'Green lawn',
      visionDescription: 'Green lawn',
    });
    expect(genArg.extraPrompt).toContain('Customer first name: Ada.');
    expect(genArg.extraPrompt).toContain('Yard side: back.');

    const updateCall = prisma.publicLead.update.mock.calls[0][0];
    expect(updateCall.data.renderStatus).toBe(PublicLeadStatus.READY);
    expect(updateCall.data.renderUrl).toBe('/static/renders/lead1.png');
    expect(updateCall.data.renderModelUsed).toBe('z-image-turbo');
    expect(updateCall.data.renderError).toBeNull();
    expect(updateCall.data.renderPrompt).toContain('style=Picket');
    expect(updateCall.data.renderPrompt).toContain('height=6ft');
    expect(updateCall.data.renderPrompt).toContain('vision="Green lawn"');
    expect(updateCall.data.renderPrompt).toContain('extra="Customer first name: Ada.');
    expect(updateCall.data.generatedAt).toBeInstanceOf(Date);
  });

  it('resolves a GALLERY lead from data/gallery when no upload path is passed', async () => {
    (svc as any).dataDir = tmpDir;
    await fs.mkdir(join(tmpDir, 'gallery'));
    await fs.writeFile(join(tmpDir, 'gallery', 'front1.jpg'), Buffer.from('fake-jpeg'));
    prisma.publicLead.findUnique.mockResolvedValue({
      id: 'lead1',
      renderStatus: PublicLeadStatus.PENDING,
      photoSource: PublicLeadPhotoSource.GALLERY,
      inputPhotoPath: '/static/gallery/front1.jpg',
      designStyle: null,
      firstName: null,
      yardSide: PublicLeadYardSide.FRONT,
    });
    ai.analysePhotoPath.mockResolvedValue({ surroundings: 'Suburban lawn' });
    ai.generateFenceImage.mockResolvedValue({ url: '/static/renders/lead1.png' });

    await (svc as any).runRender('lead1', null);

    expect(ai.analysePhotoPath).toHaveBeenCalledWith(join(tmpDir, 'gallery', 'front1.jpg'));
    const genArg = ai.generateFenceImage.mock.calls[0][0];
    expect(genArg.style).toBe('Privacy'); // default style when the lead has none
    expect(genArg.surroundings).toBe('Suburban lawn');
    expect(genArg.extraPrompt).toContain('Yard side: front.');
  });

  it('continues without vision when the vision model fails', async () => {
    const photo = join(tmpDir, 'photo.jpg');
    await fs.writeFile(photo, Buffer.from('fake-jpeg'));
    ai.analysePhotoPath.mockRejectedValue(new Error('vision api down'));
    ai.generateFenceImage.mockResolvedValue({ url: '/static/renders/lead1.png' });

    await (svc as any).runRender('lead1', photo);

    expect(ai.generateFenceImage).toHaveBeenCalledTimes(1);
    const genArg = ai.generateFenceImage.mock.calls[0][0];
    expect(genArg.surroundings).toBeUndefined();
    expect(genArg.visionDescription).toBeUndefined();
    expect(prisma.publicLead.update).toHaveBeenCalledTimes(1);
    expect(prisma.publicLead.update.mock.calls[0][0].data.renderStatus).toBe(PublicLeadStatus.READY);
  });

  it('skips vision when the input file is missing but still renders', async () => {
    ai.generateFenceImage.mockResolvedValue({ url: '/static/renders/lead1.png' });
    await (svc as any).runRender('lead1', join(tmpDir, 'missing.jpg'));
    expect(ai.analysePhotoPath).not.toHaveBeenCalled();
    expect(ai.generateFenceImage).toHaveBeenCalledTimes(1);
    expect(prisma.publicLead.update.mock.calls[0][0].data.renderStatus).toBe(PublicLeadStatus.READY);
  });

  it('persists FAILED + a truncated error when rendering throws', async () => {
    const photo = join(tmpDir, 'photo.jpg');
    await fs.writeFile(photo, Buffer.from('fake-jpeg'));
    ai.analysePhotoPath.mockResolvedValue({ surroundings: 'lawn' });
    ai.generateFenceImage.mockRejectedValue(new Error('x'.repeat(600)));

    await (svc as any).runRender('lead1', photo);

    const updateCall = prisma.publicLead.update.mock.calls[0][0];
    expect(updateCall.data.renderStatus).toBe(PublicLeadStatus.FAILED);
    expect(updateCall.data.renderError).toHaveLength(500);
  });

  it('renders nothing when the lead vanished before the worker ran', async () => {
    prisma.publicLead.findUnique.mockResolvedValue(null);
    await (svc as any).runRender('lead1', null);
    expect(ai.analysePhotoPath).not.toHaveBeenCalled();
    expect(ai.generateFenceImage).not.toHaveBeenCalled();
    expect(prisma.publicLead.update).not.toHaveBeenCalled();
  });

  it('summarisePrompt truncates vision and extra prompt text', () => {
    const summary = (svc as any).summarisePrompt({
      style: 'Privacy', heightFt: 6, extraPrompt: 'e'.repeat(200), visionDescription: 'v'.repeat(200),
    });
    expect(summary).toBe(
      'style=Privacy height=6ft vision="' + 'v'.repeat(120) + '" extra="' + 'e'.repeat(120) + '"',
    );
  });
});
