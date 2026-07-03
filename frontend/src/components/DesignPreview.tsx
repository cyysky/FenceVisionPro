import { useEffect, useRef } from 'react';

/**
 * DesignPreview
 * -------------
 * Client-side renderer that composites the design overlay onto a house
 * photo. Each fence segment is drawn using the design's overlay PNG,
 * rotated and stretched to match the segment direction and length.
 * This is intentionally simple in v1: in production we'd swap in a
 * perspective-correct 3D or AI renderer on the server.
 */
interface Segment { x1: number; y1: number; x2: number; y2: number; lengthM: number; }
interface Props {
  houseImageUrl: string;
  overlayUrl: string;
  segments: Segment[];
  widthM: number;
  heightM: number;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = url;
  });
}

export function DesignPreview({ houseImageUrl, overlayUrl, segments, widthM, heightM }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = ref.current; if (!c) return;
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, c.width, c.height);
      try {
        const [house, overlay] = await Promise.all([loadImage(houseImageUrl), loadImage(overlayUrl)]);
        if (cancelled) return;
        // Fit house photo
        const ratio = Math.min(c.width / house.width, c.height / house.height);
        const w = house.width * ratio;
        const h = house.height * ratio;
        const ox = (c.width - w) / 2;
        const oy = (c.height - h) / 2;
        ctx.drawImage(house, ox, oy, w, h);

        // Determine meter->px using the user-entered width/height
        const pxPerM = Math.min(w / Math.max(widthM, 0.001), h / Math.max(heightM, 0.001));

        for (const seg of segments) {
          const x1 = ox + seg.x1 * pxPerM;
          const y1 = oy + seg.y1 * pxPerM;
          const x2 = ox + seg.x2 * pxPerM;
          const y2 = oy + seg.y2 * pxPerM;
          const dx = x2 - x1, dy = y2 - y1;
          const segLen = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * 180 / Math.PI;
          ctx.save();
          ctx.translate((x1 + x2) / 2, (y1 + y2) / 2);
          ctx.rotate((angle * Math.PI) / 180);
          // overlay covers the segment width
          const ow = Math.max(2, segLen);
          const oh = Math.max(8, 40); // visual fence thickness
          ctx.drawImage(overlay, -ow / 2, -oh / 2, ow, oh);
          ctx.restore();
        }
      } catch (e) {
        ctx.fillStyle = '#dc2626';
        ctx.font = '14px sans-serif';
        ctx.fillText('Preview failed to render', 10, 20);
      }
    })();
    return () => { cancelled = true; };
  }, [houseImageUrl, overlayUrl, segments, widthM, heightM]);

  return <canvas ref={ref} width={1000} height={600} className="w-full border rounded bg-slate-100" />;
}
