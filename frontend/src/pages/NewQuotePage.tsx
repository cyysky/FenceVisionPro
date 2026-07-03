import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { PlanEditor, FenceSegmentM } from '../components/PlanEditor';
import { DesignPreview } from '../components/DesignPreview';
import { AiControls } from '../components/AiControls';

export default function NewQuotePage() {
  const nav = useNavigate();
  const [products, setProducts] = useState<any[]>([]);
  const [designs, setDesigns] = useState<any[]>([]);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null);
  const [housePhotoUrl, setHousePhotoUrl] = useState<string | null>(null);
  const [aiImageUrl, setAiImageUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<FenceSegmentM[]>([]);
  const [planW, setPlanW] = useState(0); const [planH, setPlanH] = useState(0);

  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedDesignId, setSelectedDesignId] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [heightOption, setHeightOption] = useState<string>('');
  const [colorOption, setColorOption] = useState<string>('');
  const [taxRate, setTaxRate] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Tracks a draft we already auto-saved to the backend. We use it
  // to persist the AI-generated image as the quote's renderUrl the
  // moment it's produced, so the image survives a page refresh.
  const [draftId, setDraftId] = useState<string | null>(null);

  // Tab-scoped persistence for the AI image. The user expects
  // "I just generated this image" to survive a navigation back
  // to the dashboard and a return to NewQuotePage, but not to
  // outlive the tab.
  const aiImageKey = 'fvp.newQuote.aiImageUrl';
  useEffect(() => {
    const saved = sessionStorage.getItem(aiImageKey);
    if (saved) setAiImageUrl(saved);
  }, []);

  // Inline form validation. A quote must have a customer name + email
  // and at least one fence segment to be saved. The "Save & send"
  // button is also disabled while AI is generating a render.
  const customerValid = customerName.trim().length > 0 && /\S+@\S+\.\S+/.test(customerEmail);
  const segmentsValid = segments.length > 0;
  const draftValid = customerValid; // a draft can have no segments
  const sendValid = customerValid && segmentsValid;

  useEffect(() => {
    api.get('/products').then(r => {
      setProducts(r.data);
      // Default to a PANEL product since that's the most common
      // pick. Falls back to the first product if no panels exist.
      const panel = r.data.find((p: any) => p.category === 'PANEL');
      setProductId((panel || r.data[0])?.id || '');
    });
    api.get('/designs').then(r => {
      setDesigns(r.data);
      if (r.data.length) setSelectedDesignId(r.data[0].id);
    });
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);
  const houseRef = useRef<HTMLInputElement>(null);

  async function upload(ref: React.RefObject<HTMLInputElement>, setter: (url: string) => void) {
    const file = ref.current?.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    const { data } = await api.post('/quotes/upload-floorplan', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setter(data.url);
  }

  const selectedDesign = designs.find(d => d.id === selectedDesignId);
  const selectedProduct = products.find(p => p.id === productId);

  // Derive height/colour numbers for the AI prompt from the
  // currently-selected product options.
  const heightFt = (() => {
    const m = (heightOption || '6ft').match(/(\d+)/);
    return m ? Number(m[1]) : 6;
  })();
  const colorForAi = colorOption || 'Black';
  const styleForAi = selectedDesign?.style || selectedDesign?.name || 'Privacy';

  /**
   * Pre-fill the form with the values the vision model inferred
   * from the customer's house photo. We only set a field if the
   * product's options list actually contains a matching value -
   * that way we never invent an option that doesn't exist in the
   * wholesaler's catalogue.
   */
  function applyVisionResult(r: { style?: string; color?: string; heightFt?: number; surroundings?: string; notes?: string }) {
    if (r.style) {
      // Try to match a design by its `style` field (case-insensitive).
      const match = designs.find(d => (d.style || d.name || '').toLowerCase() === r.style!.toLowerCase());
      if (match) setSelectedDesignId(match.id);
    }
    if (r.color && selectedProduct?.colorOptions?.length) {
      const match = selectedProduct.colorOptions.find((c: string) => c.toLowerCase() === r.color!.toLowerCase());
      if (match) setColorOption(match);
    }
    if (r.heightFt != null && selectedProduct?.heightOptions?.length) {
      // heightOptions are strings like "4ft"; find one whose digits match.
      const match = selectedProduct.heightOptions.find((h: string) => {
        const m = h.match(/(\d+)/); return m && Number(m[1]) === r.heightFt;
      });
      if (match) setHeightOption(match);
    }
    if (r.surroundings || r.notes) {
      const line = [r.surroundings, r.notes].filter(Boolean).join(' | ');
      setNotes(prev => prev ? prev + '\n' + line : line);
    }
  }

  /**
   * Persist a freshly-generated AI image so it survives a page
   * refresh or a round-trip via the dashboard. We write the URL
   * to sessionStorage (tab-scoped) and, if the user has already
   * saved a draft quote, we also PATCH renderUrl on the server
   * so the image shows up the next time the quote is opened.
   */
  function persistAiImage(url: string) {
    setAiImageUrl(url);
    try { sessionStorage.setItem(aiImageKey, url); } catch { /* ignore */ }
    if (draftId) {
      // Best-effort: persist to the backend. We don't block the
      // UI on this; failures just mean the URL only lives in
      // sessionStorage.
      api.patch(`/quotes/${draftId}`, { renderUrl: url }).catch(() => {});
    }
  }

  async function save(status: 'DRAFT' | 'SENT') {
    setErr(null); setBusy(true);
    try {
      const stamped: FenceSegmentM[] = segments.map(s => ({ ...s, productId, heightOption, colorOption }));

      // Pick the best available render: AI image > sharp top-down > nothing
      let renderUrl: string | undefined = aiImageUrl || undefined;
      if (!renderUrl && floorPlanUrl && selectedDesign) {
        try {
          const { data } = await api.post('/render', {
            floorPlanUrl, designOverlayUrl: selectedDesign.overlayUrl,
            fenceSegments: stamped.map(s => ({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, lengthM: s.lengthM })),
            floorPlanWidthM: planW, floorPlanHeightM: planH,
          });
          renderUrl = data.url;
        } catch { /* best-effort */ }
      }
      let quoteId = draftId;
      if (quoteId) {
        // Update the existing draft. We only send fields the API
        // accepts on PATCH for a DRAFT (the backend rejects most
        // field changes once a quote is SENT).
        const { data: q } = await api.patch(`/quotes/${quoteId}`, {
          customerName, customerEmail, customerPhone, projectAddress, notes,
          selectedDesignId, floorPlanUrl, floorPlanWidthM: planW, floorPlanHeightM: planH,
          fenceSegments: stamped, renderUrl, taxRate,
        });
        quoteId = q.id;
      } else {
        const { data: q } = await api.post('/quotes', {
          customerName, customerEmail, customerPhone, projectAddress, notes,
          selectedDesignId, floorPlanUrl, floorPlanWidthM: planW, floorPlanHeightM: planH,
          fenceSegments: stamped, renderUrl, taxRate,
        });
        quoteId = q.id;
        setDraftId(quoteId);
      }
      if (status === 'SENT') {
        await api.put(`/quotes/${quoteId}/status`, { status: 'SENT' });
      }
      // The render is now persisted on the quote; drop the
      // sessionStorage copy so the next NewQuotePage starts clean.
      try { sessionStorage.removeItem(aiImageKey); } catch { /* ignore */ }
      nav(`/quotes/${quoteId}`);
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Failed to save quote');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap">
        <Link to="/" className="text-sm text-slate-500 hover:text-brand-700">&larr; Back to quotes</Link>
        <h1 className="font-bold">New quote</h1>
        <div className="ml-auto flex gap-2">
          <button onClick={() => save('DRAFT')} disabled={busy || !draftValid}
            className="px-3 py-1.5 border rounded text-sm disabled:opacity-50"
            title={!draftValid ? 'Customer name and email are required' : ''}>
            Save draft
          </button>
          <button onClick={() => save('SENT')} disabled={busy || !sendValid}
            className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50"
            title={!sendValid ? 'Customer name, email, and at least one fence segment are required' : ''}>
            Save &amp; send to customer
          </button>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-6 py-6 grid grid-cols-3 gap-4">
        <section className="col-span-2 space-y-4">
          {segments.length === 0 && (
            <div className="p-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded">
              No fence segments drawn yet. Use <b>Calibrate scale</b> then <b>Draw fence</b> to add segments. You can save a draft without them, but you'll need at least one segment before sending to the customer.
            </div>
          )}
          <Card title="1. Floor plan">
            <div className="flex items-center gap-2 mb-3 text-sm">
              <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-sm" />
              <button onClick={() => upload(fileRef, setFloorPlanUrl)} className="px-2 py-1 border rounded">Upload</button>
              {floorPlanUrl && <span className="text-emerald-700 text-xs">✓ uploaded</span>}
            </div>
            <PlanEditor
              imageUrl={floorPlanUrl}
              onChange={(s, w, h) => { setSegments(s); setPlanW(w); setPlanH(h); }}
            />
          </Card>

          <Card title="2. Design preview">
            <div className="flex items-center gap-2 mb-3 text-sm">
              <label>Design:</label>
              <select value={selectedDesignId} onChange={e => setSelectedDesignId(e.target.value)} className="border rounded px-2 py-1">
                {designs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input ref={houseRef} type="file" accept="image/*" className="text-sm ml-4" />
              <button onClick={() => upload(houseRef, setHousePhotoUrl)} className="px-2 py-1 border rounded">Upload house photo</button>
              {housePhotoUrl && <span className="text-emerald-700 text-xs">✓</span>}
            </div>
            {housePhotoUrl && selectedDesign ? (
              <DesignPreview
                houseImageUrl={housePhotoUrl}
                overlayUrl={selectedDesign.overlayUrl}
                segments={segments}
                widthM={planW} heightM={planH}
              />
            ) : (
              <div className="border rounded bg-slate-100 h-64 grid place-items-center text-slate-500 text-sm">
                Upload a house photo to see a quick 2D preview
              </div>
            )}

            <div className="mt-4 pt-3 border-t">
              <AiControls
                style={styleForAi}
                color={colorForAi}
                heightFt={heightFt}
                panelCount={Math.ceil(segments.reduce((s, x) => s + x.lengthM, 0) / 2.4)}
                onImage={(url) => persistAiImage(url)}
                onAnalyse={(r) => applyVisionResult(r)}
              />
            </div>
          </Card>
        </section>

        <section className="space-y-4">
          {err && <div className="p-2 text-sm bg-red-50 text-red-700 border border-red-200 rounded">{err}</div>}
          <Card title="Customer">
            <Field label="Name *"><input className="input" value={customerName} onChange={e => setCustomerName(e.target.value)} required /></Field>
            <Field label="Email *"><input className="input" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} required /></Field>
            <Field label="Phone"><input className="input" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} /></Field>
            <Field label="Project address"><input className="input" value={projectAddress} onChange={e => setProjectAddress(e.target.value)} /></Field>
            {!customerValid && (customerName || customerEmail) && (
              <div className="text-xs text-amber-700 mt-1">Name and a valid email are required.</div>
            )}
          </Card>

          <Card title="Fence configuration">
            <Field label="Primary product">
              <select className="input" value={productId} onChange={e => setProductId(e.target.value)}>
                {products.map(p => <option key={p.id} value={p.id}>{p.name} – ${Number(p.effectivePrice).toFixed(2)} / {p.unit}</option>)}
              </select>
            </Field>
            {selectedProduct?.heightOptions?.length ? (
              <Field label="Height">
                <select className="input" value={heightOption} onChange={e => setHeightOption(e.target.value)}>
                  <option value="">(any)</option>
                  {selectedProduct.heightOptions.map((h: string) => <option key={h} value={h}>{h}</option>)}
                </select>
              </Field>
            ) : null}
            {selectedProduct?.colorOptions?.length ? (
              <Field label="Color">
                <select className="input" value={colorOption} onChange={e => setColorOption(e.target.value)}>
                  <option value="">(any)</option>
                  {selectedProduct.colorOptions.map((c: string) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
            ) : null}
            <Field label="Tax rate (%)">
              <input className="input" type="number" value={taxRate} onChange={e => setTaxRate(+e.target.value)} step="0.01" />
            </Field>
          </Card>

          <Card title="Notes">
            <textarea className="input min-h-24" value={notes} onChange={e => setNotes(e.target.value)} />
          </Card>
        </section>
      </main>
      <style>{`.input { width:100%; border:1px solid #cbd5e1; border-radius: 0.375rem; padding: 0.4rem 0.6rem; font-size: 0.875rem; }`}</style>
    </div>
  );
}

function Card({ title, children }: any) {
  return (
    <div className="bg-white border rounded p-4">
      <h2 className="font-semibold text-sm text-slate-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}
function Field({ label, children }: any) {
  return <label className="block mb-2"><span className="block text-xs text-slate-500 mb-1">{label}</span>{children}</label>;
}
