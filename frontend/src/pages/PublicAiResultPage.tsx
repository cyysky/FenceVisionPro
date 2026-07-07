import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getResult, getStatus } from '../lib/publicAi';

/**
 * Public, unauthenticated result page for the AI Yard Visualizer.
 * This is what the user sees AFTER the 3-step wizard submits.
 *
 * Three stages the user can be in:
 *   - PENDING: AI is rendering. Spinner + friendly "hold tight".
 *   - READY: AI render is shown side-by-side with their photo.
 *     The page also explains the B2B follow-up: a Yardex sales
 *     rep will email/call within 1 business day with a quote.
 *   - FAILED: friendly error + retry CTA.
 *
 * The "what happens next" panel is always visible at the bottom so
 * the user knows they don't just get the AI image - they also get
 * staff follow-up, which is the actual sales-led value prop of the
 * Yardex offering (vs Yardzen's B2C instant-render).
 */
export default function PublicAiResultPage() {
  const { id } = useParams<{ id: string }>();
  const [status, setStatus] = useState<string>('PENDING');
  const [renderUrl, setRenderUrl] = useState<string | null>(null);
  const [inputPhotoPath, setInputPhotoPath] = useState<string | null>(null);
  const [yardSide, setYardSide] = useState<string | null>(null);
  const [firstName, setFirstName] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  // One-shot fetch of the public result so we can show the
  // submitted photo alongside the AI render.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
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

  // Poll status every 5s while PENDING.
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

      <main className="max-w-4xl mx-auto px-4 pb-16 space-y-6">
        {/* Thank-you banner */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="text-sm font-medium text-brand-700">Thanks for your submission!</div>
          <h1 className="text-2xl font-bold text-slate-900 mt-1">
            {firstName ? `Hi ${firstName}, ` : ''}your {yardSide === 'BACK' ? 'back' : 'front'}-yard design is on its way.
          </h1>
          <p className="text-sm text-slate-600 mt-2">
            We're preparing an AI render of your yard with a Yardex fence, then one of our
            sales reps will email you with a tailored quote within one business day.
          </p>
        </div>

        {/* Render status card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          {err && <div className="text-sm text-red-600 mb-4">{err}</div>}

          {status === 'PENDING' && (
            <div className="py-12 text-center">
              <div className="inline-block w-12 h-12 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin mb-4" aria-label="Loading" />
              <div className="text-lg font-medium text-slate-800">Preparing your AI preview</div>
              <div className="text-sm text-slate-500 mt-1">This usually takes 30–90 seconds. Feel free to keep this tab open.</div>
            </div>
          )}

          {status === 'READY' && renderUrl && (
            <div>
              <div className="text-sm text-green-700 mb-3 font-medium">Your render is ready</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                <div>
                  <div className="text-xs font-medium text-slate-500 mb-2">Your yard</div>
                  {inputPhotoPath && (
                    <img src={inputPhotoPath} alt="Your yard" className="rounded-lg border w-full" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-medium text-brand-700 mb-2">AI preview</div>
                  <img src={renderUrl} alt="AI render preview" className="rounded-lg border w-full" />
                  <div className="text-xs text-slate-500 mt-2">
                    Right-click → "Save image as..." to keep a copy for reference.
                  </div>
                </div>
              </div>
            </div>
          )}

          {status === 'FAILED' && (
            <div className="py-12 text-center">
              <div className="text-3xl mb-2">😔</div>
              <div className="text-lg font-medium text-slate-800">Our rendering service is busy</div>
              <div className="text-sm text-slate-500 mt-1">
                Don't worry - we've still got your details. A sales rep will follow up
                with you by email within one business day.
              </div>
              <Link
                to="/ai-generate"
                className="inline-block mt-4 px-5 py-2 rounded-md bg-brand-600 text-white font-medium hover:bg-brand-700"
              >
                Submit another photo
              </Link>
            </div>
          )}
        </div>

        {/* Persistent "what happens next" panel */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-3">What happens next?</h2>
          <ol className="space-y-3 text-sm text-slate-700">
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-bold">1</span>
              <span><strong>Within minutes</strong> — your AI preview finishes rendering above.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-bold">2</span>
              <span><strong>Within 1 business day</strong> — a Yardex sales rep reviews the render and emails you a tailored quote with materials, lead times, and installation dates.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-bold">3</span>
              <span><strong>Confirm by phone or email</strong> — once you accept, we schedule a measurement visit and lock in your installation slot.</span>
            </li>
          </ol>
          <div className="mt-5 pt-5 border-t border-slate-100 text-xs text-slate-500">
            Reference: <span className="font-mono text-slate-700">{id}</span>
            {' · '}
            <Link to="/ai-generate" className="text-brand-700 hover:underline">Try another photo</Link>
          </div>
        </div>
      </main>
    </div>
  );
}