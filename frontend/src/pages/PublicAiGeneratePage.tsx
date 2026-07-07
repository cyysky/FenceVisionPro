import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getConfig, submitFromGallery, submitUpload } from '../lib/publicAi';
import { apiErrorMessage } from '../lib/api';
import { PublicYardSelector, PublicYardSide } from '../components/PublicYardSelector';
import { PublicPhotoInput, PublicPhotoValue } from '../components/PublicPhotoInput';

/**
 * Public, unauthenticated AI Yard Visualizer. Three steps:
 *  1. Yard side (front / back)
 *  2. Photo input (upload OR gallery)
 *  3. Contact info (email OR phone)
 *
 * No header / sidebar - matches the /approve/:id and
 * /public/installation/... look-and-feel so visitors don't see
 * the admin chrome.
 */
export default function PublicAiGeneratePage() {
  const nav = useNavigate();
  const [yardSide, setYardSide] = useState<PublicYardSide | null>(null);
  const [photo, setPhoto] = useState<PublicPhotoValue | null>(null);
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [designStyle, setDesignStyle] = useState<string>('');
  const [styles, setStyles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getConfig().then(c => setStyles(c.styles)).catch(() => undefined);
  }, []);

  const contactOk = Boolean(email.trim() || phone.trim());
  const canSubmit = Boolean(yardSide && photo && contactOk && !submitting);

  async function submit() {
    if (!yardSide || !photo) return;
    setErr(null);
    setSubmitting(true);
    try {
      const baseArgs = {
        yardSide,
        firstName: firstName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        designStyle: designStyle || undefined,
      };
      const out = photo.source === 'UPLOADED'
        ? await submitUpload({ ...baseArgs, photoSource: 'UPLOADED', file: photo.file! })
        : await submitFromGallery({ ...baseArgs, photoSource: 'GALLERY', galleryId: photo.galleryId! });
      nav(`/ai-generate/result/${out.id}`);
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Submission failed - please try again'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-white">
      <header className="max-w-4xl mx-auto px-4 py-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded bg-brand-600 grid place-items-center text-white font-bold">Y</div>
        <div className="font-bold text-lg">Yardex AI Yard Visualizer</div>
        <div className="ml-auto text-xs text-slate-500 italic hidden sm:block">Design To Inspire, Engineered to Endure.</div>
      </header>

      <main className="max-w-4xl mx-auto px-4 pb-16 space-y-8">
        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-3">1. Which yard?</h2>
          <PublicYardSelector value={yardSide} onChange={setYardSide} />
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-3">2. Add a photo</h2>
          <PublicPhotoInput
            value={photo}
            onChange={setPhoto}
            yardSide={yardSide || 'FRONT'}
          />
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-900 mb-3">3. Where should we send the result?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-xs text-slate-500">First name (optional)</span>
              <input
                className="mt-1 w-full border rounded px-3 py-2 text-sm"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                placeholder="Jane"
                maxLength={80}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Email</span>
              <input
                className="mt-1 w-full border rounded px-3 py-2 text-sm"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@example.com"
                type="email"
                maxLength={200}
              />
            </label>
            <label className="block">
              <span className="text-xs text-slate-500">Phone</span>
              <input
                className="mt-1 w-full border rounded px-3 py-2 text-sm"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
                type="tel"
                maxLength={40}
              />
            </label>
          </div>
          <p className="text-xs text-slate-500 mt-2">Please share at least one so we can send you the result.</p>

          {styles.length > 0 && (
            <div className="mt-4">
              <span className="text-xs text-slate-500">Preferred style (optional)</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {styles.map(s => (
                  <button
                    type="button"
                    key={s}
                    onClick={() => setDesignStyle(designStyle === s ? '' : s)}
                    className={`px-3 py-1.5 rounded-full text-xs border ${
                      designStyle === s
                        ? 'bg-brand-600 text-white border-brand-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-brand-400'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {err && <div className="rounded bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{err}</div>}

        <div className="flex items-center justify-between">
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">Back to site</Link>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="px-6 py-2.5 rounded-md bg-brand-600 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-brand-700"
          >
            {submitting ? 'Sending...' : 'Generate my preview'}
          </button>
        </div>
      </main>
    </div>
  );
}
