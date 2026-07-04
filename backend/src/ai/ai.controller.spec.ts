/**
 * Tests for the AI controller's quote-persistence behaviour
 * (Step 2 of the AI persistence + 3D upgrade).
 *
 * Specifically:
 *  - /ai/render-image with quoteId + lineItemIndex writes the
 *    URL into quote.aiImageUrls[index]
 *  - /ai/render-image with quoteId + overview writes to
 *    quote.aiOverviewImageUrl
 *  - /ai/render-image with no quoteId returns the URL only
 */
import { Test } from '@nestjs/testing';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AiController - render-image quote persistence', () => {
  let ctrl: AiController;
  let ai: any;
  let prisma: any;

  beforeEach(async () => {
    ai = {
      enabled: true,
      generateFenceImage: jest.fn().mockResolvedValue({ url: '/static/renders/ai-x.png', relPath: 'renders/ai-x.png' }),
    };
    prisma = {
      quote: { findUnique: jest.fn(), update: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      controllers: [AiController],
      providers: [
        { provide: AiService, useValue: ai },
        { provide: PrismaService, useValue: prisma },
        { provide: require('../storage/storage.service').StorageService, useValue: { saveBuffer: () => {} } },
      ],
    }).compile();
    ctrl = mod.get(AiController);
  });

  it('returns URL only when no quoteId is provided', async () => {
    const out = await ctrl.renderImage({ style: 'Privacy', color: 'Black', heightFt: 6 } as any);
    expect(out).toEqual({ url: '/static/renders/ai-x.png', relPath: 'renders/ai-x.png' });
    expect(prisma.quote.update).not.toHaveBeenCalled();
  });

  it('persists the URL at lineItemIndex into aiImageUrls', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', aiImageUrls: ['/static/renders/a.png', ''] });
    prisma.quote.update.mockResolvedValue({ aiImageUrls: ['/static/renders/a.png', '/static/renders/ai-x.png'], aiOverviewImageUrl: null });
    const out = await ctrl.renderImage({ style: 'Privacy', color: 'Black', heightFt: 6, quoteId: 'q1', lineItemIndex: 1 } as any);
    expect(prisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { aiImageUrls: { set: ['/static/renders/a.png', '/static/renders/ai-x.png'] } },
      select: { aiImageUrls: true, aiOverviewImageUrl: true },
    });
    expect(out.url).toBe('/static/renders/ai-x.png');
    expect(out.aiImageUrls[1]).toBe('/static/renders/ai-x.png');
  });

  it('appends to aiImageUrls when no lineItemIndex is provided', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', aiImageUrls: ['/static/renders/a.png'] });
    prisma.quote.update.mockResolvedValue({ aiImageUrls: ['/static/renders/a.png', '/static/renders/ai-x.png'], aiOverviewImageUrl: null });
    await ctrl.renderImage({ style: 'Privacy', color: 'Black', heightFt: 6, quoteId: 'q1' } as any);
    expect(prisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { aiImageUrls: { set: ['/static/renders/a.png', '/static/renders/ai-x.png'] } },
      select: { aiImageUrls: true, aiOverviewImageUrl: true },
    });
  });

  it('pads aiImageUrls with empty strings when lineItemIndex skips ahead', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', aiImageUrls: [] });
    prisma.quote.update.mockResolvedValue({ aiImageUrls: ['', '', '/static/renders/ai-x.png'], aiOverviewImageUrl: null });
    await ctrl.renderImage({ style: 'Privacy', color: 'Black', heightFt: 6, quoteId: 'q1', lineItemIndex: 2 } as any);
    const call = prisma.quote.update.mock.calls[0][0];
    expect(call.data.aiImageUrls.set).toEqual(['', '', '/static/renders/ai-x.png']);
  });

  it('sets aiOverviewImageUrl when overview: true', async () => {
    prisma.quote.findUnique.mockResolvedValue({ id: 'q1', aiImageUrls: [] });
    prisma.quote.update.mockResolvedValue({ aiImageUrls: [], aiOverviewImageUrl: '/static/renders/ai-x.png' });
    const out = await ctrl.renderImage({ style: 'Privacy', color: 'Black', heightFt: 6, quoteId: 'q1', overview: true } as any);
    expect(prisma.quote.update).toHaveBeenCalledWith({
      where: { id: 'q1' },
      data: { aiOverviewImageUrl: '/static/renders/ai-x.png' },
      select: { aiImageUrls: true, aiOverviewImageUrl: true },
    });
    expect(out.aiOverviewImageUrl).toBe('/static/renders/ai-x.png');
  });

  it('refuses to persist when quoteId is unknown', async () => {
    prisma.quote.findUnique.mockResolvedValue(null);
    await expect(ctrl.renderImage({ style: 'Privacy', color: 'Black', heightFt: 6, quoteId: 'q1' } as any))
      .rejects.toThrow(/not found/i);
  });

  it('refuses to run when AI is disabled', async () => {
    (ctrl as any).ai.enabled = false;
    await expect(ctrl.renderImage({ style: 'Privacy', color: 'Black', heightFt: 6 } as any))
      .rejects.toThrow(/disabled/i);
  });
});
