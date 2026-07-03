import { useEffect, useRef, useState } from 'react';

/**
 * PlanEditor
 * -----------
 * Interactive floor-plan editor. Two modes:
 *   - "calibrate" - user clicks two known-distance points, enters the real distance in meters
 *     to establish the px-per-meter ratio.
 *   - "draw" - user clicks corners to add fence segments; lengths are auto-computed.
 *
 * Coordinate space: x,y in meters, relative to the calibrated origin.
 * Output: an array of { x1, y1, x2, y2, lengthM } segments that the backend will
 * turn into line items.
 */

export interface FenceSegmentM {
  x1: number; y1: number; x2: number; y2: number; lengthM: number;
  productId?: string; heightOption?: string; colorOption?: string;
}

interface Props {
  imageUrl: string | null;
  initialSegments?: FenceSegmentM[];
  initialWidthM?: number;
  initialHeightM?: number;
  onChange: (segments: FenceSegmentM[], widthM: number, heightM: number) => void;
}

export function PlanEditor({ imageUrl, initialSegments = [], initialWidthM, initialHeightM, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [scale, setScale] = useState<number | null>(null); // px per meter
  const [planW, setPlanW] = useState<number>(initialWidthM || 0);
  const [planH, setPlanH] = useState<number>(initialHeightM || 0);
  const [mode, setMode] = useState<'calibrate' | 'draw'>(initialWidthM ? 'draw' : 'calibrate');

  // Calibration: two points + the real-world distance the user enters
  const [calA, setCalA] = useState<{ x: number; y: number } | null>(null);
  const [calB, setCalB] = useState<{ x: number; y: number } | null>(null);
  const [calDistance, setCalDistance] = useState<number>(10);

  // Drawing
  const [segments, setSegments] = useState<FenceSegmentM[]>(initialSegments);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!imageUrl) return;
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => setImg(i);
    i.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => { draw(); }, [img, segments, calA, calB, drawStart, mode, scale]);

  function pxToMeters(px: number, py: number) {
    if (!img || !scale) return { x: 0, y: 0 };
    return { x: px / scale, y: py / scale };
  }
  function metersToPx(mx: number, my: number) {
    if (!scale) return { x: 0, y: 0 };
    return { x: mx * scale, y: my * scale };
  }

  /**
   * Translate a React mouse event into the canvas's *internal*
   * pixel coordinate system. The canvas has a fixed internal
   * resolution (1000x600) but is rendered at whatever CSS width
   * the parent gives it (className="w-full"), so the on-screen
   * bounding rect can be a different size. Without this scaling
   * factor the meter coordinates are wrong by the display-to-
   * internal ratio, segments end up far from the user's clicks,
   * and the second draw point can land so far from the first
   * that the resulting segment jumps across the canvas.
   */
  function canvasPoint(e: React.MouseEvent) {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const sx = c.width / Math.max(r.width, 1);
    const sy = c.height / Math.max(r.height, 1);
    return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
  }

  function handleClick(e: React.MouseEvent) {
    if (!img) return;
    const p = canvasPoint(e);
    if (mode === 'calibrate') {
      // Calibration doesn't need scale - it sets scale.
      if (!calA) { setCalA(p); return; }
      if (!calB) { setCalB(p); return; }
      return;
    }
    if (mode === 'draw') {
      if (!scale) return; // need calibration first
      if (!drawStart) {
        setDrawStart(p);
        return;
      }
      const a = pxToMeters(drawStart.x, drawStart.y);
      const b = pxToMeters(p.x, p.y);
      const lengthM = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
      // Skip degenerate clicks (double-click on the same spot).
      if (lengthM < 0.05) { setDrawStart(p); return; }
      const next = [...segments, { x1: a.x, y1: a.y, x2: b.x, y2: b.y, lengthM }];
      setSegments(next);
      setDrawStart(null);
      // recompute plan extent
      const xs = next.flatMap(s => [s.x1, s.x2]);
      const ys = next.flatMap(s => [s.y1, s.y2]);
      const w = Math.max(...xs, 0.1);
      const h = Math.max(...ys, 0.1);
      setPlanW(w); setPlanH(h);
      onChange(next, w, h);
    }
  }

  function confirmCalibration() {
    if (!calA || !calB || !img) return;
    const dx = calB.x - calA.x;
    const dy = calB.y - calA.y;
    const pxDist = Math.sqrt(dx * dx + dy * dy);
    if (!pxDist || !calDistance) return;
    const s = pxDist / calDistance;
    setScale(s);
    setMode('draw');
    onChange([], calDistance, planH || calDistance);
  }

  function undo() {
    const next = segments.slice(0, -1);
    setSegments(next);
    onChange(next, planW, planH);
  }
  function clear() {
    setSegments([]); setDrawStart(null);
    onChange([], planW, planH);
  }

  function draw() {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, c.width, c.height);

    if (img) {
      // Fit image
      const ratio = Math.min(c.width / img.width, c.height / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, (c.width - w) / 2, (c.height - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Upload a floor plan to begin', c.width / 2, c.height / 2);
    }

    // Segments
    ctx.strokeStyle = '#0284c7';
    ctx.lineWidth = 4;
    for (const s of segments) {
      const a = metersToPx(s.x1, s.y1);
      const b = metersToPx(s.x2, s.y2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Pending draw
    if (drawStart) {
      ctx.fillStyle = '#0284c7';
      ctx.beginPath();
      ctx.arc(drawStart.x, drawStart.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Calibration markers
    if (calA) { drawMarker(ctx, calA, 'A'); }
    if (calB) { drawMarker(ctx, calB, 'B'); drawCalLine(ctx); }
  }

  function drawMarker(ctx: CanvasRenderingContext2D, p: { x: number; y: number }, label: string) {
    ctx.fillStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(label, p.x + 10, p.y - 10);
  }
  function drawCalLine(ctx: CanvasRenderingContext2D) {
    if (!calA || !calB) return;
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(calA.x, calA.y); ctx.lineTo(calB.x, calB.y); ctx.stroke();
    ctx.setLineDash([]);
  }

  const totalLengthM = segments.reduce((s, x) => s + x.lengthM, 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <button
          onClick={() => setMode('calibrate')}
          className={`px-3 py-1 rounded ${mode === 'calibrate' ? 'bg-brand-600 text-white' : 'bg-white border'}`}
        >1. Calibrate scale</button>
        <button
          onClick={() => setMode('draw')}
          disabled={!scale}
          className={`px-3 py-1 rounded ${mode === 'draw' ? 'bg-brand-600 text-white' : 'bg-white border disabled:opacity-50'}`}
        >2. Draw fence</button>
        <button onClick={undo} disabled={!segments.length} className="px-3 py-1 rounded bg-white border disabled:opacity-50">Undo</button>
        <button onClick={clear} disabled={!segments.length} className="px-3 py-1 rounded bg-white border disabled:opacity-50">Clear</button>
        <span className="ml-auto text-slate-600">Total: <b>{totalLengthM.toFixed(2)} m</b></span>
      </div>
      <div className="text-xs text-slate-600 px-1">
        {mode === 'calibrate' && !calA && 'Step 1: click the first reference point on the plan.'}
        {mode === 'calibrate' && calA && !calB && 'Step 2: click the second reference point.'}
        {mode === 'calibrate' && calA && calB && 'Step 3: enter the real-world distance and click Confirm.'}
        {mode === 'draw' && !drawStart && segments.length === 0 && 'Draw mode: click the first corner of the fence.'}
        {mode === 'draw' && drawStart && 'Click the next corner to add a segment (or click the same spot to cancel).'}
        {mode === 'draw' && !drawStart && segments.length > 0 && 'Click the next corner to continue drawing, or use Undo / Clear.'}
      </div>

      <canvas
        ref={canvasRef}
        width={1000}
        height={600}
        onClick={handleClick}
        className="w-full border rounded bg-slate-50 cursor-crosshair"
      />

      {mode === 'calibrate' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded text-sm">
          <p className="mb-2">Click two reference points on the plan (e.g. opposite walls of a room).</p>
          <div className="flex items-center gap-2">
            <label>Real distance:</label>
            <input type="number" value={calDistance} onChange={e => setCalDistance(+e.target.value)} className="border rounded px-2 py-1 w-24" />
            <span>m</span>
            <button
              onClick={confirmCalibration}
              disabled={!calA || !calB}
              className="ml-auto px-3 py-1 rounded bg-brand-600 text-white disabled:opacity-50"
            >Confirm</button>
          </div>
        </div>
      )}
    </div>
  );
}
