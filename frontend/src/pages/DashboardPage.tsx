import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

const STATUS_OPTIONS = ['ALL', 'DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;
type StatusFilter = typeof STATUS_OPTIONS[number];

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const [quotes, setQuotes] = useState<any[]>([]);
  const [wholesalers, setWholesalers] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [search, setSearch] = useState('');
  useEffect(() => { (async () => {
    const { data } = await api.get('/quotes');
    setQuotes(data);
    if (user?.role === 'ADMIN') {
      const { data: w } = await api.get('/wholesalers');
      setWholesalers(w);
    }
  })(); }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return quotes.filter(r => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.reference || '').toLowerCase().includes(q) ||
        (r.customerName || '').toLowerCase().includes(q) ||
        (r.customerEmail || '').toLowerCase().includes(q)
      );
    });
  }, [quotes, statusFilter, search]);

  const counts = useMemo(() => {
    const out: Record<string, number> = { ALL: quotes.length, DRAFT: 0, SENT: 0, APPROVED: 0, REJECTED: 0, EXPIRED: 0 };
    for (const q of quotes) out[q.status] = (out[q.status] || 0) + 1;
    return out;
  }, [quotes]);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-brand-600 grid place-items-center text-white font-bold">F</div>
            <span className="font-bold">FenceVisionPro</span>
          </div>
          <nav className="ml-2 sm:ml-8 flex flex-wrap gap-3 sm:gap-4 text-sm">
            <Link to="/" className="text-slate-700 hover:text-brand-700">Quotes</Link>
            <Link to="/products" className="text-slate-700 hover:text-brand-700">Products</Link>
            <Link to="/designs" className="text-slate-700 hover:text-brand-700">Designs</Link>
            {user?.role === 'ADMIN' && <Link to="/wholesalers" className="text-slate-700 hover:text-brand-700">Wholesalers</Link>}
          </nav>
          <div className="ml-auto flex items-center gap-2 sm:gap-3 text-sm flex-wrap">
            <span className="text-slate-500 hidden sm:inline">{user?.email} ({user?.role})</span>
            <span className="text-slate-500 sm:hidden">({user?.role})</span>
            <ChangePasswordButton />
            <button onClick={logout} className="px-3 py-1 border rounded">Logout</button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Quotes</h1>
          <span className="text-xs text-slate-500">({filtered.length}/{quotes.length})</span>
          <Link to="/quotes/new" className="ml-auto px-3 py-2 bg-brand-600 text-white rounded text-sm">+ New quote</Link>
        </div>

        {/* Quick status chips */}
        <div className="flex flex-wrap gap-2 text-xs">
          {STATUS_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-full border ${statusFilter === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}
            >
              {s} <span className="ml-1 opacity-70">{counts[s] || 0}</span>
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ref, customer, email…"
            className="ml-auto px-2 py-1 border rounded text-xs w-full sm:w-auto"
          />
        </div>

        <div className="bg-white border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr><th className="px-4 py-2">Ref</th><th>Customer</th><th>Status</th><th>Total</th><th>Created</th><th></th></tr>
            </thead>
            <tbody>
              {filtered.map(q => (
                <tr key={q.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs">{q.reference}</td>
                  <td>{q.customerName}</td>
                  <td><StatusBadge status={q.status} /></td>
                  <td>${Number(q.total).toFixed(2)}</td>
                  <td className="text-xs text-slate-500">{new Date(q.createdAt).toLocaleDateString()}</td>
                  <td className="text-right pr-4"><Link to={`/quotes/${q.id}`} className="text-brand-700">Open</Link></td>
                </tr>
              ))}
              {!filtered.length && <tr><td colSpan={6} className="text-center py-8 text-slate-500">No quotes match the filter.</td></tr>}
            </tbody>
          </table>
        </div>

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
                  <div key={w.id} className="bg-white border rounded p-4">
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
  return <span className={`px-2 py-0.5 rounded text-xs ${colors[status] || 'bg-slate-100'}`}>{status}</span>;
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
    return <button onClick={() => setOpen(true)} className="px-2 py-1 text-xs border rounded">Change password</button>;
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
