import axios from 'axios';
import { api, loadAuth } from './api';
import type {
  Installation, InstallationEvent, InstallationPhoto, InstallationPhotoKind,
  InstallationStatus, PublicCustomerLink, InstallationLinkPurpose,
} from './types';

/**
 * Installations API client.
 *
 * Two axios instances in play:
 *
 *   - `api` (from lib/api) - the regular authed instance. All
 *     dealer / installer / customer-link management goes
 *     through it.
 *   - `publicApi` - a fresh instance with NO Authorization
 *     interceptor, used by the public installer / customer
 *     pages. We re-export it from lib/api for symmetry.
 */

// Re-export so other modules only need to import from this file.
import { publicApi } from './api';
export { publicApi };

// ---------------------------------------------------------------------------
// Protected (dealer) endpoints
// ---------------------------------------------------------------------------

export interface ListInstallationsParams {
  status?: InstallationStatus;
  q?: string;
  limit?: number;
}

export async function listInstallations(params: ListInstallationsParams = {}): Promise<Installation[]> {
  const r = await api.get('/installations', { params });
  return r.data;
}

export async function getInstallation(id: string): Promise<Installation> {
  const r = await api.get(`/installations/${id}`);
  return r.data;
}

export interface CreateInstallationBody {
  quoteId: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  installerId?: string;
  installerName?: string;
  installerPhone?: string;
  installerEmail?: string;
  note?: string;
}

export async function createInstallation(body: CreateInstallationBody): Promise<Installation> {
  const r = await api.post('/installations', body);
  return r.data;
}

export async function updateInstallation(
  id: string,
  body: Partial<CreateInstallationBody>,
): Promise<Installation> {
  const r = await api.patch(`/installations/${id}`, body);
  return r.data;
}

export async function transitionInstallation(
  id: string,
  toStatus: InstallationStatus,
  note?: string,
): Promise<Installation> {
  const r = await api.post(`/installations/${id}/transition`, { toStatus, note });
  return r.data;
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

export async function listInstallationPhotos(id: string): Promise<InstallationPhoto[]> {
  const r = await api.get(`/installations/${id}/photos`);
  return r.data;
}

/**
 * Upload an installation photo as multipart/form-data. The
 * `kind` rides along as a form field; the backend validates it
 * against the allowed enum.
 */
export async function uploadInstallationPhoto(
  id: string,
  file: File,
  kind: InstallationPhotoKind,
  caption?: string,
  takenAt?: string,
): Promise<InstallationPhoto> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', kind);
  if (caption) fd.append('caption', caption);
  if (takenAt) fd.append('takenAt', takenAt);
  const r = await api.post(`/installations/${id}/photos`, fd);
  return r.data;
}

export async function deleteInstallationPhoto(id: string, photoId: string): Promise<void> {
  await api.delete(`/installations/${id}/photos/${photoId}`);
}

/**
 * Same authed-blob pattern as fetchDocumentBlob / fetchVisualizationBlob
 * in projects.ts: the browser can't set Authorization on
 * <img>/<iframe>, so we fetch the bytes and turn them into a
 * same-origin object URL.
 */
export async function fetchInstallationPhotoBlob(id: string, photoId: string): Promise<Blob> {
  const { token } = loadAuth();
  const res = await fetch(`/api/installations/${id}/photos/${photoId}/blob`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Photo fetch failed (${res.status})`);
  return res.blob();
}

// ---------------------------------------------------------------------------
// Customer links
// ---------------------------------------------------------------------------

export async function listCustomerLinks(id: string): Promise<PublicCustomerLink[]> {
  const r = await api.get(`/installations/${id}/customer-links`);
  return r.data;
}

export async function createCustomerLink(
  id: string,
  purpose: InstallationLinkPurpose,
  expiresAt?: string,
): Promise<PublicCustomerLink> {
  const r = await api.post(`/installations/${id}/customer-links`, { purpose, expiresAt });
  return r.data;
}

export async function revokeCustomerLink(id: string, linkId: string): Promise<void> {
  await api.post(`/installations/${id}/customer-links/${linkId}/revoke`);
}

// ---------------------------------------------------------------------------
// Public installer endpoints
// ---------------------------------------------------------------------------

export interface PublicInstallerView {
  id: string;
  status: InstallationStatus;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  installerName?: string | null;
  installerPhone?: string | null;
  installerEmail?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  quote?: { id: string; reference: string; customerName: string; projectAddress?: string | null } | null;
  events: InstallationEvent[];
  photos: InstallationPhoto[];
  nextActions: string[];
}

export async function publicGetInstallerView(id: string, token: string): Promise<PublicInstallerView> {
  const r = await publicApi.get(`/public/installations/${id}/installer/${token}`);
  return r.data;
}

export async function publicPostInstallerEvent(
  id: string,
  token: string,
  type: string,
  note?: string,
): Promise<{ id: string; type: string; occurredAt: string }> {
  const r = await publicApi.post(`/public/installations/${id}/installer/${token}/events`, { type, note });
  return r.data;
}

export async function publicUploadInstallerPhoto(
  id: string,
  token: string,
  file: File,
  kind: InstallationPhotoKind,
  caption?: string,
): Promise<InstallationPhoto> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('kind', kind);
  if (caption) fd.append('caption', caption);
  const r = await publicApi.post(`/public/installations/${id}/installer/${token}/photos`, fd);
  return r.data;
}

/**
 * Public photos are gated by the link token, which axios can't
 * put in the Authorization header. We pass it as a query string
 * instead. The same token authorizes both the view fetch and
 * every individual photo blob.
 */
export async function publicFetchPhotoBlob(id: string, photoId: string, token: string): Promise<Blob> {
  const res = await fetch(`/api/public/installations/${id}/photos/${photoId}/blob?token=${encodeURIComponent(token)}`);
  if (!res.ok) throw new Error(`Photo fetch failed (${res.status})`);
  return res.blob();
}

// ---------------------------------------------------------------------------
// Public customer endpoints
// ---------------------------------------------------------------------------

export interface PublicCustomerView {
  id: string;
  status: InstallationStatus;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
  installerName?: string | null;
  completedAt?: string | null;
  inspectedAt?: string | null;
  quote?: { id: string; reference: string; customerName: string; projectAddress?: string | null } | null;
  events: InstallationEvent[];
  photos: InstallationPhoto[];
  canSignOff: boolean;
}

export async function publicGetCustomerView(id: string, token: string): Promise<PublicCustomerView> {
  const r = await publicApi.get(`/public/installations/${id}/customer/${token}`);
  return r.data;
}

export async function publicPostCustomerApprove(
  id: string,
  token: string,
  signatureDataUrl: string,
  comment?: string,
): Promise<PublicCustomerView> {
  const r = await publicApi.post(`/public/installations/${id}/customer/${token}/approve`, { signatureDataUrl, comment });
  return r.data;
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/**
 * Build the absolute URL the dealer pastes into an email /
 * SMS. The dealer view is for the installer; the customer
 * view is for the end-customer.
 */
export function buildPublicInstallerUrl(id: string, token: string): string {
  return `${window.location.origin}/public/installation/${id}/installer/${token}`;
}

export function buildPublicCustomerUrl(id: string, token: string): string {
  return `${window.location.origin}/public/installation/${id}/customer/${token}`;
}

// Quiet the "axios is declared but never used" check - we
// re-export publicApi and consumers may want the bare client.
void axios;
