/**
 * Regression tests for the public-approval security fixes:
 *
 *  - approvePublic must reject signatures with too few ink pixels
 *    (so a 1x1 transparent PNG can't be used to "approve" a quote)
 *  - getPublic must not leak customerEmail/Phone/notes/floorPlan
 *  - getPublic must include approvedAt when the quote is APPROVED
 */
import { Test } from '@nestjs/testing';
import { QuotesService } from './quotes.service';
import { PrismaService } from '../prisma/prisma.service';

describe('QuotesService - public approval security', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      quote: { findUnique: jest.fn(), update: jest.fn() },
      fs: { writeFile: jest.fn().mockResolvedValue(undefined) },
    };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  // 1x1 transparent PNG
  const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  // 100x100 fully red PNG (lots of ink) - use a minimal hand-rolled PNG
  // We just use the blank + check the count.
  // For a real signature test, see the separate png-signature.spec.ts

  it('rejects a blank 1x1 PNG signature', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', status: 'SENT', notes: null, lineItems: [], wholesaler: { name: 'X', logoUrl: null, template: null },
    });
    await expect(svc.approvePublic('q1', BLANK)).rejects.toThrow(/Signature is empty/);
  });

  it('accepts a real-ish signature with enough ink pixels', async () => {
    // Build a real 8x8 PNG with a black cross using sharp? No - we
    // want a pure-Node test. Use the zlib + raw PNG approach the
    // service uses to build a small all-black image.
    const zlib = require('zlib');
    const w = 32, h = 8;
    const raw = Buffer.alloc(h * (w * 3 + 1));
    for (let y = 0; y < h; y++) {
      const row = y * (w * 3 + 1);
      raw[row] = 0; // filter: None
      for (let x = 0; x < w; x++) {
        const p = row + 1 + x * 3;
        raw[p] = 0; raw[p + 1] = 0; raw[p + 2] = 0; // black
      }
    }
    const idat = zlib.deflateSync(raw);
    function chunk(type: string, data: Buffer): Buffer {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
      const t = Buffer.from(type, 'ascii');
      const crc = Buffer.alloc(4);
      // CRC32 of (type + data)
      const table = (() => {
        const tab: number[] = [];
        for (let n = 0; n < 256; n++) {
          let c = n;
          for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
          tab.push(c);
        }
        return tab;
      })();
      let c = 0xffffffff;
      const buf = Buffer.concat([t, data]);
      for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
      crc.writeUInt32BE((c ^ 0xffffffff) >>> 0, 0);
      return Buffer.concat([len, t, data, crc]);
    }
    const sig = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', Buffer.concat([
        Buffer.from([(w >> 24) & 0xff, (w >> 16) & 0xff, (w >> 8) & 0xff, w & 0xff]),
        Buffer.from([(h >> 24) & 0xff, (h >> 16) & 0xff, (h >> 8) & 0xff, h & 0xff]),
        Buffer.from([8, 2, 0, 0, 0]), // 8-bit RGB
      ])),
      chunk('IDAT', idat),
      chunk('IEND', Buffer.alloc(0)),
    ]);
    const b64 = sig.toString('base64');
    // The first findUnique is the SENT check, the second (called
    // from getPublic after the update) returns the APPROVED state.
    prisma.quote.findUnique
      .mockResolvedValueOnce({
        id: 'q1', status: 'SENT', notes: null, lineItems: [], wholesaler: { name: 'X', logoUrl: null, template: null },
      })
      .mockResolvedValueOnce({
        id: 'q1', reference: 'FVP-2026-X', status: 'APPROVED',
        customerName: 'X', validUntil: null, approvedAt: new Date(),
        lineItems: [], floorPlanWidthM: null, floorPlanHeightM: null,
        fenceSegments: [], renderUrl: null, selectedDesign: null, projectAddress: null,
        subtotal: 0, taxRate: 0, taxAmount: 0, total: 0,
        wholesaler: { name: 'X', logoUrl: null, template: null },
      });
    prisma.quote.update.mockResolvedValue({});
    const out = await svc.approvePublic('q1', `data:image/png;base64,${b64}`);
    expect(out.status).toBe('APPROVED');
  });

  it('rejects an oversize signature (> 1.5MB base64)', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', status: 'SENT', notes: null, lineItems: [], wholesaler: { name: 'X', logoUrl: null, template: null },
    });
    const big = 'data:image/png;base64,' + 'A'.repeat(1_500_001);
    await expect(svc.approvePublic('q1', big)).rejects.toThrow(/Signature payload/);
  });

  it('rejects a malformed data URL', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', status: 'SENT', notes: null, lineItems: [], wholesaler: { name: 'X', logoUrl: null, template: null },
    });
    await expect(svc.approvePublic('q1', 'not-a-data-url')).rejects.toThrow(/Signature must be/);
  });
});

describe('QuotesService - getPublic PII safety', () => {
  let svc: QuotesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = { quote: { findUnique: jest.fn() } };
    const mod = await Test.createTestingModule({
      providers: [QuotesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    svc = mod.get(QuotesService);
  });

  it('strips PII fields from the public view', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', reference: 'FVP-2026-X', status: 'SENT',
      customerName: 'Real Name',
      customerEmail: 'leak@me.com',
      customerPhone: '+1-555-1234',
      projectAddress: '123 Leaky St',
      notes: 'internal-only notes',
      validUntil: null, approvedAt: null, approvedSignatureUrl: '/static/signatures/sig.png',
      floorPlanUrl: '/static/uploads/plan.png',
      floorPlanWidthM: 10, floorPlanHeightM: 10,
      lineItems: [],
      fenceSegments: [{ x1: 0, y1: 0, x2: 1, y2: 0, lengthM: 1, productId: 'p1' }],
      subtotal: 100, taxRate: 0, taxAmount: 0, total: 100,
      renderUrl: '/static/renders/r.png',
      selectedDesign: { id: 'd1', name: 'D', overlayUrl: '/static/overlays/d.png' },
      wholesaler: { name: 'W', logoUrl: '/static/uploads/l.png', contactEmail: 'leak@wholesale.com', contactPhone: '555', template: { termsHtml: '<p>OK</p>' } },
    });
    const out: any = await svc.getPublic('q1');
    const forbidden = ['customerEmail', 'customerPhone', 'notes', 'floorPlanUrl', 'approvedSignatureUrl', 'wholesalerId', 'fenceSegments', 'createdById'];
    for (const f of forbidden) expect(out).not.toHaveProperty(f);
    // Public-safe wholesaler block
    expect(out.wholesaler).toEqual({ name: 'W', logoUrl: '/static/uploads/l.png', termsHtml: '<p>OK</p>' });
    // Specifically check the wholesaler PII isn't there
    expect(out.wholesaler).not.toHaveProperty('contactEmail');
    expect(out.wholesaler).not.toHaveProperty('contactPhone');
  });

  it('exposes approvedAt on an APPROVED quote', async () => {
    const approvedDate = new Date('2026-01-15T10:30:00Z');
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', reference: 'FVP-2026-X', status: 'APPROVED',
      customerName: 'X', validUntil: null, approvedAt: approvedDate,
      subtotal: 0, taxRate: 0, taxAmount: 0, total: 0,
      lineItems: [], floorPlanWidthM: null, floorPlanHeightM: null,
      fenceSegments: [], renderUrl: null, selectedDesign: null, projectAddress: null,
      wholesaler: { name: 'W', logoUrl: null, template: null },
    });
    const out: any = await svc.getPublic('q1');
    expect(out.approvedAt).toEqual(approvedDate);
  });

  it('refuses to serve a DRAFT quote publicly (no enumeration by status code)', async () => {
    prisma.quote.findUnique.mockResolvedValue({
      id: 'q1', status: 'DRAFT', customerName: 'X', validUntil: null, approvedAt: null,
      subtotal: 0, taxRate: 0, taxAmount: 0, total: 0,
      lineItems: [], floorPlanWidthM: null, floorPlanHeightM: null,
      fenceSegments: [], renderUrl: null, selectedDesign: null, projectAddress: null,
      wholesaler: { name: 'W', logoUrl: null, template: null },
    });
    await expect(svc.getPublic('q1')).rejects.toThrow(/not available/);
  });
});
