import { api } from './api';
import type { Installer, InstallerStatus } from './types';

/**
 * Authenticated installer directory client.
 *
 * Mirrors the lib/projects.ts pattern. The backend endpoint is
 * /installers (no global /api prefix; see backend main.ts).
 */

export async function listInstallers(opts: { status?: InstallerStatus } = {}): Promise<Installer[]> {
  const { data } = await api.get('/installers', { params: opts });
  return data;
}

export async function getInstaller(id: string): Promise<Installer> {
  const { data } = await api.get(`/installers/${id}`);
  return data;
}

export async function createInstaller(body: {
  name: string;
  phone?: string;
  email?: string;
  companyName?: string;
  notes?: string;
  status?: InstallerStatus;
}): Promise<Installer> {
  const { data } = await api.post('/installers', body);
  return data;
}

export async function updateInstaller(id: string, body: Partial<{
  name: string;
  phone: string;
  email: string;
  companyName: string;
  notes: string;
  status: InstallerStatus;
}>): Promise<Installer> {
  const { data } = await api.patch(`/installers/${id}`, body);
  return data;
}

export async function deactivateInstaller(id: string): Promise<Installer> {
  // Backend treats DELETE as a soft delete (status → INACTIVE).
  const { data } = await api.delete(`/installers/${id}`);
  return data;
}
