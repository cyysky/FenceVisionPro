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

/**
 * Names of variables we expect the LLM-generated three.js code to
 * declare at the top level. The host wrapper rewrites their
 * declarations into `window.NAME = ...` so the auto-orbit IIFE
 * can find the camera / renderer / scene / controls even when
 * the model uses block-scoped `const` / `let`.
 */
const HOST_HOISTED_VARS = ['camera', 'renderer', 'scene', 'controls'];

/**
 * Rewrite top-level declarations of the host-hoisted variable
 * names so they become assignments to `window.NAME`. We only
 * touch lines that START with `const|let|var NAME =` (no
 * leading whitespace) so we don't accidentally rewrite
 * function-local declarations.
 */
function hoistHostVars(code: string): string {
  let out = code;
  for (const name of HOST_HOISTED_VARS) {
    // 1) Declaration: `const NAME = ...`, `let NAME = ...`,
    //    `var NAME = ...` at the start of a line.
    const re = new RegExp(
      '^(const|let|var)\\s+' + name + '\\s*=',
      'gm',
    );
    out = out.replace(re, 'window.' + name + ' =');
    // 2) Bare assignment: `NAME = ...` at the start of a line
    //    (the model often declares `let NAME;` first and
    //    assigns later). Skip if we already prefixed it.
    const re2 = new RegExp('^' + name + '\\s*=', 'gm');
    out = out.replace(re2, (m) => m.startsWith('window.') ? m : 'window.' + m);
  }
  return out;
}

function buildHtml(code: string, handshake: string): string {
  const hoisted = hoistHostVars(code);
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
// Snapshot path: requires the handshake token (echoes canvas
// bytes back to the parent).
window.addEventListener('message', function(e) {
  var m = e.data;
  if (!m) return;
  if (m.type === 'snapshot' && m.token === ${JSON.stringify(handshake)}) {
    try {
      var cv = document.querySelector('canvas');
      if (!cv) { parent.postMessage({type:'snapshot-error', token: m.token, message:'no canvas'}, '*'); return; }
      parent.postMessage({type:'snapshot', token: m.token, dataUrl: cv.toDataURL('image/png')}, '*');
    } catch (err) {
      parent.postMessage({type:'snapshot-error', token: m.token, message: String(err && err.message || err)}, '*');
    }
    return;
  }
  // Viewer control commands (no handshake needed: they only
  // mutate local camera state, they don't exfiltrate data).
  if (m.type === 'reset-view' || m.type === 'reset-zoom' || m.type === 'toggle-orbit') {
    try { applyViewerCommand(m.type); } catch (err) { /* ignore */ }
    return;
  }
});

/**
 * Apply a viewer-control command to the scene's camera/controls.
 * Reads the hoisted window.camera / window.controls set up by
 * the auto-attach IIFE further down. We store the initial
 * camera position the first time the user invokes 'reset-view'
 * so reset always returns to the model's intended framing.
 */
var __initialCamPos = null;
var __initialTarget = null;
// Mirrored on window so the render-loop IIFE can read it.
window.__fvpAutoOrbit = window.__fvpAutoOrbit || false;
function applyViewerCommand(cmd) {
  var cam = window.camera, c = window.__fvpControls;
  if (cmd === 'reset-view' || cmd === 'reset-zoom') {
    if (!cam) return;
    if (!__initialCamPos) {
      __initialCamPos = cam.position.clone();
    }
    if (!__initialTarget && c && c.target) {
      __initialTarget = c.target.clone();
    }
    if (cmd === 'reset-view' && __initialTarget && c) {
      c.target.copy(__initialTarget);
    }
    cam.position.copy(__initialCamPos);
    cam.lookAt(c && c.target ? c.target : new window.THREE.Vector3(0, 0, 0));
    if (c) { c.update(); }
    return;
  }
  if (cmd === 'toggle-orbit') {
    window.__fvpAutoOrbit = !window.__fvpAutoOrbit;
  }
}
try {
${hoisted}
} catch (e) {
  var el = document.getElementById('err');
  el.textContent = (e && e.stack) || String(e);
  el.style.display = 'block';
}

/**
 * Auto-attach OrbitControls. The LLM-generated code has been
 * hoisted (camera / renderer / scene / controls -> window.*)
 * so we can read them here. We try once immediately, then keep
 * trying for up to 3s in case the LLM constructs them
 * asynchronously (e.g. inside an init() or setTimeout).
 *
 * If the LLM code already wired up its own OrbitControls we
 * reuse it; otherwise we create one and drive the render loop
 * ourselves.
 */
(function() {
  function attach() {
    try {
      var cam = window.camera;
      var ren = window.renderer;
      if (!cam || !ren || !window.THREE || !window.THREE.OrbitControls) return false;
      if (window.__fvpControls) return true;
      var c = window.controls || new window.THREE.OrbitControls(cam, ren.domElement);
      c.enableDamping = true;
      c.dampingFactor = 0.08;
      // Aim the controls at the centre of the scene if we can
      // find one, otherwise the world origin.
      try {
        var s = window.scene;
        if (s) {
          var box = new window.THREE.Box3().setFromObject(s);
          if (box.isEmpty() === false) {
            var centre = new window.THREE.Vector3();
            box.getCenter(centre);
            c.target.copy(centre);
          }
        }
      } catch (e) { /* ignore */ }
      c.update();
      window.__fvpControls = c;
      if (!window.__fvpHasAnimate) {
        // Our own render loop. We drive controls.update() and,
        // if the dealer has toggled auto-orbit, rotate the
        // camera around the controls.target so the scene
        // demonstrates itself.
        var cam = window.camera;
        var tick = function() {
          if (window.__fvpAutoOrbit && cam && c) {
            var t = c.target;
            var dx = cam.position.x - t.x;
            var dz = cam.position.z - t.z;
            var r = Math.sqrt(dx * dx + dz * dz);
            var a = Math.atan2(dz, dx) + 0.005;
            cam.position.x = t.x + Math.cos(a) * r;
            cam.position.z = t.z + Math.sin(a) * r;
            cam.lookAt(t);
          }
          c.update();
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
      return true;
    } catch (e) { return false; }
  }
  if (!attach()) {
    var tries = 0;
    var iv = setInterval(function() {
      tries++;
      if (attach() || tries > 30) clearInterval(iv);
    }, 100);
  }
})();
</script>
</body></html>`;
}

/**
 * Send a control command to the sandboxed iframe. The iframe's
 * message handler picks it up and applies it (reset camera,
 * re-centre on the scene, etc.). The handshake is the same
 * token the iframe's buildHtml() baked in - we use it so the
 * iframe only honours commands from this viewer instance, not
 * from random postMessage on the page.
 */


function genHandshake(): string {
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
    setTimeout(() => setSnapshotting(false), 8000);
  }

  /**
   * Send a control command to the sandboxed iframe. The
   * iframe's message handler picks it up and applies it
   * (reset camera, re-centre on the scene, etc.). The
   * snapshot path is the one that needs the handshake token
   * (it returns bytes to the parent); these UI controls are
   * convenience commands and do not echo anything back.
   */
  function postViewerCommand(cmd: { type: 'reset-view' | 'reset-zoom' | 'toggle-orbit' }) {
    const w = ref.current?.contentWindow as any;
    if (!w) return;
    w.postMessage(cmd, '*');
  }

  return (
    <div className="border rounded overflow-hidden bg-slate-900" style={{ height }}>
      {error && <div className="p-3 text-sm text-red-700 bg-red-50">{error}</div>}
      {url && (
        <>
          <div className="bg-slate-800 text-slate-300 text-xs px-2 py-1 flex items-center justify-between gap-2 flex-wrap">
            <span>3D preview · drag to orbit · scroll to zoom · right-drag to pan</span>
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
                onClick={() => postViewerCommand({ type: 'reset-view' })}
                className="px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-700"
                title="Re-centre the camera on the scene"
              >⌖ reset view</button>
              <button
                onClick={() => postViewerCommand({ type: 'reset-zoom' })}
                className="px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-700"
                title="Reset the zoom level to the default"
              >🔍 reset zoom</button>
              <button
                onClick={() => postViewerCommand({ type: 'toggle-orbit' })}
                className="px-2 py-0.5 rounded border border-slate-600 hover:bg-slate-700"
                title="Toggle automatic camera rotation around the scene"
              >↺ auto-orbit</button>
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
