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
   *     "surroundings": "suburban lawn", "extraPrompt": "..." }
   */
  @Post('render-image')
  async renderImage(@Body() dto: FenceParamsDto) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    const { url, relPath } = await this.ai.generateFenceImage(dto);
    return { url, relPath };
  }

  /**
   * Generate a three.js scene as raw JS source. The frontend renders
   * it inside a sandboxed iframe so the LLM-generated code cannot
   * touch the host app.
   */
  @Post('generate-3d')
  async generate3d(@Body() dto: FenceParamsDto) {
    if (!this.ai.enabled) throw new BadRequestException('AI is disabled');
    return this.ai.generateThreeJsScene(dto);
  }

  /**
   * Analyse a customer-uploaded photo with the multimodal vision
   * model (default: qwen3.5-397b) and return inferred fence
   * parameters. The wholesaler uploads an image via multipart/
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
