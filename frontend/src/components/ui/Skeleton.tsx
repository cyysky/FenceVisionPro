/**
 * Tiny loading primitives. Use them in place of "Loading…"
 * text so the user sees something structured while data
 * fetches.
 */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`bg-slate-200 rounded animate-pulse ${className}`} />;
}

export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="bg-white border rounded p-4 space-y-2">
      <Skeleton className="h-5 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}
