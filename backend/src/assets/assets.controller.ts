import { Controller, ForbiddenException, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { promises as fs, createReadStream } from 'fs';
import { join, normalize, extname, sep } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser, JwtPayload } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

/**
 * Auth-gated asset server.
 *
 * Two paths that the open ServeStaticModule would expose are
 * PII-bearing: /static/pdfs/* (customer name + email + phone in
 * the PDF) and /static/signatures/* (the customer's signature
 * image). We exclude them from the static middleware and serve
 * them through this controller instead.
 *
 * The static middleware is left to handle /static/uploads,
 * /static/renders, /static/overlays - all referenced from the
 * public approval page and so not sensitive.
 *
 * Filename conventions used by the rest of the app:
 *   - PDFs:           `<quoteId>.pdf`
 *   - Signatures:     `sig-<quoteId>-<timestamp>.png`
 *
 * The quote UUID is embedded in the filename, so we extract it
 * and look up the quote. Only the owning wholesaler (or an
 * admin) may read the asset.
 */
@UseGuards(AuthGuard('jwt'))
@Controller('static')
export class AssetsController {
  constructor(private prisma: PrismaService) {}

  @Get('pdfs/:filename')
  async getPdf(@Param('filename') filename: string, @Res() res: Response, @CurrentUser() u: JwtPayload) {
    await this.streamAsset('pdfs', filename, res, u);
  }

  @Get('signatures/:filename')
  async getSignature(@Param('filename') filename: string, @Res() res: Response, @CurrentUser() u: JwtPayload) {
    await this.streamAsset('signatures', filename, res, u);
  }

  private async streamAsset(subdir: string, filename: string, res: Response, u: JwtPayload) {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      throw new ForbiddenException('Invalid filename');
    }
    const quoteId = this.extractQuoteId(filename);
    if (!quoteId) throw new NotFoundException('Asset not found');

    const quote = await this.prisma.quote.findUnique({
      where: { id: quoteId },
      select: { wholesalerId: true },
    });
    if (!quote) throw new NotFoundException('Asset not found');

    const isAdmin = u.role === Role.ADMIN;
    const isOwner = quote.wholesalerId === u.wholesalerId;
    if (!isAdmin && !isOwner) throw new ForbiddenException('Not your asset');

    const dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');
    const absPath = normalize(join(dataDir, subdir, filename));
    const root = normalize(join(dataDir, subdir)) + sep;
    if (!absPath.startsWith(root)) throw new ForbiddenException('Invalid path');

    try {
      await fs.access(absPath);
    } catch {
      throw new NotFoundException('Asset not found');
    }

    const mime = mimeFor(extname(absPath));
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    createReadStream(absPath).pipe(res);
  }

  private extractQuoteId(filename: string): string | null {
    const m = filename.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : null;
  }
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.pdf': return 'application/pdf';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'application/octet-stream';
  }
}
