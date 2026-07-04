import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode,
  Param, Patch, Post, Query, Res, UploadedFile,
  UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { ProjectsService } from './projects.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';
import { Roles, RolesGuard } from '../common/guards/roles.guard';
import {
  CreateMeasurementDto, CreateProjectDto, CreateSelectionDto, GenerateVisualizationDto,
  ListProjectsQueryDto, PromoteToQuoteDto, UpdateMeasurementDto, UpdateProjectDto,
  UpdateSelectionDto, UploadDocumentDto,
} from './dto';

const ALLOWED_PROJECT_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'application/pdf',
]);

const ROLES = [Role.ADMIN, Role.DEALER_OWNER, Role.DEALER_STAFF];

/**
 * End Customer Project controller. The endpoint surface is grouped
 * by resource: project CRUD, then documents / selections /
 * measurements / visualisations nested under the project, then the
 * promote-to-quote transition.
 */
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(...ROLES)
@Controller('projects')
export class ProjectsController {
  constructor(private svc: ProjectsService) {}

  // -------------------------------------------------------------------------
  // Project CRUD
  // -------------------------------------------------------------------------

  @Get()
  list(@CurrentUser() u: JwtPayload, @Query() q: ListProjectsQueryDto) {
    return this.svc.list(u, {
      status: q.status,
      projectType: q.projectType,
      installScope: q.installScope,
      q: q.q,
      take: q.take,
      skip: q.skip,
    });
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.findOne(id, u);
  }

  @Post()
  create(@Body() dto: CreateProjectDto, @CurrentUser() u: JwtPayload) {
    return this.svc.create(u, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProjectDto, @CurrentUser() u: JwtPayload) {
    return this.svc.update(id, u, dto);
  }

  /**
   * Soft delete: flips status to CANCELLED. We don't expose a
   * hard delete from the API - cancelled projects are still
   * referenced by historical quotes.
   */
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.softDelete(id, u);
  }

  // -------------------------------------------------------------------------
  // Documents
  // -------------------------------------------------------------------------

  /**
   * Upload a project document (site photo, floor plan, etc). The
   * file lives in memory until the service writes it to Prisma's
   * Bytes column; the 25 MB cap matches the spec.
   */
  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      if (ALLOWED_PROJECT_MIMES.has(mime)) cb(null, true);
      else cb(new BadRequestException(`Unsupported mime type: ${mime}`), false);
    },
  }))
  uploadDocument(
    @Param('id') id: string,
    @UploadedFile() file: { originalname: string; buffer: Buffer; size: number; mimetype: string },
    @Body() meta: UploadDocumentDto,
    @CurrentUser() u: JwtPayload,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.uploadDocument(id, u, file, meta);
  }

  @Get(':id/documents')
  listDocuments(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.listDocuments(id, u);
  }

  /**
   * Stream a document blob with the right Content-Type /
   * Content-Disposition headers. `inline` (not `attachment`) so the
   * browser renders PDFs in-tab and images can be embedded in the
   * project workspace.
   */
  @Get(':id/documents/:docId/blob')
  async getDocumentBlob(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() u: JwtPayload,
    @Res() res: Response,
  ) {
    const doc = await this.svc.getDocumentBlob(id, docId, u);
    res.setHeader('Content-Type', doc.mimeType);
    res.setHeader('Content-Length', String(doc.sizeBytes));
    res.setHeader('Content-Disposition', `inline; filename="${encodeFilename(doc.originalFilename)}"`);
    res.send(doc.data);
  }

  @Delete(':id/documents/:docId')
  @HttpCode(200)
  deleteDocument(
    @Param('id') id: string,
    @Param('docId') docId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.deleteDocument(id, docId, u);
  }

  // -------------------------------------------------------------------------
  // Fence selections
  // -------------------------------------------------------------------------

  @Post(':id/selections')
  addSelection(@Param('id') id: string, @Body() dto: CreateSelectionDto, @CurrentUser() u: JwtPayload) {
    return this.svc.addSelection(id, u, dto);
  }

  @Patch(':id/selections/:selId')
  updateSelection(
    @Param('id') id: string,
    @Param('selId') selId: string,
    @Body() dto: UpdateSelectionDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.updateSelection(id, selId, u, dto);
  }

  @Delete(':id/selections/:selId')
  @HttpCode(200)
  removeSelection(
    @Param('id') id: string,
    @Param('selId') selId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.removeSelection(id, selId, u);
  }

  // -------------------------------------------------------------------------
  // Measurements
  // -------------------------------------------------------------------------

  @Post(':id/measurements')
  addMeasurement(@Param('id') id: string, @Body() dto: CreateMeasurementDto, @CurrentUser() u: JwtPayload) {
    return this.svc.addMeasurement(id, u, dto);
  }

  @Patch(':id/measurements/:measId')
  updateMeasurement(
    @Param('id') id: string,
    @Param('measId') measId: string,
    @Body() dto: UpdateMeasurementDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.updateMeasurement(id, measId, u, dto);
  }

  @Delete(':id/measurements/:measId')
  @HttpCode(200)
  removeMeasurement(
    @Param('id') id: string,
    @Param('measId') measId: string,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.removeMeasurement(id, measId, u);
  }

  // -------------------------------------------------------------------------
  // Visualisations
  // -------------------------------------------------------------------------

  @Post(':id/visualizations')
  generateVisualization(
    @Param('id') id: string,
    @Body() dto: GenerateVisualizationDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.generateVisualization(id, u, dto);
  }

  @Get(':id/visualizations')
  listVisualizations(@Param('id') id: string, @CurrentUser() u: JwtPayload) {
    return this.svc.listVisualizations(id, u);
  }

  @Get(':id/visualizations/:visId/blob')
  async getVisualizationBlob(
    @Param('id') id: string,
    @Param('visId') visId: string,
    @CurrentUser() u: JwtPayload,
    @Res() res: Response,
  ) {
    const v = await this.svc.getVisualizationBlob(id, visId, u);
    res.setHeader('Content-Type', v.mimeType);
    res.setHeader('Content-Length', String((v.data as Buffer).length));
    res.setHeader('Content-Disposition', `inline; filename="vis-${v.id}.${v.mimeType === 'application/javascript' ? 'js' : 'bin'}"`);
    res.send(v.data);
  }

  // -------------------------------------------------------------------------
  // Promote to Quote
  // -------------------------------------------------------------------------

  @Post(':id/quotes')
  @HttpCode(201)
  async promoteToQuote(
    @Param('id') id: string,
    @Body() dto: PromoteToQuoteDto,
    @CurrentUser() u: JwtPayload,
  ) {
    return this.svc.promoteToQuote(id, u, dto);
  }
}

/**
 * Escape a user-supplied filename for use in a Content-Disposition
 * header. The HTTP spec allows quoted-string syntax, so we wrap the
 * value in quotes after stripping any embedded double-quotes that
 * could break out of the string.
 */
function encodeFilename(name: string): string {
  return (name || 'download').replace(/"/g, '').slice(0, 200);
}
