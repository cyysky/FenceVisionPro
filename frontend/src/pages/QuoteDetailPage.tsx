import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { AiControls } from '../components/AiControls';

export default function QuoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<any>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [savingRender, setSavingRender] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { (async () => {
    const { data } = await api.get(`/quotes/${id}`);
    setQuote(data);
  })(); }, [id]);

  async function refresh() {
    const { data } = await api.get(`/quotes/${id}`);
    setQuote(data);
  }

  async function generatePdf() {
    setErr(null);
    try {
      const { data } = await api.get(`/quotes/${id}/pdf`);
      setPdfUrl(data.url);
    } catch (e: any) { setErr(e?.response?.data?.message || 'PDF generation failed'); }
  }

  async function sendToCustomer() {
    setErr(null);
    try {
      await api.put(`/quotes/${id}/status`, { status: 'SENT' });
      await refresh();
    } catch (e: any) { setErr(e?.response?.data?.message || 'Send failed'); }
  }
  async function deleteQuote() {
    if (!confirm('Delete this draft? This cannot be undone.')) return;
    await api.delete(`/quotes/${id}`);
    window.location.href = '/';
  }
  async function ownerReject() {
    const reason = prompt('Optional reason (visible to your team):');
    if (reason === null) return; // cancelled
    setErr(null);
    try {
      await api.post(`/quotes/${id}/reject`, { reason });
      await refresh();
    } catch (e: any) { setErr(e?.response?.data?.message || 'Could not decline the quote'); }
  }

  async function cloneQuote() {
    setErr(null);
    try {
      const { data } = await api.post(`/quotes/${id}/clone`);
      window.location.href = `/quotes/${data.id}`;
    } catch (e: any) { setErr(e?.response?.data?.message || 'Clone failed'); }
  }

  async function setStatus(status: 'DRAFT' | 'EXPIRED' | 'SENT') {
    setErr(null);
    try {
      await api.put(`/quotes/${id}/status`, { status });
      await refresh();
    } catch (e: any) { setErr(e?.response?.data?.message || 'Status change failed'); }
  }

  /**
   * Persist an AI-generated render URL onto the quote. This is the
   * missing piece from the previous "setRender only updates local
   * state" behaviour - now we have PATCH /quotes/:id and we use it.
   */
  async function persistRender(url: string) {
    setSavingRender(true);
    try {
      await api.patch(`/quotes/${id}`, { renderUrl: url });
      setQuote((q: any) => ({ ...q, renderUrl: url }));
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Could not save render');
    } finally { setSavingRender(false); }
  }

  /**
   * Persist the LLM-generated three.js code onto the quote so
   * the 3D preview survives a page refresh. Best-effort: a
   * failure here doesn't block the UI.
   */
  async function persistCode(code: string) {
    try {
      await api.patch(`/quotes/${id}`, { threeJsCode: code });
      setQuote((q: any) => ({ ...q, threeJsCode: code }));
    } catch {
      /* best-effort */
    }
  }

  async function copyLink() {
    const link = `${window.location.origin}/approve/${quote.id}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers / non-https
      const el = document.createElement('textarea');
      el.value = link;
      document.body.appendChild(el); el.select();
      try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
      document.body.removeChild(el);
    }
  }

  async function setValidUntil(days: number | null) {
    const value = days == null ? null : new Date(Date.now() + days * 86400_000).toISOString();
    try {
      await api.patch(`/quotes/${id}`, { validUntil: value });
      await refresh();
    } catch (e: any) { setErr(e?.response?.data?.message || 'Could not set validUntil'); }
  }

  if (!quote) return <div className="p-6">Loading…</div>;
  const approvalLink = `${window.location.origin}/approve/${quote.id}`;

  // Derive AI params from the line items + selected design
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

  return (
    <div className="min-h-full">
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
        <Link to="/" className="text-sm text-slate-500 hover:text-brand-700">&larr; Back</Link>
        <h1 className="font-bold">{quote.reference}</h1>
        <span className="text-sm text-slate-500">{quote.status}</span>
        {quote.validUntil && (
          <span className="text-xs text-slate-500">
            · valid until {new Date(quote.validUntil).toLocaleDateString()}
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button onClick={cloneQuote} className="px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-50">Clone as new draft</button>
          {quote.status === 'SENT' && (
            <button onClick={ownerReject} className="px-3 py-1.5 border border-red-300 text-red-700 rounded text-sm hover:bg-red-50">Mark as declined</button>
          )}
          {isDraft && (
            <button onClick={sendToCustomer} className="px-3 py-1.5 border rounded text-sm">Send to customer</button>
          )}
          <button onClick={generatePdf} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm">Generate PDF</button>
          {isDraft && (
            <button onClick={deleteQuote} className="px-3 py-1.5 border border-red-300 text-red-700 rounded text-sm hover:bg-red-50">Delete</button>
          )}
        </div>
      </header>
      <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4">
        {err && <div className="p-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded">{err}</div>}

        <section className="bg-white border rounded p-4">
          <h2 className="font-semibold mb-2">Customer</h2>
          <div className="text-sm">
            <span className="font-medium">{quote.customerName || '(no name)'}</span>
            {quote.customerEmail && <> &middot; {quote.customerEmail}</>}
            {quote.customerPhone && <> &middot; {quote.customerPhone}</>}
          </div>
          {quote.projectAddress && <div className="text-sm text-slate-600">{quote.projectAddress}</div>}
          {isSent && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Quote expires in:</span>
              {[7, 14, 30].map(d => (
                <button key={d} onClick={() => setValidUntil(d)} className="px-2 py-0.5 border rounded text-xs hover:bg-slate-50">
                  {d} days
                </button>
              ))}
              {quote.validUntil && (
                <button onClick={() => setValidUntil(null)} className="px-2 py-0.5 border rounded text-xs hover:bg-slate-50 text-slate-500">
                  clear
                </button>
              )}
            </div>
          )}
          {isExpired && (
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span className="text-slate-500">This quote has expired.</span>
              <button onClick={() => setStatus('DRAFT')} className="px-2 py-0.5 border rounded text-xs hover:bg-slate-50">Revive as draft</button>
            </div>
          )}
        </section>

        {quote.renderUrl && (
          <section className="bg-white border rounded p-4">
            <h2 className="font-semibold mb-2">Rendered preview</h2>
            <img src={quote.renderUrl} alt="Render" className="w-full rounded border" />
            {savingRender && <div className="text-xs text-slate-500 mt-1">Saving…</div>}
          </section>
        )}

        <section className="bg-white border rounded p-4">
          <h2 className="font-semibold mb-2">AI visualisation</h2>
          <p className="text-xs text-slate-500 mb-3">Regenerate a photorealistic image or a 3D scene. The image will be saved to this quote automatically.</p>
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

        <section className="bg-white border rounded">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr><th className="px-4 py-2">Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
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
                  <td>${Number(li.lineTotal).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="text-sm">
              <tr><td colSpan={3} className="px-4 py-1 text-right text-slate-500">Subtotal</td><td>${Number(quote.subtotal).toFixed(2)}</td></tr>
              <tr><td colSpan={3} className="px-4 py-1 text-right text-slate-500">Tax ({quote.taxRate}%)</td><td>${Number(quote.taxAmount).toFixed(2)}</td></tr>
              <tr className="font-bold"><td colSpan={3} className="px-4 py-2 text-right">Total</td><td className="px-4">${Number(quote.total).toFixed(2)}</td></tr>
            </tfoot>
          </table>
        </section>

        {pdfUrl && (
          <section className="bg-white border rounded p-4">
            <h2 className="font-semibold mb-2">Quotation PDF</h2>
            <a href={pdfUrl} target="_blank" rel="noreferrer" className="text-brand-700 underline">Open PDF in new tab</a>
          </section>
        )}

        {isSent && (
          <section className="bg-white border rounded p-4">
            <h2 className="font-semibold mb-2">Customer approval link</h2>
            <div className="flex flex-wrap items-stretch gap-2">
              <code className="flex-1 min-w-0 p-2 bg-slate-50 border rounded text-xs break-all">{approvalLink}</code>
              <button onClick={copyLink} className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm whitespace-nowrap">
                {copied ? '✓ Copied' : 'Copy link'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1">Send this link to the customer for online approval and signature.</p>
          </section>
        )}
      </main>
    </div>
  );
}
