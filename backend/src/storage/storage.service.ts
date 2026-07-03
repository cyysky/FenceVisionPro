import { Injectable } from '@nestjs/common';
import { join, extname } from 'path';
import { promises as fs, createWriteStream } from 'fs';
import { v4 as uuid } from 'uuid';

const ALLOWED_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf', '.bin']);
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
};

@Injectable()
export class StorageService {
  private dataDir = process.env.DATA_DIR || join(process.cwd(), 'data');

  private resolve(subdir: string, filename: string) {
    return join(this.dataDir, subdir, filename);
  }

  /**
   * Save a buffer to disk. Extension is derived from the original
   * filename and sanitised; if the name has no usable extension we
   * fall back to "bin" (not the literal string "null").
   */
  async saveBuffer(
    subdir: string,
    originalName: string,
    data: Buffer,
    mime?: string,
  ): Promise<{ relPath: string; absPath: string; url: string }> {
    const ext = this.deriveExt(originalName, mime);
    const filename = `${uuid()}.${ext}`;
    const absPath = this.resolve(subdir, filename);
    await fs.mkdir(join(this.dataDir, subdir), { recursive: true });
    await fs.writeFile(absPath, data);
    return {
      relPath: `${subdir}/${filename}`,
      absPath,
      url: `/static/${subdir}/${filename}`,
    };
  }

  private deriveExt(originalName: string, mime?: string): string {
    if (mime && MIME_TO_EXT[mime.toLowerCase()]) return MIME_TO_EXT[mime.toLowerCase()];
    const raw = extname(originalName || '').slice(1).toLowerCase().replace(/[^a-z0-9]/g, '');
    if (raw && ALLOWED_EXTS.has('.' + raw)) return raw;
    return 'bin';
  }

  async writeStream(subdir: string, filename: string): Promise<{ absPath: string; relPath: string; stream: NodeJS.WritableStream }> {
    const absPath = this.resolve(subdir, filename);
    await fs.mkdir(join(this.dataDir, subdir), { recursive: true });
    const stream = createWriteStream(absPath);
    return { absPath, relPath: `${subdir}/${filename}`, stream };
  }

  urlFor(relPath: string) {
    return `/static/${relPath}`;
  }

  /**
   * Save a base64-encoded image (data URL or pure base64) to disk.
   * Used by the client-side 3D snapshot upload - the iframe captures
   * a PNG via canvas.toDataURL and we persist it server-side.
   * Returns the public URL under /static.
   */
  async saveDataUrl(subdir: string, dataUrl: string): Promise<{ relPath: string; absPath: string; url: string }> {
    if (!dataUrl) throw new Error('empty data URL');
    const match = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) throw new Error('expected data:image/<type>;base64,<data>');
    const mime = match[1].toLowerCase();
    const buf = Buffer.from(match[2], 'base64');
    if (!buf.length) throw new Error('decoded buffer is empty');
    // Sanity-cap to 5 MB to avoid DoS via huge base64 uploads.
    if (buf.length > 5 * 1024 * 1024) throw new Error('image too large (max 5MB)');
    const ext = MIME_TO_EXT[mime] || 'png';
    return this.saveBuffer(subdir, `snapshot.${ext}`, buf, mime);
  }
}
