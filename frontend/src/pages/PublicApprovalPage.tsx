import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

export default function PublicApprovalPage() {
  const { id } = useParams<{ id: string }>();
  const [quote, setQuote] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [approvedAt, setApprovedAt] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => { (async () => {
    try {
      const { data } = await api.get(`/public/quotes/${id}`);
      setQuote(data);
      if (data.status === 'APPROVED') setApprovedAt(data.approvedAt || null);
    } catch (e: any) { setErr('Quote not found or not available for review'); }
  })(); }, [id]);

  useEffect(() => {
    // Only initialise the canvas once we have a SENT quote. The
    // canvas would otherwise briefly flash a dashed border on every
    // status change.
    if (quote && quote.status === 'SENT') prepareCanvas();
  }, [quote?.status]);

  function prepareCanvas() {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(2, 2, c.width - 4, c.height - 4);
    ctx.setLineDash([]);
  }

  // Track the last point so we can draw a continuous line. Without
  // this, every move event becomes an isolated dot, which looks
  // nothing like a real signature.
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  function pos(e: React.MouseEvent | React.TouchEvent) {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as any).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as any).clientY;
    return { x: clientX - r.left, y: clientY - r.top };
  }
  function start(e: any) {
    e.preventDefault?.();
    drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    lastPt.current = p;
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
  }
  function end() { drawing.current = false; lastPt.current = null; }
  function draw(e: any) {
    if (!drawing.current) return;
    e.preventDefault?.();
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e);
    const prev = lastPt.current || p;
    ctx.strokeStyle = '#0f172a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPt.current = p;
  }
  function clearCanvas() { prepareCanvas(); }

  /**
   * Heuristic: count the non-white pixels in the canvas. A real
   * signature covers at least a couple hundred pixels; the 5000-char
   * data-URL check we used previously was bypassable by submitting
   * a 5000-char white PNG.
   */
  function inkPixelCount(): number {
    const c = canvasRef.current!; if (!c) return 0;
    const ctx = c.getContext('2d')!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let ink = 0;
    for (let i = 0; i < data.length; i += 4) {
      // any pixel that isn't near-white
      if (data[i] < 200 || data[i+1] < 200 || data[i+2] < 200) ink++;
    }
    return ink;
  }

  const [showReject, setShowReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  function openReject() { setShowReject(s => !s); setRejectReason(''); }
  async function confirmReject() {
    setRejecting(true); setErr(null);
    try {
      const r = await api.post(`/public/quotes/${id}/reject`, { reason: rejectReason });
      setDone(false);
      setQuote(r.data);
      setShowReject(false);
    } catch (e: any) { setErr(e?.response?.data?.message || 'Could not decline the quote'); }
    finally { setRejecting(false); }
  }

  async function approve() {
    const ink = inkPixelCount();
    if (ink < 200) { setErr(`Please sign before approving (only ${ink} ink pixels)`); return; }
    const dataUrl = canvasRef.current!.toDataURL('image/png');
    try {
      const r = await api.post(`/public/quotes/${id}/approve`, { signatureDataUrl: dataUrl });
      setApprovedAt(r.data?.approvedAt || new Date().toISOString());
      setDone(true);
    } catch (e: any) { setErr(e?.response?.data?.message || 'Approval failed'); }
  }

  if (err && !quote) return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="bg-white border rounded p-6 max-w-md text-center">
        <div className="text-3xl">⚠️</div>
        <h1 className="text-lg font-bold mt-2">Quote unavailable</h1>
        <p className="text-sm text-slate-600 mt-1">{err}</p>
      </div>
    </div>
  );
  if (!quote) return <div className="p-6">Loading…</div>;
  if (done) return (
    <div className="min-h-full grid place-items-center p-6">
      <div className="bg-white border rounded-xl p-8 max-w-md text-center">
        <div className="text-4xl">✅</div>
        <h1 className="text-xl font-bold mt-3">Quote approved</h1>
        <p className="text-sm text-slate-600 mt-2">Thank you, {quote.customerName}. Your wholesaler has been notified.</p>
        {approvedAt && <p className="text-xs text-slate-500 mt-3">Approved on {new Date(approvedAt).toLocaleString()}</p>}
        <div className="mt-4 pt-4 border-t text-left text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Reference</span><span className="font-mono">{quote.reference}</span></div>
          <div className="flex justify-between mt-1"><span className="text-slate-500">Total</span><span className="font-medium">${Number(quote.total).toFixed(2)}</span></div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
        <h1 className="font-bold">Fence Quotation</h1>
        <span className="text-sm text-slate-500">{quote.reference}</span>
        {quote.validUntil && (
          <span className="text-xs text-slate-500 ml-2">
            · Valid until {new Date(quote.validUntil).toLocaleDateString()}
          </span>
        )}
        <span className="ml-auto text-sm">{quote.wholesaler?.name}</span>
      </header>
      <main className="max-w-3xl mx-auto p-4 sm:p-6 space-y-4">
        {err && <div className="p-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded">{err}</div>}
        <section className="bg-white border rounded p-4">
          <h2 className="font-semibold mb-2">Prepared for {quote.customerName}</h2>
          {quote.projectAddress && <div className="text-sm text-slate-600">{quote.projectAddress}</div>}
          {quote.status === 'APPROVED' && approvedAt && (
            <div className="mt-2 text-xs text-emerald-700">✓ Approved on {new Date(approvedAt).toLocaleString()}</div>
          )}
        </section>

        {quote.renderUrl && (
          <section className="bg-white border rounded p-4">
            <h2 className="font-semibold mb-2">Rendered preview</h2>
            <img src={quote.renderUrl} alt="Render" className="w-full rounded border" />
          </section>
        )}

        <section className="bg-white border rounded">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr><th className="px-4 py-2">Item</th><th>Qty</th><th>Unit</th><th>Total</th></tr>
            </thead>
            <tbody>
              {quote.lineItems.map((li: any, i: number) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    {li.description}
                    {li.heightOption && <span className="text-xs text-slate-500"> · {li.heightOption}</span>}
                    {li.colorOption && <span className="text-xs text-slate-500"> · {li.colorOption}</span>}
                  </td>
                  <td>{li.quantity}</td>
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

        {quote.wholesaler?.termsHtml && (
          <section className="bg-white border rounded p-4 text-sm text-slate-600">
            <h3 className="font-semibold text-slate-700 mb-1">Terms</h3>
            <div dangerouslySetInnerHTML={{ __html: quote.wholesaler.termsHtml }} />
          </section>
        )}

        {showReject && (
          <section className="bg-white border border-red-200 rounded p-4 space-y-2">
            <h3 className="font-semibold text-red-800">Decline this quote</h3>
            <p className="text-xs text-slate-600">Optional: tell the wholesaler why. This helps them follow up with a better offer.</p>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} maxLength={2000}
              className="w-full border rounded p-2 text-sm min-h-24" placeholder="Reason (optional)…" />
            <div className="flex gap-2 justify-end">
              <button onClick={openReject} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
              <button onClick={confirmReject} disabled={rejecting} className="px-3 py-1.5 bg-red-600 text-white rounded text-sm disabled:opacity-50">
                {rejecting ? 'Declining…' : 'Decline quote'}
              </button>
            </div>
          </section>
        )}

        {quote.status === 'SENT' && (
          <section className="bg-white border rounded p-4">
            <h2 className="font-semibold mb-2">Sign to approve</h2>
            <p className="text-xs text-slate-500 mb-2">Sign in the box below. Your signature is saved with this quote and shared with the wholesaler.</p>
            <canvas
              ref={canvasRef}
              width={600} height={180}
              className="border rounded w-full touch-none bg-white"
              onMouseDown={start} onMouseUp={end} onMouseMove={draw} onMouseLeave={end}
              onTouchStart={start} onTouchEnd={end} onTouchMove={draw}
            />
            <div className="flex flex-wrap items-center mt-2 gap-2">
              <button onClick={clearCanvas} className="px-3 py-1.5 border rounded text-sm">Clear signature</button>
              <button onClick={openReject} className="px-3 py-1.5 border border-red-300 text-red-700 rounded text-sm hover:bg-red-50">Decline this quote</button>
              <button onClick={approve} className="ml-auto px-3 py-1.5 bg-emerald-600 text-white rounded text-sm">Approve quotation</button>
            </div>
          </section>
        )}
        {quote.status === 'APPROVED' && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded text-sm">
            ✓ This quotation has been approved. The wholesaler will be in touch to confirm next steps.
          </div>
        )}
        {quote.status === 'REJECTED' && (
          <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded text-sm">
            This quotation was declined. Please contact your wholesaler to discuss alternatives.
          </div>
        )}
        {quote.status === 'EXPIRED' && (
          <div className="bg-slate-100 border border-slate-200 text-slate-700 p-3 rounded text-sm">
            This quotation has expired. Please ask your wholesaler for a new one.
          </div>
        )}
      </main>
    </div>
  );
}
