import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve as resolvePath } from 'path';
import {
  PublicLead,
  PublicLeadPhotoSource,
  PublicLeadStatus,
  PublicLeadYardSide,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { StorageService } from '../storage/storage.service';
import { resolveSafe } from '../storage/safe-path';
import { SubmitLeadDto } from './dto/submit-lead.dto';

/**
 * Static gallery metadata served by GET /public/ai-generation/config.
 * Six curated stock photos - three front-yard, three back-yard -
 * mirrored into data/gallery/ at startup so the static middleware
 * can serve them straight off /static/gallery/<id>.jpg.
 *
 * Style list source: read distinct `Design.style` values where
 * `isActive = true` from Prisma. If the table is empty (first-run
 * demo) fall back to the hardcoded list so the public page never
 * returns zero options.
 */
const GALLERY: Array<{ id: string; label: string; yardSide: PublicLeadYardSide; filename: string }> = [
  { id: 'front1', label: 'Suburban front lawn',       yardSide: 'FRONT', filename: 'front1.jpg' },
  { id: 'front2', label: 'Modern townhouse front',    yardSide: 'FRONT', filename: 'front2.jpg' },
  { id: 'front3', label: 'Garden-style front',        yardSide: 'FRONT', filename: 'front3.jpg' },
  { id: 'back1',  label: 'Poolside patio',            yardSide: 'BACK',  filename: 'back1.jpg' },
  { id: 'back2',  label: 'Family lawn',               yardSide: 'BACK',  filename: 'back2.jpg' },
  { id: 'back3',  label: 'Outdoor entertaining',      yardSide: 'BACK',  filename: 'back3.jpg' },
];

const FALLBACK_STYLES = ['Privacy', 'Picket', 'Wrought Iron', 'Chain Link', 'Vinyl'];

@Injectable()
export class PublicAiService {
  private readonly logger = new Logger(PublicAiService.name);
  private readonly dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');

  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    private storage: StorageService,
  ) {}

  /**
   * GET /public/ai-generation/config - gallery items + style list.
   * No auth, no DB writes. Public-safe (no PII).
   */
  async getConfig() {
    const designStyles = await this.prisma.design
      .findMany({ where: { isActive: true }, select: { style: true }, distinct: ['style'] })
      .catch(() => []);
    const stylesFromDb = Array.from(new Set(designStyles.map(d => d.style).filter(Boolean)));
    const styles = stylesFromDb.length ? stylesFromDb : FALLBACK_STYLES;
    return {
      gallery: GALLERY.map(g => ({
        id: g.id,
        label: g.label,
        yardSide: g.yardSide,
        url: `/static/gallery/${g.filename}`,
      })),
      styles,
    };
  }

  /**
   * POST /public/ai-generation - validate, persist the lead, kick
   * off the background render. Returns immediately with the lead id
   * so the frontend can start polling.
   *
   * The caller passes either an uploaded file (UPLOADED) or a
   * galleryId (GALLERY). Mixed forms are rejected.
   */
  async submit(input: SubmitLeadDto, file?: { buffer: Buffer; originalname: string; mimetype: string; size: number }) {
    if (!input.email && !input.phone) {
      throw new BadRequestException('Either email or phone is required');
    }
    if (input.photoSource === PublicLeadPhotoSource.UPLOADED && !file) {
      throw new BadRequestException('photoSource=UPLOADED requires a file');
    }
    if (input.photoSource === PublicLeadPhotoSource.GALLERY && !input.galleryId) {
      throw new BadRequestException('photoSource=GALLERY requires galleryId');
    }
    if (input.photoSource === PublicLeadPhotoSource.GALLERY) {
      const galleryItem = GALLERY.find(g => g.id === input.galleryId);
      if (!galleryItem) throw new BadRequestException(`Unknown galleryId: ${input.galleryId}`);
      // The yard side must match the gallery asset - prevents a
      // visitor from picking a "front lawn" image then asking for
      // a back-yard render.
      if (galleryItem.yardSide !== input.yardSide) {
        throw new BadRequestException(`Gallery item ${input.galleryId} is a ${galleryItem.yardSide.toLowerCase()} yard photo`);
      }
    }

    // Persist the lead FIRST so the photo file lands under a known
    // subdirectory keyed off the cuid.
    const lead = await this.prisma.publicLead.create({
      data: {
        email: input.email || null,
        phone: input.phone || null,
        firstName: input.firstName || null,
        yardSide: input.yardSide as PublicLeadYardSide,
        photoSource: input.photoSource as PublicLeadPhotoSource,
        inputPhotoPath: '', // filled in below
        inputGalleryId: input.photoSource === PublicLeadPhotoSource.GALLERY ? input.galleryId! : null,
        designStyle: input.designStyle || null,
        renderStatus: PublicLeadStatus.PENDING,
      },
    });

    let inputPhotoPath: string;
    let inputAbsPath: string | null = null;
    if (input.photoSource === PublicLeadPhotoSource.GALLERY) {
      const galleryItem = GALLERY.find(g => g.id === input.galleryId)!;
      inputPhotoPath = `/static/gallery/${galleryItem.filename}`;
    } else {
      const saved = await this.storage.saveBuffer(
        `uploads/leads/${lead.id}`,
        file!.originalname || 'photo',
        file!.buffer,
        file!.mimetype,
      );
      inputPhotoPath = saved.url;
      inputAbsPath = saved.absPath;
    }

    const updated = await this.prisma.publicLead.update({
      where: { id: lead.id },
      data: { inputPhotoPath },
    });

    // Background render - the response goes back to the visitor
    // immediately. We pass the absolute path of the uploaded file
    // (or null for GALLERY) so the worker can read it back.
    setImmediate(() => {
      this.runRender(updated.id, inputAbsPath).catch(err => {
        this.logger.error(`[lead:${updated.id}] background render crashed: ${err?.message || err}`);
      });
    });

    return { id: updated.id, status: PublicLeadStatus.PENDING };
  }

  /**
   * GET /public/ai-generation/:id/status - minimal polling payload.
   */
  async getStatus(id: string) {
    const lead = await this.prisma.publicLead.findUnique({
      where: { id },
      select: { id: true, renderStatus: true, renderUrl: true, renderError: true },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return {
      id: lead.id,
      status: lead.renderStatus,
      renderUrl: lead.renderUrl,
      error: lead.renderError,
    };
  }

  /**
   * GET /public/ai-generation/:id/result - the full public-safe
   * lead record. Internal sales-pipeline fields (notes,
   * contactedById, contactedBy email) are stripped.
   */
  async getResult(id: string) {
    const lead = await this.prisma.publicLead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    return {
      id: lead.id,
      email: lead.email,
      phone: lead.phone,
      firstName: lead.firstName,
      yardSide: lead.yardSide,
      photoSource: lead.photoSource,
      inputPhotoPath: lead.inputPhotoPath,
      inputGalleryId: lead.inputGalleryId,
      designStyle: lead.designStyle,
      status: lead.renderStatus,
      renderUrl: lead.renderUrl,
      generatedAt: lead.generatedAt,
      createdAt: lead.createdAt,
    };
  }

  /**
   * Background worker. Runs after the HTTP response has been
   * flushed. For GALLERY leads the input photo path is a
   * /static/gallery URL - we resolve it to disk via resolveSafe.
   *
   * Steps:
   *  1. Run the vision model on the input photo (if available on disk)
   *     to get a rich property description.
   *  2. Build a FenceParamsDto shape and call AiService.generateFenceImage.
   *  3. Persist the result + audit fields onto the lead.
   */
  private async runRender(leadId: string, uploadedAbsPath: string | null) {
    const log = (msg: string) => this.logger.log(`[lead:${leadId}] ${msg}`);
    const lead = await this.prisma.publicLead.findUnique({ where: { id: leadId } });
    if (!lead) {
      log('lead vanished before render started');
      return;
    }
    try {
      log(`render start status=${lead.renderStatus} source=${lead.photoSource}`);
      // Resolve the input photo to an absolute path. For GALLERY
      // leads we read from data/gallery/<file>; for UPLOADED we
      // use the path passed in by submit().
      let absPath = uploadedAbsPath;
      if (!absPath) {
        const galleryAbs = resolveSafe(this.dataDir, lead.inputPhotoPath);
        if (await this.fileExists(galleryAbs)) absPath = galleryAbs;
      }

      let visionDescription: string | undefined;
      if (absPath && (await this.fileExists(absPath))) {
        try {
          const vision = await this.ai.analysePhotoPath(absPath);
          visionDescription = vision.surroundings || vision.notes;
          log(`vision ok style=${vision.style || '-'} color=${vision.color || '-'} h=${vision.heightFt || '-'}`);
        } catch (e: any) {
          // Vision failure is not fatal - we still render with a
          // generic surroundings prompt. Log and move on.
          log(`vision skipped: ${e?.message?.slice(0, 160) || e}`);
        }
      } else {
        log('no input file on disk - skipping vision analysis');
      }

      const style = lead.designStyle || 'Privacy';
      const extraPrompt = [
        lead.firstName ? `Customer first name: ${lead.firstName}.` : '',
        `Yard side: ${lead.yardSide.toLowerCase()}.`,
      ].filter(Boolean).join(' ');

      const params = {
        style,
        color: 'Black',
        heightFt: 6,
        surroundings: visionDescription || undefined,
        extraPrompt,
        visionDescription,
      };

      const out = await this.ai.generateFenceImage(params);

      await this.prisma.publicLead.update({
        where: { id: leadId },
        data: {
          renderStatus: PublicLeadStatus.READY,
          renderUrl: out.url,
          renderPrompt: this.summarisePrompt(params),
          renderModelUsed: this.ai['imageModel'],
          generatedAt: new Date(),
          renderError: null,
        },
      });
      log(`render ready url=${out.url}`);
    } catch (e: any) {
      const msg = e?.message || 'render failed';
      this.logger.error(`[lead:${leadId}] render failed: ${msg}`);
      await this.prisma.publicLead.update({
        where: { id: leadId },
        data: {
          renderStatus: PublicLeadStatus.FAILED,
          renderError: msg.slice(0, 500),
        },
      }).catch(() => undefined);
    }
  }

  /**
   * Short, audit-friendly summary of the params we sent. The full
   * prompt lives in the logs (AiService logs at the model call
   * site); here we just keep enough context for a sales rep to
   * understand what the customer was trying to render.
   */
  private summarisePrompt(p: { style: string; heightFt: number; extraPrompt?: string; visionDescription?: string }): string {
    const parts = [`style=${p.style}`, `height=${p.heightFt}ft`];
    if (p.visionDescription) parts.push(`vision="${p.visionDescription.slice(0, 120)}"`);
    if (p.extraPrompt) parts.push(`extra="${p.extraPrompt.slice(0, 120)}"`);
    return parts.join(' ');
  }

  private async fileExists(p: string): Promise<boolean> {
    try { await fs.access(p); return true; } catch { return false; }
  }
}
