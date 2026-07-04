import { api } from './api';
import type { Invoice, InvoiceStatus } from './types';

/**
 * Authenticated invoices client.
 *
 * Endpoints are at /invoices (no /api global prefix). Mirrors
 * the lib/projects.ts pattern.
 */

export async function listInvoices(opts: { status?: InvoiceStatus; quoteId?: string } = {}): Promise<Invoice[]> {
  const { data } = await api.get('/invoices', { params: opts });
  return data;
}

export async function getInvoice(id: string): Promise<Invoice> {
  const { data } = await api.get(`/invoices/${id}`);
  return data;
}

export async function createInvoice(body: {
  quoteId: string;
  dueAt?: string;
  notes?: string;
  taxPercent?: number;
}): Promise<Invoice> {
  const { data } = await api.post('/invoices', body);
  return data;
}

export async function updateInvoice(id: string, body: { dueAt?: string; notes?: string }): Promise<Invoice> {
  const { data } = await api.patch(`/invoices/${id}`, body);
  return data;
}

export async function transitionInvoice(id: string, to: InvoiceStatus): Promise<Invoice> {
  const { data } = await api.post(`/invoices/${id}/transition`, { to });
  return data;
}

export async function deleteInvoice(id: string): Promise<{ ok: true }> {
  const { data } = await api.delete(`/invoices/${id}`);
  return data;
}
