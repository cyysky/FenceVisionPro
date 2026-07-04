import { useEffect, useState } from 'react';
import { useToast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { SkeletonRows } from '../components/ui/Skeleton';
import { createInstaller, deactivateInstaller, listInstallers, updateInstaller } from '../lib/installers';
import type { Installer, InstallerStatus } from '../lib/types';

/**
 * Installer directory page.
 *
 * Lists the dealer's installers (admins see all). Inline modal
 * for create + edit; row action for the soft-delete (deactivate).
 *
 * Privacy: the form leaves phone/email blank by default. The
 * dealer types their own contractor's details in - we never seed
 * or default to a phone number.
 */
export default function InstallersPage() {
  const toast = useToast();
  const [list, setList] = useState<Installer[] | null>(null);
  const [editing, setEditing] = useState<Installer | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<{ name: string; phone: string; email: string; companyName: string; notes: string; status: InstallerStatus }>({
    name: '', phone: '', email: '', companyName: '', notes: '', status: 'ACTIVE',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => { void refresh(); }, []);

  async function refresh() {
    try {
      const data = await listInstallers();
      setList(data);
    } catch {
      toast.error('Failed to load installers');
      setList([]);
    }
  }

  function openCreate() {
    setDraft({ name: '', phone: '', email: '', companyName: '', notes: '', status: 'ACTIVE' });
    setEditing(null);
    setCreating(true);
  }
  function openEdit(i: Installer) {
    setDraft({
      name: i.name, phone: i.phone ?? '', email: i.email ?? '',
      companyName: i.companyName ?? '', notes: i.notes ?? '',
      status: i.status,
    });
    setCreating(false);
    setEditing(i);
  }
  function closeModal() {
    setCreating(false); setEditing(null);
  }

  function isValid() {
    if (!draft.name.trim()) return false;
    if (draft.email && !/^\S+@\S+\.\S+$/.test(draft.email)) return false;
    return true;
  }

  async function save() {
    if (!isValid()) {
      toast.error('Please provide a name (and a valid email if entered)');
      return;
    }
    setBusy(true);
    try {
      const body = {
        name: draft.name.trim(),
        phone: draft.phone.trim() || undefined,
        email: draft.email.trim() || undefined,
        companyName: draft.companyName.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        status: draft.status,
      };
      if (creating) {
        await createInstaller(body);
        toast.success('Installer added');
      } else if (editing) {
        await updateInstaller(editing.id, body);
        toast.success('Installer updated');
      }
      closeModal();
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to save installer');
    } finally { setBusy(false); }
  }

  async function deactivate(i: Installer) {
    if (!(await confirm({
      title: 'Deactivate installer?',
      message: `${i.name} will be marked inactive. Historical installations stay linked.`,
      confirmLabel: 'Deactivate', variant: 'danger',
    }))) return;
    try {
      await deactivateInstaller(i.id);
      toast.success('Installer deactivated');
      await refresh();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to deactivate');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-semibold">Installers</h1>
        <span className="text-xs text-slate-500">({list?.length ?? 0})</span>
        <button onClick={openCreate} className="ml-auto px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium hover:bg-brand-700">
          + Add installer
        </button>
      </div>

      <p className="text-xs text-slate-500">
        Phone and email are optional and entered by you for each contractor. We never seed or
        default these to a number.
      </p>

      <section className="bg-white border rounded">
        {list === null ? (
          <div className="p-4"><SkeletonRows rows={4} cols={5} /></div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">
            No installers yet. <button className="text-brand-700 underline" onClick={openCreate}>Add the first one</button>.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th>Company</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Status</th>
                <th>Installations</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map(i => (
                <tr key={i.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{i.name}</td>
                  <td>{i.companyName || <span className="text-slate-400">—</span>}</td>
                  <td className="text-slate-600">{i.phone || <span className="text-slate-400">—</span>}</td>
                  <td className="text-slate-600">{i.email || <span className="text-slate-400">—</span>}</td>
                  <td>
                    <span className={`px-2 py-0.5 rounded text-xs ${i.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
                      {i.status}
                    </span>
                  </td>
                  <td className="text-xs text-slate-500">{i._count?.installations ?? 0}</td>
                  <td className="text-right px-4 py-2 space-x-2">
                    <button onClick={() => openEdit(i)} className="text-xs text-brand-700 hover:underline">Edit</button>
                    {i.status === 'ACTIVE' && (
                      <button onClick={() => deactivate(i)} className="text-xs text-red-700 hover:underline">Deactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(creating || editing) && (
        <div className="fixed inset-0 bg-black/30 grid place-items-center z-40 p-4" onClick={closeModal}>
          <div className="bg-white border rounded p-5 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">{creating ? 'Add installer' : `Edit ${editing?.name}`}</h2>
            <div className="space-y-2">
              <Field label="Name *" v={draft.name} on={v => setDraft(d => ({ ...d, name: v }))} />
              <Field label="Company" v={draft.companyName} on={v => setDraft(d => ({ ...d, companyName: v }))} />
              <Field label="Phone" v={draft.phone} on={v => setDraft(d => ({ ...d, phone: v }))} placeholder="e.g. +60 12-345 6789" />
              <Field label="Email" type="email" v={draft.email} on={v => setDraft(d => ({ ...d, email: v }))} />
              <div>
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Status</label>
                <select className="w-full border rounded px-2 py-1.5 text-sm" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value as InstallerStatus }))}>
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={closeModal} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
              <button onClick={save} disabled={busy || !isValid()} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50">
                {creating ? 'Add' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, v, on, type = 'text', placeholder }: { label: string; v: string; on: (s: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input type={type} placeholder={placeholder} className="w-full border rounded px-2 py-1.5 text-sm" value={v} onChange={e => on(e.target.value)} />
    </div>
  );
}
