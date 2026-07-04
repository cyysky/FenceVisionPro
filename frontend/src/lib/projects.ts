import { api, loadAuth } from './api';
import type {
  Project, ProjectDocument, ProjectDocumentKind, ProjectFenceSelection,
  ProjectMeasurement, ProjectVisualization,
} from './types';

/**
 * API client for the End Customer Project module.
 * Thin wrappers around the shared `api` axios instance plus a few
 * blob-URL helpers for documents / visualisations (which can't be
 * loaded as `<img src>` directly because the endpoint requires an
 * Authorization header).
 */

export interface ListProjectsParams {
  status?: string;
  projectType?: 'RESIDENTIAL' | 'COMMERCIAL';
  installScope?: 'FULL' | 'HALF' | 'PARTIAL';
  q?: string;
  take?: number;
  skip?: number;
}

export async function listProjects(params: ListProjectsParams = {}): Promise<{ rows: Project[]; total: number }> {
  const r = await api.get('/projects', { params });
  return r.data;
}

export async function getProject(id: string): Promise<Project> {
  const r = await api.get(`/projects/${id}`);
  return r.data;
}

export async function createProject(body: Partial<Project>): Promise<Project> {
  const r = await api.post('/projects', body);
  return r.data;
}

export async function updateProject(id: string, body: Partial<Project>): Promise<Project> {
  const r = await api.patch(`/projects/${id}`, body);
  return r.data;
}

export async function deleteProject(id: string): Promise<void> {
  await api.delete(`/projects/${id}`);
}

// ---------------------------------------------------------------------------
// Fence selections
// ---------------------------------------------------------------------------

export async function addSelection(projectId: string, body: Partial<ProjectFenceSelection>): Promise<ProjectFenceSelection> {
  const r = await api.post(`/projects/${projectId}/selections`, body);
  return r.data;
}
export async function updateSelection(projectId: string, selId: string, body: Partial<ProjectFenceSelection>): Promise<ProjectFenceSelection> {
  const r = await api.patch(`/projects/${projectId}/selections/${selId}`, body);
  return r.data;
}
export async function deleteSelection(projectId: string, selId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/selections/${selId}`);
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

export async function addMeasurement(projectId: string, body: Partial<ProjectMeasurement>): Promise<ProjectMeasurement> {
  const r = await api.post(`/projects/${projectId}/measurements`, body);
  return r.data;
}
export async function updateMeasurement(projectId: string, measId: string, body: Partial<ProjectMeasurement>): Promise<ProjectMeasurement> {
  const r = await api.patch(`/projects/${projectId}/measurements/${measId}`, body);
  return r.data;
}
export async function deleteMeasurement(projectId: string, measId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/measurements/${measId}`);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

/**
 * Upload a project document. Wraps FormData so callers don't have
 * to remember the Content-Type quirk (axios sets it automatically
 * when the body is a FormData instance).
 */
export async function uploadDocument(
  projectId: string,
  file: File,
  kind: ProjectDocumentKind,
  caption?: string,
): Promise<ProjectDocument> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', kind);
  if (caption) fd.append('caption', caption);
  const r = await api.post(`/projects/${projectId}/documents`, fd);
  return r.data;
}

export async function deleteDocument(projectId: string, docId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/documents/${docId}`);
}

/**
 * Fetch a document's binary content as a Blob. The browser's
 * `<img>` and `<iframe>` tags can't set Authorization headers, so
 * we have to load the bytes ourselves and turn them into a
 * same-origin object URL.
 */
export async function fetchDocumentBlob(projectId: string, docId: string): Promise<Blob> {
  const { token } = loadAuth();
  const res = await fetch(`/api/projects/${projectId}/documents/${docId}/blob`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Document fetch failed (${res.status})`);
  return res.blob();
}

// ---------------------------------------------------------------------------
// Visualisations
// ---------------------------------------------------------------------------

export async function generateVisualization(
  projectId: string,
  body: {
    kind: 'AI_IMAGE' | 'AI_3D_SNAPSHOT';
    style: string;
    color: string;
    heightFt: number;
    panelCount?: number;
    gateCount?: number;
  },
): Promise<{ id: string }> {
  const r = await api.post(`/projects/${projectId}/visualizations`, body);
  return r.data;
}

export async function deleteVisualization(projectId: string, visId: string): Promise<void> {
  await api.delete(`/projects/${projectId}/visualizations/${visId}`);
}

export async function fetchVisualizationBlob(projectId: string, visId: string): Promise<Blob> {
  const { token } = loadAuth();
  const res = await fetch(`/api/projects/${projectId}/visualizations/${visId}/blob`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Visualization fetch failed (${res.status})`);
  return res.blob();
}

/** For 3D snapshots the backend stores JS source, fetch as text. */
export async function fetchVisualizationText(projectId: string, visId: string): Promise<string> {
  const blob = await fetchVisualizationBlob(projectId, visId);
  return blob.text();
}

// ---------------------------------------------------------------------------
// Promote to quote
// ---------------------------------------------------------------------------

export async function promoteToQuote(
  projectId: string,
  overrides?: Partial<Pick<Project, 'customerName' | 'customerEmail' | 'customerPhone' | 'customerAddress' | 'notes'>>,
): Promise<{ quoteId: string }> {
  const r = await api.post(`/projects/${projectId}/quotes`, overrides ?? {});
  return r.data;
}
