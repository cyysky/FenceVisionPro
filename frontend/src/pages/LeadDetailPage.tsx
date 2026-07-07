import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AdminLead, archiveLead, convertLead, getLead, markContacted } from '../lib/publicAi';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';

/**
 * Admin lead detail. Two-up comparison (submitted photo vs AI
 * render) and a bottom action bar: Convert to Quote / Mark
 * Contacted / Archive.
 *
 * Convert / Archive are only shown when the lead is not yet in a
 * terminal state (CONVERTED / ARCHIVED). Mark Contacted stays
 * available until archive.
 */
export default function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const nav = useNavigate();
  const [lead, setLead] = useState<AdminLead | null>(null);
  const [showContact, setShowContact] = useState(false);
  const [contactNotes, setContactNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const d = await getLead(id);
        if (!cancelled) setLead(d);
      } catch (e: any) {
        if (!cancelled) toast.error(e?.response?.data?.message || 'Lead not found');
      }
    })();
    return () => { cancelled = true; };
  }, [id, toast]);

  async function doConvert() {
    if (!id) return;
    setBusy('convert');
    try {
      const out = await convertLead(id);
      toast.success(out.alreadyConverted ? 'Already converted' : 'Converted to draft quote');
      nav(`/quotes/${out.quoteId}`);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Conversion failed');
    } finally {
      setBusy(null);
    }
  }

  async function doContact() {
    if (!id) return;
    setBusy('contact');
    try {
      const updated = await markContacted(id, contactNotes.trim() || undefined);
      setLead(updated);
      setShowContact(false);
      setContactNotes('');
      toast.success('Marked as contacted');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Failed to mark contacted');
    } finally {
      setBusy(null);
    }
  }

  async function doArchive() {
    if (!id) return;
    if (!window.confirm('Archive this lead? It can still be looked up by ID.')) return;
    setBusy('archive');
    try {
      const updated = await archiveLead(id);
      setLead(updated);
      toast.success('Lead archived');
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Archive failed');
    } finally {
      setBusy(null);
    }
  }

  if (!lead) {
    return (
      <div className="space-y-4">
        <SkeletonRows rows={4} />
      </div>
    );
  }

  const terminal = lead.status === 'CONVERTED' || lead.status === 'ARCHIVED';

  return (
    <div className="space-y-5">
      <section>
        <Link to="/leads" className="text-xs text-slate-500 hover:text-slate-700">← All leads</Link>
        <h2 className="text-lg font-semibold mt-1">Lead {lead.id.slice(0, 8)}</h2>
        <p className="text-sm text-slate-500">
          Created {new Date(lead.createdAt).toLocaleString()} · Status <strong>{lead.status}</strong>
        </p>
      </section>

      <section className="bg-white border rounded p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs uppercase text-slate-400">Customer</div>
          <div className="mt-1 font-medium">{lead.firstName || '(no name)'}</div>
          <div className="text-slate-600">{lead.email || '(no email)'}</div>
          <div className="text-slate-600">{lead.phone || '(no phone)'}</div>
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Submission</div>
          <div className="mt-1">Yard: <strong>{lead.yardSide === 'FRONT' ? 'Front' : 'Back'}</strong></div>
          <div>Source: <strong>{lead.photoSource === 'UPLOADED' ? 'Uploaded' : 'Gallery'}</strong></div>
          {lead.designStyle && <div>Style: <strong>{lead.designStyle}</strong></div>}
          {lead.inputGalleryId && <div className="text-xs text-slate-500">Gallery ID: {lead.inputGalleryId}</div>}
        </div>
        <div>
          <div className="text-xs uppercase text-slate-400">Pipeline</div>
          <div className="mt-1">
            {lead.contactedAt
              ? <>Contacted {new Date(lead.contactedAt).toLocaleString()} {lead.contactedBy && <span className="text-slate-500">by {lead.contactedBy.fullName}</span>}</>
              : <span className="text-slate-400">Not yet contacted</span>}
          </div>
          {lead.convertedQuote && (
            <div className="mt-1">
              Quote:{' '}
              <Link to={`/quotes/${lead.convertedQuote.id}`} className="text-brand-700 hover:underline">
                {lead.convertedQuote.reference}
              </Link>
            </div>
          )}
          {lead.archivedAt && (
            <div className="mt-1 text-slate-500">Archived {new Date(lead.archivedAt).toLocaleString()}</div>
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white border rounded p-4">
          <div className="text-xs font-medium text-slate-500 mb-2">Submitted photo</div>
          {lead.inputPhotoPath ? (
            <img src={lead.inputPhotoPath} alt="Submitted yard" className="rounded border w-full" />
          ) : (
            <div className="text-sm text-slate-400">(none)</div>
          )}
        </div>
        <div className="bg-white border rounded p-4">
          <div className="text-xs font-medium text-brand-700 mb-2">AI render</div>
          {lead.renderUrl ? (
            <img src={lead.renderUrl} alt="AI render" className="rounded border w-full" />
          ) : lead.renderError ? (
            <div className="text-sm text-red-600">Render failed: {lead.renderError}</div>
          ) : (
            <div className="text-sm text-slate-400">Render pending...</div>
          )}
        </div>
      </section>

      {lead.notes && (
        <section className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
          <div className="text-xs uppercase text-amber-700 font-medium">Sales notes</div>
          <div className="mt-1 whitespace-pre-wrap">{lead.notes}</div>
        </section>
      )}

      {!terminal && (
        <section className="bg-white border rounded p-4">
          {!showContact ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={doConvert}
                disabled={busy !== null}
                className="px-4 py-2 rounded bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50"
              >
                {busy === 'convert' ? 'Converting...' : 'Convert to Quote'}
              </button>
              <button
                onClick={() => setShowContact(true)}
                disabled={busy !== null}
                className="px-4 py-2 rounded border border-slate-300 hover:bg-brand-50 disabled:opacity-50"
              >
                Mark contacted
              </button>
              <button
                onClick={doArchive}
                disabled={busy !== null}
                className="ml-auto px-4 py-2 rounded border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {busy === 'archive' ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-medium text-slate-700">Add a contact note (optional)</div>
              <textarea
                value={contactNotes}
                onChange={e => setContactNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="e.g. left voicemail, customer prefers email"
              />
              <div className="flex gap-2">
                <button
                  onClick={doContact}
                  disabled={busy !== null}
                  className="px-4 py-2 rounded bg-brand-600 text-white font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy === 'contact' ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => { setShowContact(false); setContactNotes(''); }}
                  disabled={busy !== null}
                  className="px-4 py-2 rounded border border-slate-300 hover:bg-brand-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
