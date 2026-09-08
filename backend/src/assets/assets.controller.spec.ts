/**
 * AssetsController unit tests. The private streamer is exercised
 * through the public routes with fs.access and createReadStream
 * mocked, so no real files are needed.
 */
import { Test } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { promises as fsp } from 'fs';
import { AssetsController } from './assets.controller';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '@prisma/client';

describe('AssetsController', () => {
  let ctrl: AssetsController;
  let prisma: any;
  let accessSpy: jest.SpyInstance;
  let readSpy: jest.SpyInstance;
  const admin = { sub: 'u1', role: Role.ADMIN, dealerId: null } as any;
  const ownerA = { sub: 'u2', role: Role.DEALER_OWNER, dealerId: 'wA' } as any;
  const ownerB = { sub: 'u3', role: Role.DEALER_OWNER, dealerId: 'wB' } as any;
  const UUID = '11111111-2222-4333-8444-555555555555';

  function resMock() {
    const headers: Record<string, string> = {};
    const res = {
      setHeader: jest.fn((k: string, v: string) => { headers[k] = v; }),
      on: jest.fn(() => res),
      once: jest.fn(() => res),
      emit: jest.fn(),
      write: jest.fn(() => true),
      end: jest.fn(),
    } as any;
    res.headers = headers;
    return res;
  }

  beforeEach(async () => {
    prisma = { quote: { findUnique: jest.fn() } };
    accessSpy = jest.spyOn(fsp, 'access').mockResolvedValue(undefined as any);
    readSpy = jest.spyOn(require('fs'), 'createReadStream').mockReturnValue({
      pipe: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      emit: jest.fn(),
    } as any);
    const mod = await Test.createTestingModule({
      controllers: [AssetsController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    ctrl = mod.get(AssetsController);
  });
  afterEach(() => {
    accessSpy.mockRestore();
    readSpy.mockRestore();
  });

  it('streams a PDF for the owning dealer with private cache headers', async () => {
    prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wA' });
    const res = resMock();
    await ctrl.getPdf(`${UUID}.pdf`, res as any, ownerA);
    expect(res.headers['Content-Type']).toBe('application/pdf');
    expect(res.headers['Cache-Control']).toBe('private, max-age=300');
    expect(readSpy).toHaveBeenCalledWith(expect.stringContaining(`${UUID}.pdf`));
  });

  it('streams signatures for an admin', async () => {
    prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wB' });
    const res = resMock();
    await ctrl.getSignature(`sig-${UUID}-1710000000000.png`, res as any, admin);
    expect(res.headers['Content-Type']).toBe('image/png');
  });

  it('maps uncommon extensions to octet-stream', async () => {
    jest.spyOn(fsp, 'access').mockResolvedValue(undefined as any);
    prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wA' });
    const res = resMock();
    await ctrl.getPdf(`${UUID}.bin`, res as any, ownerA);
    expect(res.headers['Content-Type']).toBe('application/octet-stream');
  });

  it('forbids a filename with traversal', async () => {
    await expect(ctrl.getPdf('../../etc/passwd', resMock() as any, admin))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s a filename without a quote UUID', async () => {
    await expect(ctrl.getPdf('notes.txt', resMock() as any, admin))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when the quote is missing', async () => {
    prisma.quote.findUnique.mockResolvedValue(null);
    await expect(ctrl.getPdf(`${UUID}.pdf`, resMock() as any, admin))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('forbids a user reading another tenant asset', async () => {
    prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wB' });
    await expect(ctrl.getPdf(`${UUID}.pdf`, resMock() as any, ownerA))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('404s when the file is missing on disk', async () => {
    prisma.quote.findUnique.mockResolvedValue({ dealerId: 'wA' });
    accessSpy.mockRejectedValue(new Error('ENOENT'));
    await expect(ctrl.getPdf(`${UUID}.pdf`, resMock() as any, ownerA))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
