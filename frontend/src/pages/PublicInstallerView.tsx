import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  publicFetchPhotoBlob, publicGetInstallerView, publicPostInstallerEvent,
  publicUploadInstallerPhoto,
} from '../lib/installations';
import type { InstallationPhoto, InstallationPhotoKind, InstallationStatus } from '../lib/types';

/**
 * Public installer view. Mobile-first, no login.
 *
 * URL: /public/installation/:id/installer/:token
 *
 * The installer is scoped to "milestone updates only" - they can
 * check off KICKOFF / MATERIALS_RECEIVED / POSTS_SET / etc, and
 * upload photos. They CANNOT change the overall status directly
 * (the dealer does that), but they CAN fire "Mark Complete"
 * when the work is done in IN_PROGRESS.
 */
export default function PublicInstallerView() {
  const { id, token } = useParams<{ id: string; token: string }>();
  const [view, setView] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !token) return;
    publicGetInstallerView(id, token).then(setView).catch((e: any) => {
      setErr(e?.response?.data?.message || 'Link not found or expired');
    });
  }, [id, token]);

  if (err) {
    return (
      <div className="min-h-full grid place-items-center p-6">
        <div className="max-w-sm text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="text-sm text-slate-600">{err}</p>
          <p className="text-xs text-slate-400">Please contact your dealer for a new link.</p>
        </div>
      </div>
    );
  }

  if (!view) {
    return <div className="min-h-full grid place-items-center text-sm text-slate-500">Loading…</div>;
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-brand-600 grid place-items-center text-white font-bold text-xs">Y</div>
            <span className="font-bold text-sm">Yardex</span>
            <span className="text-[10px] text-slate-400 italic hidden sm:inline">Design To Inspire, Engineered to Endure.</span>
            <span className="ml-auto text-[10px] text-slate-400">Installer view</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <div className="text-base font-semibold">{view.quote?.reference || 'Installation'}</div>
            <div className="text-xs text-slate-500">· {lastName(view.quote?.customerName)}</div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={view.status} />
            {view.scheduledStart && (
              <span className="text-xs text-slate-600">Scheduled: {new Date(view.scheduledStart).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {view.nextActions?.length > 0 && (
          <section className="bg-white border rounded p-3 space-y-2">
            <h2 className="text-sm font-semibold">Check off a milestone</h2>
            {view.nextActions.map((t: string) => (
              <MilestoneRow
                key={t}
                type={t}
                onSubmit={async (note) => {
                  setBusy(true);
                  try {
                    await publicPostInstallerEvent(id!, token!, t, note);
                    const fresh = await publicGetInstallerView(id!, token!);
                    setView(fresh);
                  } catch (e: any) {
                    setErr(e?.response?.data?.message || 'Could not save');
                  } finally { setBusy(false); }
                }}
                disabled={busy}
              />
            ))}
          </section>
        )}

        {view.status === 'IN_PROGRESS' && (
          <section className="bg-white border rounded p-3">
            <h2 className="text-sm font-semibold mb-2">Done with the work?</h2>
            <button
              onClick={async () => {
                setBusy(true);
                try {
                  await publicPostInstallerEvent(id!, token!, 'COMPLETED', 'Installer marked complete');
                  const fresh = await publicGetInstallerView(id!, token!);
                  setView(fresh);
                } catch (e: any) { setErr(e?.response?.data?.message || 'Could not mark complete'); }
                finally { setBusy(false); }
              }}
              disabled={busy}
              className="w-full px-3 py-2.5 bg-emerald-600 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              ✓ Mark Complete
            </button>
            <p className="text-[11px] text-slate-500 mt-1">The dealer + customer will be notified.</p>
          </section>
        )}

        <UploadSection
          id={id!}
          token={token!}
          onUploaded={async () => {
            const fresh = await publicGetInstallerView(id!, token!);
            setView(fresh);
          }}
        />

        {view.photos?.length > 0 && (
          <section className="bg-white border rounded p-3 space-y-3">
            <h2 className="text-sm font-semibold">Photos on file</h2>
            <div className="grid grid-cols-3 gap-2">
              {view.photos.map((p: InstallationPhoto) => <PublicPhotoTile key={p.id} id={id!} token={token!} photo={p} />)}
            </div>
          </section>
        )}

        {view.events?.length > 0 && (
          <section className="bg-white border rounded p-3 space-y-2">
            <h2 className="text-sm font-semibold">Activity so far</h2>
            <ol className="space-y-1.5 text-xs">
              {view.events.map((e: any) => (
                <li key={e.id} className="flex items-start gap-2">
                  <span className="text-base leading-none">{EVENT_ICONS[e.type] || '•'}</span>
                  <div className="flex-1">
                    <div className="font-medium">{humanize(e.type)} <span className="text-slate-500 font-normal">· {e.actorLabel || e.actorKind}</span></div>
                    {e.note && <div className="text-slate-600 whitespace-pre-wrap">{e.note}</div>}
                  </div>
                  <time className="text-slate-400 whitespace-nowrap">{new Date(e.occurredAt).toLocaleString()}</time>
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="text-center text-[10px] text-slate-400 pt-4 pb-2">
          Powered by Yardex · Installer link
        </div>
      </main>
    </div>
  );
}

function lastName(fullName?: string | null): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] || fullName;
}

const STATUS_COLORS: Record<string, string> = {
  SCHEDULED: 'bg-slate-100 text-slate-700',
  MATERIALS_ORDERED: 'bg-amber-100 text-amber-700',
  IN_PROGRESS: 'bg-sky-100 text-sky-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  INSPECTED: 'bg-emerald-700 text-white',
  CANCELLED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: InstallationStatus }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[status] || 'bg-slate-100'}`}>{status.replace(/_/g, ' ')}</span>;
}

const EVENT_ICONS: Record<string, string> = {
  SCHEDULED: '📅', KICKOFF: '🚧', MATERIALS_ORDERED: '🛒', MATERIALS_RECEIVED: '📦',
  POSTS_SET: '🪵', PANELS_HUNG: '🧱', GATE_INSTALLED: '🚪', PHOTO_UPLOADED: '📷',
  NOTE_ADDED: '✏️', IN_PROGRESS: '🔨', COMPLETED: '✅', INSPECTED: '🏁',
  CUSTOMER_APPROVED: '👍', CANCELLED: '❌', PUBLIC_LINK_ISSUIED: '🔗',
};

function humanize(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
}

function MilestoneRow({ type, onSubmit, disabled }: { type: string; onSubmit: (note: string) => Promise<void> | void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="border rounded p-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          disabled={disabled || busy}
          onChange={async e => {
            if (!e.target.checked) { setOpen(false); return; }
            setOpen(true);
          }}
        />
        <span>{humanize(type)}</span>
      </label>
      {open && (
        <div className="mt-2 space-y-2">
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={2000}
            placeholder="Optional note (e.g. 12 panels set, 1 gate to go)" className="w-full border rounded p-2 text-sm" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setOpen(false); setNote(''); }} className="px-2 py-1 text-xs border rounded">Cancel</button>
            <button
              onClick={async () => {
                setBusy(true);
                try { await onSubmit(note); setOpen(false); setNote(''); }
                finally { setBusy(false); }
              }}
              disabled={busy}
              className="px-2 py-1 text-xs bg-brand-600 text-white rounded disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadSection({ id, token, onUploaded }: { id: string; token: string; onUploaded: () => Promise<void> | void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<InstallationPhotoKind>('DURING');
  const [caption, setCaption] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function pick(file: File) {
    setErr(null);
    setBusy(true);
    try {
      await publicUploadInstallerPhoto(id, token, file, kind, caption || undefined);
      setCaption('');
      await onUploaded();
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Upload failed');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <section className="bg-white border rounded p-3 space-y-2">
      <h2 className="text-sm font-semibold">Add a photo</h2>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <div>
          <label className="block text-slate-500">Kind</label>
          <select value={kind} onChange={e => setKind(e.target.value as InstallationPhotoKind)} className="border rounded px-2 py-1 text-sm">
            {(['BEFORE', 'DURING', 'AFTER', 'ISSUE'] as InstallationPhotoKind[]).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-slate-500">Caption</label>
          <input value={caption} onChange={e => setCaption(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" maxLength={500} />
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
        onChange={e => { const f = e.target.files?.[0]; if (f) pick(f); }}
        className="block w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:border-0 file:rounded file:bg-brand-600 file:text-white" />
      {busy && <div className="text-xs text-slate-500">Uploading…</div>}
      {err && <div className="text-xs text-red-700">{err}</div>}
    </section>
  );
}

function PublicPhotoTile({ id, token, photo }: { id: string; token: string; photo: InstallationPhoto }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (photo.mimeType.startsWith('image/')) {
      publicFetchPhotoBlob(id, photo.id, token)
        .then(blob => { if (!cancelled) { url = URL.createObjectURL(blob); setThumb(url); } })
        .catch(() => { /* ignore */ });
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [id, token, photo.id, photo.mimeType]);
  return (
    <div className="aspect-square bg-slate-100 rounded overflow-hidden">
      {thumb ? <img src={thumb} alt={photo.originalFilename} className="w-full h-full object-cover" /> : <div className="w-full h-full grid place-items-center text-slate-400 text-xs">…</div>}
    </div>
  );
}
