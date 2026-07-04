import { ReactNode, useState } from 'react';

export interface Tab {
  key: string;
  label: string;
  /** Optional badge shown next to the label (e.g. row count). */
  badge?: string | number;
  content: ReactNode;
}

/**
 * Lightweight controlled-tabs component. We don't need
 * react-router-style URL state here - the project detail page
 * renders all tab content in a single panel, so a local useState
 * is enough. Active tab is indicated by a colored underline and
 * bold text; inactive tabs use the muted slate color.
 */
export function Tabs({ tabs, initial }: { tabs: Tab[]; initial?: string }) {
  const [active, setActive] = useState<string>(initial ?? tabs[0]?.key ?? '');
  const current = tabs.find(t => t.key === active) ?? tabs[0];

  return (
    <div>
      <div role="tablist" className="flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map(t => {
          const isActive = t.key === active;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
                isActive
                  ? 'border-brand-600 text-brand-700 font-medium'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className={`ml-1.5 text-xs ${isActive ? 'text-brand-600' : 'text-slate-400'}`}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="pt-4">{current?.content}</div>
    </div>
  );
}
