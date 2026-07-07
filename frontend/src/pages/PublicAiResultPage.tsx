import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getResult, getStatus } from '../lib/publicAi';

/**
 * Public, unauthenticated result page. Polls /status every 5 s
 * while the render is PENDING. When READY shows the AI image;
 * when FAILED shows a friendly error + a "submit another photo"
 * link back to /ai-generate.
 *
 * The customer's submitted photo is shown smaller on the right so
 * they can compare.
 */
export default function PublicAiResultPage() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<string>('PENDING');
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [inputPhotoPath, setInputPhotoPath] = useState<string | null>(null);
  const [yardSide, setYardSide] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    // One-shot fetch of the public result so we can show the
    // submitted photo alongside the AI render.
    getResult(id).then(r => {
      if (cancelled) return;
      setInputPhotoPath(r.inputPhotoPath);
      setYardSide(r.yardSide);
      setStatus(r.status);
      setRenderUrl(r.renderUrl || null);
    }).catch(e => {
      if (cancelled) return;
      setErr(e?.response?.data?.message || 'Could not load your result');
    });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!id) return;
    if (status !== 'PENDING') return;
    pollTimer.current = window.setInterval(async () => {
      try {
        const s = await getStatus(id);
        setStatus(s.status);
        setRenderUrl(s.renderUrl || null);
      } catch {
        // swallow - next poll will retry
      }
    }, 5000);
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
  }, [id, status]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="max-w-4xl mx-auto px-4 py-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-brand-600 grid place-items-center text-white font-bold">Y</div>
        <div className="font-bold text-lg">Yardex AI Yard Visualizer</div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pb-16">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {err && <div className="text-sm text-red-600 mb-4">{err}</div>}

          {status === 'PENDING' && (
            <div className="py-12 text-center">
              <div className="inline-block w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" aria-label="Loading" />
              <div className="text-lg font-medium text-slate-800">Your render is being prepared</div>
              <div className="text-sm text-slate-500 mt-1">This usually takes 30–90 seconds. Feel free to keep this tab open.</div>
            </div>
          )}

          {status === 'READY' && renderUrl && (
            <div>
              <div className="text-sm text-green-700 mb-3">Your render is ready!</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-2">Your yard</div>
                  {inputPhotoPath && (
                    <img src={inputPhotoPath} alt="Your yard" className="rounded-lg border w-full" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium text-brand-700 mb-2">AI render</div>
                  <img src={renderUrl} alt="AI render preview" className="rounded-lg border w-full" />
                  <div className="text-xs text-slate-500 mt-2">
                    Right-click the image → "Save image as..." to keep a copy.
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-center justify-between">
                <div className="text-xs text-slate-400">Lead ID: {id}</div>
                <Link to="/ai-generate" className="text-sm text-brand-700 hover:underline">Try another photo</Link>
              </div>
            </div>
          )}

          {status === 'FAILED' && (
            <div className="py-12 text-center">
              <div className="text-3xl mb-2">😔</div>
              <div className="text-lg font-medium text-slate-800">Our rendering service is busy</div>
              <div className="text-sm text-slate-500 mt-1">Please try again in a few minutes.</div>
              <Link
                to="/ai-generate"
                className="inline-block mt-4 px-5 py-2 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700"
              >
                Submit another photo
              </Link>
            </div>
          )}
        </div>

        <div className="mt-6 text-xs text-slate-400">
          {yardSide && <>Yard side: {yardSide.toLowerCase()}</>}
        </div>
      </main>
    </div>
  );
}
