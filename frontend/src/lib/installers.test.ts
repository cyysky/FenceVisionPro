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

import { api } from './api';
import { createInstaller, deactivateInstaller, getInstaller, listInstallers, updateInstaller } from './installers';

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const patch = api.patch as ReturnType<typeof vi.fn>;
const del = api.delete as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset(); post.mockReset(); patch.mockReset(); del.mockReset();
});

describe('installers client', () => {
  it('listInstallers sends optional status filter', async () => {
    get.mockResolvedValue({ data: [{ id: 'i1' }] });
    await listInstallers({ status: 'ACTIVE' });
    expect(get).toHaveBeenCalledWith('/installers', { params: { status: 'ACTIVE' } });
    await listInstallers();
    expect(get).toHaveBeenLastCalledWith('/installers', { params: {} });
  });

  it('getInstaller fetches by id', async () => {
    get.mockResolvedValue({ data: { id: 'i1' } });
    await expect(getInstaller('i1')).resolves.toEqual({ id: 'i1' });
    expect(get).toHaveBeenCalledWith('/installers/i1');
  });

  it('createInstaller posts the body', async () => {
    post.mockResolvedValue({ data: { id: 'i1' } });
    await createInstaller({ name: 'Bob', companyName: 'FenceCo' });
    expect(post).toHaveBeenCalledWith('/installers', { name: 'Bob', companyName: 'FenceCo' });
  });

  it('updateInstaller patches the body', async () => {
    patch.mockResolvedValue({ data: { id: 'i1' } });
    await updateInstaller('i1', { phone: '0123' });
    expect(patch).toHaveBeenCalledWith('/installers/i1', { phone: '0123' });
  });

  it('deactivateInstaller issues a DELETE (soft deactivate)', async () => {
    del.mockResolvedValue({ data: { id: 'i1', status: 'INACTIVE' } });
    await deactivateInstaller('i1');
    expect(del).toHaveBeenCalledWith('/installers/i1');
  });
});
