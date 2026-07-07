/**
 * Unit tests for PublicAiService. Focuses on the parts that have
 * real logic and don't need the network:
 *  - config endpoint returns the gallery + style list
 *  - submit validates email/phone, photoSource, yard/gallery match
 *  - getStatus returns the right shape
 *  - getResult strips sales-pipeline fields
 *
 * The background render path is covered indirectly via the
 * validate-submit happy-path + mocked Prisma: we don't wait for
 * the AI service to be called.
 */
import { Test } from '@nestjs/testing';
import { PublicLead, PublicLeadStatus, PublicLeadYardSide, PublicLeadPhotoSource } from '@prisma/client';
import { PublicAiService } from './public-ai.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';

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
