import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  buildPublicCustomerUrl, buildPublicInstallerUrl, createCustomerLink,
  deleteInstallationPhoto, fetchInstallationPhotoBlob, getInstallation,
  listCustomerLinks, listInstallationPhotos, revokeCustomerLink,
  transitionInstallation, updateInstallation, uploadInstallationPhoto,
} from '../lib/installations';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';
import { confirm } from '../components/ui/Confirm';
import { Tabs } from '../components/ui/Tabs';
import type {
  Installation, InstallationEvent, InstallationEventType, InstallationPhoto,
  InstallationPhotoKind, InstallationStatus, PublicCustomerLink,
} from '../lib/types';
import { INSTALLATION_TRANSITIONS } from '../lib/types';

/**
 * Installation detail page. Tabbed workspace:
 *
 *   - Timeline:  chronological event list with icons
 *   - Photos:    gallery grouped by kind
 *   - Schedule:  editable scheduledStart / scheduledEnd
 *   - Installer & Links: installer contact + customer links
 *   - Actions:   big status-transition buttons
 */
export default function InstallationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [inst, setInst] = useState<Installation | null>(null);
  const [photos, setPhotos] = useState<InstallationPhoto[] | null>(null);
  const [links, setLinks] = useState<PublicCustomerLink[] | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [preview, setPreview] = useState<InstallationPhoto | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([getInstallation(id), listInstallationPhotos(id), listCustomerLinks(id)])
      .then(([i, p, l]) => {
        if (cancelled) return;
        setInst(i);
        setPhotos(p);
        setLinks(l);
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load installation'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, reloadTick]);

  function reload() { setReloadTick(t => t + 1); }

  if (!inst || !photos || !links) {
    return (
      <div className="min-h-full">
        <header className="bg-white border-b">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
            <Link to="/installations" className="text-sm text-brand-700 hover:underline">← Installations</Link>
          </div>
        </header>
        <main className="max-w-6xl mx-auto p-4 sm:p-6">
          <div className="bg-white border rounded p-4"><SkeletonRows rows={6} cols={4} /></div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-full">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <Link to="/installations" className="text-sm text-brand-700 hover:underline">← Installations</Link>
          <h1 className="text-lg font-semibold ml-2">
            Installation {inst.quote?.reference ? <>· <span className="font-mono text-sm">{inst.quote.reference}</span></> : null}
          </h1>
          <span className={`ml-2 px-2 py-0.5 rounded text-xs ${STATUS_COLORS[inst.status] || 'bg-slate-100'}`}>{inst.status}</span>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <section className="bg-white border rounded p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-slate-500">Customer</div>
              <div className="font-medium">{inst.quote?.customerName || '—'}</div>
              {inst.quote?.customerEmail && <div className="text-xs text-slate-500">{inst.quote.customerEmail}</div>}
            </div>
            <div>
              <div className="text-xs text-slate-500">Address</div>
              <div className="text-sm">{inst.quote?.projectAddress || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Schedule</div>
              <div className="text-sm">
                {inst.scheduledStart ? new Date(inst.scheduledStart).toLocaleDateString() : '—'}
                {' → '}
                {inst.scheduledEnd ? new Date(inst.scheduledEnd).toLocaleDateString() : '—'}
              </div>
            </div>
          </div>
        </section>

        <Tabs
          tabs={[
            { key: 'timeline', label: 'Timeline', badge: inst.events?.length, content:
              <TimelineTab events={inst.events || []} photos={photos} onPreview={setPreview} /> },
            { key: 'photos', label: 'Photos', badge: photos.length, content:
              <PhotosTab installationId={inst.id} photos={photos} onPreview={setPreview} onChange={reload} /> },
            { key: 'schedule', label: 'Schedule', content:
              <ScheduleTab installation={inst} onSaved={reload} /> },
            { key: 'links', label: 'Installer & Links', content:
              <LinksTab installation={inst} links={links} onChange={reload} /> },
            { key: 'actions', label: 'Actions', content:
              <ActionsTab installation={inst} onChanged={reload} /> },
          ]}
        />
      </main>

      {preview && (
        <PhotoPreviewModal installationId={inst.id} photo={preview} onClose={() => setPreview(null)} />
      )}
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

const EVENT_ICONS: Record<InstallationEventType, string> = {
  SCHEDULED: '📅',
  KICKOFF: '🚧',
  MATERIALS_ORDERED: '🛒',
  MATERIALS_RECEIVED: '📦',
  POSTS_SET: '🪵',
  PANELS_HUNG: '🧱',
  GATE_INSTALLED: '🚪',
  PHOTO_UPLOADED: '📷',
  NOTE_ADDED: '✏️',
  IN_PROGRESS: '🔨',
  COMPLETED: '✅',
  INSPECTED: '🏁',
  CUSTOMER_APPROVED: '👍',
  CANCELLED: '❌',
  PUBLIC_LINK_ISSUIED: '🔗',
};

// ---------------------------------------------------------------------------
// Timeline tab
// ---------------------------------------------------------------------------

function TimelineTab({ events, photos, onPreview }: { events: InstallationEvent[]; photos: InstallationPhoto[]; onPreview: (p: InstallationPhoto) => void }) {
  if (!events.length) {
    return <div className="text-sm text-slate-500 bg-white border rounded p-6 text-center">No events yet.</div>;
  }
  const photoById = new Map(photos.map(p => [p.id, p]));
  return (
    <ol className="space-y-2">
      {events.map(e => {
        const photo = (e.metadata as any)?.photoId ? photoById.get((e.metadata as any).photoId) : null;
        return (
          <li key={e.id} className="bg-white border rounded p-3 flex items-start gap-3">
            <div className="text-xl leading-none mt-0.5">{EVENT_ICONS[e.type] || '•'}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {humanizeEventType(e.type)}
                <span className="ml-2 text-xs text-slate-500 font-normal">{e.actorLabel || e.actorKind}</span>
              </div>
              {e.note && <div className="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{e.note}</div>}
              {photo && (
                <button onClick={() => onPreview(photo)} className="mt-2 inline-flex items-center gap-2 text-xs text-brand-700 hover:underline">
                  <span>📎 {photo.originalFilename}</span>
                </button>
              )}
            </div>
            <time className="text-xs text-slate-400 whitespace-nowrap">{new Date(e.occurredAt).toLocaleString()}</time>
          </li>
        );
      })}
    </ol>
  );
}

function humanizeEventType(t: InstallationEventType): string {
  return t.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Photos tab
// ---------------------------------------------------------------------------

function PhotosTab({ installationId, photos, onPreview, onChange }: { installationId: string; photos: InstallationPhoto[]; onPreview: (p: InstallationPhoto) => void; onChange: () => void }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<InstallationPhotoKind>('DURING');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<InstallationPhoto | null>(null);

  const grouped = photos.reduce<Record<string, InstallationPhoto[]>>((acc, p) => {
    (acc[p.kind] = acc[p.kind] || []).push(p);
    return acc;
  }, {});

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadInstallationPhoto(installationId, file, kind, caption || undefined);
      setCaption('');
      toast.success('Photo uploaded');
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function onDelete(p: InstallationPhoto) {
    const ok = await confirm({ title: 'Delete photo?', message: p.originalFilename, confirmLabel: 'Delete', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteInstallationPhoto(installationId, p.id);
      toast.success('Photo deleted');
      onChange();
    } catch {
      toast.error('Could not delete photo');
    }
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border rounded p-3 flex flex-wrap items-end gap-2 text-sm">
        <div>
          <label className="block text-xs text-slate-500">Kind</label>
          <select value={kind} onChange={e => setKind(e.target.value as InstallationPhotoKind)} className="border rounded px-2 py-1">
            {(['BEFORE', 'DURING', 'AFTER', 'ISSUE'] as InstallationPhotoKind[]).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs text-slate-500">Caption (optional)</label>
          <input value={caption} onChange={e => setCaption(e.target.value)} className="w-full border rounded px-2 py-1" maxLength={500} />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Photo file</label>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onPick} disabled={uploading}
            className="text-xs" />
        </div>
        {uploading && <div className="text-xs text-slate-500">Uploading…</div>}
      </section>

      {photos.length === 0 ? (
        <div className="bg-white border rounded p-6 text-center text-sm text-slate-500">
          No photos yet. Upload the first one above.
        </div>
      ) : (
        <div className="space-y-4">
          {(['BEFORE', 'DURING', 'AFTER', 'ISSUE'] as InstallationPhotoKind[]).map(k => {
            const list = grouped[k] || [];
            if (!list.length) return null;
            return (
              <div key={k}>
                <h4 className="text-sm font-semibold mb-2">{k} <span className="text-xs text-slate-500">({list.length})</span></h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {list.map(p => <PhotoTile key={p.id} installationId={installationId} photo={p} onPreview={() => onPreview(p)} onDelete={() => onDelete(p)} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {previewPhoto && <PhotoPreviewModal installationId={installationId} photo={previewPhoto} onClose={() => setPreviewPhoto(null)} />}
    </div>
  );
}

function PhotoTile({ installationId, photo, onPreview, onDelete }: { installationId: string; photo: InstallationPhoto; onPreview: () => void; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (photo.mimeType.startsWith('image/')) {
      fetchInstallationPhotoBlob(installationId, photo.id)
        .then(blob => { if (!cancelled) { url = URL.createObjectURL(blob); setThumb(url); } })
        .catch(() => { /* ignore */ });
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [installationId, photo.id, photo.mimeType]);
  return (
    <div className="border rounded bg-white overflow-hidden flex flex-col">
      <button type="button" onClick={onPreview} className="aspect-square bg-slate-100 grid place-items-center" title={photo.originalFilename}>
        {thumb ? <img src={thumb} alt={photo.originalFilename} className="w-full h-full object-cover" /> : <div className="text-slate-400 text-xs">Loading…</div>}
      </button>
      <div className="p-2 text-xs flex-1">
        <div className="font-medium truncate" title={photo.originalFilename}>{photo.originalFilename}</div>
        {photo.caption && <div className="text-slate-500 mt-0.5">{photo.caption}</div>}
        <div className="text-slate-400 mt-0.5">by {photo.uploadedByLabel || photo.uploadedByKind}</div>
      </div>
      <div className="p-1 border-t flex justify-end">
        <button onClick={onDelete} className="text-xs text-red-600 hover:underline px-1">Delete</button>
      </div>
    </div>
  );
}

function PhotoPreviewModal({ installationId, photo, onClose }: { installationId: string; photo: InstallationPhoto; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    fetchInstallationPhotoBlob(installationId, photo.id)
      .then(blob => { if (!cancelled) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [installationId, photo.id]);

  return (
    <div className="fixed inset-0 bg-black/80 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="max-w-4xl w-full" onClick={e => e.stopPropagation()}>
        {url ? (
          <img src={url} alt={photo.originalFilename} className="w-full max-h-[80vh] object-contain" />
        ) : (
          <div className="bg-white p-8 text-center rounded">Loading…</div>
        )}
        <div className="mt-2 text-white text-sm flex items-center justify-between">
          <span>{photo.originalFilename} {photo.caption && <span className="text-slate-300">· {photo.caption}</span>}</span>
          <button onClick={onClose} className="px-2 py-1 border border-white/40 rounded">Close</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schedule tab
// ---------------------------------------------------------------------------

function ScheduleTab({ installation, onSaved }: { installation: Installation; onSaved: () => void }) {
  const toast = useToast();
  const toLocal = (s?: string | null) => s ? new Date(s).toISOString().slice(0, 16) : '';
  const [start, setStart] = useState(toLocal(installation.scheduledStart));
  const [end, setEnd] = useState(toLocal(installation.scheduledEnd));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await updateInstallation(installation.id, {
        scheduledStart: start || undefined,
        scheduledEnd: end || undefined,
      });
      toast.success('Schedule updated');
      onSaved();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <section className="bg-white border rounded p-4 space-y-3 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500">Scheduled start</label>
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="border rounded px-2 py-1" />
        </div>
        <div>
          <label className="block text-xs text-slate-500">Scheduled end</label>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="border rounded px-2 py-1" />
        </div>
      </div>
      <button onClick={save} disabled={saving} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
        {saving ? 'Saving…' : 'Save schedule'}
      </button>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Installer & links tab
// ---------------------------------------------------------------------------

function LinksTab({ installation, links, onChange }: { installation: Installation; links: PublicCustomerLink[]; onChange: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(installation.installerName || '');
  const [phone, setPhone] = useState(installation.installerPhone || '');
  const [email, setEmail] = useState(installation.installerEmail || '');
  const [saving, setSaving] = useState(false);

  async function saveContact() {
    setSaving(true);
    try {
      await updateInstallation(installation.id, { installerName: name || undefined, installerPhone: phone || undefined, installerEmail: email || undefined });
      toast.success('Installer info updated');
      onChange();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch { toast.error('Could not copy to clipboard'); }
  }

  async function issueLink() {
    try {
      await createCustomerLink(installation.id, 'ALL');
      toast.success('New customer link issued');
      onChange();
    } catch (e: any) { toast.error(e?.response?.data?.message || 'Could not issue link'); }
  }

  async function revoke(linkId: string) {
    const ok = await confirm({ title: 'Revoke link?', message: 'The recipient will no longer be able to open it.', confirmLabel: 'Revoke', variant: 'danger' });
    if (!ok) return;
    try {
      await revokeCustomerLink(installation.id, linkId);
      toast.success('Link revoked');
      onChange();
    } catch { toast.error('Could not revoke link'); }
  }

  return (
    <div className="space-y-4">
      <section className="bg-white border rounded p-4 space-y-3 text-sm">
        <h3 className="font-semibold">Installer contact</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs text-slate-500">Name</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full border rounded px-2 py-1" maxLength={200} />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Phone</label>
            <input value={phone} onChange={e => setPhone(e.target.value)} className="w-full border rounded px-2 py-1" maxLength={50} />
          </div>
          <div>
            <label className="block text-xs text-slate-500">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded px-2 py-1" maxLength={200} />
          </div>
        </div>
        <button onClick={saveContact} disabled={saving} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save contact'}
        </button>
      </section>

      <section className="bg-white border rounded p-4 space-y-2 text-sm">
        <div className="flex items-center">
          <h3 className="font-semibold">Public customer links</h3>
          <button onClick={issueLink} className="ml-auto px-3 py-1.5 bg-brand-600 text-white rounded text-xs">+ New link</button>
        </div>
        {links.length === 0 ? (
          <p className="text-xs text-slate-500">No links issued yet. Issue one to share the install timeline with the end customer.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="py-1">Purpose</th>
                <th>Created</th>
                <th>Last viewed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {links.map(l => {
                const customerUrl = buildPublicCustomerUrl(installation.id, l.token);
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="py-1">{l.purpose}</td>
                    <td className="text-xs text-slate-500">{new Date(l.createdAt).toLocaleString()}</td>
                    <td className="text-xs text-slate-500">{l.lastViewedAt ? new Date(l.lastViewedAt).toLocaleString() : <span className="text-slate-400">never</span>}</td>
                    <td className="text-xs">
                      {l.revokedAt
                        ? <span className="text-red-700">Revoked</span>
                        : l.expiresAt && new Date(l.expiresAt).getTime() < Date.now()
                          ? <span className="text-amber-700">Expired</span>
                          : <span className="text-emerald-700">Active</span>}
                    </td>
                    <td className="text-right space-x-2">
                      {!l.revokedAt && (
                        <button onClick={() => copyUrl(customerUrl)} className="text-xs text-brand-700 hover:underline">Copy URL</button>
                      )}
                      {!l.revokedAt && (
                        <button onClick={() => revoke(l.id)} className="text-xs text-red-600 hover:underline">Revoke</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="text-[11px] text-slate-400">
          Installer links: {links.filter(l => !l.revokedAt).map(l => buildPublicInstallerUrl(installation.id, l.token)).map((u, i) => <span key={i} className="block truncate">{u}</span>)}
        </p>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Actions tab
// ---------------------------------------------------------------------------

function ActionsTab({ installation, onChanged }: { installation: Installation; onChanged: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const next = INSTALLATION_TRANSITIONS[installation.status] || [];

  async function doTransition(to: InstallationStatus) {
    if (to === 'CANCELLED') {
      const ok = await confirm({ title: 'Cancel installation?', message: 'This will close out the job without completing it.', confirmLabel: 'Cancel installation', variant: 'danger' });
      if (!ok) return;
    }
    setBusy(to);
    try {
      await transitionInstallation(installation.id, to);
      toast.success(`Marked as ${to}`);
      onChanged();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not transition');
    } finally { setBusy(null); }
  }

  if (next.length === 0) {
    return (
      <section className="bg-white border rounded p-6 text-center text-sm text-slate-500">
        This installation is closed ({installation.status}). No further transitions are allowed.
      </section>
    );
  }

  return (
    <section className="bg-white border rounded p-4 space-y-2">
      <p className="text-xs text-slate-500">
        Current status: <strong>{installation.status}</strong>. Allowed next steps:
      </p>
      <div className="flex flex-wrap gap-2">
        {next.map(to => (
          <button key={to} onClick={() => doTransition(to)} disabled={busy !== null}
            className={`px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 ${
              to === 'CANCELLED' ? 'bg-red-600 text-white' : 'bg-brand-600 text-white'
            }`}>
            {busy === to ? 'Working…' : `Mark ${to.replace(/_/g, ' ').toLowerCase()}`}
          </button>
        ))}
      </div>
    </section>
  );
}
