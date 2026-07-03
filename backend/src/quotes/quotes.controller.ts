import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { QuotesService, CreateQuoteInput } from './quotes.service';
import { PdfService } from './pdf.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { StorageService } from '../storage/storage.service';
import { CreateQuoteDto, UpdateQuoteDto, UpdateStatusDto } from './dto';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../common/guards/roles.guard';

const ALLOWED_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'application/pdf',
]);
const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf']);

@UseGuards(AuthGuard('jwt'))
@Controller('quotes')
export class QuotesController {
  constructor(
    private svc: QuotesService,
    private pdf: PdfService,
    private storage: StorageService,
  ) {}

  @Get()
  list(@CurrentUser() u: JwtPayload, @Query() q: { status?: string; q?: string; sort?: string; limit?: string }) {
    return this.svc.list(u.wholesalerId, u.role === Role.ADMIN, {
      status: q?.status,
      q: q?.q,
      sort: q?.sort,
      limit: q?.limit ? Number(q.limit) : undefined,
    });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.get(id, u.wholesalerId, u.role === Role.ADMIN);
  }

  @Post()
  create(@Body() dto: CreateQuoteDto, @CurrentUser() u: JwtPayload) {
    return this.svc.create(u.wholesalerId, u.sub, dto as unknown as CreateQuoteInput);
  }

  @Post(':id/clone')
  clone(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.clone(id, u.wholesalerId, u.role === Role.ADMIN);
  }

  /**
   * Wholesaler (or admin) marks a SENT quote as REJECTED - useful
   * when the customer declines over the phone and never opens the
   * public approval link.
   */
  @Post(':id/reject')
  async rejectByOwner(@Param('id') id: string, @Body() body: { reason?: string }, @CurrentUser() u: JwtPayload) {
    // Ownership check
    await this.svc.get(id, u.wholesalerId, u.role === Role.ADMIN);
    return this.svc.rejectByOwner(id, body?.reason, u.role === Role.ADMIN, u.wholesalerId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    const q = await this.svc.get(id, u.wholesalerId, u.role === Role.ADMIN);
    return this.svc.remove(q.id, u.wholesalerId, u.role === Role.ADMIN);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() body: UpdateStatusDto, @CurrentUser() u: JwtPayload) {
    return this.svc.updateStatus(id, u.wholesalerId, u.role === Role.ADMIN, body.status);
  }

  @Post('upload-floorplan')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      const ext = extname(file.originalname || '').toLowerCase();
      if (ALLOWED_MIMES.has(mime) || ALLOWED_EXTS.has(ext)) cb(null, true);
      else cb(new BadRequestException(`Unsupported file type: ${mime || ext}`), false);
    },
  }))
  async uploadFloorplan(@UploadedFile() file: { originalname: string; buffer: Buffer; size: number }) {
    if (!file) throw new BadRequestException('No file uploaded');
    if (!file.buffer?.length) throw new BadRequestException('Empty file');
    const saved = await this.storage.saveBuffer('uploads', file.originalname, file.buffer);
    return { url: saved.url, relPath: saved.relPath };
  }


  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateQuoteDto, @CurrentUser() u: JwtPayload) {
    return this.svc.update(id, u.wholesalerId, u.role === Role.ADMIN, dto as any);
  }


  /**
   * Persist a client-captured snapshot (3D iframe canvas.toDataURL)
   * as the quote's render. We accept the raw data URL, decode it on
   * the server, write it to /renders, and return the public URL.
   */
  @Post(':id/snapshot')
  async saveSnapshot(@Param('id') id: string, @Body() body: { dataUrl?: string }, @CurrentUser() u: JwtPayload) {
    // Ownership check: throws 403/404 if not your quote
    await this.svc.get(id, u.wholesalerId, u.role === Role.ADMIN);
    if (!body?.dataUrl) throw new BadRequestException('dataUrl is required');
    let saved;
    try {
      saved = await this.storage.saveDataUrl('renders', body.dataUrl);
    } catch (e: any) {
      throw new BadRequestException(e?.message || 'invalid image data');
    }
    // Persist the URL on the quote so it survives reloads
    await this.svc.update(id, u.wholesalerId, u.role === Role.ADMIN, { renderUrl: saved.url });
    return { url: saved.url };
  }

  @Get(':id/pdf')
  async getPdf(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    const q = await this.svc.get(id, u.wholesalerId, u.role === Role.ADMIN);
    const url = await this.pdf.generate(q);
    return { url };
  }

  /**
   * Admin/maintenance: mark all SENT quotes with validUntil < now as
   * EXPIRED. Returns the number of rows affected. Safe to call
   * repeatedly (idempotent). Usually invoked by a periodic cron, but
   * also useful for ops debugging.
   *
   * Admin-only: a wholesaler has no business sweeping the global
   * quote pool, and the in-process interval in main.ts already
   * handles their own quotes every 5 minutes.
   */
  @Roles(Role.ADMIN)
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Post('expire-overdue')
  @HttpCode(200)
  expireOverdue(@CurrentUser() u: JwtPayload) {
    // Idempotent maintenance endpoint - 200, not 201 (NestJS POST default).
    return this.svc.expireOverdue().then(count => ({ expired: count }));
  }
}
