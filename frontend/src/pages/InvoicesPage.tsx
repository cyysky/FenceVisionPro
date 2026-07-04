import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { SkeletonRows } from '../components/ui/Skeleton';
import { deleteInvoice, listInvoices } from '../lib/invoices';
import type { Invoice, InvoiceStatus } from '../lib/types';

const STATUS_FILTERS: ('ALL' | InvoiceStatus)[] = ['ALL', 'DRAFT', 'SENT', 'PAID', 'VOID'];

const STATUS_COLORS: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SENT:  'bg-amber-100 text-amber-700',
  PAID:  'bg-emerald-100 text-emerald-700',
  VOID:  'bg-red-100 text-red-700',
};

/**
 * Invoices list page.
 *
 * - Status filter chips (ALL / DRAFT / SENT / PAID / VOID)
 * - "New invoice" CTA directs the user to the Quotes list
 *   (invoices are created FROM a quote, not from scratch).
 * - Each row shows: number, quote reference, customer, total,
 *   due date, status badge, action menu.
 */
export default function InvoicesPage() {
  const toast = useToast();
  const [list, setList] = useState<Invoice[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | InvoiceStatus>('ALL');

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      const data = await listInvoices();
      setList(data);
    } catch {
      toast.error('Failed to load invoices');
      setList([]);
    }
  }

  const filtered = (list ?? []).filter(i => statusFilter === 'ALL' ? true : i.status === statusFilter);

  async function removeDraft(i: Invoice) {
    if (!(await confirm({
      title: 'Delete draft invoice?',
      message: `Invoice ${i.number} will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete', variant: 'danger',
    }))) return;
    try {
      await deleteInvoice(i.id);
      toast.success('Draft invoice deleted');
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to delete');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Invoices</h1>
        <span className="text-xs text-slate-500">({filtered.length}{statusFilter !== 'ALL' ? ` of ${list?.length ?? 0}` : ''})</span>
      </div>

      <p className="text-xs text-slate-500">
        Invoices are created from an <strong>APPROVED</strong> quote. Open a quote's detail page and click "Create invoice" to generate one.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
              statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
            }`}>
            {s}
          </button>
        ))}
      </div>

      <section className="bg-white border rounded">
        {list === null ? (
          <div className="p-4"><SkeletonRows rows={4} cols={6} /></div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            {list.length === 0
              ? <>No invoices yet. Open an APPROVED quote and click "Create invoice".</>
              : <>No invoices match this filter. <button onClick={() => setStatusFilter('ALL')} className="text-brand-700 underline">Clear filter</button></>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b">
                <tr>
                  <th className="px-4 py-2">Number</th>
                  <th>Quote</th>
                  <th>Customer</th>
                  <th className="text-right">Total</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(i => (
                  <tr key={i.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link to={`/invoices/${i.id}`} className="text-brand-700 hover:underline">{i.number}</Link>
                    </td>
                    <td className="text-xs text-slate-600">
                      {i.quote ? <Link to={`/quotes/${i.quote.id}`} className="hover:underline">{i.quote.reference}</Link> : '—'}
                    </td>
                    <td>{i.quote?.customerName || '—'}</td>
                    <td className="text-right">${Number(i.total).toFixed(2)}</td>
                    <td className="text-xs text-slate-500">{i.dueAt ? new Date(i.dueAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[i.status]}`}>{i.status}</span>
                    </td>
                    <td className="text-right px-4 py-2">
                      <Link to={`/invoices/${i.id}`} className="text-xs text-brand-700 hover:underline">Open</Link>
                      {i.status === 'DRAFT' && (
                        <button onClick={() => removeDraft(i)} className="text-xs text-red-700 hover:underline ml-2">Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
