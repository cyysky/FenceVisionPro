import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { SkeletonRows } from '../components/ui/Skeleton';

type Dealer = {
  id: string; name: string; slug: string; contactEmail: string; contactPhone?: string;
  createdAt: string; isActive: boolean; users?: { id: string; email: string; fullName: string; role: string; isActive?: boolean }[];
};

export default function DealersPage() {
  const toast = useToast();
  const [list, setList] = useState<Dealer[] | null>(null);
  // Inline add-staff form (replaces the old prompt() chain).
  const [addStaffFor, setAddStaffFor] = useState<string | null>(null);
  const [staffDraft, setStaffDraft] = useState({ email: '', fullName: '', password: '' });
  // Inline reset-password form.
  const [resetFor, setResetFor] = useState<string | null>(null);
  const [resetDraft, setResetDraft] = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ name: '', slug: '', contactEmail: '', contactPhone: '', ownerEmail: '', ownerPassword: '', ownerName: '' });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { refresh(); }, []);

  async function refresh() {
    const r = await api.get('/wholesalers');
    setList(r.data);
  }

  function isFormValid() {
    if (!form.name.trim() || !form.slug.trim()) return false;
    if (!/^[a-z0-9-]+$/.test(form.slug)) return false;
    if (!/^\S+@\S+\.\S+$/.test(form.contactEmail)) return false;
    if (!/^\S+@\S+\.\S+$/.test(form.ownerEmail)) return false;
    if (form.ownerPassword.length < 8) return false;
    if (!form.ownerName.trim()) return false;
    return true;
  }

  async function create() {
    setErr(null); setMsg(null); setBusy(true);
    try {
      const { data } = await api.post('/wholesalers', form);
      toast.success(`Created ${data.dealer.name} – owner login: ${data.owner.email}`);
      setForm({ name: '', slug: '', contactEmail: '', contactPhone: '', ownerEmail: '', ownerPassword: '', ownerName: '' });
      await refresh();
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Failed'));
      toast.error(apiErrorMessage(e, 'Failed'));
    } finally { setBusy(false); }
  }

  async function toggleExpand(w: Dealer) {
    if (expanded[w.id]) { setExpanded(s => ({ ...s, [w.id]: false })); return; }
    await reloadDealer(w.id);
    setExpanded(s => ({ ...s, [w.id]: true }));
  }

  /**
   * Refetch a single dealer (with its users) and merge into the
   * list. Used by the toggle/refetch patterns below; replaces the
   * old "call toggle twice" hack which depended on React state
   * timing.
   */
  async function reloadDealer(id: string) {
    const { data } = await api.get(`/dealers/${id}`);
    setList(prev => (prev || []).map(x => x.id === id ? { ...x, ...data } : x));
  }

  async function submitStaff(w: Dealer) {
    if (!/^\S+@\S+\.\S+$/.test(staffDraft.email)) { toast.error('Valid email required'); return; }
    if (!staffDraft.fullName.trim()) { toast.error('Full name required'); return; }
    if (staffDraft.password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await api.post(`/dealers/${w.id}/staff`, staffDraft);
      await reloadDealer(w.id);
      setAddStaffFor(null);
      setStaffDraft({ email: '', fullName: '', password: '' });
      toast.success('Staff added');
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Failed to add staff'));
    }
  }

  async function submitReset(w: Dealer, staffId: string) {
    if (resetDraft.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    try {
      await api.post(`/dealers/${w.id}/staff/${staffId}/reset-password`, { newPassword: resetDraft });
      setResetFor(null); setResetDraft('');
      toast.success('Password reset - user must log in again');
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Failed to reset password'));
    }
  }

  async function toggleStaffActive(w: Dealer, staffId: string, currentlyActive: boolean) {
    const action = currentlyActive ? 'deactivate' : 'reactivate';
    if (!(await confirm({ title: `${action.charAt(0).toUpperCase() + action.slice(1)} staff?`, message: `This will ${action} the staff member's access to the system.`, confirmLabel: action.charAt(0).toUpperCase() + action.slice(1), variant: currentlyActive ? 'danger' : 'default' }))) return;
    const path = currentlyActive ? 'deactivate' : 'reactivate';
    try {
      await api.post(`/dealers/${w.id}/staff/${staffId}/${path}`);
      await reloadDealer(w.id);
      toast.success(`Staff ${action}d`);
    } catch (e: any) {
      const m = e?.response?.data?.message;
      alert(Array.isArray(m) ? m.join(', ') : m || `Failed to ${action}`);
    }
  }

  return (
    <div className="min-h-full">
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center flex-wrap gap-2">
        <Link to="/quotes" className="text-sm text-slate-500 hover:text-brand-700">&larr; Back</Link>
        <h1 className="font-bold">Dealers</h1>
      </header>
      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        <section className="bg-white border rounded p-4">
          <h2 className="font-semibold mb-3">Onboard new dealer</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <Input label="Company name *" v={form.name} on={(v: string) => setForm({ ...form, name: v })} />
            <Input label="URL slug * (lowercase, hyphens)" v={form.slug} on={(v: string) => setForm({ ...form, slug: v.toLowerCase() })} />
            <Input label="Contact email *" v={form.contactEmail} on={(v: string) => setForm({ ...form, contactEmail: v })} />
            <Input label="Contact phone" v={form.contactPhone} on={(v: string) => setForm({ ...form, contactPhone: v })} />
            <Input label="Owner full name *" v={form.ownerName} on={(v: string) => setForm({ ...form, ownerName: v })} />
            <Input label="Owner email (login) *" v={form.ownerEmail} on={(v: string) => setForm({ ...form, ownerEmail: v.toLowerCase() })} />
            <Input label="Owner initial password * (min 8 chars)" v={form.ownerPassword} on={(v: string) => setForm({ ...form, ownerPassword: v })} type="password" />
          </div>
          <div className="mt-3 flex items-center flex-wrap gap-2">
            {msg && <span className="text-sm text-emerald-700">{msg}</span>}
            {err && <span className="text-sm text-red-700">{err}</span>}
            <button onClick={create} disabled={busy || !isFormValid()}
              className="ml-auto px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
              {busy ? 'Creating…' : 'Create dealer'}
            </button>
          </div>
        </section>

        {list === null ? (
          <div className="bg-white border rounded p-4"><SkeletonRows rows={4} cols={5} /></div>
        ) : (
        <section className="bg-white border rounded">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="px-4 py-2">Name</th><th>Slug</th><th>Email</th><th>Created</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {(list || []).map(w => (
                <Fragment key={w.id}>
                  <tr className="border-b last:border-0">
                    <td className="px-4 py-2">{w.name}</td>
                    <td className="font-mono text-xs">{w.slug}</td>
                    <td>{w.contactEmail}</td>
                    <td className="text-xs text-slate-500">{new Date(w.createdAt).toLocaleDateString()}</td>
                    <td>
                      <span className={`px-2 py-0.5 rounded text-xs ${w.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                        {w.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="text-right pr-4">
                      <button onClick={() => toggleExpand(w)} className="text-brand-700 text-xs hover:underline">
                        {expanded[w.id] ? 'Hide' : 'Manage'}
                      </button>
                    </td>
                  </tr>
                  {expanded[w.id] && w.users && (
                    <tr className="bg-slate-50">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-center mb-2">
                          <h3 className="text-sm font-semibold">Users ({w.users.length})</h3>
                          <button onClick={() => { setAddStaffFor(w.id === addStaffFor ? null : w.id); setStaffDraft({ email: '', fullName: '', password: '' }); }} className="ml-auto px-2 py-1 text-xs border rounded hover:bg-white">
                            {addStaffFor === w.id ? '× Cancel' : '+ Add staff'}
                          </button>
                        </div>
                        {addStaffFor === w.id && (
                          <div className="mb-2 p-2 bg-white border rounded space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <input className="input flex-1 min-w-32" placeholder="Full name" value={staffDraft.fullName} onChange={e => setStaffDraft(s => ({ ...s, fullName: e.target.value }))} />
                              <input className="input flex-1 min-w-32" type="email" placeholder="Email" value={staffDraft.email} onChange={e => setStaffDraft(s => ({ ...s, email: e.target.value }))} />
                              <input className="input flex-1 min-w-32" type="password" placeholder="Initial password (8+ chars)" value={staffDraft.password} onChange={e => setStaffDraft(s => ({ ...s, password: e.target.value }))} />
                              <button onClick={() => submitStaff(w)} className="px-3 py-1 bg-brand-600 text-white rounded text-xs">Create</button>
                            </div>
                          </div>
                        )}
                        {w.users.length === 0 ? (
                          <div className="text-xs text-slate-500">No users yet.</div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="text-slate-500">
                              <tr><th className="text-left py-1">Name</th><th className="text-left">Email</th><th className="text-left">Role</th><th className="text-left">Status</th><th></th></tr>
                            </thead>
                            <tbody>
                              {w.users.map(u => (
                                <tr key={u.id} className="border-t border-slate-200">
                                  <td className="py-1">{u.fullName}</td>
                                  <td className="font-mono">{u.email}</td>
                                  <td>{u.role.replace('DEALER_', '')}</td>
                                  <td>
                                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${u.isActive === false ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}>
                                      {u.isActive === false ? 'Inactive' : 'Active'}
                                    </span>
                                  </td>
                                  <td className="text-right py-1">
                                    {u.role !== 'ADMIN' && (
                                      <span className="space-x-2">
                                        {resetFor === u.id ? (
                                          <span className="inline-flex gap-1">
                                            <input type="password" className="input w-32 text-xs" placeholder="new pw" value={resetDraft} onChange={e => setResetDraft(e.target.value)} />
                                            <button onClick={() => submitReset(w, u.id)} className="text-emerald-700 hover:underline">✓</button>
                                            <button onClick={() => { setResetFor(null); setResetDraft(''); }} className="text-slate-500 hover:underline">×</button>
                                          </span>
                                        ) : (
                                          <button onClick={() => { setResetFor(u.id); setResetDraft(''); }} className="text-brand-700 hover:underline">Reset pw</button>
                                        )}
                                        <button onClick={() => toggleStaffActive(w, u.id, u.isActive !== false)} className={u.isActive === false ? 'text-emerald-700 hover:underline' : 'text-red-700 hover:underline'}>
                                          {u.isActive === false ? 'Reactivate' : 'Deactivate'}
                                        </button>
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>
        )}
      </main>
    </div>
  );
}

function Input({ label, v, on, type = 'text' }: any) {
  return (
    <label>
      <span className="block text-xs text-slate-500 mb-1">{label}</span>
      <input type={type} className="w-full border rounded px-2 py-1.5" value={v} onChange={e => on(e.target.value)} />
    </label>
  );
}
