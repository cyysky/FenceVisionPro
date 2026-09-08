import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('axios', () => {
  const makeInstance = () => ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
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
import {
  addMeasurement, addSelection, createProject, deleteDocument, deleteMeasurement,
  deleteProject, deleteSelection, deleteVisualization, fetchDocumentBlob,
  fetchVisualizationBlob, fetchVisualizationText, generateVisualization,
  getProject, listProjects, promoteToQuote, updateMeasurement, updateProject,
  updateSelection, uploadDocument,
} from './projects';

const get = api.get as ReturnType<typeof vi.fn>;
const post = api.post as ReturnType<typeof vi.fn>;
const patch = api.patch as ReturnType<typeof vi.fn>;
const del = api.delete as ReturnType<typeof vi.fn>;

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

describe('projects CRUD', () => {
  it('listProjects sends query params and returns rows + total', async () => {
    const payload = { rows: [{ id: 'p1' }], total: 1 };
    get.mockResolvedValue({ data: payload });
    await expect(listProjects({ status: 'ACTIVE', q: 'ada', take: 10 })).resolves.toEqual(payload);
    expect(get).toHaveBeenCalledWith('/projects', { params: { status: 'ACTIVE', q: 'ada', take: 10 } });
  });

  it('listProjects defaults to empty params', async () => {
    get.mockResolvedValue({ data: { rows: [], total: 0 } });
    await listProjects();
    expect(get).toHaveBeenCalledWith('/projects', { params: {} });
  });

  it('getProject fetches a single project', async () => {
    get.mockResolvedValue({ data: { id: 'p1' } });
    await expect(getProject('p1')).resolves.toEqual({ id: 'p1' });
    expect(get).toHaveBeenCalledWith('/projects/p1');
  });

  it('createProject and updateProject post/patch the right bodies', async () => {
    post.mockResolvedValue({ data: { id: 'p1' } });
    patch.mockResolvedValue({ data: { id: 'p1', name: 'x' } });
    await createProject({ customerName: 'New Customer' });
    expect(post).toHaveBeenCalledWith('/projects', { customerName: 'New Customer' });
    await updateProject('p1', { notes: 'x' });
    expect(patch).toHaveBeenCalledWith('/projects/p1', { notes: 'x' });
  });

  it('deleteProject issues a DELETE', async () => {
    del.mockResolvedValue({ data: {} });
    await deleteProject('p1');
    expect(del).toHaveBeenCalledWith('/projects/p1');
  });
});

describe('selections & measurements', () => {
  it('add/update/delete selections hit the nested routes', async () => {
    post.mockResolvedValue({ data: { id: 's1' } });
    patch.mockResolvedValue({ data: { id: 's1' } });
    del.mockResolvedValue({ data: {} });

    await addSelection('p1', { linearMeters: 10, heightFt: 6 });
    expect(post).toHaveBeenCalledWith('/projects/p1/selections', { linearMeters: 10, heightFt: 6 });
    await updateSelection('p1', 's1', { heightFt: 5 });
    expect(patch).toHaveBeenCalledWith('/projects/p1/selections/s1', { heightFt: 5 });
    await deleteSelection('p1', 's1');
    expect(del).toHaveBeenCalledWith('/projects/p1/selections/s1');
  });

  it('add/update/delete measurements hit the nested routes', async () => {
    post.mockResolvedValue({ data: { id: 'm1' } });
    patch.mockResolvedValue({ data: { id: 'm1' } });
    del.mockResolvedValue({ data: {} });

    await addMeasurement('p1', { label: 'A', lengthM: 12 });
    expect(post).toHaveBeenCalledWith('/projects/p1/measurements', { label: 'A', lengthM: 12 });
    await updateMeasurement('p1', 'm1', { lengthM: 14 });
    expect(patch).toHaveBeenCalledWith('/projects/p1/measurements/m1', { lengthM: 14 });
    await deleteMeasurement('p1', 'm1');
    expect(del).toHaveBeenCalledWith('/projects/p1/measurements/m1');
  });
});

describe('documents', () => {
  it('uploadDocument sends multipart form data with optional caption', async () => {
    post.mockResolvedValue({ data: { id: 'd1' } });
    const file = new File(['pdf-bytes'], 'plan.pdf', { type: 'application/pdf' });
    await uploadDocument('p1', file, 'FLOOR_PLAN', 'North plot');
    expect(post).toHaveBeenCalledTimes(1);
    const [url, fd] = post.mock.calls[0];
    expect(url).toBe('/projects/p1/documents');
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('file')).toBe(file);
    expect(fd.get('kind')).toBe('FLOOR_PLAN');
    expect(fd.get('caption')).toBe('North plot');

    await uploadDocument('p1', file, 'REFERENCE_IMAGE');
    const [, fd2] = post.mock.calls[1];
    expect(fd2.get('caption')).toBeNull();
  });

  it('deleteDocument issues a DELETE', async () => {
    del.mockResolvedValue({ data: {} });
    await deleteDocument('p1', 'd1');
    expect(del).toHaveBeenCalledWith('/projects/p1/documents/d1');
  });

  it('fetchDocumentBlob uses fetch with the JWT and returns a Blob', async () => {
    localStorage.setItem('fvp_token', 'tok123');
    const blob = new Blob(['pdf'], { type: 'application/pdf' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchDocumentBlob('p1', 'd1')).resolves.toBe(blob);
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/documents/d1/blob', {
      headers: { Authorization: 'Bearer tok123' },
    });
    vi.unstubAllGlobals();
  });

  it('fetchDocumentBlob throws when the response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    await expect(fetchDocumentBlob('p1', 'missing')).rejects.toThrow(/Document fetch failed \(404\)/);
    vi.unstubAllGlobals();
  });
});

describe('visualizations & promote', () => {
  it('generateVisualization posts the render params', async () => {
    post.mockResolvedValue({ data: { id: 'v1' } });
    await generateVisualization('p1', { kind: 'AI_IMAGE', style: 'Picket', color: 'Black', heightFt: 6 });
    expect(post).toHaveBeenCalledWith('/projects/p1/visualizations', {
      kind: 'AI_IMAGE', style: 'Picket', color: 'Black', heightFt: 6,
    });
  });

  it('deleteVisualization issues a DELETE', async () => {
    del.mockResolvedValue({ data: {} });
    await deleteVisualization('p1', 'v1');
    expect(del).toHaveBeenCalledWith('/projects/p1/visualizations/v1');
  });

  it('fetchVisualizationText loads blob bytes as text', async () => {
    localStorage.setItem('fvp_token', 'tok123');
    const blobMock = { text: () => Promise.resolve('scene.js source') } as Blob;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blobMock) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchVisualizationText('p1', 'v1')).resolves.toBe('scene.js source');
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/p1/visualizations/v1/blob', {
      headers: { Authorization: 'Bearer tok123' },
    });
    vi.unstubAllGlobals();
  });

  it('fetchVisualizationBlob throws on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(fetchVisualizationBlob('p1', 'v1')).rejects.toThrow(/Visualization fetch failed \(500\)/);
    vi.unstubAllGlobals();
  });

  it('promoteToQuote posts overrides or an empty object', async () => {
    post.mockResolvedValue({ data: { quoteId: 'q1' } });
    await promoteToQuote('p1', { customerName: 'Ada' });
    expect(post).toHaveBeenCalledWith('/projects/p1/quotes', { customerName: 'Ada' });
    await promoteToQuote('p1');
    expect(post).toHaveBeenLastCalledWith('/projects/p1/quotes', {});
  });
});
