/**
 * RenderService unit tests. The heavy lifting (sharp) is mocked,
 * so we can verify the traversal guards, missing-file handling,
 * and the composite placement maths without real images.
 */
import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { promises as fsp } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RenderService } from './render.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

jest.mock('uuid', () => ({ v4: () => 'fixed-uuid' }));

jest.mock('sharp', () => {
  const chains: any = {
    floorChain: {},
    overlayChain: {},
    segmentChain: {},
  };
  const chain = (meta: any, holder: any): any => {
    Object.assign(holder, {
      metadata: jest.fn().mockResolvedValue(meta),
      composite: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toFile: jest.fn().mockResolvedValue({}),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('rotated-png')),
      resize: jest.fn().mockReturnThis(),
      rotate: jest.fn().mockReturnThis(),
    });
    return holder;
  };
  const sharp = jest.fn((p: any) => {
    if (typeof p === 'string' && /plan/.test(p)) return chain({ width: 1200, height: 800 }, chains.floorChain);
    if (typeof p === 'string') return chain({ width: 100, height: 100 }, chains.overlayChain);
    return chain({ width: 100, height: 100 }, chains.segmentChain);
  });
  (sharp as any).__state = chains;
  return sharp;
});

describe('RenderService', () => {
  let svc: RenderService;
  let storage: any;
  let accessSpy: jest.SpyInstance;
  let dataDir: string;
  const prevDataDir = process.env.DATA_DIR;

  const baseParams = {
    floorPlanUrl: '/static/uploads/plan.png',
    designOverlayUrl: '/static/overlays/picket.png',
    fenceSegments: [
      { x1: 0, y1: 0, x2: 12, y2: 0, lengthM: 12 },
      { x1: 12, y1: 0, x2: 12, y2: 8, lengthM: 8 },
    ],
    floorPlanWidthM: 12,
    floorPlanHeightM: 8,
  };

  beforeAll(async () => {
    dataDir = path.join(os.tmpdir(), `fvp-render-spec-${Date.now()}`);
    await fsp.mkdir(dataDir, { recursive: true });
    process.env.DATA_DIR = dataDir;
  });
  afterAll(async () => {
    await fsp.rm(dataDir, { recursive: true, force: true }).catch(() => {});
    if (prevDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = prevDataDir;
  });

  beforeEach(async () => {
    storage = { writeStream: jest.fn().mockResolvedValue({
      absPath: path.join(dataDir, 'renders', 'render-fixed-uuid.png'),
      relPath: 'renders/render-fixed-uuid.png',
    }) };
    accessSpy = jest.spyOn(fsp, 'access').mockResolvedValue(undefined as any);
    const mod = await Test.createTestingModule({
      providers: [
        RenderService,
        { provide: PrismaService, useValue: {} },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();
    svc = mod.get(RenderService);
  });
  afterEach(() => {
    accessSpy.mockRestore();
    jest.clearAllMocks();
  });

  it('composites the floor plan + rotated overlays and writes the PNG', async () => {
    const url = await svc.compositeTopDown(baseParams as any);
    expect(url).toBe('/static/renders/render-fixed-uuid.png');
    expect(storage.writeStream).toHaveBeenCalledWith('renders', 'render-fixed-uuid.png');

    // Two segments -> two rotated overlays placed on the composite.
    const placeCalls = floorCompositeCalls();
    expect(placeCalls).toHaveLength(1);
    expect(placeCalls[0][0]).toHaveLength(2); // one placement per segment
    const placements = placeCalls[0][0];
    expect(placements[0].input).toBeInstanceOf(Buffer);
    expect(placements[0]).toHaveProperty('left');
    expect(placements[0]).toHaveProperty('top');
    expect(placements[1]).toHaveProperty('left');
    expect(placements[1]).toHaveProperty('top');
  });

  function floorCompositeCalls(): any[][] {
    const sharp = jest.requireMock('sharp') as any;
    return sharp.__state?.floorChain.composite.mock.calls ?? [];
  }

  it('rejects traversal attempts in the URLs', async () => {
    await expect(svc.compositeTopDown({ ...baseParams, floorPlanUrl: '/static/../../etc/passwd' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.compositeTopDown({ ...baseParams, designOverlayUrl: '/static/../.env' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(storage.writeStream).not.toHaveBeenCalled();
  });

  it('rejects non-/static URL paths', async () => {
    await expect(svc.compositeTopDown({ ...baseParams, floorPlanUrl: 'uploads/plan.png' } as any))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns a clear 400 when the floor plan file is missing', async () => {
    accessSpy.mockImplementation((p: string) => {
      if (String(p).includes('plan')) return Promise.reject(new Error('ENOENT'));
      return Promise.resolve(undefined as any);
    });
    await expect(svc.compositeTopDown(baseParams as any))
      .rejects.toThrow(/Floor plan not found/);
  });

  it('returns a clear 400 when the design overlay file is missing', async () => {
    accessSpy.mockImplementation((p: string) => {
      if (String(p).includes('picket')) return Promise.reject(new Error('ENOENT'));
      return Promise.resolve(undefined as any);
    });
    await expect(svc.compositeTopDown(baseParams as any))
      .rejects.toThrow(/Design overlay not found/);
  });

  it('handles a zero-metadata image with canvas defaults', async () => {
    const sharp = jest.requireMock('sharp') as any;
    sharp.mockImplementationOnce(() => ({
      metadata: jest.fn().mockResolvedValue({}),
      composite: jest.fn().mockReturnThis(),
      png: jest.fn().mockReturnThis(),
      toFile: jest.fn().mockResolvedValue({}),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('x')),
      resize: jest.fn().mockReturnThis(),
      rotate: jest.fn().mockReturnThis(),
    }));
    const url = await svc.compositeTopDown(baseParams as any);
    expect(url).toMatch(/^\/static\/renders\//);
  });
});
