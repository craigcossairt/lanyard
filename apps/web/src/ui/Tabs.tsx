import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: ReactNode;
  panel: ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  /** Accessible name for the tab list. */
  label: string;
}

/**
 * ARIA tabs with roving focus: Left/Right/Home/End move between tabs and select them.
 * Only the selected panel is rendered.
 * The attendee live session does not use tabs (direction A uses a dock and sheets);
 * use these on dense screens such as organizer views and attendee home.
 */
export function Tabs({ items, value, onChange, label }: TabsProps) {
  const base = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(
    0,
    items.findIndex((t) => t.id === value),
  );

  function onKeyDown(e: KeyboardEvent) {
    const last = items.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : e.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    const item = items[next];
    if (!item) return;
    onChange(item.id);
    refs.current[next]?.focus();
  }

  const selected = items[current];
  return (
    <div className="ly-tabs">
      <div className="ly-tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {items.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-controls={`${base}-panel-${t.id}`}
            aria-selected={i === current}
            tabIndex={i === current ? 0 : -1}
            className="ly-tabs__tab"
            onClick={() => onChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {selected && (
        <div
          role="tabpanel"
          id={`${base}-panel-${selected.id}`}
          aria-labelledby={`${base}-tab-${selected.id}`}
          tabIndex={0}
          className="ly-tabs__panel"
        >
          {selected.panel}
        </div>
      )}
    </div>
  );
}
