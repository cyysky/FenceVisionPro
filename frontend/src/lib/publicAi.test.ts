import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => {
  const makeInstance = () => ({
    get: vi.fn(), post: vi.fn(),
    defaults: { headers: { common: {} as Record<string, unknown> } },
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  });
  const create = vi.fn(() => makeInstance());
  return { default: { create }, create };
});

import { api, publicApi } from './api';
import {
  archiveLead, convertLead, getConfig, getLead, getResult, getStatus,
  listLeads, markContacted, submitFromGallery, submitUpload,
} from './publicAi';

const pget = publicApi.get as ReturnType<typeof vi.fn>;
const ppost = publicApi.post as ReturnType<typeof vi.fn>;
const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  pget.mockReset(); ppost.mockReset(); get.mockReset(); post.mockReset();
});

describe('public endpoints', () => {
  it('getConfig fetches the public config without auth', async () => {
    pget.mockResolvedValue({ data: { gallery: [], styles: ['Privacy'] } });
    await expect(getConfig()).resolves.toEqual({ gallery: [], styles: ['Privacy'] });
    expect(pget).toHaveBeenCalledWith('/public/ai-generation/config');
  });

  it('submitFromGallery posts the lead payload', async () => {
    ppost.mockResolvedValue({ data: { id: 'lead1', status: 'PENDING' } });
    await submitFromGallery({ photoSource: 'GALLERY', galleryId: 'front1', yardSide: 'FRONT', email: 'a@b.co' });
    expect(ppost).toHaveBeenCalledWith('/public/ai-generation', {
      photoSource: 'GALLERY', galleryId: 'front1', yardSide: 'FRONT', email: 'a@b.co',
    });
  });

  it('submitUpload posts a multipart form with the file', async () => {
    ppost.mockResolvedValue({ data: { id: 'lead1', status: 'PENDING' } });
    const file = new File(['x'], 'yard.jpg', { type: 'image/jpeg' });
    await submitUpload({
      photoSource: 'UPLOADED', file, yardSide: 'BACK', designStyle: 'Picket', firstName: 'Ada', phone: '0123',
    });
    const [url, fd, cfg] = ppost.mock.calls[0];
    expect(url).toBe('/public/ai-generation');
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('photoSource')).toBe('UPLOADED');
    expect(fd.get('yardSide')).toBe('BACK');
    expect(fd.get('designStyle')).toBe('Picket');
    expect(fd.get('firstName')).toBe('Ada');
    expect(fd.get('phone')).toBe('0123');
    const storedFile = fd.get('file') as File;
    expect(storedFile.name).toBe('yard.jpg');
    expect(storedFile.type).toBe('image/jpeg');
    expect(storedFile.size).toBe(file.size);
    expect(cfg).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  });

  it('getStatus and getResult return the public payloads', async () => {
    pget.mockResolvedValueOnce({ data: { id: 'lead1', status: 'READY', renderUrl: '/static/r.png' } })
      .mockResolvedValueOnce({ data: { id: 'lead1', firstName: 'Ada', createdAt: 'x' } });
    await expect(getStatus('lead1')).resolves.toEqual({ id: 'lead1', status: 'READY', renderUrl: '/static/r.png' });
    await expect(getResult('lead1')).resolves.toEqual({ id: 'lead1', firstName: 'Ada', createdAt: 'x' });
    expect(pget).toHaveBeenNthCalledWith(1, '/public/ai-generation/lead1/status');
    expect(pget).toHaveBeenNthCalledWith(2, '/public/ai-generation/lead1/result');
  });
});

describe('admin endpoints (authed api client)', () => {
  it('listLeads passes status/page/pageSize params', async () => {
    get.mockResolvedValue({ data: { total: 1, page: 1, pageSize: 20, leads: [] } });
    await listLeads({ status: 'PENDING', page: 2, pageSize: 10 });
    expect(get).toHaveBeenCalledWith('/admin/leads', { params: { status: 'PENDING', page: 2, pageSize: 10 } });
  });

  it('getLead fetches by id', async () => {
    get.mockResolvedValue({ data: { id: 'lead1' } });
    await expect(getLead('lead1')).resolves.toEqual({ id: 'lead1' });
    expect(get).toHaveBeenCalledWith('/admin/leads/lead1');
  });

  it('convertLead, markContacted, archiveLead post to the admin routes', async () => {
    post.mockResolvedValueOnce({ data: { quoteId: 'q1', leadId: 'lead1' } })
      .mockResolvedValueOnce({ data: { id: 'lead1', contactedAt: 'x' } })
      .mockResolvedValueOnce({ data: { id: 'lead1', archivedAt: 'x' } });

    await expect(convertLead('lead1')).resolves.toEqual({ quoteId: 'q1', leadId: 'lead1' });
    expect(post).toHaveBeenNthCalledWith(1, '/admin/leads/lead1/convert-to-quote');

    await markContacted('lead1', 'called back');
    expect(post).toHaveBeenNthCalledWith(2, '/admin/leads/lead1/mark-contacted', { notes: 'called back' });

    await archiveLead('lead1');
    expect(post).toHaveBeenNthCalledWith(3, '/admin/leads/lead1/archive');
  });
});
