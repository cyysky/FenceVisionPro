import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import { SkeletonRows } from '../components/ui/Skeleton';

export default function ProductsPage() {
  const toast = useToast();
  const [products, setProducts] = useState<any[] | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'PANEL' | 'POST' | 'GATE' | 'ACCESSORY'>('ALL');
  useEffect(() => {
    api.get('/products').then(r => setProducts(r.data)).catch(() => {
      setProducts([]);
      toast.error('Failed to load products');
    });
  }, [toast]);

  const filtered = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    return products.filter(p => {
      if (filter !== 'ALL' && p.category !== filter) return false;
      if (!q) return true;
      return (p.name || '').toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q);
    });
  }, [products, search, filter]);

  const counts = useMemo(() => {
    if (!products) return { ALL: 0, PANEL: 0, POST: 0, GATE: 0, ACCESSORY: 0 };
    const out: Record<string, number> = { ALL: products.length, PANEL: 0, POST: 0, GATE: 0, ACCESSORY: 0 };
    for (const p of products) out[p.category] = (out[p.category] || 0) + 1;
    return out;
  }, [products]);

  return (
    <div className="min-h-full">
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center flex-wrap gap-2">
        <Link to="/quotes" className="text-sm text-slate-500 hover:text-brand-700">← Back</Link>
        <h1 className="font-bold">Products & prices</h1>
        <span className="ml-2 text-xs text-slate-500 hidden sm:inline">Your effective price per product (after any per-dealer override).</span>
      </header>
      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
        <div className="flex flex-wrap gap-2 text-xs items-center">
          {(['ALL', 'PANEL', 'POST', 'GATE', 'ACCESSORY'] as const).map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className={`px-2.5 py-1 rounded-full border ${filter === c ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'}`}>
              {c} <span className={`ml-1 ${filter === c ? 'opacity-80' : 'text-slate-400'}`}>{counts[c] || 0}</span>
            </button>
          ))}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or SKU…"
            className="ml-auto px-2 py-1 border rounded text-xs w-full sm:w-48"
            aria-label="Search products"
          />
        </div>
        <div className="bg-white border rounded overflow-x-auto">
          {products === null ? (
            <div className="p-4"><SkeletonRows rows={5} cols={6} /></div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500 border-b">
                <tr>
                  <th className="px-4 py-2">SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th>Heights</th>
                  <th>Colors</th>
                  <th className="text-right pr-4">Base</th>
                  <th className="text-right pr-4">Your price</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const base = Number(p.basePrice);
                  const eff = Number(p.effectivePrice);
                  const overridden = Math.abs(base - eff) > 0.001;
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono text-xs">{p.sku}</td>
                      <td className="px-4 py-2">{p.name}</td>
                      <td><span className="text-xs px-1.5 py-0.5 bg-slate-100 rounded">{p.category}</span></td>
                      <td className="text-xs text-slate-600">{p.unit}</td>
                      <td className="text-xs text-slate-600">{(p.heightOptions || []).join(', ') || <span className="text-slate-300">—</span>}</td>
                      <td className="text-xs text-slate-600">{(p.colorOptions || []).join(', ') || <span className="text-slate-300">—</span>}</td>
                      <td className="text-right pr-4 text-xs text-slate-500">${base.toFixed(2)}</td>
                      <td className="text-right pr-4">
                        <span className={`font-medium ${overridden ? 'text-amber-700' : ''}`}>
                          ${eff.toFixed(2)}
                        </span>
                        {overridden && <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-700">override</span>}
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr><td colSpan={8} className="text-center py-10 text-slate-500">
                    {products.length === 0 ? 'No products available.' : (
                      <>No products match the filter. <button onClick={() => { setFilter('ALL'); setSearch(''); }} className="text-brand-700 underline">Clear filter</button></>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
