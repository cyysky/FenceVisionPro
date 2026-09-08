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
import { createInvoice, deleteInvoice, getInvoice, listInvoices, transitionInvoice, updateInvoice } from './invoices';

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const patch = api.patch as ReturnType<typeof vi.fn>;
const del = api.delete as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset(); post.mockReset(); patch.mockReset(); del.mockReset();
});

describe('invoices client', () => {
  it('listInvoices sends optional filters', async () => {
    get.mockResolvedValue({ data: [] });
    await listInvoices({ status: 'SENT', quoteId: 'q1' });
    expect(get).toHaveBeenCalledWith('/invoices', { params: { status: 'SENT', quoteId: 'q1' } });
  });

  it('getInvoice fetches by id', async () => {
    get.mockResolvedValue({ data: { id: 'inv1' } });
    await expect(getInvoice('inv1')).resolves.toEqual({ id: 'inv1' });
    expect(get).toHaveBeenCalledWith('/invoices/inv1');
  });

  it('createInvoice posts the body', async () => {
    post.mockResolvedValue({ data: { id: 'inv1' } });
    await createInvoice({ quoteId: 'q1', notes: 'n', taxPercent: 6 });
    expect(post).toHaveBeenCalledWith('/invoices', { quoteId: 'q1', notes: 'n', taxPercent: 6 });
  });

  it('updateInvoice patches dueAt/notes', async () => {
    patch.mockResolvedValue({ data: { id: 'inv1' } });
    await updateInvoice('inv1', { dueAt: '2026-10-01' });
    expect(patch).toHaveBeenCalledWith('/invoices/inv1', { dueAt: '2026-10-01' });
  });

  it('transitionInvoice posts the target status', async () => {
    post.mockResolvedValue({ data: { id: 'inv1', status: 'PAID' } });
    await transitionInvoice('inv1', 'PAID');
    expect(post).toHaveBeenCalledWith('/invoices/inv1/transition', { to: 'PAID' });
  });

  it('deleteInvoice issues a DELETE and returns ok', async () => {
    del.mockResolvedValue({ data: { ok: true } });
    await expect(deleteInvoice('inv1')).resolves.toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith('/invoices/inv1');
  });
});
