import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query, Res, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { InstallationsService } from './installations.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import {
  CreateInstallationDto, CreateCustomerLinkDto, ListInstallationsQueryDto,
  TransitionInstallationDto, UpdateInstallationDto, UploadInstallationPhotoDto,
} from './dto';

/**
 * Wholesaler-facing installation endpoints. Mounted at
 * `/installations` (no global prefix in this app, see main.ts).
 * All routes require a JWT and (for non-admin users) are
 * implicitly tenant-scoped inside the service via findOwned().
 */
const ROLES = [Role.ADMIN, Role.WHOLESALER_OWNER, Role.WHOLESALER_STAFF];

@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(...ROLES)
@Controller('installations')
export class InstallationsController {
  constructor(private svc: InstallationsService) {}

  @Get()
  list(@CurrentUser() u: JwtPayload, @Query() q: ListInstallationsQueryDto) {
    return this.svc.list(u, { status: q.status, q: q.q, limit: q.limit });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.get(id, u);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateInstallationDto, @CurrentUser() u: JwtPayload) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateInstallationDto, @CurrentUser() u: JwtPayload) {
    return this.svc.update(id, u, dto);
  }

  @Post(':id/transition')
  @HttpCode(200)
  transition(@Param('id') id: string, @Body() dto: TransitionInstallationDto, @CurrentUser() u: JwtPayload) {
    return this.svc.transition(id, u, dto);
  }

  // -------------------------------------------------------------------------
  // Photos
  // -------------------------------------------------------------------------

  @Post(':id/photos')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      if (['image/png', 'image/jpeg', 'image/webp'].includes(mime)) cb(null, true);
      else cb(new BadRequestException(`Unsupported mime type: ${mime}`), false);
    },
  }))
  uploadPhoto(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
    @Body() meta: UploadInstallationPhotoDto,
    @CurrentUser() u: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.uploadPhoto(id, u, file, meta);
  }

  @Get(':id/photos')
  listPhotos(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.listPhotos(id, u);
  }

  @Get(':id/photos/:photoId/blob')
  async getPhotoBlob(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() u: JwtPayload,
    @Res() res: Response,
  ) {
    const photo = await this.svc.getPhotoBlob(id, photoId, u);
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', String(photo.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${encodeFilename(photo.originalFilename)}"`);
    res.send(photo.data);
  }

  @Delete(':id/photos/:photoId')
  @HttpCode(200)
  deletePhoto(
    @Param('id') id: string,
    @Param('photoId') photoId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.deletePhoto(id, photoId, u);
  }

  // -------------------------------------------------------------------------
  // Customer links
  // -------------------------------------------------------------------------

  @Post(':id/customer-links')
  @HttpCode(201)
  createLink(
    @Param('id') id: string,
    @Body() dto: CreateCustomerLinkDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.createCustomerLink(id, u, dto);
  }

  @Get(':id/customer-links')
  listLinks(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.listCustomerLinks(id, u);
  }

  @Post(':id/customer-links/:linkId/revoke')
  @HttpCode(200)
  revokeLink(
    @Param('id') id: string,
    @Param('linkId') linkId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.revokeCustomerLink(id, linkId, u);
  }
}

/**
 * Escape a user-supplied filename for use in a Content-Disposition
 * header (same helper the projects controller uses).
 */
function encodeFilename(name: string): string {
  return (name || 'download').replace(/"/g, '').slice(0, 200);
}
