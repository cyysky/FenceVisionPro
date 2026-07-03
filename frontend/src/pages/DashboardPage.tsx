import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { SkeletonRows } from '../components/ui/Skeleton';

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
type StatusFilter = typeof STATUS_OPTIONS[number];
type SortKey = 'newest' | 'oldest' | 'total-desc' | 'total-asc' | 'customer';

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [quotes, setQuotes] = useState<any[] | null>(null);
  const [wholesalers, setWholesalers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  // Re-fetch whenever the filter or sort changes. Debounced
  // search so we don't hammer the server on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { void loadQuotes(); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, statusFilter, sort, search]);

  async function loadQuotes() {
    try {
      const params: any = { sort };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (search.trim()) params.q = search.trim();
      const { data } = await api.get('/quotes', { params });
      setQuotes(data);
    } catch (e: any) {
      toast.error('Failed to load quotes');
      setQuotes([]);
    }
  }
  useEffect(() => { (async () => {
    await loadQuotes();
    if (user?.role === 'ADMIN') {
      try {
        const { data: w } = await api.get('/wholesalers');
        setWholesalers(w);
      } catch { /* non-fatal */ }
    }
  })(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  // The backend now does the filtering + sorting, so the
  // "filtered" view is just the quotes array we received.
  const filtered = quotes ?? [];

  const counts = useMemo(() => {
    if (!quotes) return { ALL: 0, DRAFT: 0, SENT: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 };
    const out: Record<string, number> = { ALL: quotes.length, DRAFT: 0, SENT: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 };
    for (const q of quotes) out[q.status] = (out[q.status] || 0) + 1;
    return out;
  }, [quotes]);

  async function deleteQuote(id: string, ref: string) {
    const ok = await confirm({
      title: 'Delete draft?',
      message: `Quote ${ref} will be permanently deleted. This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.delete(`/quotes/${id}`);
      setQuotes(qs => (qs || []).filter(x => x.id !== id));
      toast.success('Draft deleted');
    } catch (e: any) {
      toast.error('Could not delete quote');
    }
  }

  async function cloneQuote(id: string) {
    try {
      const { data } = await api.post(`/quotes/${id}/clone`);
      toast.success('Cloned - opening new draft');
      nav(`/quotes/${data.id}`);
    } catch (e: any) {
      toast.error('Could not clone quote');
    }
  }

  return (
    <div className="min-h-full">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-brand-600 grid place-items-center text-white font-bold">F</div>
            <span className="font-bold">FenceVisionPro</span>
          </div>
          <nav className="ml-2 sm:ml-8 flex flex-wrap gap-3 sm:gap-4 text-sm">
            <Link to="/" className="text-slate-900 font-medium">Quotes</Link>
            <Link to="/products" className="text-slate-600 hover:text-brand-700">Products</Link>
            <Link to="/designs" className="text-slate-600 hover:text-brand-700">Designs</Link>
            {user?.role === 'ADMIN' && (
              <Link to="/wholesalers" className="text-slate-600 hover:text-brand-700">Wholesalers</Link>
            )}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <Link to="/quotes/new" className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium">
              + New quote
            </Link>
            <span className="hidden sm:inline text-slate-600">{user?.fullName || user?.email}</span>
            <ChangePasswordButton />
            <button onClick={logout} className="px-2 py-1 text-xs border rounded">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <section className="bg-white border rounded">
          <div className="p-3 border-b flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">Quotes</h2>
            <span className="text-xs text-slate-500">({filtered.length}{filtered.length !== (quotes?.length || 0) ? ` of ${quotes?.length}` : ''})</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search reference, customer…"
                className="px-2 py-1 border rounded text-sm w-44"
                aria-label="Search quotes"
              />
              <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
                className="px-2 py-1 border rounded text-sm" aria-label="Sort quotes">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="total-desc">Highest total</option>
                <option value="total-asc">Lowest total</option>
                <option value="customer">Customer A-Z</option>
              </select>
            </div>
          </div>
          <div className="p-2 border-b flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                  statusFilter === s
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}>
                {s} <span className={`ml-1 ${statusFilter === s ? 'opacity-80' : 'text-slate-400'}`}>{counts[s] || 0}</span>
              </button>
            ))}
          </div>
          {quotes === null ? (
            <div className="p-4"><SkeletonRows rows={5} cols={6} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-slate-500 border-b">
                  <tr>
                    <th className="px-4 py-2">Ref</th>
                    <th>Customer</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th>Created</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(q => (
                    <tr key={q.id} className="border-b last:border-0 hover:bg-slate-50 group">
                      <td className="px-4 py-2 font-mono text-xs">
                        <Link to={`/quotes/${q.id}`} className="text-brand-700 hover:underline">{q.reference}</Link>
                      </td>
                      <td>
                        <div>{q.customerName}</div>
                        {q.customerEmail && <div className="text-xs text-slate-500">{q.customerEmail}</div>}
                      </td>
                      <td><StatusBadge status={q.status} /></td>
                      <td className="text-right font-medium">${Number(q.total).toFixed(2)}</td>
                      <td className="text-xs text-slate-500">{new Date(q.createdAt).toLocaleDateString()}</td>
                      <td className="text-right pr-4">
                        <div className="opacity-60 group-hover:opacity-100 transition-opacity flex gap-2 justify-end">
                          {q.status === 'DRAFT' && (
                            <button onClick={() => deleteQuote(q.id, q.reference)}
                              className="text-xs text-red-600 hover:underline">Delete</button>
                          )}
                          <button onClick={() => cloneQuote(q.id)}
                            className="text-xs text-slate-600 hover:underline">Clone</button>
                          <Link to={`/quotes/${q.id}`} className="text-xs text-brand-700 hover:underline">Open</Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr><td colSpan={6} className="text-center py-10 text-slate-500">
                      {quotes.length === 0 ? (
                        <div className="space-y-2">
                          <div className="text-2xl">📋</div>
                          <div>No quotes yet. <Link to="/quotes/new" className="text-brand-700 underline">Create your first one</Link>.</div>
                        </div>
                      ) : (
                        <>No quotes match the filter. <button onClick={() => { setStatusFilter('ALL'); setSearch(''); }} className="text-brand-700 underline">Clear filter</button></>
                      )}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {user?.role === 'ADMIN' && (
          <section>
            <div className="flex items-center mb-2">
              <h2 className="text-lg font-semibold">Wholesalers</h2>
              <span className="ml-2 text-xs text-slate-500">({wholesalers.length})</span>
              <Link to="/wholesalers" className="ml-auto text-sm text-brand-700 hover:underline">Manage</Link>
            </div>
            {wholesalers.length === 0 ? (
              <div className="bg-white border rounded p-6 text-center text-slate-500 text-sm">
                No wholesalers onboarded yet. <Link to="/wholesalers" className="text-brand-700 underline">Add the first one</Link>.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {wholesalers.slice(0, 6).map(w => (
                  <div key={w.id} className="bg-white border rounded p-4 hover:border-brand-300 transition-colors">
                    <div className="font-medium">{w.name}</div>
                    <div className="text-xs text-slate-500">{w.contactEmail}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    SENT: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
    EXPIRED: 'bg-slate-200 text-slate-600',
  };
  return <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${colors[status] || 'bg-slate-100'}`}>{status}</span>;
}

function ChangePasswordButton() {
  const [open, setOpen] = useState(false);
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr(null); setMsg(null); setBusy(true);
    try {
      await api.post('/auth/change-password', { oldPassword: oldP, newPassword: newP });
      setMsg('Password updated.');
      setOldP(''); setNewP('');
      setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
    } catch (e: any) {
      const m = e?.response?.data?.message;
      setErr(Array.isArray(m) ? m.join(', ') : m || 'Failed');
    } finally { setBusy(false); }
  }

  if (!open) {
    return <button onClick={() => setOpen(true)} className="px-2 py-1 text-xs border rounded hidden sm:inline-block">Change password</button>;
  }
  return (
    <div className="fixed inset-0 bg-black/30 grid place-items-center z-50 p-4" onClick={() => setOpen(false)}>
      <div className="bg-white border rounded p-4 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold mb-3">Change password</h3>
        <label className="block text-xs text-slate-500 mb-1">Current password</label>
        <input type="password" className="w-full border rounded px-2 py-1.5 mb-2" value={oldP} onChange={e => setOldP(e.target.value)} />
        <label className="block text-xs text-slate-500 mb-1">New password (min 8 chars)</label>
        <input type="password" className="w-full border rounded px-2 py-1.5 mb-3" value={newP} onChange={e => setNewP(e.target.value)} />
        {err && <div className="text-sm text-red-700 mb-2">{err}</div>}
        {msg && <div className="text-sm text-emerald-700 mb-2">{msg}</div>}
        <div className="flex gap-2 justify-end">
          <button onClick={() => setOpen(false)} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
          <button onClick={submit} disabled={busy || oldP.length < 6 || newP.length < 8} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
