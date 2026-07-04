/**
 * Tests for the unauthenticated public PDF route. Critical
 * security: the controller must not let a caller traverse out
 * of <DATA_DIR>/public/pdfs/ via a crafted filename, and it
 * must not require any auth header.
 */
import { Test } from '@nestjs/testing';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PassThrough } from 'stream';
import { PublicAssetsController } from './public-assets.controller';

describe('PublicAssetsController - /public/pdfs/:filename', () => {
  let ctrl: PublicAssetsController;
  let tmp: string;
  let pdfsDir: string;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), 'fvp-pubassets-'));
    pdfsDir = join(tmp, 'public', 'pdfs');
    mkdirSync(pdfsDir, { recursive: true });
    process.env.DATA_DIR = tmp;
    const mod = await Test.createTestingModule({
      controllers: [PublicAssetsController],
    }).compile();
    ctrl = mod.get(PublicAssetsController);
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  // The controller calls `createReadStream(absPath).pipe(res)`.
  // Node's stream .pipe() needs `res.on()` to wire up drain
  // listeners, so our fake res has to look like a writable
  // stream. A PassThrough is a perfect stand-in: it has setHeader
  // is missing, so we attach that separately.
  function makeRes() {
    const headers: Record<string, string> = {};
    const sink = new PassThrough();
    const chunks: Buffer[] = [];
    sink.on('data', (c) => chunks.push(c));
    // Promote PassThrough to look like an Express response
    (sink as any).setHeader = (k: string, v: string) => { headers[k.toLowerCase()] = v; };
    return { sink, headers, chunks };
  }

  async function waitEnd(sink: PassThrough) {
    if (sink.readableEnded) return;
    await new Promise<void>((resolve) => sink.once('end', () => resolve()));
  }

  it('streams an existing PDF with application/pdf content type', async () => {
    writeFileSync(join(pdfsDir, 'quote-abc.pdf'), '%PDF-1.4 stub');
    const { sink, headers, chunks } = makeRes();
    await ctrl.publicPdf('quote-abc.pdf', sink as any);
    await waitEnd(sink);
    expect(headers['content-type']).toBe('application/pdf');
    expect(Buffer.concat(chunks).toString('utf-8')).toContain('%PDF-1.4 stub');
  });

  it('rejects filenames containing .. segments', async () => {
    const { sink } = makeRes();
    await expect(ctrl.publicPdf('../../../etc/passwd', sink as any)).rejects.toThrow(/not found/i);
  });

  it('rejects filenames that contain slashes', async () => {
    const { sink } = makeRes();
    await expect(ctrl.publicPdf('sub/dir/x.pdf', sink as any)).rejects.toThrow(/not found/i);
  });

  it('returns 404 for a file that does not exist', async () => {
    const { sink } = makeRes();
    await expect(ctrl.publicPdf('does-not-exist.pdf', sink as any)).rejects.toThrow(/not found/i);
  });
});
