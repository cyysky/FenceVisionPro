import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { promises as fs } from 'fs';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import { resolveSafe } from '../storage/safe-path';

/**
 * Render service: composites a fence design over a floor plan image.
 *
 * The default implementation produces a top-down 2D composite using
 * the `sharp` library (no native deps beyond libvips which ships in
 * common Node images). This is enough for the 7-day-cycle MVP. To swap
 * in 3D or AI rendering, replace `compositeTopDown` with a call to an
 * external renderer (Blender, Replicate, etc.) - the rest of the
 * pipeline is unchanged.
 */
@Injectable()
export class RenderService {
  constructor(private prisma: PrismaService, private storage: StorageService) {}

  async compositeTopDown(params: {
    floorPlanUrl: string;       // /static/uploads/xxx.png
    designOverlayUrl: string;   // /static/...
    fenceSegments: { x1: number; y1: number; x2: number; y2: number; lengthM: number }[];
    floorPlanWidthM: number;
    floorPlanHeightM: number;
  }) {
    let sharp: any;
    try {
      sharp = (await import('sharp')).default;
    } catch (e) {
      throw new BadRequestException('Image processing library not available on the server');
    }

    const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
    // Sanitize the URL paths so a `../` traversal can't escape
    // DATA_DIR. The leading /static/ is replaced and the result
    // must stay inside dataDir.
    let floorPath: string;
    let overlayPath: string;
    try {
      floorPath = resolveSafe(dataDir, params.floorPlanUrl);
      overlayPath = resolveSafe(dataDir, params.designOverlayUrl);
    } catch (e: any) {
      // Path validation failure (bad prefix or escape attempt) -> 400
      throw new BadRequestException(e?.message || 'Invalid file path');
    }

    // Fail with a clear 400 if either file is missing, instead of
    // bubbling up a 500 from sharp's ENOENT.
    const { promises: fsx } = await import('fs');
    try { await fsx.access(floorPath); }
    catch { throw new BadRequestException(`Floor plan not found: ${params.floorPlanUrl}`); }
    try { await fsx.access(overlayPath); }
    catch { throw new BadRequestException(`Design overlay not found: ${params.designOverlayUrl}`); }

    const baseImg = sharp(floorPath);
    const meta = await baseImg.metadata();
    const canvasW = meta.width || 1200;
    const canvasH = meta.height || 800;

    // Build an SVG with the fence layout drawn on top of the plan
    const scaleX = canvasW / Math.max(params.floorPlanWidthM, 0.0001);
    const scaleY = canvasH / Math.max(params.floorPlanHeightM, 0.0001);

    const overlayImg = await sharp(overlayPath).metadata();
    const overlayW = overlayImg.width || 100;
    const overlayH = overlayImg.height || 100;

    // For each segment, draw a rotated overlay image.
    // We pre-rotate the overlay then place it.
    const placements = await Promise.all(params.fenceSegments.map(async seg => {
      const dx = (seg.x2 - seg.x1);
      const dy = (seg.y2 - seg.y1);
      const segLenPx = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const rotated = await sharp(overlayPath)
        .resize({ width: Math.max(2, Math.round(segLenPx)) })
        .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
      const left = Math.round(seg.x1 * scaleX - segLenPx / 2);
      const top = Math.round(seg.y1 * scaleY - overlayH / 2);
      return { input: rotated, left, top };
    }));

    const outFile = `render-${uuid()}.png`;
    const { absPath, relPath } = await this.storage.writeStream('renders', outFile);
    const out = await baseImg
      .composite(placements)
      .png()
      .toFile(absPath);
    return `/static/renders/${outFile}`;
  }
}
