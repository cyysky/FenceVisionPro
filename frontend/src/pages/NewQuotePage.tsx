import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import { PlanEditor, FenceSegmentM } from '../components/PlanEditor';
import { DesignPreview } from '../components/DesignPreview';
import { AiControls } from '../components/AiControls';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';

const STEPS = [
  { key: 'plan',   label: 'Plan',     hint: 'Upload a floor plan, calibrate the scale, then draw fence segments.' },
  { key: 'design', label: 'Design',   hint: 'Pick a fence style, optionally upload a house photo for context.' },
  { key: 'ai',     label: 'AI',       hint: 'Generate a photorealistic preview and a 3D scene.' },
  { key: 'review', label: 'Review',   hint: 'Fill in customer details, set pricing, then save or send.' },
] as const;

export default function NewQuotePage() {
  const nav = useNavigate();
  const toast = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [designs, setDesigns] = useState<any[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null);
  const [housePhotoUrl, setHousePhotoUrl] = useState<string | null>(null);
  const [aiImageUrl, setAiImageUrl] = useState<string | null>(null);
  const [segments, setSegments] = useState<FenceSegmentM[]>([]);
  const [planW, setPlanW] = useState(0); const [planH, setPlanH] = useState(0);
  const [uploading, setUploading] = useState<'floor' | 'house' | null>(null);

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
  const [draftId, setDraftId] = useState<string | null>(null);

  const aiImageKey = 'fvp.newQuote.aiImageUrl';
  const threeCodeKey = 'fvp.newQuote.threeCode';
  const [initialThreeCode, setInitialThreeCode] = useState<string | null>(() => {
    try { return sessionStorage.getItem(threeCodeKey); } catch { return null; }
  });
  useEffect(() => {
    try { const saved = sessionStorage.getItem(aiImageKey); if (saved) setAiImageUrl(saved); } catch { /* ignore */ }
  }, []);

  // Live validation hints so users see issues immediately.
  const emailLooksValid = customerEmail.length === 0 || /\S+@\S+\.\S+/.test(customerEmail);
  const emailInvalid = customerEmail.length > 0 && !emailLooksValid;
  const customerValid = customerName.trim().length > 0 && emailLooksValid;
  const segmentsValid = segments.length > 0;
  const sendValid = customerValid && segmentsValid && productId;

  useEffect(() => {
    setLoadingLists(true);
    Promise.all([
      api.get('/products').then(r => r.data),
      api.get('/designs').then(r => r.data),
    ]).then(([prods, des]) => {
      setProducts(prods);
      setDesigns(des);
      const panel = prods.find((p: any) => p.category === 'PANEL');
      setProductId((panel || prods[0])?.id || '');
      if (des.length) setSelectedDesignId(des[0].id);
    }).catch(e => toast.error(apiErrorMessage(e, 'Failed to load products/designs')))
      .finally(() => setLoadingLists(false));
  }, [toast]);

  const fileRef = useRef<HTMLInputElement>(null);
  const houseRef = useRef<HTMLInputElement>(null);

  async function upload(ref: React.RefObject<HTMLInputElement>, setter: (url: string) => void, kind: 'floor' | 'house') {
    const file = ref.current?.files?.[0]; if (!file) return;
    setUploading(kind);
    try {
      const fd = new FormData(); fd.append('file', file);
      const { data } = await api.post('/quotes/upload-floorplan', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setter(data.url);
      toast.success(`${kind === 'house' ? 'House photo' : 'Floor plan'} uploaded`);
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Upload failed'));
    } finally { setUploading(null); }
  }

  const selectedDesign = designs.find(d => d.id === selectedDesignId);
  const selectedProduct = products.find(p => p.id === productId);

  const heightFt = useMemo(() => {
    const m = (heightOption || '6ft').match(/(\d+)/);
    return m ? Number(m[1]) : 6;
  }, [heightOption]);
  const colorForAi = colorOption || 'Black';
  const styleForAi = selectedDesign?.style || selectedDesign?.name || 'Privacy';

  // Live total preview
  const totals = useMemo(() => {
    if (!selectedProduct || !segmentsValid) return null;
    const totalLen = segments.reduce((s, x) => s + x.lengthM, 0);
    const base = Number(selectedProduct.basePrice) || 0;
    const qty = selectedProduct.unit === 'linear_ft' || selectedProduct.unit === 'm'
      ? totalLen : Math.ceil(totalLen / 2.4);
    const subtotal = qty * base;
    const taxAmount = +(subtotal * (taxRate / 100)).toFixed(2);
    return { qty: Number(qty.toFixed(2)), subtotal: +subtotal.toFixed(2), taxAmount, total: +(subtotal + taxAmount).toFixed(2) };
  }, [selectedProduct, segments, taxRate, segmentsValid]);

  function applyVisionResult(r: { style?: string; color?: string; heightFt?: number; surroundings?: string; notes?: string }) {
    let applied: string[] = [];
    if (r.style) {
      const match = designs.find(d => (d.style || d.name || '').toLowerCase() === r.style!.toLowerCase());
      if (match) { setSelectedDesignId(match.id); applied.push('design'); }
    }
    if (r.color && selectedProduct?.colorOptions?.length) {
      const match = selectedProduct.colorOptions.find((c: string) => c.toLowerCase() === r.color!.toLowerCase());
      if (match) { setColorOption(match); applied.push('color'); }
    }
    if (r.heightFt != null && selectedProduct?.heightOptions?.length) {
      const match = selectedProduct.heightOptions.find((h: string) => {
        const m = h.match(/(\d+)/); return m && Number(m[1]) === r.heightFt;
      });
      if (match) { setHeightOption(match); applied.push('height'); }
    }
    if (r.surroundings || r.notes) {
      const line = [r.surroundings, r.notes].filter(Boolean).join(' | ');
      setNotes(prev => prev ? prev + '\n' + line : line);
      applied.push('notes');
    }
    if (applied.length) toast.success(`AI pre-filled: ${applied.join(', ')}`);
    else toast.info('AI analysis returned no catalogue matches - check product options');
  }

  function persistAiImage(url: string) {
    setAiImageUrl(url);
    try { sessionStorage.setItem(aiImageKey, url); } catch { /* ignore */ }
    if (draftId) api.patch(`/quotes/${draftId}`, { renderUrl: url }).catch(() => {});
  }

  async function save(status: 'DRAFT' | 'SENT') {
    setErr(null); setBusy(true);
    try {
      const stamped: FenceSegmentM[] = segments.map(s => ({ ...s, productId, heightOption, colorOption }));
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
        toast.success('Quote sent to customer');
      } else {
        toast.success('Draft saved');
      }
      try { sessionStorage.removeItem(aiImageKey); } catch { /* ignore */ }
      try { sessionStorage.removeItem(threeCodeKey); } catch { /* ignore */ }
      nav(`/quotes/${quoteId}`);
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Failed to save quote'));
      toast.error(apiErrorMessage(e, 'Failed to save quote'));
    } finally { setBusy(false); }
  }

  // Stepper state - which step is the user on?
  const currentStep = useMemo(() => {
    if (!segmentsValid) return 0;
    if (!selectedDesign) return 0;
    if (!aiImageUrl) return 2;
    return 3;
  }, [segmentsValid, selectedDesign, aiImageUrl]);

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <Link to="/" className="text-sm text-slate-500 hover:text-brand-700">← Dashboard</Link>
          <h1 className="font-bold text-lg">New quote</h1>
          {draftId && <span className="text-xs text-slate-500 ml-2">Auto-saved as draft</span>}
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        {/* Stepper */}
        <nav aria-label="Progress" className="bg-white border rounded p-3">
          <ol className="flex flex-wrap items-center gap-2 text-sm">
            {STEPS.map((s, i) => {
              const done = i < currentStep;
              const active = i === currentStep;
              return (
                <li key={s.key} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full grid place-items-center text-xs font-bold ${
                    done ? 'bg-emerald-500 text-white' :
                    active ? 'bg-brand-600 text-white' :
                    'bg-slate-200 text-slate-600'
                  }`}>{done ? '✓' : i + 1}</div>
                  <span className={active ? 'font-semibold' : done ? 'text-slate-500' : 'text-slate-400'}>{s.label}</span>
                  {i < STEPS.length - 1 && <span className="text-slate-300 mx-1">›</span>}
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-slate-500 mt-2">{STEPS[currentStep].hint}</p>
        </nav>

        {err && <div role="alert" className="p-3 text-sm bg-red-50 text-red-700 border border-red-200 rounded">{err}</div>}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card title="1. Floor plan & segments" subtitle="Upload a plan, set the scale, and draw your fence.">
              <PlanEditor
                imageUrl={floorPlanUrl}
                initialSegments={segments}
                initialWidthM={planW || undefined}
                initialHeightM={planH || undefined}
                onChange={(s, w, h) => { setSegments(s); setPlanW(w); setPlanH(h); }}
              />
              <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2 text-sm">
                <input ref={fileRef} type="file" accept="image/*,application/pdf" className="text-sm" id="floorplan-input" />
                <button onClick={() => upload(fileRef, setFloorPlanUrl, 'floor')} disabled={uploading !== null}
                  className="px-3 py-1 bg-slate-700 text-white rounded text-sm disabled:opacity-50">
                  {uploading === 'floor' ? 'Uploading…' : 'Upload floor plan'}
                </button>
                {floorPlanUrl && <span className="text-emerald-700 text-xs">✓ Floor plan loaded</span>}
              </div>
            </Card>

            <Card title="2. Design & house photo" subtitle="Choose a style and (optionally) upload a house photo for AI context.">
              {loadingLists ? (
                <SkeletonRows rows={2} cols={3} />
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
                    <label htmlFor="design-select" className="font-medium">Design:</label>
                    <select id="design-select" value={selectedDesignId} onChange={e => setSelectedDesignId(e.target.value)} className="border rounded px-2 py-1">
                      {designs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                    {selectedDesign && <span className="text-xs text-slate-500">style: {selectedDesign.style}</span>}
                    <input ref={houseRef} type="file" accept="image/*" className="text-sm ml-auto" id="house-input" />
                    <button onClick={() => upload(houseRef, setHousePhotoUrl, 'house')} disabled={uploading !== null}
                      className="px-3 py-1 bg-slate-700 text-white rounded text-sm disabled:opacity-50">
                      {uploading === 'house' ? 'Uploading…' : 'Upload house photo'}
                    </button>
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
                      {housePhotoUrl ? 'Select a design to see the preview' : 'Upload a house photo to see a quick 2D preview'}
                    </div>
                  )}
                </>
              )}
            </Card>

            <Card title="3. AI visualisation" subtitle="Generate a photorealistic image or a 3D scene based on the design.">
              <AiControls
                style={styleForAi}
                color={colorForAi}
                heightFt={heightFt}
                panelCount={Math.ceil(segments.reduce((s, x) => s + x.lengthM, 0) / 2.4)}
                housePhotoUrl={housePhotoUrl}
                initialCode={initialThreeCode}
                onImage={(url) => persistAiImage(url)}
                onAnalyse={(r) => applyVisionResult(r)}
                onCode={(code) => { try { sessionStorage.setItem(threeCodeKey, code); } catch { /* ignore */ } }}
              />
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="4. Customer & pricing" subtitle="Fill in the customer details, then save or send.">
              <div className="space-y-3">
                <Field label="Customer name *">
                  <input className={`input w-full ${customerName.trim().length === 0 ? '' : ''}`}
                    placeholder="Jane Smith"
                    value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </Field>
                <Field label="Customer email *" hint={emailInvalid ? 'That email doesn\'t look right' : undefined}>
                  <input type="email" className={`input w-full ${emailInvalid ? 'border-red-400' : ''}`}
                    placeholder="jane@example.com"
                    value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <input className="input w-full" placeholder="+1 555 0100"
                    value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} />
                </Field>
                <Field label="Project address">
                  <input className="input w-full" placeholder="123 Main St, Austin TX"
                    value={projectAddress} onChange={e => setProjectAddress(e.target.value)} />
                </Field>
                <Field label="Internal notes">
                  <textarea className="input w-full min-h-20" placeholder="Anything your team should know"
                    value={notes} onChange={e => setNotes(e.target.value)} />
                </Field>
              </div>
            </Card>

            <Card title="Product & options">
              {loadingLists ? (
                <SkeletonRows rows={4} cols={2} />
              ) : (
                <div className="space-y-3">
                  <Field label="Product">
                    <select className="input w-full" value={productId} onChange={e => setProductId(e.target.value)}>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}
                    </select>
                  </Field>
                  {selectedProduct?.heightOptions?.length ? (
                    <Field label="Height">
                      <select className="input w-full" value={heightOption} onChange={e => setHeightOption(e.target.value)}>
                        <option value="">(use default)</option>
                        {selectedProduct.heightOptions.map((h: string) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </Field>
                  ) : null}
                  {selectedProduct?.colorOptions?.length ? (
                    <Field label="Color">
                      <select className="input w-full" value={colorOption} onChange={e => setColorOption(e.target.value)}>
                        <option value="">(use default)</option>
                        {selectedProduct.colorOptions.map((c: string) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                  ) : null}
                  <Field label="Tax rate (%)">
                    <input type="number" min={0} max={25} step={0.25} className="input w-full"
                      value={taxRate} onChange={e => setTaxRate(Number(e.target.value) || 0)} />
                  </Field>
                </div>
              )}
            </Card>

            {totals && (
              <Card title="Estimated total" subtitle="Preview - final total is calculated server-side when the quote is saved.">
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between"><dt className="text-slate-500">Quantity</dt><dd>{totals.qty} {selectedProduct.unit === 'm' ? 'm' : (selectedProduct.unit === 'linear_ft' ? 'ft' : 'pcs')}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd>${totals.subtotal.toFixed(2)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">Tax ({taxRate}%)</dt><dd>${totals.taxAmount.toFixed(2)}</dd></div>
                  <div className="flex justify-between font-bold text-base border-t pt-2 mt-2"><dt>Total</dt><dd>${totals.total.toFixed(2)}</dd></div>
                </dl>
                <p className="text-xs text-slate-500 mt-2">Final total is calculated server-side when the quote is saved.</p>
              </Card>
            )}

            <Card>
              <div className="space-y-2">
                <button onClick={() => save('DRAFT')} disabled={busy || !customerValid}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm font-medium disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save draft'}
                </button>
                <button onClick={() => save('SENT')} disabled={busy || !sendValid}
                  className="w-full px-3 py-2 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50">
                  {busy ? 'Sending…' : 'Save & send to customer'}
                </button>
                {!customerValid && (
                  <p className="text-xs text-slate-500 text-center">
                    {!customerName.trim() ? 'Add a customer name. ' : ''}
                    {emailInvalid ? 'Fix the email address. ' : ''}
                  </p>
                )}
                {customerValid && !segmentsValid && (
                  <p className="text-xs text-amber-700 text-center">Draft will save without segments. Add at least one fence segment to send.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border rounded p-4">
      {title && <h2 className="font-semibold">{title}</h2>}
      {subtitle && <p className="text-xs text-slate-500 mb-3">{subtitle}</p>}
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-red-600 mt-1">{hint}</span>}
    </label>
  );
}
