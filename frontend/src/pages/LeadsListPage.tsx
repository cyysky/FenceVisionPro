import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLead, AdminLeadList, listLeads } from '../lib/publicAi';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';
import { LeadCard } from '../components/LeadCard';

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'READY', label: 'Ready' },
  { value: 'CONTACTED', label: 'Contacted' },
  { value: 'CONVERTED', label: 'Converted' },
  { value: 'ARCHIVED', label: 'Archived' },
  { value: 'FAILED', label: 'Failed' },
];

/**
 * Admin Leads list. Paginated table with status filter chips.
 * "Leads" are customers who used the public AI Yard Visualizer
 * and haven't yet been converted to a quote.
 */
export default function LeadsListPage() {
  const toast = useToast();
  const [data, setData] = useState<AdminLeadList | null>(null);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await listLeads({ status: status || undefined, page, pageSize: 25 });
        if (!cancelled) setData(d);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.response?.data?.message || 'Failed to load leads');
      }
    })();
    return () => { cancelled = true; };
  }, [status, page, toast]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <section>
        <h2 className="text-lg font-semibold">Leads</h2>
        <p className="text-sm text-slate-500">
          Public AI Yard Visualizer submissions. Pick a lead to convert to a quote or record contact.
        </p>
      </section>

      <section className="bg-white border rounded">
        <div className="p-3 border-b flex flex-wrap items-center gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value || 'ALL'}
              onClick={() => setStatus(opt.value)}
              className={`px-3 py-1.5 rounded-full text-xs border ${
                status === opt.value
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-brand-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-12 gap-3 px-4 py-2 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 border-b">
          <div className="col-span-3">Created</div>
          <div className="col-span-1">Yard</div>
          <div className="col-span-2">Source</div>
          <div className="col-span-3">Contact</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        {!data && <SkeletonRows rows={6} />}
        {data && data.leads.length === 0 && (
          <div className="p-12 text-center text-sm text-slate-500">
            No leads yet. <Link to="/ai-generate" className="text-brand-700 hover:underline">Try the public form</Link> to create one.
          </div>
        )}
        {data && data.leads.map(lead => <LeadCard key={lead.id} lead={lead} />)}

        {data && data.total > data.pageSize && (
          <div className="p-3 border-t flex items-center justify-between text-sm">
            <div className="text-slate-500">Page {data.page} of {totalPages} ({data.total} total)</div>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 border rounded disabled:opacity-50">Prev</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 border rounded disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
