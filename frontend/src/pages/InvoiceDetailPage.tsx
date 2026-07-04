import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton';
import { deleteInvoice, getInvoice, transitionInvoice, updateInvoice } from '../lib/invoices';
import { INVOICE_TRANSITIONS, type Invoice, type InvoiceStatus } from '../lib/types';

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT:  'bg-amber-100 text-amber-700',
  PAID:  'bg-emerald-100 text-emerald-700',
  VOID:  'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  SENT:  'Sent',
  PAID:  'Paid',
  VOID:  'Void',
};

/**
 * Invoice detail page.
 *
 * - Header: number, status badge, customer / quote, totals.
 * - Line items table.
 * - Status transition buttons (DRAFT→SENT, SENT→PAID, etc).
 * - Editable notes / dueAt while DRAFT.
 */
export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { void refresh(); }, [id]);

  async function refresh() {
    setLoading(true);
    try {
      const data = await getInvoice(id!);
      setInvoice(data);
    } catch (e: any) {
      setLoadErr(e?.response?.data?.message || 'Failed to load invoice');
    } finally { setLoading(false); }
  }

  async function doTransition(to: InvoiceStatus) {
    if (!(await confirm({
      title: `Mark invoice as ${STATUS_LABEL[to]}?`,
      message: to === 'VOID' ? 'Voiding an invoice cannot be undone.' : `Transition ${invoice!.number} to ${STATUS_LABEL[to]}.`,
      confirmLabel: STATUS_LABEL[to], variant: to === 'VOID' ? 'danger' : 'default',
    }))) return;
    setBusy(to);
    try {
      await transitionInvoice(invoice!.id, to);
      toast.success(`Marked as ${STATUS_LABEL[to]}`);
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Transition failed');
    } finally { setBusy(null); }
  }

  async function saveDraftEdits() {
    if (!invoice) return;
    setBusy('save');
    try {
      await updateInvoice(invoice.id, {
        dueAt: invoice.dueAt || undefined,
        notes: invoice.notes ?? '',
      });
      toast.success('Saved');
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally { setBusy(null); }
  }

  async function removeDraft() {
    if (!invoice) return;
    if (!(await confirm({
      title: 'Delete draft invoice?',
      message: `Invoice ${invoice.number} will be permanently deleted.`,
      confirmLabel: 'Delete', variant: 'danger',
    }))) return;
    try {
      await deleteInvoice(invoice.id);
      toast.success('Draft deleted');
      window.location.href = '/invoices';
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Delete failed');
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-1/2" />
        <SkeletonRows rows={3} cols={4} />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (loadErr || !invoice) {
    return <div className="p-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{loadErr || 'Invoice not found'}</div>;
  }

  const allowed = INVOICE_TRANSITIONS[invoice.status] || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center flex-wrap gap-2">
        <Link to="/invoices" className="text-xs text-slate-500 hover:text-brand-700">← Invoices</Link>
        <h1 className="text-2xl font-semibold font-mono">{invoice.number}</h1>
        <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[invoice.status]}`}>{STATUS_LABEL[invoice.status]}</span>
        {invoice.quote && (
          <Link to={`/quotes/${invoice.quote.id}`} className="ml-2 text-xs text-brand-700 hover:underline">
            from quote {invoice.quote.reference}
          </Link>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          {allowed.map(t => (
            <button
              key={t}
              onClick={() => doTransition(t as InvoiceStatus)}
              disabled={busy === t}
              className={`px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 ${
                t === 'VOID' ? 'bg-red-600 text-white hover:bg-red-700' :
                t === 'PAID' ? 'bg-emerald-600 text-white hover:bg-emerald-700' :
                'bg-brand-600 text-white hover:bg-brand-700'
              }`}
            >
              {busy === t ? '…' : `Mark as ${STATUS_LABEL[t as InvoiceStatus]}`}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border rounded p-4">
          <div className="text-xs text-slate-500">Customer</div>
          <div className="font-medium">{invoice.quote?.customerName || '—'}</div>
          {invoice.quote?.customerEmail && <div className="text-xs text-slate-500">{invoice.quote.customerEmail}</div>}
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-xs text-slate-500">Issued</div>
          <div>{invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleDateString() : '— (still draft)'}</div>
          <div className="text-xs text-slate-500 mt-2">Due</div>
          <div>{invoice.dueAt ? new Date(invoice.dueAt).toLocaleDateString() : '—'}</div>
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-xs text-slate-500">Total</div>
          <div className="text-2xl font-bold">${Number(invoice.total).toFixed(2)}</div>
          <div className="text-xs text-slate-500">Subtotal ${Number(invoice.subtotal).toFixed(2)} · Tax ${Number(invoice.tax).toFixed(2)}</div>
        </div>
      </div>

      <section className="bg-white border rounded overflow-x-auto">
        <div className="p-3 border-b font-semibold">Line items</div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500 border-b">
            <tr>
              <th className="px-4 py-2">Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit</th>
              <th className="text-right pr-4">Total</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lineItems ?? []).map(li => (
              <tr key={li.id} className="border-b last:border-0">
                <td className="px-4 py-2">{li.description}</td>
                <td className="text-right">{Number(li.quantity)}</td>
                <td className="text-right">${Number(li.unitPrice).toFixed(2)}</td>
                <td className="text-right pr-4">${Number(li.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-right px-4 py-1 text-xs text-slate-500">Subtotal</td>
              <td className="text-right pr-4 text-sm">${Number(invoice.subtotal).toFixed(2)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="text-right px-4 py-1 text-xs text-slate-500">Tax</td>
              <td className="text-right pr-4 text-sm">${Number(invoice.tax).toFixed(2)}</td>
            </tr>
            <tr className="border-t">
              <td colSpan={3} className="text-right px-4 py-1 font-semibold">Total</td>
              <td className="text-right pr-4 text-base font-semibold">${Number(invoice.total).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </section>

      {invoice.status === 'DRAFT' && (
        <section className="bg-white border rounded p-4 space-y-3">
          <h2 className="font-semibold">Edit draft</h2>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Due date</label>
            <input type="date" className="border rounded px-2 py-1.5 text-sm"
              value={invoice.dueAt ? invoice.dueAt.slice(0, 10) : ''}
              onChange={e => setInvoice({ ...invoice, dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Notes</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={3}
              value={invoice.notes ?? ''}
              onChange={e => setInvoice({ ...invoice, notes: e.target.value })}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={saveDraftEdits} disabled={busy === 'save'} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50">
              {busy === 'save' ? 'Saving…' : 'Save changes'}
            </button>
            <button onClick={removeDraft} className="px-3 py-1.5 border border-red-300 text-red-700 rounded text-sm">
              Delete draft
            </button>
          </div>
        </section>
      )}

      {invoice.status !== 'DRAFT' && invoice.notes && (
        <section className="bg-white border rounded p-4">
          <h2 className="font-semibold mb-1">Notes</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{invoice.notes}</p>
        </section>
      )}
    </div>
  );
}
