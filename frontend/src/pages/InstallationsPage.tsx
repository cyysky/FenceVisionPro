import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listInstallations } from '../lib/installations';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';
import type { Installation, InstallationStatus } from '../lib/types';

const STATUS_OPTIONS: InstallationStatus[] = [
  'SCHEDULED', 'MATERIALS_ORDERED', 'IN_PROGRESS', 'COMPLETED', 'INSPECTED', 'CANCELLED',
];

/**
 * Installations list page. Same shape as the Projects list
 * page: status filter chips, search box, paginated table.
 *
 * The "New installation" CTA is intentionally absent -
 * installations are created from the quote detail page (not
 * yet wired in this PR) because the link is 1:1 to a quote.
 */
export default function InstallationsPage() {
  const toast = useToast();
  const [rows, setRows] = useState<Installation[] | null>(null);
  const [status, setStatus] = useState<InstallationStatus | ''>('');
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, q]);

  async function load() {
    try {
      const params: any = {};
      if (status) params.status = status;
      if (q.trim()) params.q = q.trim();
      const data = await listInstallations(params);
      setRows(data);
    } catch {
      toast.error('Failed to load installations');
      setRows([]);
    }
  }

  return (
    <div className="min-h-full">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-brand-600 grid place-items-center text-white font-bold">F</div>
            <span className="font-bold">Yardex</span>
          </div>
          <nav className="ml-2 sm:ml-8 flex flex-wrap gap-3 sm:gap-4 text-sm">
            <Link to="/" className="text-slate-600 hover:text-brand-700">Quotes</Link>
            <Link to="/projects" className="text-slate-600 hover:text-brand-700">Projects</Link>
            <Link to="/installations" className="text-slate-900 font-medium">Installations</Link>
            <Link to="/products" className="text-slate-600 hover:text-brand-700">Products</Link>
            <Link to="/designs" className="text-slate-600 hover:text-brand-700">Designs</Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <section>
          <h2 className="text-lg font-semibold">Installations</h2>
          <p className="text-sm text-slate-500">
            Active and past installations. Click a row to see the timeline, photos, and customer sign-off.
          </p>
        </section>

        <section className="bg-white border rounded">
          <div className="p-3 border-b flex flex-wrap items-center gap-2">
            <input
              value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search quote reference or customer…"
              className="px-2 py-1 border rounded text-sm w-56"
              aria-label="Search installations"
            />
            <select
              value={status} onChange={e => setStatus(e.target.value as InstallationStatus | '')}
              className="px-2 py-1 border rounded text-sm"
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(status || q) && (
              <button
                onClick={() => { setStatus(''); setQ(''); }}
                className="ml-auto text-xs text-slate-500 hover:text-slate-800 underline"
              >
                Clear filters
              </button>
            )}
          </div>
          {rows === null ? (
            <div className="p-4"><SkeletonRows rows={5} cols={5} /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <div className="text-2xl mb-2">🔧</div>
              No installations yet. Installations are created from an approved quote.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b">
                  <tr>
                    <th className="px-4 py-2">Quote</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th>Scheduled</th>
                    <th>Installer</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(i => (
                    <tr key={i.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs">
                        {i.quote ? (
                          <Link to={`/installations/${i.id}`} className="text-brand-700 hover:underline">
                            {i.quote.reference}
                          </Link>
                        ) : <span className="text-slate-400">(no quote)</span>}
                      </td>
                      <td>
                        <div>{i.quote?.customerName || <span className="text-slate-400">—</span>}</div>
                        {i.quote?.customerEmail && <div className="text-xs text-slate-500">{i.quote.customerEmail}</div>}
                      </td>
                      <td><StatusBadge status={i.status} /></td>
                      <td className="text-xs text-slate-600">
                        {i.scheduledStart ? new Date(i.scheduledStart).toLocaleDateString() : <span className="text-slate-400">—</span>}
                      </td>
                      <td className="text-xs text-slate-600">
                        {i.installerName || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="text-right pr-4">
                        <Link to={`/installations/${i.id}`} className="text-xs text-brand-700 hover:underline">Open</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const STATUS_COLORS: Record<InstallationStatus, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-700',
  MATERIALS_ORDERED: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  INSPECTED: 'bg-emerald-700 text-white',
  CANCELLED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: InstallationStatus }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${STATUS_COLORS[status] || 'bg-slate-100'}`}>
      {status}
    </span>
  );
}
