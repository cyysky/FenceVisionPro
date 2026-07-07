import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionState } from '../lib/useSessionState';
import { PublicYardSide } from '../components/PublicYardSelector';
import { PublicPhotoValue } from '../components/PublicPhotoInput';
import { WizardShell } from '../components/WizardShell';
import { PUBLIC_AI_WIZARD_STEPS } from './wizardSteps';
import { getConfig, submitFromGallery, submitUpload } from '../lib/publicAi';
import { apiErrorMessage } from '../lib/api';

/**
 * Step 3 of the public AI yard visualizer wizard. Final step - the
 * Next button here is actually "Submit" and creates the PublicLead
 * on the backend. On success we navigate to the result page where
 * the user sees the PENDING / READY status and the staff-confirmation
 * guidance.
 */
export default function PublicAiStepContact() {
  const nav = useNavigate();

  const [yardSide] = useSessionState<PublicYardSide | null>('ai-wizard.yardSide', null);
  const [photo] = useSessionState<PublicPhotoValue | null>('ai-wizard.photo', null);
  const [firstName, setFirstName] = useSessionState<string>('ai-wizard.firstName', '');
  const [email, setEmail] = useSessionState<string>('ai-wizard.email', '');
  const [phone, setPhone] = useSessionState<string>('ai-wizard.phone', '');
  const [designStyle, setDesignStyle] = useSessionState<string>('ai-wizard.designStyle', '');

  const [styles, setStyles] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Pre-fetch style list once (cheap, small JSON).
  useEffect(() => {
    getConfig().then(c => setStyles(c.styles)).catch(() => undefined);
  }, []);

  // Deep-link defence: missing previous steps bounces user back.
  useEffect(() => {
    if (!yardSide) nav('/ai-generate', { replace: true });
    else if (!photo) nav('/ai-generate/photo', { replace: true });
  }, [yardSide, photo, nav]);

  const contactOk = Boolean(email.trim() || phone.trim());
  const canAdvance = Boolean(yardSide && photo && contactOk && !submitting);

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
      // Wipe wizard sessionStorage once we've successfully submitted
      // so a subsequent visit starts fresh.
      try {
        for (const k of [
          'ai-wizard.yardSide', 'ai-wizard.photo', 'ai-wizard.firstName',
          'ai-wizard.email', 'ai-wizard.phone', 'ai-wizard.designStyle',
        ]) sessionStorage.removeItem(k);
      } catch { /* ignore */ }
      nav(`/ai-generate/result/${out.id}`);
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Submission failed - please try again'));
      setSubmitting(false);
    }
  }

  return (
    <WizardShell
      steps={PUBLIC_AI_WIZARD_STEPS}
      currentPath="/ai-generate/contact"
      onBack={() => nav('/ai-generate/photo')}
      canAdvance={canAdvance}
      onAdvance={submit}
      advancing={submitting}
      nextLabel={submitting ? 'Sending…' : 'Generate my preview'}
    >
      <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Where should we send your preview?</h1>
      <p className="text-sm text-slate-600 mb-6">
        We'll start the AI render immediately and email you once our team has reviewed
        the design (typically within one business day).
      </p>

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

      {err && <div className="mt-4 rounded bg-red-50 border border-red-200 text-red-800 px-4 py-3 text-sm">{err}</div>}

      <div className="mt-6 text-xs text-slate-500 leading-relaxed">
        By submitting you agree to receive a one-off design preview by email or SMS from Yardex.
        We don't share your details with third parties.
      </div>
    </WizardShell>
  );
}