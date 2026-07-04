import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import {
  createProject, addMeasurement, addSelection,
} from '../lib/projects';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';
import type { InstallScope, ProjectType } from '../lib/types';

/**
 * NewProjectPage - single-page form (no wizard) for creating an
 * end-customer project. Sectioned cards for Customer, Property,
 * Measurements, Selections, and Review. On submit we POST the
 * project, then loop over the row arrays to create the related
 * measurements / selections. We don't fail the whole form if a
 * row insert errors - instead we toast and keep going.
 */
export default function NewProjectPage() {
  const nav = useNavigate();
  const toast = useToast();

  // Catalogue lookups
  const [products, setProducts] = useState<any[] | null>(null);
  const [designs, setDesigns] = useState<any[] | null>(null);
  useEffect(() => {
    Promise.all([
      api.get('/products').then(r => r.data).catch(() => null),
      api.get('/designs').then(r => r.data).catch(() => null),
    ]).then(([p, d]) => {
      setProducts(p ?? []);
      setDesigns(d ?? []);
      if (p === null) toast.error('Failed to load products');
      if (d === null) toast.error('Failed to load designs');
    });
  }, [toast]);

  // Section 1: customer
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');

  // Section 2: property & install
  const [projectType, setProjectType] = useState<ProjectType>('RESIDENTIAL');
  const [installScope, setInstallScope] = useState<InstallScope>('FULL');
  const [notes, setNotes] = useState('');

  // Section 3: measurements
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([
    { label: '', lengthM: 0, heightFt: 0, widthM: 0, slopeDeg: 0, notes: '' },
  ]);

  // Section 4: selections
  const [selections, setSelections] = useState<SelectionRow[]>([
    { productId: '', designId: '', linearMeters: 0, heightFt: 0, panelCount: 0, gateCount: 0, notes: '' },
  ]);

  // Section 5: totals
  const [totalLinearMeters, setTotalLinearMeters] = useState(0);
  const [totalAreaSqM, setTotalAreaSqM] = useState(0);

  // Submission state
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emailLooksValid = customerEmail.length === 0 || /\S+@\S+\.\S+/.test(customerEmail);
  const canSubmit = customerName.trim().length > 0 && emailLooksValid && !busy;

  function addMeasurementRow() {
    setMeasurements(rs => [...rs, { label: '', lengthM: 0, heightFt: 0, widthM: 0, slopeDeg: 0, notes: '' }]);
  }
  function removeMeasurementRow(idx: number) {
    setMeasurements(rs => rs.filter((_, i) => i !== idx));
  }
  function updateMeasurementRow(idx: number, patch: Partial<MeasurementRow>) {
    setMeasurements(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  function addSelectionRow() {
    setSelections(rs => [...rs, { productId: '', designId: '', linearMeters: 0, heightFt: 0, panelCount: 0, gateCount: 0, notes: '' }]);
  }
  function removeSelectionRow(idx: number) {
    setSelections(rs => rs.filter((_, i) => i !== idx));
  }
  function updateSelectionRow(idx: number, patch: Partial<SelectionRow>) {
    setSelections(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  }

  async function submit() {
    setErr(null); setBusy(true);
    try {
      // Filter out empty measurement/selection rows so the user
      // doesn't have to delete the seeded row if they only want
      // the project header.
      const validMeasurements = measurements.filter(m => m.label.trim() && m.lengthM > 0 && m.heightFt > 0);
      const validSelections = selections.filter(s => s.productId && s.linearMeters > 0 && s.heightFt > 0);

      const project = await createProject({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        projectType,
        installScope,
        notes: notes.trim() || undefined,
        totalLinearMeters: validMeasurements.length
          ? validMeasurements.reduce((s, m) => s + Number(m.lengthM || 0), 0)
          : (totalLinearMeters || undefined),
        totalAreaSqM: totalAreaSqM || undefined,
      });

      // Related rows: insert sequentially. We swallow per-row
      // errors so a single bad row doesn't kill the project, but
      // we toast so the user knows.
      for (const m of validMeasurements) {
        try {
          await addMeasurement(project.id, {
            label: m.label.trim(),
            lengthM: Number(m.lengthM),
            heightFt: Number(m.heightFt),
            widthM: m.widthM ? Number(m.widthM) : undefined,
            slopeDeg: m.slopeDeg ? Number(m.slopeDeg) : undefined,
            notes: m.notes?.trim() || undefined,
          });
        } catch (e: any) {
          toast.warning(`Measurement "${m.label}" not added: ${apiErrorMessage(e)}`);
        }
      }
      for (const s of validSelections) {
        try {
          await addSelection(project.id, {
            productId: s.productId,
            designId: s.designId || undefined,
            linearMeters: Number(s.linearMeters),
            heightFt: Number(s.heightFt),
            panelCount: s.panelCount ? Number(s.panelCount) : undefined,
            gateCount: s.gateCount ? Number(s.gateCount) : undefined,
            notes: s.notes?.trim() || undefined,
          });
        } catch (e: any) {
          toast.warning(`Selection row not added: ${apiErrorMessage(e)}`);
        }
      }

      toast.success('Project created');
      nav(`/projects/${project.id}`);
    } catch (e: any) {
      setErr(apiErrorMessage(e, 'Failed to create project'));
      toast.error(apiErrorMessage(e, 'Failed to create project'));
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <Link to="/projects" className="text-sm text-slate-500 hover:text-brand-700">← Projects</Link>
          <h1 className="font-bold text-lg">New end-customer project</h1>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        {err && <div role="alert" className="p-3 text-sm bg-red-50 text-red-700 border border-red-200 rounded">{err}</div>}

        <Card title="1. Customer info" subtitle="Who is the project for?">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Customer name" required>
              <input className="input w-full" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Jane Smith" />
            </Field>
            <Field label="Email" hint={!emailLooksValid ? 'Looks invalid' : undefined}>
              <input className="input w-full" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="jane@example.com" />
            </Field>
            <Field label="Phone">
              <input className="input w-full" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="555-123-4567" />
            </Field>
            <Field label="Address" className="sm:col-span-2">
              <textarea className="input w-full" rows={2} value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="123 Main St, Springfield" />
            </Field>
          </div>
        </Card>

        <Card title="2. Property & install scope" subtitle="What kind of job is this?">
          <div className="space-y-3">
            <Field label="Project type">
              <div className="flex gap-4 text-sm">
                {(['RESIDENTIAL', 'COMMERCIAL'] as const).map(t => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="projectType" value={t} checked={projectType === t} onChange={() => setProjectType(t)} />
                    <span>{t === 'RESIDENTIAL' ? 'Residential' : 'Commercial'}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Install scope">
              <div className="flex gap-4 text-sm">
                {(['FULL', 'HALF', 'PARTIAL'] as const).map(s => (
                  <label key={s} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name="installScope" value={s} checked={installScope === s} onChange={() => setInstallScope(s)} />
                    <span>{s.charAt(0) + s.slice(1).toLowerCase()}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Notes">
              <textarea className="input w-full" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Access notes, customer preferences, etc." />
            </Field>
          </div>
        </Card>

        <Card title="3. Measurements" subtitle="Side lengths, gate openings, etc.">
          <div className="space-y-2">
            {measurements.map((m, idx) => (
              <div key={idx} className="grid grid-cols-2 sm:grid-cols-7 gap-2 items-end p-2 bg-slate-50 rounded">
                <Field label="Label" className="col-span-2 sm:col-span-2">
                  <input className="input w-full text-sm" value={m.label} onChange={e => updateMeasurementRow(idx, { label: e.target.value })} placeholder="Front yard" />
                </Field>
                <Field label="Length (m)">
                  <input type="number" min={0} step={0.1} className="input w-full text-sm" value={m.lengthM || ''} onChange={e => updateMeasurementRow(idx, { lengthM: Number(e.target.value) })} />
                </Field>
                <Field label="Height (ft)">
                  <input type="number" min={0} step={0.1} className="input w-full text-sm" value={m.heightFt || ''} onChange={e => updateMeasurementRow(idx, { heightFt: Number(e.target.value) })} />
                </Field>
                <Field label="Width (m)">
                  <input type="number" min={0} step={0.1} className="input w-full text-sm" value={m.widthM || ''} onChange={e => updateMeasurementRow(idx, { widthM: Number(e.target.value) })} />
                </Field>
                <Field label="Slope (°)">
                  <input type="number" min={-45} max={45} step={1} className="input w-full text-sm" value={m.slopeDeg || ''} onChange={e => updateMeasurementRow(idx, { slopeDeg: Number(e.target.value) })} />
                </Field>
                <button
                  type="button" onClick={() => removeMeasurementRow(idx)}
                  className="px-2 py-1.5 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                  aria-label={`Remove measurement ${idx + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" onClick={addMeasurementRow} className="text-sm text-brand-700 hover:underline">+ Add measurement</button>
          </div>
        </Card>

        <Card title="4. Fence selections" subtitle="What products will go where?">
          {products === null || designs === null ? (
            <SkeletonRows rows={2} cols={5} />
          ) : (
            <div className="space-y-2">
              {selections.map((s, idx) => (
                <div key={idx} className="grid grid-cols-2 sm:grid-cols-8 gap-2 items-end p-2 bg-slate-50 rounded">
                  <Field label="Product" className="col-span-2 sm:col-span-2">
                    <select className="input w-full text-sm" value={s.productId} onChange={e => updateSelectionRow(idx, { productId: e.target.value })}>
                      <option value="">— pick —</option>
                      {products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Design" className="col-span-2 sm:col-span-2">
                    <select className="input w-full text-sm" value={s.designId} onChange={e => updateSelectionRow(idx, { designId: e.target.value })}>
                      <option value="">(none)</option>
                      {designs.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Linear (m)">
                    <input type="number" min={0} step={0.1} className="input w-full text-sm" value={s.linearMeters || ''} onChange={e => updateSelectionRow(idx, { linearMeters: Number(e.target.value) })} />
                  </Field>
                  <Field label="Height (ft)">
                    <input type="number" min={0} step={0.1} className="input w-full text-sm" value={s.heightFt || ''} onChange={e => updateSelectionRow(idx, { heightFt: Number(e.target.value) })} />
                  </Field>
                  <Field label="Panels">
                    <input type="number" min={0} step={1} className="input w-full text-sm" value={s.panelCount || ''} onChange={e => updateSelectionRow(idx, { panelCount: Number(e.target.value) })} />
                  </Field>
                  <Field label="Gates">
                    <input type="number" min={0} step={1} className="input w-full text-sm" value={s.gateCount || ''} onChange={e => updateSelectionRow(idx, { gateCount: Number(e.target.value) })} />
                  </Field>
                  <button
                    type="button" onClick={() => removeSelectionRow(idx)}
                    className="px-2 py-1.5 text-xs border border-red-200 text-red-700 rounded hover:bg-red-50"
                    aria-label={`Remove selection ${idx + 1}`}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" onClick={addSelectionRow} className="text-sm text-brand-700 hover:underline">+ Add selection</button>
            </div>
          )}
        </Card>

        <Card title="5. Review & create" subtitle="Totals are optional - they'll be auto-calculated from measurements if you leave the box empty.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Total linear meters (auto)">
              <input
                type="number" min={0} step={0.1} className="input w-full"
                value={
                  // Sum of measurement lengths; if user-edited, prefer that.
                  totalLinearMeters || measurements.reduce((s, m) => s + Number(m.lengthM || 0), 0)
                }
                onChange={e => setTotalLinearMeters(Number(e.target.value))}
                placeholder="auto"
              />
            </Field>
            <Field label="Total area (sq m)">
              <input
                type="number" min={0} step={0.1} className="input w-full"
                value={totalAreaSqM || ''} onChange={e => setTotalAreaSqM(Number(e.target.value))}
                placeholder="optional"
              />
            </Field>
          </div>
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm text-slate-600 mb-2">
              {measurements.filter(m => m.label.trim()).length} measurement(s) ·
              {' '}{selections.filter(s => s.productId).length} selection(s) ·
              {' '}{customerName.trim() ? `customer: ${customerName.trim()}` : 'no customer name yet'}
            </div>
            <button
              type="button" onClick={submit} disabled={!canSubmit}
              className="w-full px-3 py-2 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50"
            >
              {busy ? 'Creating…' : 'Create Project'}
            </button>
            {!canSubmit && (
              <p className="text-xs text-slate-500 text-center mt-2">
                {!customerName.trim() ? 'Customer name is required. ' : ''}
                {!emailLooksValid ? 'Fix the email address. ' : ''}
              </p>
            )}
          </div>
        </Card>
      </main>
    </div>
  );
}

interface MeasurementRow {
  label: string;
  lengthM: number;
  heightFt: number;
  widthM: number;
  slopeDeg: number;
  notes: string;
}

interface SelectionRow {
  productId: string;
  designId: string;
  linearMeters: number;
  heightFt: number;
  panelCount: number;
  gateCount: number;
  notes: string;
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border rounded p-4">
      <h2 className="font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-slate-500 mb-3">{subtitle}</p>}
      {children}
    </section>
  );
}

function Field({ label, required, hint, className, children }: { label: string; required?: boolean; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className || ''}`}>
      <span className="block text-xs font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-600 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-red-600 mt-1">{hint}</span>}
    </label>
  );
}
