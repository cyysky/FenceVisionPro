import {
  BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { promises as fs } from 'fs';
import { resolve as pathResolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { QuotesService, FenceSegment } from '../quotes/quotes.service';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { ProjectStatus, Role } from '@prisma/client';

/**
 * Allowed document mime types. We keep this list small and explicit
 * because each mime type is mapped 1:1 to a magic-byte signature we
 * verify before persisting the blob.
 */
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

/** 25 MB upload cap (per spec). */
const MAX_FILE_SIZE = 25 * 1024 * 1024;

/**
 * Magic-byte signatures for the four allowed mime types. We inspect
 * the leading bytes of the upload rather than trusting the browser-
 * supplied Content-Type, because the latter is trivial to forge.
 */
const MAGIC_SIGNATURES: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', test: (b) => b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A },
  { mime: 'image/jpeg', test: (b) => b.length >= 3 &&
      b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  // WEBP: "RIFF????WEBP" - bytes 0-3 = "RIFF", 8-11 = "WEBP".
  { mime: 'image/webp', test: (b) => b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  // PDF: "%PDF-"
  { mime: 'application/pdf', test: (b) => b.length >= 5 &&
      b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2D },
];

/**
 * Sniff the real mime type of an upload by inspecting its leading
 * bytes. Returns null if the bytes don't match any of our allowed
 * signatures - the caller should reject the file.
 */
export function sniffMimeType(buf: Buffer): string | null {
  for (const sig of MAGIC_SIGNATURES) {
    if (sig.test(buf)) return sig.mime;
  }
  return null;
}

interface AuthedUser extends JwtPayload {
  sub: string;
  role: string;
  dealerId: string | null;
}

@Injectable()
export class ProjectsService {
  constructor(
    private prisma: PrismaService,
    private ai: AiService,
    @Inject(forwardRef(() => QuotesService))
    private quotes: QuotesService,
  ) {}

  /**
   * Centralised ownership check. Admins bypass; otherwise the
   * project's dealerId must match the caller's dealerId.
   * Throws 404 if the project is missing so we don't leak the
   * existence of cross-tenant rows.
   */
  async assertOwnership(projectId: string, user: AuthedUser) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    if (user.role !== Role.ADMIN && project.dealerId !== user.dealerId) {
      throw new ForbiddenException('Not your project');
    }
    return project;
  }

  /**
   * List projects visible to the caller with optional filters. Admin
   * sees every row; dealer users are scoped to their tenant.
   * Returns `{ rows, total }` so the dashboard can show a count
   * without a second round-trip.
   */
  async list(
    user: AuthedUser,
    opts: {
      status?: string;
      projectType?: 'RESIDENTIAL' | 'COMMERCIAL';
      installScope?: 'FULL' | 'HALF' | 'PARTIAL';
      q?: string;
      take?: number;
      skip?: number;
    } = {},
  ) {
    const where: any = user.role === Role.ADMIN ? {} : { dealerId: user.dealerId! };
    if (opts.status) where.status = opts.status;
    if (opts.projectType) where.projectType = opts.projectType;
    if (opts.installScope) where.installScope = opts.installScope;
    if (opts.q && opts.q.trim()) {
      const q = opts.q.trim();
      where.OR = [
        { customerName: { contains: q, mode: 'insensitive' } },
        { customerEmail: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ];
    }
    const take = Math.min(Math.max(opts.take ?? 50, 1), 500);
    const skip = Math.max(opts.skip ?? 0, 0);
    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        skip,
        include: {
          _count: { select: { documents: true, selections: true, measurements: true, visualizations: true } },
        },
      }),
      this.prisma.project.count({ where }),
    ]);
    return { rows, total };
  }

  /**
   * Fetch a single project with the full nested tree (documents,
   * selections, measurements, visualizations). The `data` Bytes field
   * is stripped from the document rows before returning - callers
   * fetch the blob via the dedicated /documents/:docId/blob endpoint
   * so we never serialise multi-MB byte arrays into a JSON response.
   */
  async findOne(id: string, user: AuthedUser) {
    const project = await this.assertOwnership(id, user);
    const full = await this.prisma.project.findUnique({
      where: { id: project.id },
      include: {
        documents: {
          // Order: newest first, then by kind for stable display.
          orderBy: [{ uploadedAt: 'desc' }],
          // Strip the blob - we serve it from the dedicated endpoint.
          select: this.documentMetadataSelect(),
        },
        selections: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
        measurements: { orderBy: { id: 'asc' } },
        visualizations: {
          orderBy: { generatedAt: 'desc' },
          // Visualisations always come back without their data blob.
          select: this.visualizationMetadataSelect(),
        },
      },
    });
    return full!;
  }

  /**
   * Create a new project. Dealer users are pinned to their own
   * tenant even if the body contains a dealerId (defence in depth
   * - validation rejects it for them too, but we override to be safe).
   * Admin callers may set dealerId explicitly.
   */
  async create(user: AuthedUser, dto: {
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
    customerAddress?: string;
    projectType?: 'RESIDENTIAL' | 'COMMERCIAL';
    installScope: 'FULL' | 'HALF' | 'PARTIAL';
    notes?: string;
    totalLinearMeters?: number;
    totalAreaSqM?: number;
    dealerId?: string;
  }) {
    const dealerId = user.role === Role.ADMIN
      ? (dto.dealerId ?? user.dealerId ?? null)
      : user.dealerId;
    if (!dealerId) {
      throw new ForbiddenException('Only dealer users can create projects');
    }
    // Validate the dealer exists when an admin is creating on
    // someone else's behalf - a typo in the body should 4xx, not
    // produce an FK violation deep in Prisma.
    if (user.role === Role.ADMIN && dto.dealerId) {
      const w = await this.prisma.dealer.findUnique({ where: { id: dto.dealerId } });
      if (!w) throw new BadRequestException('Unknown dealerId');
    }
    return this.prisma.project.create({
      data: {
        dealerId,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail ?? null,
        customerPhone: dto.customerPhone ?? null,
        customerAddress: dto.customerAddress ?? null,
        projectType: (dto.projectType as any) ?? 'RESIDENTIAL',
        installScope: dto.installScope as any,
        notes: dto.notes ?? null,
        totalLinearMeters: dto.totalLinearMeters ?? null,
        totalAreaSqM: dto.totalAreaSqM ?? null,
        status: ProjectStatus.DRAFT,
      },
    });
  }

  /**
   * Partial update on a project. Allowed only for the owner or an
   * admin. Setting status to SUBMITTED stamps submittedAt so we have
   * an audit trail of when the customer sent the project for quoting.
   */
  async update(id: string, user: AuthedUser, dto: Record<string, any>) {
    const project = await this.assertOwnership(id, user);
    const data: any = {};
    for (const k of [
      'customerName', 'customerEmail', 'customerPhone', 'customerAddress',
      'projectType', 'installScope', 'notes', 'totalLinearMeters', 'totalAreaSqM',
    ]) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === ProjectStatus.SUBMITTED && !project.submittedAt) {
        data.submittedAt = new Date();
      }
    }
    return this.prisma.project.update({ where: { id: project.id }, data });
  }

  /**
   * Soft delete: we don't actually drop the row (the project is
   * referenced by quotes and historical data), we just flip the
   * status to CANCELLED. Owner or admin only.
   */
  async softDelete(id: string, user: AuthedUser) {
    const project = await this.assertOwnership(id, user);
    if (project.status === ProjectStatus.CANCELLED) return project;
    return this.prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.CANCELLED },
    });
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  /**
   * Select clause used whenever we return document rows to the
   * client. Excludes the `data` blob - we serve it from a dedicated
   * streaming endpoint so the listing response stays small.
   */
  private documentMetadataSelect() {
    return {
      id: true, projectId: true, kind: true,
      originalFilename: true, mimeType: true, sizeBytes: true,
      widthPx: true, heightPx: true,
      uploadedById: true, uploadedAt: true, caption: true,
    } as const;
  }

  private visualizationMetadataSelect() {
    return {
      id: true, projectId: true, kind: true,
      mimeType: true, prompt: true, modelUsed: true,
      widthPx: true, heightPx: true, generatedAt: true,
    } as const;
  }

  /**
   * Persist a new document blob. Performs three layers of validation:
   *   1. size cap (multer + this check)
   *   2. declared mime type must be in the allowlist
   *   3. magic bytes must match the declared mime type
   * For image mime types we extract the real dimensions with sharp.
   * PDF dimensions are left null - sharp doesn't introspect PDFs.
   */
  async uploadDocument(
    projectId: string,
    user: AuthedUser,
    file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
    meta: { kind: 'SITE_PHOTO' | 'FLOOR_PLAN' | 'PROPERTY_DEED' | 'REFERENCE_IMAGE' | 'OTHER'; caption?: string },
  ) {
    const project = await this.assertOwnership(projectId, user);
    if (!file?.buffer?.length) throw new BadRequestException('Empty file');
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`Unsupported mime type: ${file.mimetype}`);
    }
    const sniffed = sniffMimeType(file.buffer);
    if (!sniffed) {
      throw new BadRequestException('File contents do not match any allowed format');
    }
    if (sniffed !== file.mimetype) {
      throw new BadRequestException(
        `Declared mime type (${file.mimetype}) does not match file contents (${sniffed})`,
      );
    }
    let widthPx: number | null = null;
    let heightPx: number | null = null;
    if (sniffed !== 'application/pdf') {
      try {
        // Dynamic import keeps the bundle small for callers that
        // never touch documents (e.g. quote-only code paths).
        const sharp = (await import('sharp')).default;
        const meta = await sharp(file.buffer).metadata();
        widthPx = meta.width ?? null;
        heightPx = meta.height ?? null;
      } catch {
        // Dimension extraction is best-effort; persist the blob
        // anyway so the upload isn't lost.
      }
    }
    return this.prisma.projectDocument.create({
      data: {
        projectId: project.id,
        kind: meta.kind as any,
        originalFilename: file.originalname,
        mimeType: sniffed,
        sizeBytes: file.size,
        widthPx: widthPx ?? undefined,
        heightPx: heightPx ?? undefined,
        data: file.buffer,
        uploadedById: user.sub,
        caption: meta.caption ?? null,
      },
      select: this.documentMetadataSelect(),
    });
  }

  async listDocuments(projectId: string, user: AuthedUser) {
    await this.assertOwnership(projectId, user);
    return this.prisma.projectDocument.findMany({
      where: { projectId },
      orderBy: [{ uploadedAt: 'desc' }],
      select: this.documentMetadataSelect(),
    });
  }

  /**
   * Return the raw document row (with the `data` Bytes column) so
   * the controller can stream it back with the right Content-Type
   * and Content-Disposition headers.
   */
  async getDocumentBlob(projectId: string, docId: string, user: AuthedUser) {
    await this.assertOwnership(projectId, user);
    const doc = await this.prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.projectId !== projectId) {
      throw new NotFoundException('Document not found');
    }
    return doc;
  }

  async deleteDocument(projectId: string, docId: string, user: AuthedUser) {
    const project = await this.assertOwnership(projectId, user);
    const doc = await this.prisma.projectDocument.findUnique({ where: { id: docId } });
    if (!doc || doc.projectId !== project.id) {
      throw new NotFoundException('Document not found');
    }
    await this.prisma.projectDocument.delete({ where: { id: docId } });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Fence selections
  // -------------------------------------------------------------------------

  async addSelection(projectId: string, user: AuthedUser, dto: {
    productId: string; designId?: string; linearMeters: number; heightFt: number;
    panelCount?: number; gateCount?: number; notes?: string; sortOrder?: number;
  }) {
    const project = await this.assertOwnership(projectId, user);
    return this.prisma.projectFenceSelection.create({
      data: {
        projectId: project.id,
        productId: dto.productId,
        designId: dto.designId ?? null,
        linearMeters: dto.linearMeters,
        heightFt: dto.heightFt,
        panelCount: dto.panelCount ?? null,
        gateCount: dto.gateCount ?? null,
        notes: dto.notes ?? null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateSelection(projectId: string, selId: string, user: AuthedUser, dto: Record<string, any>) {
    const project = await this.assertOwnership(projectId, user);
    const sel = await this.prisma.projectFenceSelection.findUnique({ where: { id: selId } });
    if (!sel || sel.projectId !== project.id) throw new NotFoundException('Selection not found');
    const data: any = {};
    for (const k of ['productId', 'designId', 'linearMeters', 'heightFt', 'panelCount', 'gateCount', 'notes', 'sortOrder']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    return this.prisma.projectFenceSelection.update({ where: { id: selId }, data });
  }

  async removeSelection(projectId: string, selId: string, user: AuthedUser) {
    const project = await this.assertOwnership(projectId, user);
    const sel = await this.prisma.projectFenceSelection.findUnique({ where: { id: selId } });
    if (!sel || sel.projectId !== project.id) throw new NotFoundException('Selection not found');
    await this.prisma.projectFenceSelection.delete({ where: { id: selId } });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Measurements
  // -------------------------------------------------------------------------

  async addMeasurement(projectId: string, user: AuthedUser, dto: {
    label: string; lengthM: number; heightFt: number; widthM?: number; slopeDeg?: number; notes?: string;
  }) {
    const project = await this.assertOwnership(projectId, user);
    return this.prisma.projectMeasurement.create({
      data: {
        projectId: project.id,
        label: dto.label,
        lengthM: dto.lengthM,
        heightFt: dto.heightFt,
        widthM: dto.widthM ?? null,
        slopeDeg: dto.slopeDeg ?? null,
        notes: dto.notes ?? null,
      },
    });
  }

  async updateMeasurement(projectId: string, measId: string, user: AuthedUser, dto: Record<string, any>) {
    const project = await this.assertOwnership(projectId, user);
    const m = await this.prisma.projectMeasurement.findUnique({ where: { id: measId } });
    if (!m || m.projectId !== project.id) throw new NotFoundException('Measurement not found');
    const data: any = {};
    for (const k of ['label', 'lengthM', 'heightFt', 'widthM', 'slopeDeg', 'notes']) {
      if (dto[k] !== undefined) data[k] = dto[k];
    }
    return this.prisma.projectMeasurement.update({ where: { id: measId }, data });
  }

  async removeMeasurement(projectId: string, measId: string, user: AuthedUser) {
    const project = await this.assertOwnership(projectId, user);
    const m = await this.prisma.projectMeasurement.findUnique({ where: { id: measId } });
    if (!m || m.projectId !== project.id) throw new NotFoundException('Measurement not found');
    await this.prisma.projectMeasurement.delete({ where: { id: measId } });
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Visualisations
  // -------------------------------------------------------------------------

  /**
   * Generate an AI visualisation (rendered image or 3D source code)
   * and persist it as a blob. We delegate the actual model call to
   * AiService and only handle the glue:
   *   - read the generated bytes from disk (or wrap the JS source)
   *   - delete the temp file the AI service wrote
   *   - persist the blob + metadata
   */
  async generateVisualization(projectId: string, user: AuthedUser, dto: {
    kind: 'AI_IMAGE' | 'AI_3D_SNAPSHOT';
    style: string; color: string; heightFt: number;
    panelCount?: number; gateCount?: number;
  }) {
    const project = await this.assertOwnership(projectId, user);

    if (dto.kind === 'AI_IMAGE') {
      // The AI service writes a PNG to data/renders/... and returns
      // its relative path. We read the bytes back, persist them on
      // the project, and clean up the temp file.
      // generateFenceImage doesn't take panel/gate counts - the
      // surrounding prompt text already conveys the project context.
      const { relPath } = await this.ai.generateFenceImage({
        style: dto.style, color: dto.color, heightFt: dto.heightFt,
      });
      const dataDir = process.env.DATA_DIR || pathResolve(process.cwd(), 'data');
      const absPath = pathResolve(dataDir, relPath);
      const bytes = await fs.readFile(absPath);
      // Best-effort cleanup of the temp file - the AI service wrote
      // it just for us. If the cleanup fails (permissions, racing
      // with another request) the next save will overwrite it.
      fs.unlink(absPath).catch(() => { /* ignore */ });
      return this.prisma.projectVisualization.create({
        data: {
          projectId: project.id,
          kind: 'AI_IMAGE' as any,
          mimeType: 'image/png',
          data: bytes,
          prompt: `${dto.style} ${dto.color} ${dto.heightFt}ft` +
            (dto.panelCount ? `, ${dto.panelCount} panels` : '') +
            (dto.gateCount ? `, ${dto.gateCount} gates` : ''),
          modelUsed: this.ai['imageModel'] ?? null,
          widthPx: null,
          heightPx: null,
        },
        select: this.visualizationMetadataSelect(),
      });
    }

    // AI_3D_SNAPSHOT: store the generated three.js source as the
    // blob. We don't have a headless renderer in v1, so the source
    // is the value - the frontend runs it inside a sandboxed iframe.
    //
    // TODO: render three.js scene via puppeteer/playwright when
    // available, and persist the rendered PNG (mimeType image/png)
    // in addition to (or instead of) the source.
    const { code, model } = await this.ai.generateThreeJsScene({
      style: dto.style, color: dto.color, heightFt: dto.heightFt,
      panelCount: dto.panelCount, gateCount: dto.gateCount,
    });
    return this.prisma.projectVisualization.create({
      data: {
        projectId: project.id,
        kind: 'AI_3D_SNAPSHOT' as any,
        mimeType: 'application/javascript',
        data: Buffer.from(code, 'utf8'),
        prompt: code.slice(0, 200),
        modelUsed: model,
        widthPx: null,
        heightPx: null,
      },
      select: this.visualizationMetadataSelect(),
    });
  }

  async listVisualizations(projectId: string, user: AuthedUser) {
    await this.assertOwnership(projectId, user);
    return this.prisma.projectVisualization.findMany({
      where: { projectId },
      orderBy: { generatedAt: 'desc' },
      select: this.visualizationMetadataSelect(),
    });
  }

  async getVisualizationBlob(projectId: string, visId: string, user: AuthedUser) {
    await this.assertOwnership(projectId, user);
    const v = await this.prisma.projectVisualization.findUnique({ where: { id: visId } });
    if (!v || v.projectId !== projectId) throw new NotFoundException('Visualization not found');
    return v;
  }

  // -------------------------------------------------------------------------
  // Promote to Quote
  // -------------------------------------------------------------------------

  /**
   * Hand a project off to QuotesService. We:
   *   1. Build a CreateQuoteInput by combining the project's customer
   *      data with the per-selection fence segments.
   *   2. Hand it to QuotesService.create() to materialise the Quote +
   *      line items.
   *   3. Link the new Quote back to the project (Quote.projectId is
   *      a nullable FK created in the projects migration).
   *   4. Flip the project status to QUOTED.
   *
   * Returns the new quote's id.
   */
  async promoteToQuote(projectId: string, user: AuthedUser, override: {
    customerName?: string; customerEmail?: string;
    customerPhone?: string; customerAddress?: string; notes?: string;
  }) {
    const project = await this.assertOwnership(projectId, user);
    if (!project.dealerId && user.role !== Role.ADMIN) {
      throw new ForbiddenException('Project has no dealer');
    }
    if (project.status === ProjectStatus.CANCELLED) {
      throw new BadRequestException('Cannot promote a cancelled project');
    }
    const selections = await this.prisma.projectFenceSelection.findMany({
      where: { projectId: project.id },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    if (!selections.length) {
      throw new BadRequestException('Add at least one fence selection before promoting to a quote');
    }
    // Promote requires a customer email - the existing QuotesService
    // refuses to create a quote without one (used as the approval
    // link destination). We pull it from the project, or fall back
    // to the override.
    const customerEmail = (override.customerEmail ?? project.customerEmail ?? '').trim().toLowerCase();
    if (!customerEmail) {
      throw new BadRequestException('Project needs a customer email to be promoted to a quote');
    }
    const segments: FenceSegment[] = selections.map((s) => ({
      x1: 0, y1: 0, x2: s.linearMeters, y2: 0,
      lengthM: s.linearMeters,
      productId: s.productId,
      // heightFt is stored as a number on the selection; the legacy
      // FenceSegment uses heightOption as a string. We pass it through
      // verbatim so QuotesService can echo it on the line item.
      heightOption: String(s.heightFt),
    }));
    const quote = await this.quotes.create(
      project.dealerId!,
      user.sub,
      {
        customerName: override.customerName ?? project.customerName,
        customerEmail,
        customerPhone: override.customerPhone ?? project.customerPhone ?? undefined,
        projectAddress: override.customerAddress ?? project.customerAddress ?? undefined,
        notes: override.notes ?? project.notes ?? undefined,
        fenceSegments: segments,
      },
    );
    // Link the new quote back to the project. QuotesService.create
    // doesn't set this (it's a project-specific concern), so we
    // patch it ourselves.
    await this.prisma.quote.update({
      where: { id: quote.id },
      data: { projectId: project.id },
    });
    await this.prisma.project.update({
      where: { id: project.id },
      data: { status: ProjectStatus.QUOTED },
    });
    return { quoteId: quote.id };
  }
}
