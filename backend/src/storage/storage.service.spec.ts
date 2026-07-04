import { StorageService } from './storage.service';
import { mkdtempSync, rmSync, statSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('StorageService - file extensions', () => {
  let svc: StorageService;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fvp-storage-'));
    process.env.DATA_DIR = tmp;
    svc = new (require('./storage.service').StorageService)();
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  async function save(name: string, mime?: string) {
    return svc.saveBuffer('uploads', name, Buffer.from('hello'), mime);
  }

  it('keeps .png when extension matches MIME', async () => {
    const r = await save('photo.png', 'image/png');
    expect(r.relPath).toMatch(/\.png$/);
  });
  it('falls back to MIME-derived extension when filename has none', async () => {
    const r = await save('photo', 'image/jpeg');
    expect(r.relPath).toMatch(/\.jpg$/);
  });
  it('does NOT write the literal string "null" as extension', async () => {
    const r = await save('', 'application/octet-stream').catch(() => null);
    // octet-stream is not in MIME_TO_EXT so it should fall through to .bin
    if (r) expect(r.relPath).not.toMatch(/\.null$/);
  });
  it('sanitises weird characters in extension', async () => {
    const r = await save('photo.PnG!@#', 'image/png');
    expect(r.relPath).toMatch(/\.png$/);
  });
  it('writes the file to disk', async () => {
    const r = await save('test.png', 'image/png');
    expect(statSync(r.absPath).isFile()).toBe(true);
    expect(readFileSync(r.absPath, 'utf-8')).toBe('hello');
  });
});

describe('StorageService - saveDataUrl (3D snapshot upload)', () => {
  let svc: StorageService;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fvp-snap-'));
    process.env.DATA_DIR = tmp;
    svc = new (require('./storage.service').StorageService)();
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  // 1x1 transparent PNG
  const TINY_PNG_DATAURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

  it('saves a valid data URL and returns a public URL', async () => {
    const r = await svc.saveDataUrl('renders', TINY_PNG_DATAURL);
    expect(r.url).toMatch(/^\/static\/renders\/.+\.png$/);
    expect(statSync(r.absPath).isFile()).toBe(true);
  });

  it('rejects empty data URL', async () => {
    await expect(svc.saveDataUrl('renders', '')).rejects.toThrow(/empty/);
  });

  it('rejects malformed data URL', async () => {
    await expect(svc.saveDataUrl('renders', 'not-a-data-url')).rejects.toThrow(/expected/);
  });

  it('rejects oversize image (>5MB)', async () => {
    // 6MB of zero bytes -> ~8MB of base64
    const big = Buffer.alloc(6 * 1024 * 1024).toString('base64');
    await expect(svc.saveDataUrl('renders', `data:image/png;base64,${big}`)).rejects.toThrow(/too large/);
  });
});

describe('StorageService - writePublicStream (Step 1: customer-shareable bucket)', () => {
  let svc: any;
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'fvp-pub-'));
    process.env.DATA_DIR = tmp;
    svc = new (require('./storage.service').StorageService)();
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it('writes a file under <DATA_DIR>/public/<subdir>/', async () => {
    const { absPath, relPath, stream } = await svc.writePublicStream('pdfs', 'quote-abc.pdf');
    await new Promise<void>((resolve, reject) => {
      stream.on('finish', () => resolve());
      stream.on('error', reject);
      stream.end(Buffer.from('hello public'));
    });
    expect(relPath).toBe('public/pdfs/quote-abc.pdf');
    expect(absPath).toBe(join(tmp, 'public', 'pdfs', 'quote-abc.pdf'));
    expect(statSync(absPath).isFile()).toBe(true);
    expect(readFileSync(absPath, 'utf-8')).toBe('hello public');
  });

  it('urlForPublic returns a /public/ URL', () => {
    expect(svc.urlForPublic('pdfs/quote-abc.pdf')).toBe('/public/pdfs/quote-abc.pdf');
  });
});
