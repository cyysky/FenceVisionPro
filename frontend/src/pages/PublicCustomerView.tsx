import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  publicFetchPhotoBlob, publicGetCustomerView, publicPostCustomerApprove,
} from '../lib/installations';
import { useToast } from '../components/ui/Toast';
import type { InstallationPhoto, InstallationStatus } from '../lib/types';

/**
 * Public customer view. Mobile-first, no login, no edit.
 *
 * URL: /public/installation/:id/customer/:linkToken
 *
 * Shows a read-only timeline of events + a photo gallery +
 * a sign-off canvas when the installation is COMPLETED. On
 * sign-off the canvas dataURL is POSTed to
 * /public/installation/:id/customer/:token/approve.
 */
export default function PublicCustomerView() {
  const { id, linkToken } = useParams<{ id: string; linkToken: string }>();
  const toast = useToast();
  const [view, setView] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const [comment, setComment] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    if (!id || !linkToken) return;
    publicGetCustomerView(id, linkToken).then(v => {
      setView(v);
      if (v.status === 'INSPECTED') setDone(true);
    }).catch((e: any) => {
      setErr(e?.response?.data?.message || 'Link not found or expired');
    });
  }, [id, linkToken]);

  // Reset + prep the canvas whenever the sign-off panel becomes visible.
  useEffect(() => {
    if (view && view.canSignOff && !done) prepareCanvas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.canSignOff, done]);

  function prepareCanvas() {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4); ctx.setLineDash([]);
    setHasInk(false);
  }

  function pos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as any).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as any).clientY;
    const sx = c.width / Math.max(r.width, 1);
    const sy = c.height / Math.max(r.height, 1);
    return { x: (clientX - r.left) * sx, y: (clientY - r.top) * sy };
  }
  function start(e: any) {
    e.preventDefault?.();
    drawing.current = true; setHasInk(true);
    const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e); lastPt.current = p;
    ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  function end() { drawing.current = false; lastPt.current = null; }
  function draw(e: any) {
    if (!drawing.current) return;
    e.preventDefault?.();
    const ctx = canvasRef.current!.getContext('2d')!; const p = pos(e);
    const prev = lastPt.current || p;
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    lastPt.current = p;
  }
  function inkCount(): number {
    const c = canvasRef.current!; if (!c) return 0;
    const ctx = c.getContext('2d')!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (data[i] < 200 || data[i+1] < 200 || data[i+2] < 200) n++;
    return n;
  }

  async function approve() {
    const ink = inkCount();
    if (ink < 200) { setErr(`Please sign before approving (only ${ink} ink pixels).`); return; }
    setErr(null); setSigning(true);
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    try {
      const fresh = await publicPostCustomerApprove(id!, linkToken!, dataUrl, comment || undefined);
      setView(fresh); setDone(true); toast.success('Thank you - sign-off recorded');
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Could not record sign-off');
    } finally { setSigning(false); }
  }

  if (err && !view) {
    return (
      <div className="min-h-full grid place-items-center p-6">
        <div className="max-w-sm text-center space-y-2">
          <div className="text-4xl">🔒</div>
          <h1 className="text-lg font-semibold">Link unavailable</h1>
          <p className="text-sm text-slate-600">{err}</p>
        </div>
      </div>
    );
  }
  if (!view) return <div className="min-h-full grid place-items-center text-sm text-slate-500">Loading…</div>;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-brand-600 grid place-items-center text-white font-bold text-xs">F</div>
            <span className="font-bold text-sm">FenceVisionPro</span>
            <span className="ml-auto text-[10px] text-slate-400">Customer view</span>
          </div>
          <h1 className="mt-2 text-base font-semibold">Your fence installation progress</h1>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <StatusBadge status={view.status} />
            {view.installerName && <span className="text-xs text-slate-600">Installer: {view.installerName}</span>}
            {view.quote?.reference && <span className="text-xs text-slate-500">· {view.quote.reference}</span>}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-4 space-y-4">
        {view.quote?.projectAddress && (
          <section className="bg-white border rounded p-3 text-sm">
            <div className="text-xs text-slate-500">Site address</div>
            <div>{view.quote.projectAddress}</div>
          </section>
        )}

        <section className="bg-white border rounded p-3 space-y-2">
          <h2 className="text-sm font-semibold">Timeline</h2>
          {view.events.length === 0 ? (
            <p className="text-xs text-slate-500">No updates yet.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {view.events.map((e: any) => (
                <li key={e.id} className="flex items-start gap-2">
                  <span className="text-base leading-none">{EVENT_ICONS[e.type] || '•'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{humanize(e.type)}</div>
                    {e.note && <div className="text-xs text-slate-600 whitespace-pre-wrap">{e.note}</div>}
                  </div>
                  <time className="text-xs text-slate-400 whitespace-nowrap">{new Date(e.occurredAt).toLocaleDateString()}</time>
                </li>
              ))}
            </ol>
          )}
        </section>

        {view.photos.length > 0 && (
          <section className="bg-white border rounded p-3 space-y-3">
            <h2 className="text-sm font-semibold">Photos</h2>
            {(['BEFORE', 'DURING', 'AFTER', 'ISSUE'] as const).map(k => {
              const list = view.photos.filter((p: InstallationPhoto) => p.kind === k);
              if (!list.length) return null;
              return (
                <div key={k}>
                  <div className="text-xs font-medium text-slate-600 mb-1">{k}</div>
                  <div className="grid grid-cols-3 gap-2">
                    {list.map((p: InstallationPhoto) => <PublicPhotoTile key={p.id} id={id!} token={linkToken!} photo={p} />)}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {done && (
          <section className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded p-4 text-sm text-center space-y-1">
            <div className="text-2xl">✅</div>
            <div className="font-semibold">Thank you — installation completed on {view.inspectedAt ? new Date(view.inspectedAt).toLocaleDateString() : 'today'}.</div>
            <p className="text-xs">The wholesaler has been notified of your sign-off.</p>
          </section>
        )}

        {view.canSignOff && !done && (
          <section className="bg-white border rounded p-3 space-y-2">
            <h2 className="text-sm font-semibold">Approve &amp; sign off</h2>
            <p className="text-xs text-slate-500">The installer has marked the work as complete. Please review and sign below to confirm.</p>
            <div className="border-2 border-dashed border-slate-300 rounded bg-white">
              <canvas ref={canvasRef} width={600} height={180} aria-label="Signature pad"
                className="w-full touch-none rounded"
                onMouseDown={start} onMouseUp={end} onMouseMove={draw} onMouseLeave={end}
                onTouchStart={start} onTouchEnd={end} onTouchMove={draw} />
            </div>
            {!hasInk && <p className="text-xs text-slate-500 text-center">✍ Sign here</p>}
            <textarea value={comment} onChange={e => setComment(e.target.value)} maxLength={2000}
              placeholder="Optional comment for the wholesaler…" className="w-full border rounded p-2 text-sm" rows={2} />
            <div className="flex gap-2 justify-end">
              <button onClick={prepareCanvas} className="px-3 py-1.5 border rounded text-sm">Clear</button>
              <button onClick={approve} disabled={signing} className="px-4 py-2 bg-emerald-600 text-white rounded text-sm font-medium disabled:opacity-50">
                {signing ? 'Submitting…' : '✓ Approve & Sign Off'}
              </button>
            </div>
            {err && <div className="text-xs text-red-700">{err}</div>}
          </section>
        )}

        {view.status === 'CANCELLED' && (
          <section className="bg-red-50 border border-red-200 text-red-800 rounded p-3 text-sm">
            This installation was cancelled. Please contact your wholesaler to discuss next steps.
          </section>
        )}

        <div className="text-center text-[10px] text-slate-400 pt-4 pb-2">
          Powered by FenceVisionPro · Customer view
        </div>
      </main>
    </div>
  );
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
