import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listProjects } from '../lib/projects';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';
import type { Project, ProjectStatus, ProjectType, InstallScope } from '../lib/types';

const STATUSES: ProjectStatus[] = ['DRAFT', 'SUBMITTED', 'QUOTED', 'APPROVED', 'INSTALLED', 'CANCELLED'];
const SCOPES: InstallScope[] = ['FULL', 'HALF', 'PARTIAL'];
const TYPES: ProjectType[] = ['RESIDENTIAL', 'COMMERCIAL'];
const PAGE_SIZE = 50;

export default function ProjectsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Project[] | null>(null);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | ProjectStatus>('');
  const [scope, setScope] = useState<'' | InstallScope>('');
  const [ptype, setPtype] = useState<'' | ProjectType>('');
  const [skip, setSkip] = useState(0);

  // Debounce search so we don't fire a request on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, scope, ptype, skip]);

  async function load() {
    try {
      const params: Record<string, string | number> = { take: PAGE_SIZE, skip };
      if (status) params.status = status;
      if (scope) params.installScope = scope;
      if (ptype) params.projectType = ptype;
      if (search.trim()) params.q = search.trim();
      const { rows, total } = await listProjects(params);
      setRows(rows);
      setTotal(total);
    } catch {
      setRows([]);
      setTotal(0);
      toast.error('Failed to load projects');
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(skip / PAGE_SIZE) + 1;

  return (
    <div className="min-h-full bg-slate-50">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-2">
          <Link to="/" className="text-sm text-slate-500 hover:text-brand-700">← Dashboard</Link>
          <h1 className="font-bold text-lg">End Customer Projects</h1>
          <span className="text-xs text-slate-500 hidden sm:inline">{user?.fullName || user?.email}</span>
          <Link to="/projects/new" className="ml-auto px-3 py-1.5 bg-brand-600 text-white rounded text-sm font-medium">
            + New Project
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <section className="bg-white border rounded p-3 flex flex-wrap items-center gap-2">
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setSkip(0); }}
            placeholder="Search customer, email, notes…"
            aria-label="Search projects"
            className="px-2 py-1 border rounded text-sm w-full sm:w-64"
          />
          <select
            value={status} onChange={e => { setStatus(e.target.value as any); setSkip(0); }}
            className="px-2 py-1 border rounded text-sm"
            aria-label="Filter by status"
          >
            <option value="">All statuses</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={scope} onChange={e => { setScope(e.target.value as any); setSkip(0); }}
            className="px-2 py-1 border rounded text-sm"
            aria-label="Filter by install scope"
          >
            <option value="">All scopes</option>
            {SCOPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={ptype} onChange={e => { setPtype(e.target.value as any); setSkip(0); }}
            className="px-2 py-1 border rounded text-sm"
            aria-label="Filter by project type"
          >
            <option value="">All types</option>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {(status || scope || ptype || search) && (
            <button
              onClick={() => { setStatus(''); setScope(''); setPtype(''); setSearch(''); setSkip(0); }}
              className="ml-auto text-xs text-slate-500 hover:text-slate-800 underline"
            >
              Clear filters
            </button>
          )}
        </section>

        <section className="bg-white border rounded overflow-x-auto">
          {rows === null ? (
            <div className="p-4"><SkeletonRows rows={5} cols={6} /></div>
          ) : rows.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              <div className="text-2xl mb-2">📁</div>
              {total === 0
                ? <>No projects yet. <Link to="/projects/new" className="text-brand-700 underline">Create your first one</Link>.</>
                : <>No projects match the filter. <button onClick={() => { setStatus(''); setScope(''); setPtype(''); setSearch(''); setSkip(0); }} className="text-brand-700 underline">Clear filter</button></>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b">
                <tr>
                  <th className="px-4 py-2">Customer</th>
                  <th>Address</th>
                  <th>Type</th>
                  <th>Scope</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link to={`/projects/${p.id}`} className="text-brand-700 hover:underline font-medium">
                        {p.customerName}
                      </Link>
                      {p.customerEmail && <div className="text-xs text-slate-500">{p.customerEmail}</div>}
                    </td>
                    <td className="text-xs text-slate-600 max-w-[16rem] truncate" title={p.customerAddress || ''}>
                      {p.customerAddress || <span className="text-slate-300">—</span>}
                    </td>
                    <td><span className="text-xs text-slate-600">{p.projectType}</span></td>
                    <td><ScopeBadge scope={p.installScope} /></td>
                    <td><StatusBadge status={p.status} /></td>
                    <td className="text-xs text-slate-500">{new Date(p.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2 text-sm">
            <button
              onClick={() => setSkip(Math.max(0, skip - PAGE_SIZE))}
              disabled={skip === 0}
              className="px-2 py-1 border rounded disabled:opacity-40"
            >
              ‹ Prev
            </button>
            <span className="text-slate-500">Page {currentPage} of {totalPages}</span>
            <button
              onClick={() => setSkip(skip + PAGE_SIZE)}
              disabled={skip + PAGE_SIZE >= total}
              className="px-2 py-1 border rounded disabled:opacity-40"
            >
              Next ›
            </button>
          </div>
        )}
      </main>
    </div>
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
  return (
    <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${STATUS_COLORS[status] || 'bg-slate-100'}`}>
      {status}
    </span>
  );
}

const SCOPE_COLORS: Record<InstallScope, string> = {
  FULL: 'bg-emerald-100 text-emerald-700',
  HALF: 'bg-amber-100 text-amber-700',
  PARTIAL: 'bg-sky-100 text-sky-700',
};

function ScopeBadge({ scope }: { scope: InstallScope }) {
  return (
    <span className={`px-2 py-0.5 rounded text-xs whitespace-nowrap ${SCOPE_COLORS[scope] || 'bg-slate-100'}`}>
      {scope}
    </span>
  );
}
