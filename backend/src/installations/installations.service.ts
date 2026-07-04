import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { Role, InstallationStatus, InstallationEventType } from '@prisma/client';
import {
  CreateInstallationDto, CreateCustomerLinkDto, InstallationStatusLiteral,
  INSTALLATION_TRANSITIONS, UpdateInstallationDto, TransitionInstallationDto,
} from './dto';

/**
 * Photo size cap (per upload). 25 MB matches the existing project
 * document cap, which is enough for a phone camera JPEG and
 * consistent with the rest of the app.
 */
const MAX_PHOTO_BYTES = 25 * 1024 * 1024;
const ALLOWED_PHOTO_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

/**
 * Installation traceability service.
 *
 * Owns the protected (dealer-facing) CRUD on Installation +
 * the protected photo upload + the customer-link issue/revoke
 * flow. The public installer + customer controllers live in
 * `public-installations.controller.ts` and call into the same
 * service via small wrapper methods (postInstallerEvent,
 * approveAsCustomer, etc) so the audit trail stays in one place.
 */
@Injectable()
export class InstallationsService {
  constructor(private prisma: PrismaService) {}

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /**
   * Convert the caller's JwtPayload to a (dealerId, isAdmin)
   * pair. Mirrors the same pattern in QuotesService.
   */
  private authCtx(u: JwtPayload) {
    const isAdmin = u.role === Role.ADMIN;
    return { dealerId: u.dealerId, isAdmin };
  }

  /**
   * Find an installation by id and assert the caller can see it.
   * Throws 404 (not 403) if the row doesn't exist OR is owned by
   * a different tenant - we don't want to leak the existence of
   * cross-tenant rows.
   */
  private async findOwned(id: string, u: JwtPayload, extra: any = {}) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const inst = await this.prisma.installation.findUnique({
      where: { id },
      include: { events: { orderBy: { occurredAt: 'asc' } }, photos: true, customerLinks: true, installer: { select: { id: true, name: true, phone: true, email: true, companyName: true, status: true } } },
      ...extra,
    });
    if (!inst) throw new NotFoundException('Installation not found');
    if (!isAdmin) {
      const q = await this.prisma.quote.findUnique({ where: { id: inst.quoteId }, select: { dealerId: true } });
      if (!q || q.dealerId !== dealerId) {
        throw new NotFoundException('Installation not found');
      }
    }
    return inst;
  }

  /**
   * Record an audit event on an installation. Used by every state
   * change AND every photo / note write so the timeline is the
   * single source of truth for what happened.
   */
  private async logEvent(
    installationId: string,
    type: InstallationEventType,
    actorKind: string,
    actorLabel: string | null,
    note?: string | null,
    metadata?: any,
  ) {
    return this.prisma.installationEvent.create({
      data: {
        installationId,
        type,
        actorKind,
        actorLabel: actorLabel ?? null,
        note: note ?? null,
        metadata: metadata ?? undefined,
      },
    });
  }

  /**
   * Generate a 64-char hex token for a public customer link. 32
   * bytes (256 bits) is well past the "unguessable" threshold for
   * a public-by-link endpoint.
   */
  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  // -------------------------------------------------------------------------
  // Protected (dealer) endpoints
  // -------------------------------------------------------------------------

  /**
   * List installations visible to the caller. Mirrors the
   * QuotesService list() shape: dealer-scoped (admin sees
   * all), with optional status filter and a free-text search
   * across the linked quote's reference / customer name.
   */
  async list(u: JwtPayload, opts: { status?: InstallationStatusLiteral; q?: string; limit?: number }) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const where: any = isAdmin ? {} : { quote: { dealerId: dealerId! } };
    if (opts.status) where.status = opts.status;
    if (opts.q) {
      const q = opts.q.trim();
      if (q) {
        where.OR = [
          { quote: { reference: { contains: q, mode: 'insensitive' } } },
          { quote: { customerName: { contains: q, mode: 'insensitive' } } },
          { quote: { customerEmail: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }
    return this.prisma.installation.findMany({
      where,
      orderBy: [{ status: 'asc' }, { scheduledStart: 'asc' }, { createdAt: 'desc' }],
      take: Math.min(Math.max(opts.limit ?? 200, 1), 500),
      include: {
        quote: { select: { id: true, reference: true, customerName: true, customerEmail: true, status: true } },
        installer: { select: { id: true, name: true, status: true } },
        _count: { select: { events: true, photos: true, customerLinks: true } },
      },
    });
  }

  /**
   * Fetch a single installation with everything the detail page
   * needs: events (timeline), photos (gallery), and customer
   * links (installer & links tab).
   */
  async get(id: string, u: JwtPayload) {
    const inst = await this.findOwned(id, u);
    // also include the quote reference / customer for the header
    const quote = await this.prisma.quote.findUnique({
      where: { id: inst.quoteId },
      select: { id: true, reference: true, customerName: true, customerEmail: true, customerPhone: true, projectAddress: true, status: true },
    });
    return { ...inst, quote };
  }

  /**
   * Create a new installation for a quote. Enforces 1:1 (a quote
   * can only have one installation) by relying on the unique
   * constraint on Installation.quoteId; we turn the resulting
   * P2002 into a friendly 400.
   */
  async create(u: JwtPayload, dto: CreateInstallationDto) {
    const { dealerId, isAdmin } = this.authCtx(u);
    const quote = await this.prisma.quote.findUnique({ where: { id: dto.quoteId } });
    if (!quote) throw new NotFoundException('Quote not found');
    if (!isAdmin && quote.dealerId !== dealerId) {
      throw new ForbiddenException('Not your quote');
    }
    // Only approved (or above) quotes can be turned into installations.
    if (!['APPROVED'].includes(quote.status)) {
      throw new BadRequestException(`Quote must be APPROVED before scheduling an installation (currently ${quote.status})`);
    }

    // If an installerId is given, validate ownership and
    // pre-populate the denormalised snapshot fields. Explicit
    // free-form fields on the body win if both are provided.
    let installerName = dto.installerName ?? null;
    let installerPhone = dto.installerPhone ?? null;
    let installerEmail = dto.installerEmail ?? null;
    let installerId: string | null = null;
    if (dto.installerId) {
      const installer = await this.prisma.installer.findUnique({ where: { id: dto.installerId } });
      if (!installer) throw new NotFoundException('Installer not found');
      if (!isAdmin && installer.dealerId !== dealerId) {
        throw new ForbiddenException('Installer belongs to another dealer');
      }
      installerId = installer.id;
      if (installerName === null) installerName = installer.name;
      if (installerPhone === null) installerPhone = installer.phone ?? null;
      if (installerEmail === null) installerEmail = installer.email ?? null;
    }

    let inst;
    try {
      inst = await this.prisma.installation.create({
        data: {
          quoteId: dto.quoteId,
          status: InstallationStatus.SCHEDULED,
          scheduledStart: dto.scheduledStart ? new Date(dto.scheduledStart) : null,
          scheduledEnd: dto.scheduledEnd ? new Date(dto.scheduledEnd) : null,
          installerId,
          installerName,
          installerPhone,
          installerEmail,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new BadRequestException('An installation already exists for this quote');
      }
      throw e;
    }
    await this.logEvent(
      inst.id,
      InstallationEventType.SCHEDULED,
      u.role,
      u.email,
      dto.note ?? null,
      { source: 'dealer_create', installerId: installerId ?? undefined },
    );
    return this.get(inst.id, u);
  }

  /**
   * Partial update of the editable fields. The audit log records
   * the field changes so the timeline shows reschedules.
   */
  async update(id: string, u: JwtPayload, dto: UpdateInstallationDto) {
    const inst = await this.findOwned(id, u);
    const { dealerId, isAdmin } = this.authCtx(u);
    const data: any = {};
    const changed: string[] = [];
    if (dto.scheduledStart !== undefined) {
      data.scheduledStart = dto.scheduledStart ? new Date(dto.scheduledStart) : null;
      changed.push('scheduledStart');
    }
    if (dto.scheduledEnd !== undefined) {
      data.scheduledEnd = dto.scheduledEnd ? new Date(dto.scheduledEnd) : null;
      changed.push('scheduledEnd');
    }
    if (dto.installerId !== undefined) {
      if (dto.installerId === '') {
        // Empty string clears the FK (lets the dealer un-assign).
        data.installerId = null;
        changed.push('installerId');
      } else {
        // Validate ownership before assigning.
        const installer = await this.prisma.installer.findUnique({ where: { id: dto.installerId } });
        if (!installer) throw new NotFoundException('Installer not found');
        if (!isAdmin && installer.dealerId !== dealerId) {
          throw new ForbiddenException('Installer belongs to another dealer');
        }
        data.installerId = installer.id;
        changed.push('installerId');
      }
    }
    if (dto.installerName !== undefined) {
      data.installerName = dto.installerName || null;
      changed.push('installerName');
    }
    if (dto.installerPhone !== undefined) {
      data.installerPhone = dto.installerPhone || null;
      changed.push('installerPhone');
    }
    if (dto.installerEmail !== undefined) {
      data.installerEmail = dto.installerEmail || null;
      changed.push('installerEmail');
    }
    await this.prisma.installation.update({ where: { id: inst.id }, data });
    if (changed.length) {
      await this.logEvent(
        inst.id,
        InstallationEventType.NOTE_ADDED,
        u.role,
        u.email,
        null,
        { kind: 'installation_updated', fields: changed },
      );
    }
    return this.get(id, u);
  }

  /**
   * Move the installation to a new status. The allowed next
   * states are defined in the static INSTALLATION_TRANSITIONS map
   * (mirrored in dto.ts for the front end). Side-effect timestamps
   * (startedAt, completedAt, etc) are filled in here.
   */
  async transition(id: string, u: JwtPayload, dto: TransitionInstallationDto) {
    const inst = await this.findOwned(id, u);
    const allowed = INSTALLATION_TRANSITIONS[inst.status as InstallationStatusLiteral] || [];
    if (!allowed.includes(dto.toStatus)) {
      throw new BadRequestException(`Cannot move installation from ${inst.status} to ${dto.toStatus}`);
    }
    const now = new Date();
    const data: any = { status: dto.toStatus };
    if (dto.toStatus === 'IN_PROGRESS' && !inst.startedAt) data.startedAt = now;
    if (dto.toStatus === 'COMPLETED' && !inst.completedAt) data.completedAt = now;
    if (dto.toStatus === 'INSPECTED' && !inst.inspectedAt) data.inspectedAt = now;
    if (dto.toStatus === 'CANCELLED' && !inst.cancelledAt) data.cancelledAt = now;
    await this.prisma.installation.update({ where: { id: inst.id }, data });
    const eventType = this.statusToEventType(dto.toStatus);
    await this.logEvent(
      inst.id,
      eventType,
      u.role,
      u.email,
      dto.note ?? null,
      { from: inst.status, to: dto.toStatus },
    );
    return this.get(id, u);
  }

  private statusToEventType(s: InstallationStatusLiteral): InstallationEventType {
    switch (s) {
      case 'SCHEDULED': return InstallationEventType.SCHEDULED;
      case 'MATERIALS_ORDERED': return InstallationEventType.MATERIALS_ORDERED;
      case 'IN_PROGRESS': return InstallationEventType.IN_PROGRESS;
      case 'COMPLETED': return InstallationEventType.COMPLETED;
      case 'INSPECTED': return InstallationEventType.INSPECTED;
      case 'CANCELLED': return InstallationEventType.CANCELLED;
    }
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  /**
   * Upload a photo. The file is read in memory by multer (see
   * the controller) and persisted as a BYTEA blob - same
   * pattern as the existing ProjectDocument upload. The
   * `uploadedByKind` is set to "WHOLESALER" because this method
   * is the protected path; the public installer / customer
   * controllers have their own upload methods that set
   * "INSTALLER" / "CUSTOMER".
   */
  async uploadPhoto(
    id: string,
    u: JwtPayload,
    file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
    meta: { kind: 'BEFORE' | 'DURING' | 'AFTER' | 'ISSUE'; caption?: string; takenAt?: string },
  ) {
    const inst = await this.findOwned(id, u);
    if (!file || !file.buffer || !file.size) throw new BadRequestException('No file uploaded');
    if (file.size > MAX_PHOTO_BYTES) throw new BadRequestException('Photo exceeds 25 MB limit');
    const mime = (file.mimetype || '').toLowerCase();
    if (!ALLOWED_PHOTO_MIMES.has(mime)) throw new BadRequestException(`Unsupported mime type: ${mime}`);
    const photo = await this.prisma.installationPhoto.create({
      data: {
        installationId: inst.id,
        kind: meta.kind,
        caption: meta.caption ?? null,
        originalFilename: file.originalname || 'photo',
        mimeType: mime,
        sizeBytes: file.size,
        data: file.buffer,
        uploadedByKind: 'WHOLESALER',
        uploadedByLabel: u.email,
        takenAt: meta.takenAt ? new Date(meta.takenAt) : null,
      },
    });
    await this.logEvent(
      inst.id,
      InstallationEventType.PHOTO_UPLOADED,
      u.role,
      u.email,
      meta.caption ?? null,
      { photoId: photo.id, kind: meta.kind, originalFilename: photo.originalFilename },
    );
    return {
      id: photo.id,
      kind: photo.kind,
      caption: photo.caption,
      originalFilename: photo.originalFilename,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      widthPx: photo.widthPx,
      heightPx: photo.heightPx,
      uploadedByKind: photo.uploadedByKind,
      uploadedByLabel: photo.uploadedByLabel,
      takenAt: photo.takenAt,
      uploadedAt: photo.uploadedAt,
    };
  }

  /**
   * List photos. The data column (BYTES) is omitted - use the
   * dedicated blob endpoint to stream the image bytes.
   */
  async listPhotos(id: string, u: JwtPayload) {
    const inst = await this.findOwned(id, u);
    return this.prisma.installationPhoto.findMany({
      where: { installationId: inst.id },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true, kind: true, caption: true, originalFilename: true,
        mimeType: true, sizeBytes: true, widthPx: true, heightPx: true,
        uploadedByKind: true, uploadedByLabel: true, takenAt: true, uploadedAt: true,
      },
    });
  }

  /**
   * Stream a photo's binary data. Throws 404 if the photo or its
   * parent installation can't be seen by the caller.
   */
  async getPhotoBlob(installationId: string, photoId: string, u: JwtPayload) {
    const inst = await this.findOwned(installationId, u);
    const photo = await this.prisma.installationPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.installationId !== inst.id) {
      throw new NotFoundException('Photo not found');
    }
    return {
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      originalFilename: photo.originalFilename,
      data: photo.data as Buffer,
    };
  }

  /**
   * Delete a photo. Records a NOTE_ADDED audit event so the
   * timeline still shows the gap (we deliberately don't pretend
   * it never happened).
   */
  async deletePhoto(installationId: string, photoId: string, u: JwtPayload) {
    const inst = await this.findOwned(installationId, u);
    const photo = await this.prisma.installationPhoto.findUnique({ where: { id: photoId } });
    if (!photo || photo.installationId !== inst.id) {
      throw new NotFoundException('Photo not found');
    }
    await this.prisma.installationPhoto.delete({ where: { id: photoId } });
    await this.logEvent(
      inst.id,
      InstallationEventType.NOTE_ADDED,
      u.role,
      u.email,
      null,
      { kind: 'photo_deleted', photoId, originalFilename: photo.originalFilename },
    );
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Customer links
  // -------------------------------------------------------------------------

  /**
   * Issue a new public customer link. The token is the only
   * secret; we never store anything user-supplied in the URL.
   * Returns the token + a fully-qualified URL the dealer
   * can copy/paste.
   */
  async createCustomerLink(
    id: string,
    u: JwtPayload,
    dto: CreateCustomerLinkDto,
  ) {
    const inst = await this.findOwned(id, u);
    const token = this.generateToken();
    const link = await this.prisma.publicCustomerLink.create({
      data: {
        installationId: inst.id,
        token,
        purpose: dto.purpose,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    await this.logEvent(
      inst.id,
      InstallationEventType.PUBLIC_LINK_ISSUIED,
      u.role,
      u.email,
      null,
      { linkId: link.id, purpose: link.purpose },
    );
    return {
      id: link.id,
      token: link.token,
      purpose: link.purpose,
      expiresAt: link.expiresAt,
      revokedAt: link.revokedAt,
      createdAt: link.createdAt,
    };
  }

  async listCustomerLinks(id: string, u: JwtPayload) {
    const inst = await this.findOwned(id, u);
    return this.prisma.publicCustomerLink.findMany({
      where: { installationId: inst.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Revoke a link. We soft-revoke (set revokedAt) instead of
   * deleting so the audit log of "who got which link when"
   * survives.
   */
  async revokeCustomerLink(installationId: string, linkId: string, u: JwtPayload) {
    const inst = await this.findOwned(installationId, u);
    const link = await this.prisma.publicCustomerLink.findUnique({ where: { id: linkId } });
    if (!link || link.installationId !== inst.id) {
      throw new NotFoundException('Link not found');
    }
    if (link.revokedAt) return { ok: true, alreadyRevoked: true };
    await this.prisma.publicCustomerLink.update({
      where: { id: linkId },
      data: { revokedAt: new Date() },
    });
    await this.logEvent(
      inst.id,
      InstallationEventType.NOTE_ADDED,
      u.role,
      u.email,
      null,
      { kind: 'link_revoked', linkId },
    );
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Internal lookups used by the public controllers (Step 3)
  // -------------------------------------------------------------------------

  /**
   * Look up an installation by id without a user. Used by the
   * public installer + customer controllers, which authenticate
   * the caller via the link token instead of a JWT.
   */
  async findByIdPublic(id: string) {
    return this.prisma.installation.findUnique({
      where: { id },
      include: {
        quote: {
          select: { id: true, reference: true, customerName: true, customerEmail: true, customerPhone: true, projectAddress: true, status: true },
        },
        events: { orderBy: { occurredAt: 'asc' } },
        installer: { select: { id: true, name: true } },
        photos: {
          orderBy: { uploadedAt: 'desc' },
          select: {
            id: true, kind: true, caption: true, originalFilename: true,
            mimeType: true, sizeBytes: true, widthPx: true, heightPx: true,
            uploadedByKind: true, uploadedByLabel: true, takenAt: true, uploadedAt: true,
          },
        },
      },
    });
  }

  /**
   * Look up a link by token, marking it viewed in the same call.
   * Returns null if the token doesn't exist, is revoked, or is
   * expired - the caller maps all three to the same 404 to
   * avoid leaking which one failed.
   */
  async consumeCustomerLink(token: string) {
    const link = await this.prisma.publicCustomerLink.findUnique({ where: { token } });
    if (!link) return null;
    if (link.revokedAt) return null;
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
    await this.prisma.publicCustomerLink.update({
      where: { id: link.id },
      data: { lastViewedAt: new Date() },
    });
    return link;
  }
}
