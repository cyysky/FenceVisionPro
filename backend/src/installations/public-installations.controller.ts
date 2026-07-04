import {
  BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { InstallationsService } from './installations.service';
import { InstallationEventType, InstallationStatus } from '@prisma/client';
import { PHOTO_KINDS } from './dto';

const TrimmedNonEmpty = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Installer public DTOs. The installer has no JWT; their
 * "credential" is the opaque token in the URL. We don't ask
 * for an email or anything else.
 */
class InstallerEventDto {
  @IsIn(['KICKOFF', 'MATERIALS_ORDERED', 'MATERIALS_RECEIVED', 'POSTS_SET', 'PANELS_HUNG', 'GATE_INSTALLED', 'IN_PROGRESS', 'COMPLETED'])
  type: 'KICKOFF' | 'MATERIALS_ORDERED' | 'MATERIALS_RECEIVED' | 'POSTS_SET' | 'PANELS_HUNG' | 'GATE_INSTALLED' | 'IN_PROGRESS' | 'COMPLETED';
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) note?: string;
}

/**
 * Customer sign-off DTO. The signature is a data:image/png;base64
 * URL from a small canvas, same shape as the Quote approval
 * canvas. We do the same 200-pixel ink check server-side.
 */
class CustomerApproveDto {
  @IsString() signatureDataUrl: string;
  @IsOptional() @Transform(TrimmedNonEmpty) @IsString() @MaxLength(2000) comment?: string;
}

const MAX_PUBLIC_PHOTO_BYTES = 25 * 1024 * 1024;

/**
 * Public installation endpoints. Split into two URL trees:
 *
 *   /public/installations/:id/installer/:token   - installer view
 *   /public/installations/:id/customer/:token    - customer view
 *
 * No JWT, no `@UseGuards`. Link security is the unguessable
 * token (32 random bytes -> 64 hex chars).
 */
@Controller('public/installations')
export class PublicInstallationsController {
  constructor(private svc: InstallationsService) {}

  // -------------------------------------------------------------------------
  // Installer view
  // -------------------------------------------------------------------------

  /**
   * Installer reads the work order. Returns the installation
   * with the quote summary, timeline events, and a list of
   * photos (no blob bytes - use the photo blob endpoint).
   */
  @Get(':id/installer/:token')
  async getInstallerView(@Param('id') id: string, @Param('token') token: string) {
    const link = await this.svc.consumeCustomerLink(token);
    if (!link) throw new NotFoundException('Link not found or expired');
    if (link.installationId !== id) throw new NotFoundException('Link does not match this installation');
    const inst = await this.svc.findByIdPublic(id);
    if (!inst) throw new NotFoundException('Installation not found');
    return this.publicInstallerView(inst);
  }

  /**
   * Installer posts a milestone event. We do NOT translate a
   * single "POSTS_SET" click into a status change - the status
   * follows the installer's explicit "Mark In Progress" /
   * "Mark Complete" actions. The event log just records what
   * happened.
   */
  @Post(':id/installer/:token/events')
  @HttpCode(201)
  async postInstallerEvent(
    @Param('id') id: string,
    @Param('token') token: string,
    @Body() dto: InstallerEventDto,
  ) {
    const link = await this.svc.consumeCustomerLink(token);
    if (!link || link.installationId !== id) throw new NotFoundException('Link not found or expired');
    const inst = await this.svc.findByIdPublic(id);
    if (!inst) throw new NotFoundException('Installation not found');
    if (inst.status === InstallationStatus.INSPECTED || inst.status === InstallationStatus.CANCELLED) {
      throw new BadRequestException('Installation is closed');
    }
    const map: Record<string, InstallationEventType> = {
      KICKOFF: InstallationEventType.KICKOFF,
      MATERIALS_ORDERED: InstallationEventType.MATERIALS_ORDERED,
      MATERIALS_RECEIVED: InstallationEventType.MATERIALS_RECEIVED,
      POSTS_SET: InstallationEventType.POSTS_SET,
      PANELS_HUNG: InstallationEventType.PANELS_HUNG,
      GATE_INSTALLED: InstallationEventType.GATE_INSTALLED,
      IN_PROGRESS: InstallationEventType.IN_PROGRESS,
      COMPLETED: InstallationEventType.COMPLETED,
    };
    const event = await (this.svc as any)['prisma'].installationEvent.create({
      data: {
        installationId: id,
        type: map[dto.type],
        actorKind: 'INSTALLER',
        actorLabel: inst.installerName || 'Installer',
        note: dto.note ?? null,
      },
    });
    return { id: event.id, type: event.type, occurredAt: event.occurredAt };
  }

  /**
   * Installer uploads a photo. Same 25 MB / image-only rules
   * as the protected path; tagged with `uploadedByKind:
   * 'INSTALLER'` and the installer's free-form name from the
   * installation record.
   */
  @Post(':id/installer/:token/photos')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MAX_PUBLIC_PHOTO_BYTES },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) cb(null, true);
      else cb(new BadRequestException(`Unsupported mime type: ${mime}`), false);
    },
  }))
  async uploadInstallerPhoto(
    @Param('id') id: string,
    @Param('token') token: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
    @Body() body: { kind?: string; caption?: string },
  ) {
    const link = await this.svc.consumeCustomerLink(token);
    if (!link || link.installationId !== id) throw new NotFoundException('Link not found or expired');
    const inst = await this.svc.findByIdPublic(id);
    if (!inst) throw new NotFoundException('Installation not found');
    if (!file) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_PUBLIC_PHOTO_BYTES) throw new BadRequestException('Photo exceeds 25 MB limit');
    if (!body.kind || !PHOTO_KINDS.includes(body.kind as any)) {
      throw new BadRequestException('Invalid photo kind');
    }
    const photo = await (this.svc as any)['prisma'].installationPhoto.create({
      data: {
        installationId: id,
        kind: body.kind,
        caption: body.caption ?? null,
        originalFilename: file.originalname || 'photo',
        mimeType: file.mimetype,
        sizeBytes: file.size,
        data: file.buffer,
        uploadedByKind: 'INSTALLER',
        uploadedByLabel: inst.installerName || 'Installer',
      },
    });
    await (this.svc as any)['prisma'].installationEvent.create({
      data: {
        installationId: id,
        type: InstallationEventType.PHOTO_UPLOADED,
        actorKind: 'INSTALLER',
        actorLabel: inst.installerName || 'Installer',
        note: body.caption ?? null,
        metadata: { photoId: photo.id, kind: body.kind, source: 'installer_public' },
      },
    });
    return {
      id: photo.id, kind: photo.kind, caption: photo.caption,
      originalFilename: photo.originalFilename, mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes, uploadedAt: photo.uploadedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Customer view
  // -------------------------------------------------------------------------

  @Get(':id/customer/:token')
  async getCustomerView(@Param('id') id: string, @Param('token') token: string) {
    const link = await this.svc.consumeCustomerLink(token);
    if (!link) throw new NotFoundException('Link not found or expired');
    if (link.installationId !== id) throw new NotFoundException('Link does not match this installation');
    const inst = await this.svc.findByIdPublic(id);
    if (!inst) throw new NotFoundException('Installation not found');
    return this.publicCustomerView(inst);
  }

  /**
   * Customer signs off on a completed install. Requires a real
   * (non-blank) signature and the installation must be in
   * COMPLETED status. On success we set the status to
   * INSPECTED, stamp inspectedAt, and record the sign-off
   * signature in a PublicCustomerLink metadata side-table for
   * audit (we don't yet persist the signature image - the quote
   * approval path is the one that writes a signature PNG to
   * disk, and that's the established place to look).
   */
  @Post(':id/customer/:token/approve')
  @HttpCode(200)
  async customerApprove(
    @Param('id') id: string,
    @Param('token') token: string,
    @Body() dto: CustomerApproveDto,
  ) {
    const link = await this.svc.consumeCustomerLink(token);
    if (!link || link.installationId !== id) throw new NotFoundException('Link not found or expired');
    const inst = await this.svc.findByIdPublic(id);
    if (!inst) throw new NotFoundException('Installation not found');
    if (inst.status !== InstallationStatus.COMPLETED) {
      throw new BadRequestException('Installation is not awaiting sign-off');
    }
    // Same sanity-cap + format check + ink-pixel check as the
    // quote approval path. We borrow the QuotesService method
    // via a lazy require to keep the ink-detection logic in
    // exactly one place.
    if (typeof dto.signatureDataUrl !== 'string' || dto.signatureDataUrl.length > 1_500_000) {
      throw new BadRequestException('Signature payload is missing or too large');
    }
    if (!/^data:image\/\w+;base64,[A-Za-z0-9+/=._-]+$/.test(dto.signatureDataUrl)) {
      throw new BadRequestException('Signature must be a data:image/<type>;base64 URL');
    }
    const base64 = dto.signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) throw new BadRequestException('Decoded signature is empty');
    const ink = this.countInkPixels(buf);
    if (ink < 200) {
      throw new BadRequestException(`Signature is empty or unreadable (only ${ink} ink pixels). Please sign before approving.`);
    }
    // The actual sign-off. We persist the data URL itself in
    // event.metadata so the wholesaler can render the
    // signature in the install detail page (and so the audit
    // trail contains it), without writing a new file to disk.
    const now = new Date();
    await (this.svc as any)['prisma'].installation.update({
      where: { id },
      data: { status: InstallationStatus.INSPECTED, inspectedAt: now },
    });
    await (this.svc as any)['prisma'].installationEvent.create({
      data: {
        installationId: id,
        type: InstallationEventType.CUSTOMER_APPROVED,
        actorKind: 'CUSTOMER',
        actorLabel: inst.quote?.customerName || 'Customer',
        note: dto.comment ?? null,
        metadata: { signatureDataUrl: dto.signatureDataUrl, inkPixels: ink },
      },
    });
    const fresh = await this.svc.findByIdPublic(id);
    return this.publicCustomerView(fresh!);
  }

  // -------------------------------------------------------------------------
  // Shared public blob endpoint (no auth, just the link)
  // -------------------------------------------------------------------------

  @Get(':id/photos/:photoId/blob')
  async getPublicPhotoBlob(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @Res() res: Response,
  ) {
    // Photos served via the public blob endpoint are scoped to
    // the public context: they're reachable only if the request
    // supplies a valid link token in either the `?token=...`
    // query param OR (for the installer / customer page) we
    // accept it as a path param. To keep the contract simple
    // for the front-end, we accept ?token=... on this endpoint.
    const url = res.req?.url || '';
    const m = url.match(/[?&]token=([^&]+)/);
    const token = m ? decodeURIComponent(m[1]) : null;
    if (!token) throw new NotFoundException('Token required');
    const link = await this.svc.consumeCustomerLink(token);
    if (!link) throw new NotFoundException('Link not found or expired');
    if (link.installationId !== id) throw new NotFoundException('Link does not match this installation');
    const photo = await (this.svc as any)['prisma'].installationPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.installationId !== id) throw new NotFoundException('Photo not found');
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', String(photo.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${(photo.originalFilename || 'photo').replace(/"/g, '').slice(0, 200)}"`);
    res.send(photo.data);
  }

  // -------------------------------------------------------------------------
  // View shaping
  // -------------------------------------------------------------------------

  /**
   * Public installer view. Differs from the protected
   * wholesaler view in three ways:
   *   - The customer email / phone are dropped (installer only
   *     needs name + address for the site visit).
   *   - The internal event metadata is omitted.
   *   - A `nextActions` hint is included so the front-end can
   *     render the right milestone checkboxes for the current
   *     status.
   */
  private publicInstallerView(inst: any) {
    const allowedNext = this.allowedNextActionsForInstaller(inst.status);
    return {
      id: inst.id,
      status: inst.status,
      scheduledStart: inst.scheduledStart,
      scheduledEnd: inst.scheduledEnd,
      installerName: inst.installerName,
      installerPhone: inst.installerPhone,
      installerEmail: inst.installerEmail,
      startedAt: inst.startedAt,
      completedAt: inst.completedAt,
      quote: inst.quote ? {
        id: inst.quote.id,
        reference: inst.quote.reference,
        customerName: inst.quote.customerName,
        projectAddress: inst.quote.projectAddress,
      } : null,
      events: inst.events.map((e: any) => ({
        id: e.id, type: e.type, actorKind: e.actorKind, actorLabel: e.actorLabel,
        note: e.note, occurredAt: e.occurredAt,
      })),
      photos: inst.photos,
      nextActions: allowedNext,
    };
  }

  private publicCustomerView(inst: any) {
    return {
      id: inst.id,
      status: inst.status,
      scheduledStart: inst.scheduledStart,
      scheduledEnd: inst.scheduledEnd,
      installerName: inst.installerName,
      completedAt: inst.completedAt,
      inspectedAt: inst.inspectedAt,
      quote: inst.quote ? {
        id: inst.quote.id,
        reference: inst.quote.reference,
        customerName: inst.quote.customerName,
        projectAddress: inst.quote.projectAddress,
      } : null,
      events: inst.events.map((e: any) => ({
        id: e.id, type: e.type, actorKind: e.actorKind, actorLabel: e.actorLabel,
        note: e.note, occurredAt: e.occurredAt,
      })),
      photos: inst.photos,
      canSignOff: inst.status === 'COMPLETED',
    };
  }

  /**
   * Which milestone event types the installer UI should show
   * checkboxes for, given the current installation status.
   */
  private allowedNextActionsForInstaller(status: string) {
    switch (status) {
      case 'SCHEDULED':
        return ['KICKOFF', 'MATERIALS_ORDERED'];
      case 'MATERIALS_ORDERED':
        return ['MATERIALS_RECEIVED', 'POSTS_SET', 'IN_PROGRESS'];
      case 'IN_PROGRESS':
        return ['POSTS_SET', 'PANELS_HUNG', 'GATE_INSTALLED', 'COMPLETED'];
      case 'COMPLETED':
      case 'INSPECTED':
      case 'CANCELLED':
      default:
        return [];
    }
  }

  /**
   * Inline copy of the ink-pixel counter used by the quote
   * approval path. Inlined here (rather than calling into
   * QuotesService) so the installations module stays
   * self-contained - both copies are small and the format
   * they parse (PNG) is stable.
   */
  private countInkPixels(buf: Buffer): number {
    try {
      if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return 0;
      const w = buf.readUInt32BE(16);
      const h = buf.readUInt32BE(20);
      const bitDepth = buf.readUInt8(24);
      const colorType = buf.readUInt8(25);
      if (bitDepth !== 8) return 0;
      const chunks: Buffer[] = [];
      let off = 8;
      while (off < buf.length) {
        const len = buf.readUInt32BE(off);
        const type = buf.toString('ascii', off + 4, off + 8);
        if (type === 'IDAT') chunks.push(buf.slice(off + 8, off + 8 + len));
        else if (type === 'IEND') break;
        off += 12 + len;
      }
      const zlib = require('zlib');
      const raw = zlib.inflateSync(Buffer.concat(chunks));
      const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
      if (!bpp) return 0;
      const stride = w * bpp + 1;
      let ink = 0;
      for (let y = 0; y < h; y++) {
        const row = raw.slice(y * stride + 1, y * stride + 1 + w * bpp);
        for (let x = 0; x < w; x++) {
          const r = row[x * bpp], g = row[x * bpp + 1], b = row[x * bpp + 2];
          if (r < 200 || g < 200 || b < 200) {
            ink++;
            if (ink >= 200) return ink;
          }
        }
      }
      return ink;
    } catch {
      return 0;
    }
  }
}
