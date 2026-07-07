import { publicApi, api } from './api';

/**
 * Frontend wrapper around the public AI Yard Visualizer endpoints.
 *
 * - `submit`, `getConfig`, `getStatus`, `getResult` are all PUBLIC
 *   (no JWT required) and use the unauthenticated axios client so
 *   an admin token can't accidentally leak into a public call.
 * - The admin-side helpers (`listLeads`, `getLead`, `convertLead`,
 *   `markContacted`, `archiveLead`) use the regular `api` client
 *   so they pick up the JWT from the auth context.
 */

export interface GalleryItem { id: string; label: string; yardSide: 'FRONT' | 'BACK'; url: string; }
export interface PublicConfig { gallery: GalleryItem[]; styles: string[]; }

export async function getConfig(): Promise<PublicConfig> {
  const { data } = await publicApi.get('/public/ai-generation/config');
  return data;
}

export interface SubmitResult { id: string; status: string; }

export async function submitFromGallery(input: {
  photoSource: 'GALLERY';
  galleryId: string;
  yardSide: 'FRONT' | 'BACK';
  designStyle?: string;
  firstName?: string;
  email?: string;
  phone?: string;
}): Promise<SubmitResult> {
  const { data } = await publicApi.post('/public/ai-generation', input);
  return data;
}

export async function submitUpload(input: {
  photoSource: 'UPLOADED';
  file: File;
  yardSide: 'FRONT' | 'BACK';
  designStyle?: string;
  firstName?: string;
  email?: string;
  phone?: string;
}): Promise<SubmitResult> {
  const fd = new FormData();
  fd.append('photoSource', input.photoSource);
  fd.append('yardSide', input.yardSide);
  if (input.designStyle) fd.append('designStyle', input.designStyle);
  if (input.firstName) fd.append('firstName', input.firstName);
  if (input.email) fd.append('email', input.email);
  if (input.phone) fd.append('phone', input.phone);
  fd.append('file', input.file, input.file.name);
  const { data } = await publicApi.post('/public/ai-generation', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export interface PublicLeadStatus { id: string; status: string; renderUrl?: string | null; error?: string | null; }
export interface PublicLeadResult extends PublicLeadStatus {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  yardSide: string;
  photoSource: string;
  inputPhotoPath: string;
  inputGalleryId?: string | null;
  designStyle?: string | null;
  generatedAt?: string | null;
  createdAt: string;
}

export async function getStatus(id: string): Promise<PublicLeadStatus> {
  const { data } = await publicApi.get(`/public/ai-generation/${id}/status`);
  return data;
}

export async function getResult(id: string): Promise<PublicLeadResult> {
  const { data } = await publicApi.get(`/public/ai-generation/${id}/result`);
  return data;
}

// ----- Admin helpers -------------------------------------------------------

export interface AdminLead {
  id: string;
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  yardSide: string;
  photoSource: string;
  inputPhotoPath: string;
  inputGalleryId?: string | null;
  designStyle?: string | null;
  status: string;
  renderUrl?: string | null;
  renderError?: string | null;
  generatedAt?: string | null;
  contactedAt?: string | null;
  contactedBy?: { id: string; fullName: string; email: string } | null;
  notes?: string | null;
  convertedQuoteId?: string | null;
  convertedQuote?: { id: string; reference: string; status: string } | null;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminLeadList { total: number; page: number; pageSize: number; leads: AdminLead[]; }

export async function listLeads(params: { status?: string; page?: number; pageSize?: number } = {}): Promise<AdminLeadList> {
  const { data } = await api.get('/admin/leads', { params });
  return data;
}

export async function getLead(id: string): Promise<AdminLead> {
  const { data } = await api.get(`/admin/leads/${id}`);
  return data;
}

export async function convertLead(id: string): Promise<{ quoteId: string; leadId: string; alreadyConverted?: boolean }> {
  const { data } = await api.post(`/admin/leads/${id}/convert-to-quote`);
  return data;
}

export async function markContacted(id: string, notes?: string): Promise<AdminLead> {
  const { data } = await api.post(`/admin/leads/${id}/mark-contacted`, { notes });
  return data;
}

export async function archiveLead(id: string): Promise<AdminLead> {
  const { data } = await api.post(`/admin/leads/${id}/archive`);
  return data;
}
