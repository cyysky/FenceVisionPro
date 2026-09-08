import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => {
  const makeInstance = () => ({
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(),
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
  buildPublicCustomerUrl, buildPublicInstallerUrl, createCustomerLink,
  createInstallation, deleteInstallationPhoto, fetchInstallationPhotoBlob,
  getInstallation, listCustomerLinks, listInstallationPhotos, listInstallations,
  publicFetchPhotoBlob, publicGetCustomerView, publicGetInstallerView,
  publicPostCustomerApprove, publicPostInstallerEvent, publicUploadInstallerPhoto,
  revokeCustomerLink, transitionInstallation, updateInstallation, uploadInstallationPhoto,
} from './installations';

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const patch = api.patch as ReturnType<typeof vi.fn>;
const del = api.delete as ReturnType<typeof vi.fn>;
const pget = publicApi.get as ReturnType<typeof vi.fn>;
const ppost = publicApi.post as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset(); post.mockReset(); patch.mockReset(); del.mockReset();
  pget.mockReset(); ppost.mockReset();
});

describe('installations client', () => {
  it('listInstallations / getInstallation hit the right routes', async () => {
    get.mockResolvedValue({ data: [{ id: 'i1' }] });
    await listInstallations({ status: 'SCHEDULED', limit: 5 });
    expect(get).toHaveBeenCalledWith('/installations', { params: { status: 'SCHEDULED', limit: 5 } });
    get.mockResolvedValue({ data: { id: 'i1' } });
    await expect(getInstallation('i1')).resolves.toEqual({ id: 'i1' });
    expect(get).toHaveBeenLastCalledWith('/installations/i1');
  });

  it('create/update/transition installations', async () => {
    post.mockResolvedValue({ data: { id: 'i1' } });
    patch.mockResolvedValue({ data: { id: 'i1' } });
    await createInstallation({ quoteId: 'q1', note: 'hi' });
    expect(post).toHaveBeenCalledWith('/installations', { quoteId: 'q1', note: 'hi' });
    await updateInstallation('i1', { installerName: 'Bob' });
    expect(patch).toHaveBeenCalledWith('/installations/i1', { installerName: 'Bob' });
    post.mockResolvedValue({ data: { id: 'i1', status: 'IN_PROGRESS' } });
    await transitionInstallation('i1', 'IN_PROGRESS', 'started');
    expect(post).toHaveBeenLastCalledWith('/installations/i1/transition', { toStatus: 'IN_PROGRESS', note: 'started' });
  });

  it('photo management', async () => {
    get.mockResolvedValue({ data: [{ id: 'ph1' }] });
    await listInstallationPhotos('i1');
    expect(get).toHaveBeenCalledWith('/installations/i1/photos');

    post.mockResolvedValue({ data: { id: 'ph1' } });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await uploadInstallationPhoto('i1', file, 'BEFORE', 'shot', '2026-09-01T00:00:00Z');
    const [url, fd] = post.mock.calls[0];
    expect(url).toBe('/installations/i1/photos');
    expect(fd.get('file')).toBe(file);
    expect(fd.get('kind')).toBe('BEFORE');
    expect(fd.get('caption')).toBe('shot');
    expect(fd.get('takenAt')).toBe('2026-09-01T00:00:00Z');

    await uploadInstallationPhoto('i1', file, 'AFTER');
    const [, fd2] = post.mock.calls[1];
    expect(fd2.get('caption')).toBeNull();
    expect(fd2.get('takenAt')).toBeNull();

    del.mockResolvedValue({ data: {} });
    await deleteInstallationPhoto('i1', 'ph1');
    expect(del).toHaveBeenCalledWith('/installations/i1/photos/ph1');
  });

  it('fetchInstallationPhotoBlob carries the JWT and fails on !ok', async () => {
    localStorage.setItem('fvp_token', 'tok123');
    const blob = new Blob(['img']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(fetchInstallationPhotoBlob('i1', 'ph1')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/api/installations/i1/photos/ph1/blob', {
      headers: { Authorization: 'Bearer tok123' },
    });
    vi.unstubAllGlobals();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }));
    await expect(fetchInstallationPhotoBlob('i1', 'ph1')).rejects.toThrow(/Photo fetch failed \(403\)/);
    vi.unstubAllGlobals();
  });

  it('customer-link management', async () => {
    get.mockResolvedValue({ data: [] });
    await listCustomerLinks('i1');
    expect(get).toHaveBeenCalledWith('/installations/i1/customer-links');
    post.mockResolvedValue({ data: { id: 'l1' } });
    await createCustomerLink('i1', 'COMPLETION_REVIEW', '2026-10-01');
    expect(post).toHaveBeenCalledWith('/installations/i1/customer-links', { purpose: 'COMPLETION_REVIEW', expiresAt: '2026-10-01' });
    await revokeCustomerLink('i1', 'l1');
    expect(post).toHaveBeenLastCalledWith('/installations/i1/customer-links/l1/revoke');
  });
});

describe('public installer/customer endpoints', () => {
  it('publicGetInstallerView passes the link token in the URL', async () => {
    pget.mockResolvedValue({ data: { id: 'i1' } });
    await publicGetInstallerView('i1', 'tok');
    expect(pget).toHaveBeenCalledWith('/public/installations/i1/installer/tok');
  });

  it('publicPostInstallerEvent posts type + note', async () => {
    ppost.mockResolvedValue({ data: { id: 'e1', type: 'ARRIVED', occurredAt: 'x' } });
    await publicPostInstallerEvent('i1', 'tok', 'ARRIVED', 'on site');
    expect(ppost).toHaveBeenCalledWith('/public/installations/i1/installer/tok/events', { type: 'ARRIVED', note: 'on site' });
  });

  it('publicUploadInstallerPhoto sends multipart form data', async () => {
    ppost.mockResolvedValue({ data: { id: 'ph1' } });
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    await publicUploadInstallerPhoto('i1', 'tok', file, 'DURING', 'wall done');
    const [url, fd] = ppost.mock.calls[0];
    expect(url).toBe('/public/installations/i1/installer/tok/photos');
    expect(fd.get('file')).toBe(file);
    expect(fd.get('kind')).toBe('DURING');
    expect(fd.get('caption')).toBe('wall done');
  });

  it('publicFetchPhotoBlob passes the token as a query param', async () => {
    const blob = new Blob(['img']);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);
    await expect(publicFetchPhotoBlob('i1', 'ph1', 'a/b')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/api/public/installations/i1/photos/ph1/blob?token=a%2Fb');
    vi.unstubAllGlobals();
  });

  it('public customer view + approval', async () => {
    pget.mockResolvedValue({ data: { id: 'i1', canSignOff: true } });
    await publicGetCustomerView('i1', 'tok');
    expect(pget).toHaveBeenCalledWith('/public/installations/i1/customer/tok');
    ppost.mockResolvedValue({ data: { id: 'i1' } });
    await publicPostCustomerApprove('i1', 'tok', 'data:image/png;base64,abc', 'looks good');
    expect(ppost).toHaveBeenCalledWith('/public/installations/i1/customer/tok/approve', {
      signatureDataUrl: 'data:image/png;base64,abc', comment: 'looks good',
    });
  });
});

describe('public link URL builders', () => {
  it('builds installer and customer URLs from window.location.origin', () => {
    expect(buildPublicInstallerUrl('i1', 'tok')).toBe(`${window.location.origin}/public/installation/i1/installer/tok`);
    expect(buildPublicCustomerUrl('i1', 'tok')).toBe(`${window.location.origin}/public/installation/i1/customer/tok`);
  });
});
