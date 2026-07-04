import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { AiControls } from '../components/AiControls';
import { useToast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton';

const STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED'] as const;

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [quote, setQuote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [validUntilDate, setValidUntilDate] = useState<string>('');

  useEffect(() => { (async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/quotes/${id}`);
      setQuote(data);
      if (data.validUntil) setValidUntilDate(data.validUntil.slice(0, 10));
    } catch (e: any) {
      setLoadErr(apiErrorMessage(e, 'Failed to load quote'));
    } finally { setLoading(false); }
  })(); }, [id]);

  async function refresh() {
    try {
      const { data } = await api.get(`/quotes/${id}`);
      setQuote(data);
      if (data.validUntil) setValidUntilDate(data.validUntil.slice(0, 10));
    } catch (e: any) { toast.error('Could not refresh'); }
  }

  async function generatePdf() {
    setBusy('pdf');
    try {
      const { data } = await api.get(`/quotes/${id}/pdf`);
      setPdfUrl(data.url);
      toast.success('PDF generated');
    } catch (e: any) { toast.error(apiErrorMessage(e, 'PDF generation failed')); }
    finally { setBusy(null); }
  }

  async function sendToCustomer() {
    if (!(await confirm({
      title: 'Send to customer?',
      message: 'This generates a public approval link. The customer can then view, approve, or decline the quote online.',
      confirmLabel: 'Send',
    }))) return;
    setBusy('send');
    try {
      await api.put(`/quotes/${id}/status`, { status: 'SENT' });
      await refresh();
      toast.success('Quote sent - share the approval link below');
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Send failed')); }
    finally { setBusy(null); }
  }

  async function deleteQuote() {
    if (!(await confirm({
      title: 'Delete draft?',
      message: 'This draft will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    }))) return;
    try {
      await api.delete(`/quotes/${id}`);
      toast.success('Draft deleted');
      window.location.href = '/';
    } catch (e: any) { toast.error('Could not delete quote'); }
  }

  async function ownerReject() {
    const reason = prompt('Optional reason (visible to your team):');
    if (reason === null) return;
    setBusy('reject');
    try {
      await api.post(`/quotes/${id}/reject`, { reason });
      await refresh();
      toast.success('Quote declined');
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Could not decline the quote')); }
    finally { setBusy(null); }
  }

  async function cloneQuote() {
    setBusy('clone');
    try {
      const { data } = await api.post(`/quotes/${id}/clone`);
      toast.success('Cloned - opening new draft');
      window.location.href = `/quotes/${data.id}`;
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Clone failed')); }
    finally { setBusy(null); }
  }

  async function createInstallation() {
    setBusy('inst');
    try {
      const { data } = await api.post('/installations', { quoteId: quote.id });
      toast.success('Installation created');
      window.location.href = `/installations/${data.id}`;
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Failed to create installation'));
    } finally { setBusy(null); }
  }

  async function createInvoice() {
    setBusy('inv');
    try {
      const { data } = await api.post('/invoices', { quoteId: quote.id });
      toast.success(`Invoice ${data.number} created`);
      window.location.href = `/invoices/${data.id}`;
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Failed to create invoice'));
    } finally { setBusy(null); }
  }

  async function setStatus(status: 'DRAFT' | 'EXPIRED' | 'SENT') {
    setBusy(status);
    try {
      await api.put(`/quotes/${id}/status`, { status });
      await refresh();
      toast.success(`Status changed to ${status}`);
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Status change failed')); }
    finally { setBusy(null); }
  }

  async function persistRender(url: string) {
    try {
      await api.patch(`/quotes/${id}`, { renderUrl: url });
      setQuote((q: any) => ({ ...q, renderUrl: url }));
      toast.success('Render saved to this quote');
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Could not save render')); }
  }

  async function persistCode(code: string) {
    try {
      await api.patch(`/quotes/${id}`, { threeJsCode: code });
      setQuote((q: any) => ({ ...q, threeJsCode: code }));
    } catch { /* best-effort */ }
  }

  /**
   * Generate the AI render for a single line item. The backend
   * persists the URL into quote.aiImageUrls[index] so it
   * survives a refresh and shows up in the generated PDF.
   * Sequential rather than parallel: the upstream is sometimes
   * rate-limited and we don't want to fire 6 in parallel.
   */
  async function generateOneAiImage(lineItemIndex: number) {
    setBusy(`ai-${lineItemIndex}`);
    try {
      const item = quote.lineItems?.[lineItemIndex];
      if (!item) return;
      // Splice in the latest analyse result if the dealer
      // uploaded a photo - same logic as the global AiControls.
      let visionDescription: string | undefined;
      try {
        const { data: ana } = await api.get(`/quotes/${id}/photo-analyses`).catch(() => ({ data: null }) as any);
        const latest = Array.isArray(ana?.photoAnalyses) ? ana.photoAnalyses[ana.photoAnalyses.length - 1] : null;
        if (latest) {
          visionDescription = [latest.notes, latest.surroundings].filter(Boolean).join('. ') || latest.description;
        }
      } catch { /* no analyse available, fall through */ }
      const { data } = await api.post('/ai/render-image', {
        style: designStyle,
        color: item.colorOption || color,
        heightFt: (() => {
          const m = String(item.heightOption || `${heightFt}ft`).match(/(\d+)/);
          return m ? Number(m[1]) : heightFt;
        })(),
        panelCount: 1,
        visionDescription,
        quoteId: id,
        lineItemIndex,
      });
      setQuote((q: any) => ({ ...q, aiImageUrls: data.aiImageUrls || q.aiImageUrls }));
      toast.success(`Generated image for item ${lineItemIndex + 1}`);
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Could not generate image'));
    } finally { setBusy(null); }
  }

  /**
   * Walk every line item and call /ai/render-image once each.
   * The backend stores the URL at the matching index, so the
   * operation is idempotent (re-running overwrites previous
   * results for that slot).
   */
  async function generateAllAiImages() {
    if (!quote.lineItems?.length) return;
    setBusy('ai-all');
    try {
      for (let i = 0; i < quote.lineItems.length; i++) {
        await generateOneAiImage(i);
      }
      toast.success(`Generated ${quote.lineItems.length} images`);
    } finally { setBusy(null); }
  }

  async function copyLink() {
    const link = `${window.location.origin}/approve/${quote.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement('textarea');
      el.value = link; document.body.appendChild(el); el.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      document.body.removeChild(el);
    }
    setCopied(true);
    toast.success('Approval link copied to clipboard');
    setTimeout(() => setCopied(false), 1500);
  }

  async function setValidUntil(days: number | null) {
    const value = days == null ? null : new Date(Date.now() + days * 86400_000).toISOString();
    try {
      await api.patch(`/quotes/${id}`, { validUntil: value });
      await refresh();
      toast.success(days == null ? 'Expiry cleared' : `Expires in ${days} days`);
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Could not set validUntil')); }
  }

  async function setValidUntilCustom(dateStr: string) {
    if (!dateStr) return;
    try {
      const iso = new Date(dateStr + 'T23:59:59').toISOString();
      await api.patch(`/quotes/${id}`, { validUntil: iso });
      await refresh();
      toast.success(`Expires on ${dateStr}`);
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Could not set validUntil')); }
  }

  if (loading) return (
    <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-1/2" />
      <SkeletonRows rows={4} cols={3} />
    </div>
  );
  if (loadErr || !quote) return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="bg-white border rounded p-6 max-w-md text-center">
        <div className="text-3xl">⚠️</div>
        <h1 className="text-lg font-bold mt-2">Quote unavailable</h1>
        <p className="text-sm text-slate-600 mt-1">{loadErr || 'Quote not found'}</p>
        <Link to="/" className="mt-3 inline-block text-brand-700 underline text-sm">← Back to dashboard</Link>
      </div>
    </div>
  );

  const approvalLink = `${window.location.origin}/approve/${quote.id}`;
  const designStyle = quote.selectedDesign?.name?.toLowerCase().includes('picket') ? 'Picket'
    : quote.selectedDesign?.name?.toLowerCase().includes('wrought') ? 'Wrought Iron'
    : 'Privacy';
  const firstLine = quote.lineItems?.[0];
  const heightFt = (() => {
    const m = String(firstLine?.heightOption || '6ft').match(/(\d+)/);
    return m ? Number(m[1]) : 6;
  })();
  const color = firstLine?.colorOption || 'Black';

  const isDraft = quote.status === 'DRAFT';
  const isSent = quote.status === 'SENT' || quote.status === 'APPROVED';
  const isExpired = quote.status === 'EXPIRED';
  const isFinal = quote.status === 'APPROVED' || quote.status === 'REJECTED' || quote.status === 'EXPIRED';

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/" className="text-sm text-slate-500 hover:text-brand-700">← Dashboard</Link>
        <span className="font-mono text-sm text-slate-500">{quote.reference}</span>
        <StatusBadge status={quote.status} />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {isDraft && (
            <>
              <button onClick={() => setStatus('SENT')} disabled={busy !== null}
                className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50">
                {busy === 'SENT' ? 'Sending…' : '📤 Send to customer'}
              </button>
              <button onClick={deleteQuote} className="px-2 py-1.5 border border-red-300 text-red-700 rounded text-sm hover:bg-red-50">Delete draft</button>
            </>
          )}
          {isSent && (
            <button onClick={ownerReject} disabled={busy !== null}
              className="px-2 py-1.5 border border-red-300 text-red-700 rounded text-sm hover:bg-red-50 disabled:opacity-50">
              {busy === 'reject' ? '…' : 'Decline for customer'}
            </button>
          )}
          {isExpired && (
            <button onClick={() => setStatus('DRAFT')} disabled={busy !== null}
              className="px-3 py-1.5 border rounded text-sm hover:bg-slate-50 disabled:opacity-50">
              Revive as draft
            </button>
          )}
          {quote.status === 'APPROVED' && !quote.installationId && (
            <button onClick={createInstallation} disabled={busy !== null}
              className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50">
              {busy === 'inst' ? '…' : '🏗 Create installation'}
            </button>
          )}
          {quote.status === 'APPROVED' && !quote.invoiceCount && (
            <button onClick={createInvoice} disabled={busy !== null}
              className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50">
              {busy === 'inv' ? '…' : '🧾 Create invoice'}
            </button>
          )}
          {quote.projectId && (
            <Link to={`/projects/${quote.projectId}`}
              className="px-3 py-1.5 border border-brand-600 text-brand-700 rounded text-sm hover:bg-brand-50">
              Open project
            </Link>
          )}
          <button onClick={cloneQuote} disabled={busy !== null}
            className="px-2 py-1.5 border rounded text-sm hover:bg-slate-50 disabled:opacity-50">
            {busy === 'clone' ? '…' : 'Clone'}
          </button>
        </div>
      </div>
        <section className="bg-white border rounded p-4">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="font-semibold text-lg">{quote.customerName || '(no name)'}</div>
              {quote.customerEmail && <div className="text-sm text-slate-600">{quote.customerEmail}</div>}
              {quote.customerPhone && <div className="text-sm text-slate-600">{quote.customerPhone}</div>}
              {quote.projectAddress && <div className="text-sm text-slate-600 mt-1">{quote.projectAddress}</div>}
            </div>
            <StatusTimeline status={quote.status} createdAt={quote.createdAt} sentAt={quote.sentAt} approvedAt={quote.approvedAt} rejectedAt={quote.rejectedAt} />
          </div>

          {isSent && (
            <div className="mt-4 pt-3 border-t">
              <div className="text-sm font-medium mb-2">Quote expiry</div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-500">Expires:</span>
                {[7, 14, 30, 60].map(d => (
                  <button key={d} onClick={() => setValidUntil(d)} disabled={busy !== null}
                    className="px-2 py-0.5 border rounded text-xs hover:bg-slate-50 disabled:opacity-50">
                    {d} days
                  </button>
                ))}
                <span className="text-slate-400 text-xs">or</span>
                <input type="date" value={validUntilDate} disabled={busy !== null}
                  onChange={e => setValidUntilDate(e.target.value)}
                  onBlur={e => e.target.value && setValidUntilCustom(e.target.value)}
                  className="px-2 py-1 border rounded text-xs" />
                {quote.validUntil && (
                  <button onClick={() => setValidUntil(null)} disabled={busy !== null}
                    className="px-2 py-0.5 border rounded text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-50">
                    clear
                  </button>
                )}
                {quote.validUntil && (
                  <span className="text-xs text-slate-500 ml-auto">
                    currently: {new Date(quote.validUntil).toLocaleDateString()}
                    {new Date(quote.validUntil).getTime() < Date.now() && <span className="text-red-600 ml-1">(expired)</span>}
                  </span>
                )}
              </div>
            </div>
          )}
        </section>

        {quote.renderUrl && (
          <section className="bg-white border rounded p-4">
            <h2 className="font-semibold mb-2">Rendered preview</h2>
            <img src={quote.renderUrl} alt="Render" className="w-full rounded border" />
          </section>
        )}

        <section className="bg-white border rounded p-4">
          <h2 className="font-semibold mb-2">AI visualisation</h2>
          <p className="text-xs text-slate-500 mb-3">
            Regenerate a photorealistic image or a 3D scene. Both are saved to this quote automatically.
          </p>
          <AiControls
            quoteId={quote.id}
            style={designStyle}
            color={color}
            heightFt={heightFt}
            panelCount={quote.lineItems?.length}
            initialCode={quote.threeJsCode}
            onImage={persistRender}
            onCode={persistCode}
          />
        </section>

        {Array.isArray(quote.lineItems) && quote.lineItems.length > 0 && (
          <section className="bg-white border rounded p-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
              <div>
                <h2 className="font-semibold">Per-item AI renders</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  One photorealistic image per line item. Saved to this quote so it
                  survives a page refresh and shows up in the generated PDF.
                </p>
              </div>
              <button
                onClick={generateAllAiImages}
                disabled={busy === 'ai-all' || !quote.lineItems?.length}
                className="px-3 py-1.5 border rounded text-sm font-medium hover:bg-slate-50 disabled:opacity-50"
                title="Generate (or regenerate) the AI image for every line item"
              >
                {busy === 'ai-all' ? 'Generating all…' : '✨ Generate all items'}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {quote.lineItems.map((li: any, idx: number) => (
                <LineItemRenderCard
                  key={li.id}
                  index={idx}
                  description={li.description}
                  heightOption={li.heightOption}
                  colorOption={li.colorOption}
                  imageUrl={quote.aiImageUrls?.[idx] || ''}
                  busy={busy === `ai-${idx}`}
                  onGenerate={() => generateOneAiImage(idx)}
                />
              ))}
            </div>
            {quote.aiOverviewImageUrl && (
              <div className="mt-4 pt-3 border-t">
                <div className="text-xs text-slate-500 mb-2">Scene overview:</div>
                <img src={quote.aiOverviewImageUrl} alt="Scene overview" className="max-h-48 rounded border" />
              </div>
            )}
          </section>
        )}

        <section className="bg-white border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr><th className="px-4 py-2">Item</th><th>Qty</th><th>Unit</th><th className="text-right pr-4">Total</th></tr>
            </thead>
            <tbody>
              {quote.lineItems.map((li: any) => (
                <tr key={li.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    {li.description}
                    {li.heightOption && <span className="text-xs text-slate-500"> · {li.heightOption}</span>}
                    {li.colorOption && <span className="text-xs text-slate-500"> · {li.colorOption}</span>}
                  </td>
                  <td>{Number(li.quantity)}</td>
                  <td>${Number(li.unitPrice).toFixed(2)}</td>
                  <td className="text-right pr-4 font-medium">${Number(li.lineTotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr><td colSpan={3} className="px-4 py-1 text-right text-slate-500">Subtotal</td><td className="text-right pr-4">${Number(quote.subtotal).toFixed(2)}</td></tr>
              <tr><td colSpan={3} className="px-4 py-1 text-right text-slate-500">Tax ({quote.taxRate}%)</td><td className="text-right pr-4">${Number(quote.taxAmount).toFixed(2)}</td></tr>
              <tr className="font-bold text-base"><td colSpan={3} className="px-4 py-2 text-right">Total</td><td className="text-right pr-4">${Number(quote.total).toFixed(2)}</td></tr>
            </tfoot>
          </table>
        </section>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={generatePdf} disabled={busy !== null}
            className="px-3 py-1.5 border rounded text-sm font-medium hover:bg-slate-50 disabled:opacity-50">
            {busy === 'pdf' ? 'Generating…' : '📄 Generate PDF'}
          </button>
          {pdfUrl && (
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline text-sm">
              Open PDF in new tab ↗
            </a>
          )}
        </div>

        {isSent && !isFinal && (
          <section className="bg-white border rounded p-4">
            <h2 className="font-semibold mb-2">Customer approval link</h2>
            <div className="flex flex-wrap items-stretch gap-2">
              <code className="flex-1 min-w-0 p-2 bg-slate-50 border rounded text-xs break-all">{approvalLink}</code>
              <button onClick={copyLink} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm whitespace-nowrap font-medium">
                {copied ? '✓ Copied' : '📋 Copy link'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">Send this link to the customer for online approval and signature.</p>
          </section>
        )}

        {quote.status === 'APPROVED' && (
          <section className="bg-emerald-50 border border-emerald-200 rounded p-4">
            <h2 className="font-semibold text-emerald-800">✓ Quote approved</h2>
            {quote.approvedAt && <p className="text-sm text-emerald-700 mt-1">on {new Date(quote.approvedAt).toLocaleString()}</p>}
            {quote.approvedSignatureUrl && (
              <div className="mt-2">
                <div className="text-xs text-slate-600 mb-1">Customer signature:</div>
                <img src={quote.approvedSignatureUrl} alt="Signature" className="bg-white border rounded max-h-24" />
              </div>
            )}
          </section>
        )}

        {quote.status === 'REJECTED' && (
          <section className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-800">
            <h2 className="font-semibold">Quote declined</h2>
            {quote.rejectionReason && <p className="mt-1">Reason: {quote.rejectionReason}</p>}
          </section>
        )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: 'bg-slate-100 text-slate-700',
    SENT: 'bg-amber-100 text-amber-700',
    APPROVED: 'bg-emerald-100 text-emerald-700',
    REJECTED: 'bg-red-100 text-red-700',
    EXPIRED: 'bg-slate-200 text-slate-600',
  };
  return <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${colors[status] || 'bg-slate-100'}`}>{status}</span>;
}

/**
 * Visual status timeline. Shows the order of status transitions
 * (Created -> Sent -> Approved/Rejected) and highlights where
 * the quote currently is. Falls back gracefully if some
 * timestamps are missing.
 */
function StatusTimeline({ status, createdAt, sentAt, approvedAt, rejectedAt }: { status: string; createdAt: string; sentAt?: string; approvedAt?: string; rejectedAt?: string; }) {
  const steps = [
    { key: 'DRAFT', label: 'Created', at: createdAt },
    { key: 'SENT', label: 'Sent', at: sentAt },
    { key: status === 'APPROVED' ? 'APPROVED' : status === 'REJECTED' ? 'REJECTED' : status === 'EXPIRED' ? 'EXPIRED' : 'SENT', label: status === 'APPROVED' ? 'Approved' : status === 'REJECTED' ? 'Declined' : status === 'EXPIRED' ? 'Expired' : 'Awaiting', at: approvedAt || rejectedAt },
  ];
  return (
    <ol className="flex items-center gap-1 text-xs" aria-label="Quote status timeline">
      {steps.map((s, i) => {
        const active = s.key === status;
        const done = (s.key !== 'SENT' || sentAt) && (s.key !== 'APPROVED' || approvedAt) && (s.key !== 'REJECTED' || rejectedAt);
        return (
          <li key={i} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${active ? 'bg-brand-600 ring-2 ring-brand-200' : done ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            <span className={active ? 'font-semibold text-slate-900' : 'text-slate-500'}>
              {s.label}
              {s.at && <span className="text-slate-400 ml-1">{new Date(s.at).toLocaleDateString()}</span>}
            </span>
            {i < steps.length - 1 && <span className="text-slate-300">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Card for a single line item in the per-item AI renders grid.
 * Shows the item description, its current image (or a placeholder),
 * and a Generate / Regenerate button. The image URL is read from
 * quote.aiImageUrls[index] (parent passes the value down) and
 * written back via the parent's generateOneAiImage callback.
 */
function LineItemRenderCard({
  index, description, heightOption, colorOption, imageUrl, busy, onGenerate,
}: {
  index: number;
  description: string;
  heightOption?: string | null;
  colorOption?: string | null;
  imageUrl: string;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="border rounded p-3 flex flex-col gap-2 bg-slate-50">
      <div className="text-xs text-slate-500">Item {index + 1}</div>
      <div className="text-sm font-medium leading-snug line-clamp-2">{description}</div>
      <div className="text-xs text-slate-500">
        {heightOption ? `${heightOption}` : ''}
        {heightOption && colorOption ? ' · ' : ''}
        {colorOption ? `${colorOption}` : ''}
      </div>
      <div className="aspect-video bg-white border rounded overflow-hidden flex items-center justify-center">
        {imageUrl ? (
          <img src={imageUrl} alt={`Render of ${description}`} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400 px-3 text-center">No AI render yet</span>
        )}
      </div>
      <button
        onClick={onGenerate}
        disabled={busy}
        className="px-2 py-1.5 border border-brand-600 text-brand-700 rounded text-xs font-medium hover:bg-brand-50 disabled:opacity-50"
      >
        {busy ? 'Generating…' : imageUrl ? '🔄 Regenerate' : '✨ Generate image'}
      </button>
    </div>
  );
}
