import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { ThreeJsViewer } from './ThreeJsViewer';

interface Props {
  style: string;       // design name
  color: string;       // e.g. "Black"
  heightFt: number;    // e.g. 6
  panelCount?: number;
  gateCount?: number;
  onImage?: (url: string) => void;     // called with a server-side URL (server-rendered AI image)
  onSnapshot?: (dataUrl: string) => void; // called with a data: URL when 3D snapshot is captured
  quoteId?: string;                   // if provided, the snapshot is POSTed to the backend
}

/**
 * Renders the AI controls: status, "Generate AI image" button, and
 * "Generate 3D scene" button. The 3D scene is shown inline in a
 * sandboxed iframe once it loads; users can also capture the 3D
 * frame as the quote's persisted render.
 */
export function AiControls({ style, color, heightFt, panelCount, gateCount, onImage, onSnapshot, quoteId }: Props) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState<'image' | '3d' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);

  useEffect(() => {
    api.get('/ai/status')
      .then(r => setEnabled(r.data.enabled))
      .catch(() => setEnabled(false));
  }, []);

  async function genImage() {
    setBusy('image'); setErr(null);
    try {
      const { data } = await api.post('/ai/render-image', { style, color, heightFt, panelCount, gateCount });
      setImageUrl(data.url);
      onImage?.(data.url);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'AI image generation failed');
    } finally { setBusy(null); }
  }
  async function gen3d() {
    setBusy('3d'); setErr(null);
    try {
      const { data } = await api.post('/ai/generate-3d', { style, color, heightFt, panelCount, gateCount });
      setCode(data.code);
    } catch (e: any) {
      setErr(e?.response?.data?.message || '3D generation failed');
    } finally { setBusy(null); }
  }

  /**
   * Called by the ThreeJsViewer when the user captures a frame.
   * If we have a quoteId we POST it to the backend so the URL is
   * persisted; otherwise we just forward the data URL to the parent.
   */
  async function handleSnapshot(dataUrl: string) {
    setSnapshotBusy(true);
    setErr(null);
    try {
      if (quoteId) {
        const { data } = await api.post(`/quotes/${quoteId}/snapshot`, { dataUrl });
        setSnapshotUrl(data.url);
        onImage?.(data.url);
      } else {
        setSnapshotUrl(dataUrl);
        onSnapshot?.(dataUrl);
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Could not save snapshot');
    } finally { setSnapshotBusy(false); }
  }

  if (enabled === null) return null;
  if (!enabled) {
    return (
      <div className="p-2 text-xs text-slate-500 bg-slate-50 border rounded">
        AI is disabled. Set <code>AI_ENABLED=true</code> in <code>.env</code> to enable photorealistic rendering and 3D scenes.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {err && <div className="p-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded">{err}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={genImage} disabled={busy !== null}
          className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
          {busy === 'image' ? 'Generating image…' : '✨ AI render image'}
        </button>
        <button onClick={gen3d} disabled={busy !== null}
          className="px-3 py-1.5 bg-slate-700 text-white rounded text-sm disabled:opacity-50">
          {busy === '3d' ? 'Generating 3D scene…' : '🧊 Generate 3D scene'}
        </button>
        {snapshotBusy && <span className="text-xs text-slate-500">saving snapshot…</span>}
        {snapshotUrl && !snapshotBusy && <span className="text-xs text-emerald-700">✓ snapshot saved</span>}
      </div>
      {imageUrl && (
        <div>
          <div className="text-xs text-slate-500 mb-1">AI-generated preview</div>
          <img src={imageUrl} alt="AI render" className="w-full rounded border" />
        </div>
      )}
      {code && (
        <div>
          <div className="text-xs text-slate-500 mb-1">3D preview (sandboxed)</div>
          <ThreeJsViewer code={code} height={420} onSnapshot={handleSnapshot} />
          <p className="text-[11px] text-slate-500 mt-1">Tip: adjust the camera, then click <strong>📷 Save as render</strong> to attach the current frame to this quote.</p>
        </div>
      )}
    </div>
  );
}
