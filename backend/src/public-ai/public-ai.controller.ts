import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { PublicAiService } from './public-ai.service';
import { SubmitLeadDto } from './dto/submit-lead.dto';

/**
 * Public, unauthenticated endpoints for the Yardex AI Yard
 * Visualizer (like ai.yardzen.com). All four routes are mounted
 * under `/public/ai-generation` so they can never collide with
 * the auth-gated `/ai/*` admin endpoints.
 *
 * Rate limit only the submit endpoint - status/result/config are
 * idempotent and polled by the visitor's browser.
 */
@Controller('public/ai-generation')
export class PublicAiController {
  constructor(private svc: PublicAiService) {}

  /**
   * GET /public/ai-generation/config
   * Gallery photos + style list. Used to render the upload/gallery
   * tabs on the public page. No auth.
   */
  @Get('config')
  config() {
    return this.svc.getConfig();
  }

  /**
   * POST /public/ai-generation
   * Multipart (file upload) OR JSON (gallery selection). Rate
   * limited to 5 per IP per hour to slow down drive-by abuse.
   */
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60 * 60 * 1000 } })
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const mime = (file.mimetype || '').toLowerCase();
      if (/^image\/(png|jpe?g|webp|gif)$/.test(mime)) cb(null, true);
      else cb(new BadRequestException(`Unsupported image type: ${mime}`), false);
    },
  }))
  async submit(
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined,
    @Body() body: SubmitLeadDto,
  ) {
    if (body.photoSource === 'UPLOADED' && !file) {
      throw new BadRequestException('file is required when photoSource=UPLOADED');
    }
    return this.svc.submit(body, file);
  }

  /**
   * GET /public/ai-generation/:id/status
   * Polled by the public result page. Returns just what the
   * spinner needs: status + (when ready) the image URL.
   */
  @Get(':id/status')
  status(@Param('id') id: string) {
    return this.svc.getStatus(id);
  }

  /**
   * GET /public/ai-generation/:id/result
   * Full public-safe lead record for the result page.
   */
  @Get(':id/result')
  result(@Param('id') id: string) {
    return this.svc.getResult(id);
  }
}
