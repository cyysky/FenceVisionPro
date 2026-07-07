import { useEffect, useState } from 'react';
import { getConfig, GalleryItem } from '../lib/publicAi';

export type PublicPhotoSource = 'UPLOADED' | 'GALLERY';

export interface PublicPhotoValue {
  source: PublicPhotoSource;
  // For UPLOADED: the File the user picked (kept in memory; the
  // form uploads it as multipart). For GALLERY: the gallery id.
  file?: File;
  galleryId?: string;
}

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * Step 2 of the public AI Yard Visualizer. Two tabs:
 *  - Upload: drag/drop or file picker (jpg/png/webp, max 8 MB).
 *  - Gallery: 6 curated stock photos loaded from
 *    /public/ai-generation/config.
 */
export function PublicPhotoInput({
  value,
  onChange,
  yardSide,
}: {
  value: PublicPhotoValue | null;
  onChange: (next: PublicPhotoValue) => void;
  yardSide: 'FRONT' | 'BACK';
}) {
  const [tab, setTab] = useState<'UPLOAD' | 'GALLERY'>('UPLOAD');
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Lazy-load the gallery on first render of the gallery tab.
  useEffect(() => {
    if (tab !== 'GALLERY' || gallery.length) return;
    let cancelled = false;
    getConfig().then(cfg => {
      if (cancelled) return;
      setGallery(cfg.gallery);
    }).catch(e => {
      if (cancelled) return;
      setErr(e?.response?.data?.message || 'Failed to load gallery');
    });
    return () => { cancelled = true; };
  }, [tab, gallery.length]);

  // Maintain an object URL preview for uploaded files so we can
  // re-render <img> on re-pick. Clean up on unmount / change.
  useEffect(() => {
    if (value?.source === 'UPLOADED' && value.file) {
      const url = URL.createObjectURL(value.file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(null);
  }, [value?.file, value?.source]);

  function handleFile(file: File | null) {
    setErr(null);
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) {
      setErr('Unsupported file type - please pick a JPG, PNG or WebP image');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr('File too large - 8 MB maximum');
      return;
    }
    onChange({ source: 'UPLOADED', file });
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    handleFile(e.dataTransfer.files?.[0] || null);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  // Filter gallery items to the chosen yard side so the customer
  // doesn't see front-yard photos in the "back" flow.
  // Re-shuffle on every (re)mount of the gallery tab so reloads feel
  // fresh. We use a state key tied to yardSide + a fresh shuffle
  // seed that's generated when the tab opens, so users never see the
  // same order twice in a row.
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const filteredGallery = gallery
    .filter(g => g.yardSide === yardSide)
    .map(g => ({ ...g, _sort: Math.random() }))
    .sort((a, b) => a._sort - b._sort)
    .map(({ _sort, ...g }) => g);

  function openGallery() {
    if (tab !== 'GALLERY') setTab('GALLERY');
    // Bump the shuffle seed so re-opening shows a fresh order
    setShuffleSeed(s => s + 1);
  }

  return (
    <div>
      <div className="inline-flex rounded-md border border-slate-200 overflow-hidden mb-4 text-sm">
        <button
          type="button"
          onClick={() => setTab('UPLOAD')}
          className={`px-4 py-2 ${tab === 'UPLOAD' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-brand-50'}`}
        >
          Upload
        </button>
        <button
          type="button"
          onClick={openGallery}
          className={`px-4 py-2 border-l border-slate-200 ${tab === 'GALLERY' ? 'bg-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-brand-50'}`}
        >
          Gallery ({yardSide === 'FRONT' ? 'Front' : 'Back'} yard)
        </button>
      </div>

      {tab === 'UPLOAD' ? (
        <div>
          <label
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            className={`block rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition ${
              dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:bg-slate-50'
            }`}
          >
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={e => handleFile(e.target.files?.[0] || null)}
            />
            <div className="text-3xl mb-2">📷</div>
            <div className="font-medium text-slate-800">Drop a photo here, or click to choose</div>
            <div className="text-xs text-slate-500 mt-1">JPG / PNG / WebP, up to 8 MB</div>
          </label>
          {previewUrl && (
            <div className="mt-3 flex items-center gap-3 text-sm">
              <img src={previewUrl} alt="Selected preview" className="h-16 w-16 object-cover rounded border" />
              <div className="text-slate-600">Photo ready - it will upload when you submit.</div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Header: tile count + shuffle button. The order changes
              on every page reload AND every time the user clicks
              Shuffle, so they always see a fresh layout. */}
          <div className="flex items-center justify-between mb-3 text-sm text-slate-600">
            <div>
              {filteredGallery.length} curated {yardSide === 'FRONT' ? 'front-yard' : 'back-yard'} photo{filteredGallery.length === 1 ? '' : 's'}
            </div>
            <button
              type="button"
              onClick={() => setShuffleSeed(s => s + 1)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 bg-white hover:bg-brand-50 text-slate-700 transition"
              title="Shuffle gallery order"
            >
              <span aria-hidden>🔀</span>
              <span>Shuffle</span>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {filteredGallery.length === 0 && (
              <div className="col-span-full text-sm text-slate-500 py-6 text-center">Loading gallery...</div>
            )}
            {filteredGallery.map(g => {
              const selected = value?.source === 'GALLERY' && value.galleryId === g.id;
              return (
                <button
                  type="button"
                  key={`${g.id}-${shuffleSeed}`}
                  onClick={() => onChange({ source: 'GALLERY', galleryId: g.id })}
                  className={`group relative rounded-lg overflow-hidden border-2 transition ${
                    selected ? 'border-brand-600 ring-2 ring-brand-200' : 'border-slate-200 hover:border-brand-300'
                  }`}
                >
                  <img src={g.url} alt={g.label} className="block w-full h-32 sm:h-36 object-cover" />
                  <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition">
                    {g.label}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {err && <div className="mt-3 text-sm text-red-600">{err}</div>}
    </div>
  );
}
