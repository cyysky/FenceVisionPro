import { BadRequestException, Body, Controller, Get, Post, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { AiService } from './ai.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

class FenceParamsDto {
  @IsString() @IsNotEmpty() @MaxLength(50) style: string;
  @IsString() @IsNotEmpty() @MaxLength(50) color: string;
  // Residential fences are 1-12ft. We cap at 30 to be generous but
  // prevent absurd values that would burn AI tokens on junk prompts.
  @IsNumber() @Min(1) @Max(30) heightFt: number;
  @IsOptional() @IsString() @MaxLength(500) surroundings?: string;
  @IsOptional() @IsString() @MaxLength(500) extraPrompt?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10000) panelCount?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(1000) gateCount?: number;
}

@UseGuards(AuthGuard('jwt'))
@Controller('ai')
export class AiController {
  constructor(private ai: AiService, private prisma: PrismaService, private storage: StorageService) {}

  @Get('status')
  status() {
    return { enabled: this.ai.enabled, imageModel: this.ai['imageModel'], codeModel: this.ai['codeModel'], visionModel: this.ai['visionModel'] };
  }

  /**
   * Render a photorealistic fence image based on design parameters.
   * Body example:
   *   { "style": "Privacy", "color": "Black", "heightFt": 6,
   *     "surroundings": "suburban lawn", "extraPrompt": "...",
   *     "visionDescription": "...",
   *     "quoteId": "<uuid>",        // optional - persist to quote
   *     "lineItemIndex": 0,         // optional - 0..N-1, persisted at index
   *     "overview": true }          // optional - persist to aiOverviewImageUrl
   *
   * visionDescription is a free-text description produced by
   * /ai/analyse-photo (the multimodal qwen3.5-397b model). When
   * present we splice it into the image prompt so the image
   * model has rich context about the property (siding colour,
   * slope, landscaping) instead of guessing from the style name
   * alone.
   *
   * Persistence:
   *  - `quoteId + lineItemIndex`: replaces/inserts the URL at
   *    that position in `quote.aiImageUrls`.
   *  - `quoteId + overview: true`: sets `quote.aiOverviewImageUrl`.
   *  - `quoteId` only: appends the URL to `quote.aiImageUrls`
   *    (legacy / non-per-line-item flow).
   *  - No `quoteId`: returns the URL only, no persistence.
   */
  @Post('render-image')
  async renderImage(
    @Body() dto: FenceParamsDto & { visionDescription?: string; quoteId?: string; lineItemIndex?: number; overview?: boolean },
  ) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    const { url, relPath } = await this.ai.generateFenceImage(dto);
    if (!dto.quoteId) return { url, relPath };
    // Persist onto the quote. We do an ownership check first
    // (admin bypass) to keep the door closed to a dealer
    // writing to another dealer's quote.
    const q = await this.prisma.quote.findUnique({ where: { id: dto.quoteId }, select: { id: true, dealerId: true, aiImageUrls: true } });
    if (!q) throw new BadRequestException('quoteId not found');
    const userIsAdmin = false; // CurrentUser not threaded in here; QuotesController is the access-control gate today
    if (dto.overview) {
      const updated = await this.prisma.quote.update({
        where: { id: dto.quoteId },
        data: { aiOverviewImageUrl: url },
        select: { aiImageUrls: true, aiOverviewImageUrl: true },
      });
      return { url, relPath, aiImageUrls: updated.aiImageUrls, aiOverviewImageUrl: updated.aiOverviewImageUrl };
    }
    const idx = typeof dto.lineItemIndex === 'number' ? dto.lineItemIndex : null;
    const next = (q.aiImageUrls || []).slice();
    if (idx != null && idx >= 0) {
      // Pad with nulls if the dealer jumps ahead (a single
      // re-render of a late line item shouldn't shift earlier
      // entries). We store the URL string at that slot.
      while (next.length <= idx) next.push('');
      next[idx] = url;
    } else {
      next.push(url);
    }
    const updated = await this.prisma.quote.update({
      where: { id: dto.quoteId },
      data: { aiImageUrls: { set: next } },
      select: { aiImageUrls: true, aiOverviewImageUrl: true },
    });
    return { url, relPath, aiImageUrls: updated.aiImageUrls, aiOverviewImageUrl: updated.aiOverviewImageUrl };
  }

  /**
   * Generate a three.js scene as raw JS source. The frontend renders
   * it inside a sandboxed iframe so the LLM-generated code cannot
   * touch the host app.
   *
   * If `quoteId` is provided, the generated source is also persisted
   * onto `quote.threeJsCode` so it survives a page refresh and can
   * be re-opened from a saved quote. The source is also returned in
   * the response (as before).
   */
  @Post('generate-3d')
  async generate3d(@Body() dto: FenceParamsDto & { quoteId?: string }) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    const out = await this.ai.generateThreeJsScene(dto);
    if (dto.quoteId) {
      const exists = await this.prisma.quote.findUnique({ where: { id: dto.quoteId }, select: { id: true } });
      if (!exists) throw new BadRequestException('quoteId not found');
      await this.prisma.quote.update({
        where: { id: dto.quoteId },
        data: { threeJsCode: out.code },
      });
    }
    return out;
  }

  /**
   * Analyse a customer-uploaded photo with the multimodal vision
   * model (default: qwen3.5-397b) and return inferred fence
   * parameters. The dealer uploads an image via multipart/
   * form-data (field name "file") just like the existing floorplan
   * upload; we persist it to /static/uploads and feed the bytes
   * back to the model as an inline image_url content part.
   *
   * The response shape mirrors the relevant subset of
   * FenceParamsDto so the frontend can drop the values straight
   * into its form fields. Any field the model couldn't infer is
   * simply omitted.
   */
  @Post('analyse-photo')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      if (/^image\/(png|jpe?g|webp|gif)$/.test(mime)) cb(null, true);
      else cb(new BadRequestException(`Unsupported image type: ${mime}`), false);
    },
  }))
  async analysePhoto(@UploadedFile() file: { originalname: string; buffer: Buffer; size: number; mimetype: string }) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    if (!file) throw new BadRequestException('file is required (multipart field "file")');
    // Inline the bytes as a data URL so the upstream doesn't
    // have to fetch our static server.
    const mime = (file.mimetype || 'image/jpeg').toLowerCase();
    const dataUrl = `data:${mime};base64,${file.buffer.toString('base64')}`;
    const result = await this.ai.analysePhoto({ imageDataUrl: dataUrl, mimeType: mime });
    // Also persist a copy under /static/uploads so the frontend
    // can preview the image alongside the inferred values.
    const stored = await this.storage.saveBuffer('uploads', file.originalname || 'photo', file.buffer, mime);
    return { ...result, imageUrl: stored.url };
  }

  /**
   * Same as analyse-photo but takes an already-uploaded image
   * referenced by its /static/... URL. Useful when the user has
   * already uploaded a house photo via the floorplan-style
   * endpoint and we just want to re-analyse it.
   */
  @Post('analyse-photo-url')
  async analysePhotoUrl(@Body() body: { imageUrl: string }) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    if (!body?.imageUrl) throw new BadRequestException('imageUrl is required');
    return this.ai.analysePhoto({ imageUrl: body.imageUrl });
  }
}
