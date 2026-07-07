import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { SkeletonCard } from '../components/ui/Skeleton';

export default function DesignsPage() {
  const toast = useToast();
  const [designs, setDesigns] = useState<any[] | null>(null);
  const [search, setSearch] = useState('');
  const [style, setStyle] = useState<string>('ALL');

  useEffect(() => {
    api.get('/designs').then(r => setDesigns(r.data)).catch(() => {
      setDesigns([]);
      toast.error('Failed to load designs');
    });
  }, [toast]);

  const styles = useMemo(() => {
    if (!designs) return ['ALL'];
    const set = new Set<string>(['ALL']);
    for (const d of designs) if (d.style) set.add(d.style);
    return Array.from(set);
  }, [designs]);

  const filtered = useMemo(() => {
    if (!designs) return [];
    const q = search.trim().toLowerCase();
    return designs.filter(d => {
      if (style !== 'ALL' && d.style !== style) return false;
      if (!q) return true;
      return (d.name || '').toLowerCase().includes(q) || (d.style || '').toLowerCase().includes(q);
    });
  }, [designs, style, search]);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center flex-wrap gap-2">
        <Link to="/quotes" className="text-sm text-slate-500 hover:text-brand-700">← Back</Link>
        <h1 className="font-bold">Design library</h1>
        <span className="text-xs text-slate-500">({filtered.length} of {designs?.length || 0})</span>
      </header>
      <main className="max-w-6xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="bg-white border rounded p-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {styles.map(s => (
              <button key={s} onClick={() => setStyle(s)}
                className={`px-2.5 py-1 rounded-full text-xs border ${
                  style === s ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                }`}>
                {s}
              </button>
            ))}
          </div>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or style…"
            className="ml-auto px-2 py-1 border rounded text-sm w-48"
            aria-label="Search designs"
          />
        </div>

        {designs === null ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border rounded p-12 text-center text-slate-500">
            {designs.length === 0 ? (
              <>
                <div className="text-3xl">🎨</div>
                <div className="mt-2">No designs in the library yet.</div>
                <p className="text-xs mt-1">Ask an admin to upload design overlays.</p>
              </>
            ) : (
              <>
                <div className="text-3xl">🔍</div>
                <div className="mt-2">No designs match the filter.</div>
                <button onClick={() => { setSearch(''); setStyle('ALL'); }} className="mt-2 text-brand-700 underline text-sm">Clear filter</button>
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(d => (
              <div key={d.id} className="bg-white border rounded overflow-hidden hover:border-brand-300 transition-colors">
                <div className="aspect-video bg-slate-100 grid place-items-center text-slate-400 text-sm">
                  {d.overlayUrl ? <img src={d.overlayUrl} alt={d.name} className="w-full h-full object-cover" /> : 'No preview'}
                </div>
                <div className="p-3">
                  <div className="font-medium">{d.name}</div>
                  <div className="text-xs text-slate-500">{d.style}</div>
                  {d.description && <div className="text-xs text-slate-600 mt-1 line-clamp-2">{d.description}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
