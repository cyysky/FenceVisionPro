import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { promises as fs, createReadStream } from 'fs';
import { join, normalize, extname, sep } from 'path';

/**
 * Unauthenticated public asset server for artefacts that are
 * INTENDED to be sent to customers (PDFs, etc.) via the
 * approval link or email.
 *
 * Files in this subtree are produced by
 * `StorageService.writePublicStream()` and live under
 * `<DATA_DIR>/public/<bucket>/<filename>`. Anything that
 * should NOT be public (drafts, signatures) must NEVER be
 * written here - keep it under the regular `/static/...`
 * bucket, which is still JWT-gated.
 *
 * Routes are scoped per-bucket (e.g. `/public/pdfs/...`) so
 * we never accidentally serve an arbitrary file off disk -
 * each handler can do its own allow-list / sanity checks.
 */
@Controller('public')
export class PublicAssetsController {
  @Get('pdfs/:filename')
  async publicPdf(@Param('filename') filename: string, @Res() res: Response) {
    await this.streamFile('pdfs', filename, res);
  }

  private async streamFile(subdir: string, filename: string, res: Response) {
    // Defensive checks: reject any filename that would let the
    // caller traverse out of the bucket or point to a different
    // subdirectory. We only accept a plain basename.
    if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new NotFoundException('File not found');
    }
    const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
    const bucketRoot = normalize(join(dataDir, 'public', subdir));
    const absPath = normalize(join(bucketRoot, filename));
    if (!absPath.startsWith(bucketRoot + sep) && absPath !== bucketRoot) {
      throw new NotFoundException('File not found');
    }
    try {
      await fs.access(absPath);
    } catch {
      throw new NotFoundException('File not found');
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'public, max-age=300');
    createReadStream(absPath).pipe(res);
  }
}
