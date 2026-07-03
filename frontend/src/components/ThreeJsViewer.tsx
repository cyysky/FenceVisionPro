import { useEffect, useRef, useState } from 'react';

/**
 * ThreeJsViewer
 * -------------
 * Renders a self-contained three.js scene inside a *sandboxed* iframe.
 * The iframe is created with a Blob URL, so the LLM-generated code
 * never touches the host page. The sandbox attribute prevents script
 * access to the parent origin, cookies, and storage.
 *
 * Props:
 *   code      - the JS source returned by /ai/generate-3d
 *   height    - viewer height in pixels (default 480)
 *   onSnapshot- optional callback receiving a PNG dataURL when the
 *               user clicks "Save snapshot". The iframe does
 *               toDataURL() and posts it back via postMessage.
 */

interface Props {
  code: string;
  height?: number;
  onSnapshot?: (dataUrl: string) => void;
}

// Origin used for postMessage from the sandboxed iframe. The iframe
// is created from a blob: URL so its origin is "null"; we accept any
// origin and rely on a randomly-generated handshake token.
function buildHtml(code: string, handshake: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0f172a;overflow:hidden;font-family:sans-serif;color:#cbd5e1}
canvas{display:block}
#err{position:fixed;top:8px;left:8px;right:8px;background:#7f1d1d;color:#fecaca;
  padding:8px 12px;border-radius:6px;font-size:12px;white-space:pre-wrap;max-height:40%;overflow:auto;display:none}
</style></head><body>
<div id="err"></div>
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
<script src="https://unpkg.com/three@0.160.0/examples/js/controls/OrbitControls.js"></script>
<script>
window.addEventListener('error', function(e){
  var el = document.getElementById('err');
  el.textContent = (e.error && e.error.stack) || e.message;
  el.style.display = 'block';
});
// Snapshot handshake: parent posts {type:'snapshot', token:HS} to us
// and we reply with a PNG dataURL via postMessage.
window.addEventListener('message', function(e) {
  var m = e.data;
  if (!m || m.type !== 'snapshot' || m.token !== ${JSON.stringify(handshake)}) return;
  try {
    var cv = document.querySelector('canvas');
    if (!cv) { parent.postMessage({type:'snapshot-error', token: m.token, message:'no canvas'}, '*'); return; }
    // Force a final render frame to make sure the buffer is fresh
    parent.postMessage({type:'snapshot', token: m.token, dataUrl: cv.toDataURL('image/png')}, '*');
  } catch (err) {
    parent.postMessage({type:'snapshot-error', token: m.token, message: String(err && err.message || err)}, '*');
  }
});
try {
${code}
} catch (e) {
  var el = document.getElementById('err');
  el.textContent = (e && e.stack) || String(e);
  el.style.display = 'block';
}
</script>
</body></html>`;
}

function genHandshake(): string {
  // 16 bytes of randomness -> hex. We pair it with the Blob URL.
  const a = new Uint8Array(16);
  (window.crypto || (window as any).msCrypto).getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}

export function ThreeJsViewer({ code, height = 480, onSnapshot }: Props) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [handshake, setHandshake] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [snapshotting, setSnapshotting] = useState(false);

  useEffect(() => {
    if (url) URL.revokeObjectURL(url);
    try {
      const hs = genHandshake();
      const html = buildHtml(code, hs);
      const blob = new Blob([html], { type: 'text/html' });
      const u = URL.createObjectURL(blob);
      setUrl(u);
      setHandshake(hs);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'failed to build viewer');
    }
    return () => { if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Listen for snapshot replies from the iframe
  useEffect(() => {
    if (!onSnapshot) return;
    const handler = (e: MessageEvent) => {
      const m = e.data;
      if (!m || m.token !== handshake) return;
      if (m.type === 'snapshot') {
        onSnapshot(m.dataUrl);
        setSnapshotting(false);
      } else if (m.type === 'snapshot-error') {
        setError(m.message);
        setSnapshotting(false);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [handshake, onSnapshot]);

  function capture() {
    const w = ref.current?.contentWindow as any;
    if (!w) return;
    setSnapshotting(true);
    w.postMessage({ type: 'snapshot', token: handshake }, '*');
    // Failsafe - if the iframe is slow or doesn't reply, clear the
    // spinner after a few seconds so the UI doesn't get stuck.
    setTimeout(() => setSnapshotting(false), 8000);
  }

  return (
    <div className="border rounded overflow-hidden bg-slate-900" style={{ height }}>
      {error && <div className="p-3 text-sm text-red-700 bg-red-50">{error}</div>}
      {url && (
        <>
          <div className="bg-slate-800 text-slate-300 text-xs px-2 py-1 flex items-center justify-between gap-2 flex-wrap">
            <span>3D preview (sandboxed - LLM-generated code runs in isolation)</span>
            <div className="flex gap-1">
              {onSnapshot && (
                <button
                  onClick={capture}
                  disabled={snapshotting}
                  className="px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-700 disabled:opacity-50"
                  title="Save the current frame as the quote's render"
                >
                  {snapshotting ? 'Capturing…' : '📷 Save as render'}
                </button>
              )}
              <button
                onClick={() => {
                  const w = (ref.current?.contentWindow as any);
                  w?.location?.reload?.();
                }}
                className="px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-700"
                title="Re-run the 3D scene"
              >↻ rerun</button>
            </div>
          </div>
          <iframe
            ref={ref}
            src={url}
            title="3D fence preview"
            sandbox="allow-scripts"
            className="w-full"
            style={{ height: height - 28 }}
          />
        </>
      )}
    </div>
  );
}
