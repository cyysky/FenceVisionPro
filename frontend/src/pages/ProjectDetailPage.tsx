import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, apiErrorMessage } from '../lib/api';
import {
  getProject, updateProject, deleteProject,
  addSelection, updateSelection, deleteSelection,
  addMeasurement, updateMeasurement, deleteMeasurement,
  uploadDocument, deleteDocument, fetchDocumentBlob,
  generateVisualization, deleteVisualization, fetchVisualizationBlob, fetchVisualizationText,
  promoteToQuote,
} from '../lib/projects';
import { useToast } from '../components/ui/Toast';
import { confirm } from '../components/ui/Confirm';
import { Skeleton, SkeletonRows } from '../components/ui/Skeleton';
import { Tabs, Tab } from '../components/ui/Tabs';
import type {
  Project, ProjectDocument, ProjectFenceSelection, ProjectMeasurement,
  ProjectVisualization, ProjectStatus,
} from '../lib/types';

const ALLOWED_DOC_TYPES = '.png,.jpg,.jpeg,.webp,.pdf';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const nav = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    try {
      const p = await getProject(id);
      setProject(p);
      setLoadErr(null);
    } catch (e: any) {
      setLoadErr(apiErrorMessage(e, 'Failed to load project'));
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [id]);

  async function onEditSave(patch: Partial<Project>) {
    if (!id) return;
    setBusy('edit');
    try {
      const updated = await updateProject(id, patch);
      setProject(p => ({ ...(p as Project), ...updated }));
      setEditing(false);
      toast.success('Project updated');
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Update failed'));
    } finally { setBusy(null); }
  }

  async function onDelete() {
    if (!id || !project) return;
    const ok = await confirm({
      title: 'Cancel this project?',
      message: `${project.customerName} will be marked CANCELLED. You can still see it in the list.`,
      confirmLabel: 'Cancel project',
      variant: 'danger',
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteProject(id);
      toast.success('Project cancelled');
      nav('/projects');
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Delete failed'));
    } finally { setBusy(null); }
  }

  async function onPromote() {
    if (!id || !project) return;
    const ok = await confirm({
      title: 'Promote to Quote?',
      message: 'A new quote will be created from this project. You can edit it further on the quote page.',
      confirmLabel: 'Promote',
    });
    if (!ok) return;
    setBusy('promote');
    try {
      const { quoteId } = await promoteToQuote(id);
      toast.success(`Quote created — ${quoteId.slice(0, 8)}…`);
      nav(`/quotes/${quoteId}`);
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Promote failed'));
    } finally { setBusy(null); }
  }

  async function onSetStatus(status: ProjectStatus) {
    if (!id) return;
    setBusy('status');
    try {
      const updated = await updateProject(id, { status });
      setProject(p => ({ ...(p as Project), ...updated }));
      toast.success(`Status changed to ${status}`);
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Status change failed'));
    } finally { setBusy(null); }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto p-6 space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-1/2" />
        <SkeletonRows rows={6} cols={4} />
      </div>
    );
  }
  if (loadErr || !project) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-red-700">
        <Link to="/projects" className="text-brand-700 hover:underline">← Projects</Link>
        <p className="mt-3">{loadErr || 'Project not found'}</p>
      </div>
    );
  }

  const counts = {
    documents: project.documents?.length ?? 0,
    selections: project.selections?.length ?? 0,
    measurements: project.measurements?.length ?? 0,
    visualizations: project.visualizations?.length ?? 0,
  };

  const isCancelled = project.status === 'CANCELLED';
  const hasQuotes = (project.quotes?.length ?? 0) > 0;

  const tabs: Tab[] = [
    { key: 'overview', label: 'Overview', content: (
      <OverviewTab
        project={project}
        editing={editing}
        onStartEdit={() => setEditing(true)}
        onCancelEdit={() => setEditing(false)}
        onSave={onEditSave}
        busy={busy === 'edit'}
      />
    )},
    { key: 'documents', label: 'Documents', badge: counts.documents, content: (
      <DocumentsTab
        projectId={project.id}
        documents={project.documents ?? []}
        onChange={async () => { await load(); }}
      />
    )},
    { key: 'selections', label: 'Selections', badge: counts.selections, content: (
      <SelectionsTab
        projectId={project.id}
        selections={project.selections ?? []}
        onChange={async () => { await load(); }}
      />
    )},
    { key: 'measurements', label: 'Measurements', badge: counts.measurements, content: (
      <MeasurementsTab
        projectId={project.id}
        measurements={project.measurements ?? []}
        onChange={async () => { await load(); }}
      />
    )},
    { key: 'visualisations', label: 'Visualisations', badge: counts.visualizations, content: (
      <VisualisationsTab
        projectId={project.id}
        visualizations={project.visualizations ?? []}
        onChange={async () => { await load(); }}
      />
    )},
    { key: 'quote', label: 'Quote', content: (
      <QuoteTab
        project={project}
        hasQuotes={hasQuotes}
        onPromote={onPromote}
        busy={busy === 'promote'}
      />
    )},
  ];

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <Link to="/projects" className="text-sm text-slate-500 hover:text-brand-700">← Projects</Link>
          <h1 className="font-bold text-lg">{project.customerName}</h1>
          {project.customerAddress && <span className="text-xs text-slate-500 hidden sm:inline">— {project.customerAddress}</span>}
          <StatusBadge status={project.status} />
          <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
            {!isCancelled && project.status === 'DRAFT' && (
              <button onClick={() => onSetStatus('SUBMITTED')} disabled={busy !== null}
                className="px-3 py-1.5 border border-amber-300 text-amber-800 rounded hover:bg-amber-50 text-xs disabled:opacity-50">
                {busy === 'status' ? '…' : 'Mark submitted'}
              </button>
            )}
            {!isCancelled && !hasQuotes && (
              <button onClick={onPromote} disabled={busy !== null}
                className="px-3 py-1.5 bg-brand-600 text-white rounded text-xs font-medium disabled:opacity-50">
                {busy === 'promote' ? 'Promoting…' : 'Promote to Quote'}
              </button>
            )}
            {!isCancelled && (
              <button onClick={() => setEditing(e => !e)} disabled={busy !== null}
                className="px-3 py-1.5 border rounded text-xs disabled:opacity-50">
                {editing ? 'Done editing' : 'Edit'}
              </button>
            )}
            {!isCancelled && (
              <button onClick={onDelete} disabled={busy !== null}
                className="px-3 py-1.5 border border-red-300 text-red-700 rounded text-xs hover:bg-red-50 disabled:opacity-50">
                {busy === 'delete' ? '…' : 'Cancel project'}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6">
        <section className="bg-white border rounded p-4">
          <Tabs tabs={tabs} initial="overview" />
        </section>
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab({ project, editing, onStartEdit, onCancelEdit, onSave, busy }: {
  project: Project;
  editing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: (patch: Partial<Project>) => void;
  busy: boolean;
}) {
  const [name, setName] = useState(project.customerName);
  const [email, setEmail] = useState(project.customerEmail || '');
  const [phone, setPhone] = useState(project.customerPhone || '');
  const [address, setAddress] = useState(project.customerAddress || '');
  const [notes, setNotes] = useState(project.notes || '');

  // Reset local state when switching into edit mode for a fresh form
  useEffect(() => {
    if (editing) {
      setName(project.customerName);
      setEmail(project.customerEmail || '');
      setPhone(project.customerPhone || '');
      setAddress(project.customerAddress || '');
      setNotes(project.notes || '');
    }
  }, [editing, project]);

  if (editing) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Customer name"><input className="input w-full" value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Email"><input className="input w-full" type="email" value={email} onChange={e => setEmail(e.target.value)} /></Field>
          <Field label="Phone"><input className="input w-full" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
          <Field label="Address"><input className="input w-full" value={address} onChange={e => setAddress(e.target.value)} /></Field>
        </div>
        <Field label="Notes"><textarea className="input w-full" rows={2} value={notes} onChange={e => setNotes(e.target.value)} /></Field>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancelEdit} className="px-3 py-1.5 border rounded text-sm">Cancel</button>
          <button
            onClick={() => onSave({
              customerName: name.trim() || project.customerName,
              customerEmail: email.trim() || null,
              customerPhone: phone.trim() || null,
              customerAddress: address.trim() || null,
              notes: notes.trim() || null,
            } as any)}
            disabled={busy}
            className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        <Row label="Customer" value={project.customerName} />
        <Row label="Project type" value={project.projectType} />
        <Row label="Email" value={project.customerEmail} />
        <Row label="Install scope" value={project.installScope} />
        <Row label="Phone" value={project.customerPhone} />
        <Row label="Total linear m" value={project.totalLinearMeters != null ? String(project.totalLinearMeters) : null} />
        <Row label="Address" value={project.customerAddress} className="sm:col-span-2" />
        <Row label="Total area (sq m)" value={project.totalAreaSqM != null ? String(project.totalAreaSqM) : null} />
        <Row label="Notes" value={project.notes} className="sm:col-span-2" />
        <Row label="Created" value={new Date(project.createdAt).toLocaleString()} />
        <Row label="Updated" value={new Date(project.updatedAt).toLocaleString()} />
        {project.submittedAt && <Row label="Submitted" value={new Date(project.submittedAt).toLocaleString()} />}
      </div>
      <div className="pt-2 border-t">
        <button onClick={onStartEdit} className="text-sm text-brand-700 hover:underline">Edit customer info</button>
      </div>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value?: string | null; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-slate-900">{value || <span className="text-slate-300">—</span>}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function DocumentsTab({ projectId, documents, onChange }: {
  projectId: string;
  documents: ProjectDocument[];
  onChange: () => Promise<void>;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<string>('SITE_PHOTO');
  const [caption, setCaption] = useState('');
  const [preview, setPreview] = useState<ProjectDocument | null>(null);

  async function onUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(projectId, file, kind as any, caption.trim() || undefined);
      toast.success('Document uploaded');
      if (fileRef.current) fileRef.current.value = '';
      setCaption('');
      await onChange();
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Upload failed'));
    } finally { setUploading(false); }
  }

  async function onDelete(d: ProjectDocument) {
    const ok = await confirm({
      title: 'Delete document?',
      message: d.originalFilename,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteDocument(projectId, d.id);
      toast.success('Document deleted');
      await onChange();
    } catch (e: any) {
      toast.error(apiErrorMessage(e, 'Delete failed'));
    }
  }

  return (
    <div className="space-y-3">
      <div className="border border-dashed border-slate-300 rounded p-4 bg-slate-50">
        <div className="text-sm font-medium mb-2">Upload document</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <Field label="Kind" className="sm:col-span-1">
            <select className="input w-full text-sm" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="SITE_PHOTO">Site photo</option>
              <option value="FLOOR_PLAN">Floor plan</option>
              <option value="PROPERTY_DEED">Property deed</option>
              <option value="REFERENCE_IMAGE">Reference image</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Caption (optional)" className="sm:col-span-2">
            <input className="input w-full text-sm" value={caption} onChange={e => setCaption(e.target.value)} placeholder="e.g. Front elevation" />
          </Field>
          <div className="flex gap-2 sm:justify-end">
            <input ref={fileRef} type="file" accept={ALLOWED_DOC_TYPES} className="text-sm" />
            <button onClick={onUpload} disabled={uploading}
              className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500 mt-2">Allowed: PNG, JPEG, WEBP, PDF · max 25 MB</p>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-8 text-slate-500 text-sm">No documents uploaded yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {documents.map(d => (
            <DocumentTile key={d.id} projectId={projectId} doc={d} onPreview={() => setPreview(d)} onDelete={() => onDelete(d)} />
          ))}
        </div>
      )}

      {preview && (
        <DocumentPreviewModal projectId={projectId} doc={preview} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

function DocumentTile({ projectId, doc, onPreview, onDelete }: { projectId: string; doc: ProjectDocument; onPreview: () => void; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    if (doc.mimeType.startsWith('image/')) {
      fetchDocumentBlob(projectId, doc.id)
        .then(blob => { if (!cancelled) { url = URL.createObjectURL(blob); setThumb(url); } })
        .catch(() => { /* ignore */ });
    }
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [projectId, doc.id, doc.mimeType]);

  const isImage = doc.mimeType.startsWith('image/');
  return (
    <div className="border rounded bg-white overflow-hidden flex flex-col">
      <button
        type="button" onClick={onPreview}
        className="aspect-square bg-slate-100 grid place-items-center text-3xl"
        title={doc.originalFilename}
      >
        {isImage && thumb ? (
          <img src={thumb} alt={doc.originalFilename} className="w-full h-full object-cover" />
        ) : (
          <div className="text-slate-500 text-center px-2">
            <div className="text-2xl">📄</div>
            <div className="text-[10px] mt-1 uppercase">{doc.mimeType.split('/')[1] || 'file'}</div>
          </div>
        )}
      </button>
      <div className="p-2 text-xs flex-1">
        <div className="font-medium truncate" title={doc.originalFilename}>{doc.originalFilename}</div>
        <div className="text-slate-500">{doc.kind.replace('_', ' ').toLowerCase()}</div>
      </div>
      <div className="p-1 border-t flex justify-end">
        <button onClick={onDelete} className="text-xs text-red-600 hover:underline px-1">Delete</button>
      </div>
    </div>
  );
}

function DocumentPreviewModal({ projectId, doc, onClose }: { projectId: string; doc: ProjectDocument; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setLoading(true);
    fetchDocumentBlob(projectId, doc.id)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, doc.id]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b flex items-center gap-2">
          <div className="font-medium text-sm flex-1 truncate">{doc.originalFilename}</div>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
        </div>
        <div className="p-3 bg-slate-100">
          {loading ? (
            <div className="h-64 grid place-items-center text-sm text-slate-500">Loading…</div>
          ) : url ? (
            doc.mimeType === 'application/pdf' ? (
              <iframe src={url} className="w-full" style={{ height: '70vh' }} title={doc.originalFilename} />
            ) : (
              <img src={url} alt={doc.originalFilename} className="max-w-full mx-auto" />
            )
          ) : (
            <div className="h-64 grid place-items-center text-sm text-red-700">Could not load preview</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Selections
// ---------------------------------------------------------------------------

function SelectionsTab({ projectId, selections, onChange }: {
  projectId: string;
  selections: ProjectFenceSelection[];
  onChange: () => Promise<void>;
}) {
  const toast = useToast();
  const [products, setProducts] = useState<any[] | null>(null);
  const [designs, setDesigns] = useState<any[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [row, setRow] = useState({ productId: '', designId: '', linearMeters: 0, heightFt: 6, panelCount: 0, gateCount: 0, notes: '' });

  useEffect(() => {
    Promise.all([
      api.get('/products').then(r => r.data).catch(() => null),
      api.get('/designs').then(r => r.data).catch(() => null),
    ]).then(([p, d]) => { setProducts(p ?? []); setDesigns(d ?? []); });
  }, []);

  async function onAdd() {
    if (!row.productId || row.linearMeters <= 0) return;
    try {
      await addSelection(projectId, {
        productId: row.productId,
        designId: row.designId || undefined,
        linearMeters: Number(row.linearMeters),
        heightFt: Number(row.heightFt),
        panelCount: row.panelCount || undefined,
        gateCount: row.gateCount || undefined,
        notes: row.notes.trim() || undefined,
      });
      toast.success('Selection added');
      setAdding(false);
      setRow({ productId: '', designId: '', linearMeters: 0, heightFt: 6, panelCount: 0, gateCount: 0, notes: '' });
      await onChange();
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Add failed')); }
  }

  async function onUpdate(sel: ProjectFenceSelection, patch: Partial<ProjectFenceSelection>) {
    try {
      await updateSelection(projectId, sel.id, patch);
      await onChange();
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Update failed')); }
  }
  async function onDelete(sel: ProjectFenceSelection) {
    const ok = await confirm({ title: 'Delete selection?', message: 'This cannot be undone.', variant: 'danger' });
    if (!ok) return;
    try {
      await deleteSelection(projectId, sel.id);
      toast.success('Selection deleted');
      await onChange();
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Delete failed')); }
  }

  return (
    <div className="space-y-3">
      {selections.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">No fence selections yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="px-2 py-1">Product</th>
                <th>Design</th>
                <th>Linear m</th>
                <th>Height ft</th>
                <th>Panels</th>
                <th>Gates</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selections.map(s => (
                <SelectionRow key={s.id} sel={s} onUpdate={onUpdate} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="border rounded p-3 bg-slate-50 grid grid-cols-2 sm:grid-cols-7 gap-2 items-end">
          <Field label="Product" className="col-span-2">
            <select className="input w-full text-sm" value={row.productId} onChange={e => setRow(r => ({ ...r, productId: e.target.value }))}>
              <option value="">— pick —</option>
              {products?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <Field label="Design" className="col-span-2">
            <select className="input w-full text-sm" value={row.designId} onChange={e => setRow(r => ({ ...r, designId: e.target.value }))}>
              <option value="">(none)</option>
              {designs?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="Linear m"><input type="number" min={0} step={0.1} className="input w-full text-sm" value={row.linearMeters || ''} onChange={e => setRow(r => ({ ...r, linearMeters: Number(e.target.value) }))} /></Field>
          <Field label="Height ft"><input type="number" min={0} step={0.1} className="input w-full text-sm" value={row.heightFt || ''} onChange={e => setRow(r => ({ ...r, heightFt: Number(e.target.value) }))} /></Field>
          <Field label="Panels"><input type="number" min={0} step={1} className="input w-full text-sm" value={row.panelCount || ''} onChange={e => setRow(r => ({ ...r, panelCount: Number(e.target.value) }))} /></Field>
          <Field label="Gates"><input type="number" min={0} step={1} className="input w-full text-sm" value={row.gateCount || ''} onChange={e => setRow(r => ({ ...r, gateCount: Number(e.target.value) }))} /></Field>
          <div className="col-span-2 sm:col-span-7 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="px-3 py-1 border rounded text-sm">Cancel</button>
            <button onClick={onAdd} disabled={!row.productId || row.linearMeters <= 0}
              className="px-3 py-1 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
              Add
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-sm text-brand-700 hover:underline">+ Add selection</button>
      )}
    </div>
  );
}

function SelectionRow({ sel, onUpdate, onDelete }: { sel: ProjectFenceSelection; onUpdate: (s: ProjectFenceSelection, p: Partial<ProjectFenceSelection>) => void; onDelete: (s: ProjectFenceSelection) => void }) {
  const [editing, setEditing] = useState(false);
  const [linear, setLinear] = useState(sel.linearMeters);
  const [height, setHeight] = useState(sel.heightFt);
  const [panels, setPanels] = useState(sel.panelCount || 0);
  const [gates, setGates] = useState(sel.gateCount || 0);

  if (!editing) {
    return (
      <tr className="border-b last:border-0">
        <td className="px-2 py-1">{sel.product?.name || <span className="text-slate-400 text-xs">{sel.productId.slice(0, 8)}…</span>}</td>
        <td>{sel.design?.name || <span className="text-slate-300">—</span>}</td>
        <td>{sel.linearMeters}</td>
        <td>{sel.heightFt}</td>
        <td>{sel.panelCount ?? <span className="text-slate-300">—</span>}</td>
        <td>{sel.gateCount ?? <span className="text-slate-300">—</span>}</td>
        <td className="text-right">
          <button onClick={() => setEditing(true)} className="text-xs text-brand-700 hover:underline mr-2">Edit</button>
          <button onClick={() => onDelete(sel)} className="text-xs text-red-600 hover:underline">Delete</button>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b last:border-0 bg-amber-50">
      <td className="px-2 py-1 text-xs text-slate-600">{sel.product?.name || sel.productId.slice(0, 8)}</td>
      <td className="text-xs text-slate-600">{sel.design?.name || '—'}</td>
      <td><input type="number" min={0} step={0.1} className="input w-20 text-xs" value={linear} onChange={e => setLinear(Number(e.target.value))} /></td>
      <td><input type="number" min={0} step={0.1} className="input w-16 text-xs" value={height} onChange={e => setHeight(Number(e.target.value))} /></td>
      <td><input type="number" min={0} step={1} className="input w-16 text-xs" value={panels} onChange={e => setPanels(Number(e.target.value))} /></td>
      <td><input type="number" min={0} step={1} className="input w-16 text-xs" value={gates} onChange={e => setGates(Number(e.target.value))} /></td>
      <td className="text-right">
        <button
          onClick={() => { onUpdate(sel, { linearMeters: linear, heightFt: height, panelCount: panels || null, gateCount: gates || null }); setEditing(false); }}
          className="text-xs text-brand-700 hover:underline mr-2"
        >Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:underline">Cancel</button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

function MeasurementsTab({ projectId, measurements, onChange }: {
  projectId: string;
  measurements: ProjectMeasurement[];
  onChange: () => Promise<void>;
}) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [row, setRow] = useState({ label: '', lengthM: 0, heightFt: 6, widthM: 0, slopeDeg: 0, notes: '' });

  async function onAdd() {
    if (!row.label.trim() || row.lengthM <= 0) return;
    try {
      await addMeasurement(projectId, {
        label: row.label.trim(),
        lengthM: Number(row.lengthM),
        heightFt: Number(row.heightFt),
        widthM: row.widthM || undefined,
        slopeDeg: row.slopeDeg || undefined,
        notes: row.notes.trim() || undefined,
      });
      toast.success('Measurement added');
      setAdding(false);
      setRow({ label: '', lengthM: 0, heightFt: 6, widthM: 0, slopeDeg: 0, notes: '' });
      await onChange();
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Add failed')); }
  }

  async function onDelete(m: ProjectMeasurement) {
    const ok = await confirm({ title: 'Delete measurement?', message: m.label, variant: 'danger' });
    if (!ok) return;
    try { await deleteMeasurement(projectId, m.id); toast.success('Deleted'); await onChange(); }
    catch (e: any) { toast.error(apiErrorMessage(e, 'Delete failed')); }
  }

  return (
    <div className="space-y-3">
      {measurements.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">No measurements yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-slate-500 border-b">
              <tr>
                <th className="px-2 py-1">Label</th>
                <th>Length m</th>
                <th>Height ft</th>
                <th>Width m</th>
                <th>Slope °</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {measurements.map(m => (
                <MeasurementRow key={m.id} m={m} onUpdate={async (patch) => {
                  try { await updateMeasurement(projectId, m.id, patch); await onChange(); }
                  catch (e: any) { toast.error(apiErrorMessage(e, 'Update failed')); }
                }} onDelete={() => onDelete(m)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adding ? (
        <div className="border rounded p-3 bg-slate-50 grid grid-cols-2 sm:grid-cols-6 gap-2 items-end">
          <Field label="Label" className="col-span-2"><input className="input w-full text-sm" value={row.label} onChange={e => setRow(r => ({ ...r, label: e.target.value }))} placeholder="Front yard" /></Field>
          <Field label="Length m"><input type="number" min={0} step={0.1} className="input w-full text-sm" value={row.lengthM || ''} onChange={e => setRow(r => ({ ...r, lengthM: Number(e.target.value) }))} /></Field>
          <Field label="Height ft"><input type="number" min={0} step={0.1} className="input w-full text-sm" value={row.heightFt || ''} onChange={e => setRow(r => ({ ...r, heightFt: Number(e.target.value) }))} /></Field>
          <Field label="Width m"><input type="number" min={0} step={0.1} className="input w-full text-sm" value={row.widthM || ''} onChange={e => setRow(r => ({ ...r, widthM: Number(e.target.value) }))} /></Field>
          <Field label="Slope °"><input type="number" min={-45} max={45} step={1} className="input w-full text-sm" value={row.slopeDeg || ''} onChange={e => setRow(r => ({ ...r, slopeDeg: Number(e.target.value) }))} /></Field>
          <div className="col-span-2 sm:col-span-6 flex justify-end gap-2">
            <button onClick={() => setAdding(false)} className="px-3 py-1 border rounded text-sm">Cancel</button>
            <button onClick={onAdd} disabled={!row.label.trim() || row.lengthM <= 0} className="px-3 py-1 bg-brand-600 text-white rounded text-sm disabled:opacity-50">Add</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="text-sm text-brand-700 hover:underline">+ Add measurement</button>
      )}
    </div>
  );
}

function MeasurementRow({ m, onUpdate, onDelete }: { m: ProjectMeasurement; onUpdate: (patch: Partial<ProjectMeasurement>) => void; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(m.label);
  const [lengthM, setLengthM] = useState(m.lengthM);
  const [heightFt, setHeightFt] = useState(m.heightFt);
  const [widthM, setWidthM] = useState(m.widthM || 0);
  const [slopeDeg, setSlopeDeg] = useState(m.slopeDeg || 0);

  if (!editing) {
    return (
      <tr className="border-b last:border-0">
        <td className="px-2 py-1">{m.label}</td>
        <td>{m.lengthM}</td>
        <td>{m.heightFt}</td>
        <td>{m.widthM ?? <span className="text-slate-300">—</span>}</td>
        <td>{m.slopeDeg ?? <span className="text-slate-300">—</span>}</td>
        <td className="text-xs text-slate-500 max-w-[10rem] truncate">{m.notes || <span className="text-slate-300">—</span>}</td>
        <td className="text-right">
          <button onClick={() => setEditing(true)} className="text-xs text-brand-700 hover:underline mr-2">Edit</button>
          <button onClick={onDelete} className="text-xs text-red-600 hover:underline">Delete</button>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-b last:border-0 bg-amber-50">
      <td className="px-2 py-1"><input className="input w-full text-xs" value={label} onChange={e => setLabel(e.target.value)} /></td>
      <td><input type="number" min={0} step={0.1} className="input w-20 text-xs" value={lengthM} onChange={e => setLengthM(Number(e.target.value))} /></td>
      <td><input type="number" min={0} step={0.1} className="input w-16 text-xs" value={heightFt} onChange={e => setHeightFt(Number(e.target.value))} /></td>
      <td><input type="number" min={0} step={0.1} className="input w-16 text-xs" value={widthM} onChange={e => setWidthM(Number(e.target.value))} /></td>
      <td><input type="number" min={-45} max={45} step={1} className="input w-16 text-xs" value={slopeDeg} onChange={e => setSlopeDeg(Number(e.target.value))} /></td>
      <td className="text-xs text-slate-500">—</td>
      <td className="text-right">
        <button onClick={() => { onUpdate({ label, lengthM, heightFt, widthM: widthM || null, slopeDeg: slopeDeg || null }); setEditing(false); }} className="text-xs text-brand-700 hover:underline mr-2">Save</button>
        <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:underline">Cancel</button>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Visualisations
// ---------------------------------------------------------------------------

function VisualisationsTab({ projectId, visualizations, onChange }: {
  projectId: string;
  visualizations: ProjectVisualization[];
  onChange: () => Promise<void>;
}) {
  const toast = useToast();
  const [style, setStyle] = useState('Privacy');
  const [color, setColor] = useState('Black');
  const [heightFt, setHeightFt] = useState(6);
  const [busy, setBusy] = useState<string | null>(null);
  const [viewing, setViewing] = useState<ProjectVisualization | null>(null);

  async function generate(kind: 'AI_IMAGE' | 'AI_3D_SNAPSHOT') {
    setBusy(kind);
    try {
      await generateVisualization(projectId, { kind, style, color, heightFt: Number(heightFt) });
      toast.success(`${kind === 'AI_IMAGE' ? 'AI render' : '3D scene'} generated`);
      await onChange();
    } catch (e: any) { toast.error(apiErrorMessage(e, 'Generation failed')); }
    finally { setBusy(null); }
  }

  async function onDelete(v: ProjectVisualization) {
    const ok = await confirm({ title: 'Delete visualisation?', message: `${v.kind} from ${new Date(v.generatedAt).toLocaleString()}`, variant: 'danger' });
    if (!ok) return;
    try { await deleteVisualization(projectId, v.id); toast.success('Deleted'); await onChange(); }
    catch (e: any) { toast.error(apiErrorMessage(e, 'Delete failed')); }
  }

  return (
    <div className="space-y-3">
      <div className="border rounded p-3 bg-slate-50">
        <div className="text-sm font-medium mb-2">Generate new</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
          <Field label="Style"><input className="input w-full text-sm" value={style} onChange={e => setStyle(e.target.value)} /></Field>
          <Field label="Color"><input className="input w-full text-sm" value={color} onChange={e => setColor(e.target.value)} /></Field>
          <Field label="Height (ft)"><input type="number" min={0.5} step={0.5} className="input w-full text-sm" value={heightFt} onChange={e => setHeightFt(Number(e.target.value))} /></Field>
          <div className="flex gap-2 sm:justify-end">
            <button onClick={() => generate('AI_IMAGE')} disabled={busy !== null}
              className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm disabled:opacity-50">
              {busy === 'AI_IMAGE' ? '…' : '✨ AI render'}
            </button>
            <button onClick={() => generate('AI_3D_SNAPSHOT')} disabled={busy !== null}
              className="px-3 py-1.5 border rounded text-sm disabled:opacity-50">
              {busy === 'AI_3D_SNAPSHOT' ? '…' : '🧊 3D scene'}
            </button>
          </div>
        </div>
      </div>

      {visualizations.length === 0 ? (
        <div className="text-center py-6 text-slate-500 text-sm">No visualisations yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {visualizations.map(v => (
            <VisTile key={v.id} projectId={projectId} vis={v} onView={() => setViewing(v)} onDelete={() => onDelete(v)} />
          ))}
        </div>
      )}

      {viewing && <VisPreviewModal projectId={projectId} vis={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function VisTile({ projectId, vis, onView, onDelete }: { projectId: string; vis: ProjectVisualization; onView: () => void; onDelete: () => void }) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (vis.kind !== 'AI_IMAGE') return;
    let cancelled = false;
    let url: string | null = null;
    fetchVisualizationBlob(projectId, vis.id)
      .then(blob => { if (!cancelled) { url = URL.createObjectURL(blob); setThumb(url); } })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [projectId, vis.id, vis.kind]);

  return (
    <div className="border rounded bg-white overflow-hidden flex flex-col">
      <button type="button" onClick={onView} className="aspect-square bg-slate-100 grid place-items-center text-3xl" title={vis.prompt || vis.kind}>
        {thumb ? (
          <img src={thumb} alt={vis.kind} className="w-full h-full object-cover" />
        ) : (
          <div className="text-slate-500 text-center px-2">
            <div className="text-2xl">{vis.kind === 'AI_3D_SNAPSHOT' ? '🧊' : '🖼️'}</div>
            <div className="text-[10px] mt-1">{vis.kind}</div>
          </div>
        )}
      </button>
      <div className="p-2 text-xs flex-1">
        <div className="font-medium">{vis.kind === 'AI_3D_SNAPSHOT' ? '3D source' : 'AI render'}</div>
        <div className="text-slate-500">{new Date(vis.generatedAt).toLocaleString()}</div>
        {vis.modelUsed && <div className="text-slate-400 text-[10px]">model: {vis.modelUsed}</div>}
      </div>
      <div className="p-1 border-t flex justify-end">
        <button onClick={onDelete} className="text-xs text-red-600 hover:underline px-1">Delete</button>
      </div>
    </div>
  );
}

function VisPreviewModal({ projectId, vis, onClose }: { projectId: string; vis: ProjectVisualization; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (vis.kind === 'AI_IMAGE') {
      fetchVisualizationBlob(projectId, vis.id)
        .then(blob => { if (!cancelled) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } })
        .catch(() => { /* ignore */ });
    } else {
      fetchVisualizationText(projectId, vis.id)
        .then(t => { if (!cancelled) setCode(t); })
        .catch(() => { /* ignore */ });
    }
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [projectId, vis.id, vis.kind]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={onClose}>
      <div className="bg-white rounded max-w-4xl w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b flex items-center gap-2">
          <div className="font-medium text-sm flex-1">{vis.kind} — {new Date(vis.generatedAt).toLocaleString()}</div>
          <button onClick={onClose} className="text-sm text-slate-500 hover:text-slate-800">Close</button>
        </div>
        <div className="p-3 bg-slate-100">
          {vis.kind === 'AI_IMAGE' ? (
            url ? <img src={url} alt={vis.kind} className="max-w-full mx-auto" /> : <div className="h-64 grid place-items-center text-sm text-slate-500">Loading…</div>
          ) : (
            <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded overflow-auto" style={{ maxHeight: '70vh' }}>
              {code ?? 'Loading…'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

function QuoteTab({ project, hasQuotes, onPromote, busy }: {
  project: Project;
  hasQuotes: boolean;
  onPromote: () => void;
  busy: boolean;
}) {
  return (
    <div className="space-y-3">
      {hasQuotes ? (
        <div>
          <div className="text-sm font-medium mb-2">Linked quotes</div>
          <ul className="space-y-1">
            {project.quotes!.map(q => (
              <li key={q.id} className="text-sm">
                <Link to={`/quotes/${q.id}`} className="text-brand-700 hover:underline font-mono text-xs">{q.reference}</Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-center py-6">
          <div className="text-sm text-slate-600 mb-3">Not quoted yet.</div>
          <button onClick={onPromote} disabled={busy}
            className="px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium disabled:opacity-50">
            {busy ? 'Promoting…' : 'Promote to Quote'}
          </button>
          {project.status === 'CANCELLED' && (
            <p className="text-xs text-red-700 mt-2">Cancelled projects can't be promoted.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

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

const STATUS_COLORS: Record<ProjectStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  QUOTED: 'bg-sky-100 text-sky-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  INSTALLED: 'bg-emerald-700 text-white',
  CANCELLED: 'bg-red-100 text-red-700',
};

function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${STATUS_COLORS[status] || 'bg-slate-100'}`}>{status}</span>;
}
