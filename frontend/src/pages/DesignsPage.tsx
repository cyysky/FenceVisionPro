import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

export default function DesignsPage() {
  const [designs, setDesigns] = useState<any[]>([]);
  useEffect(() => { api.get('/designs').then(r => setDesigns(r.data)); }, []);
  return (
    <div className="min-h-full">
      <header className="bg-white border-b px-4 sm:px-6 py-3 flex items-center flex-wrap gap-2">
        <Link to="/" className="text-sm text-slate-500 hover:text-brand-700">&larr; Back</Link>
        <h1 className="font-bold">Design library</h1>
      </header>
      <main className="max-w-6xl mx-auto p-6 grid grid-cols-3 gap-4">
        {designs.map(d => (
          <div key={d.id} className="bg-white border rounded overflow-hidden">
            <div className="aspect-video bg-slate-100 grid place-items-center text-slate-400 text-sm">
              {d.overlayUrl ? <img src={d.overlayUrl} alt={d.name} className="w-full h-full object-cover" /> : 'No preview'}
            </div>
            <div className="p-3">
              <div className="font-medium">{d.name}</div>
              <div className="text-xs text-slate-500">{d.style}</div>
              {d.description && <div className="text-xs text-slate-600 mt-1">{d.description}</div>}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
