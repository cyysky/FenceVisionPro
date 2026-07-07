export type PublicYardSide = 'FRONT' | 'BACK';

/**
 * Step 1 of the public AI Yard Visualizer. Two large side-by-side
 * cards - front yard / back yard. Required state.
 */
export function PublicYardSelector({
  value,
  onChange,
}: {
  value: PublicYardSide | null;
  onChange: (next: PublicYardSide) => void;
}) {
  const cards: Array<{ id: PublicYardSide; title: string; subtitle: string; icon: string }> = [
    { id: 'FRONT', title: 'Front Yard', subtitle: 'Street-facing fence, curb appeal focus', icon: '🏡' },
    { id: 'BACK', title: 'Back Yard',  subtitle: 'Privacy / pool / entertaining focus',    icon: '🌳' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {cards.map(c => {
        const selected = value === c.id;
        return (
          <button
            type="button"
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`text-left rounded-xl border-2 p-6 transition shadow-sm hover:shadow ${
              selected ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white hover:border-brand-300'
            }`}
            aria-pressed={selected}
          >
            <div className="text-4xl mb-2">{c.icon}</div>
            <div className="text-lg font-semibold text-slate-900">{c.title}</div>
            <div className="text-sm text-slate-500 mt-1">{c.subtitle}</div>
          </button>
        );
      })}
    </div>
  );
}
