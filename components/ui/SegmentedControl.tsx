import React from 'react';

export interface Segment<T extends string | number> {
  value: T;
  label: React.ReactNode;
  /** Announced to screen readers when the visible label is a bare number. */
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string | number> {
  segments: readonly Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers, e.g. "Trend range". */
  label: string;
  /** Tabular figures for numeric segments (7D / 14D / 30D). */
  nums?: boolean;
  className?: string;
}

/**
 * Single-choice control for a small, stable set of options.
 *
 * Three of these were hand-rolled with the same markup, so a keyboard user got
 * three slightly different experiences. Arrow keys move between segments here,
 * which is what the radiogroup role promises.
 */
export function SegmentedControl<T extends string | number>({
  segments, value, onChange, label, nums = false, className = '',
}: SegmentedControlProps<T>) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const i = segments.findIndex((s) => s.value === value);
    onChange(segments[(i + dir + segments.length) % segments.length].value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`flex gap-1 bg-raised p-1 rounded-control w-fit max-w-full overflow-x-auto ${className}`}
    >
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <button
            key={String(s.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={s.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(s.value)}
            className={`${nums ? 'nums ' : ''}px-4 py-1.5 rounded-[8px] text-sm font-semibold whitespace-nowrap
              transition-colors focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-raised
              ${selected ? 'bg-card shadow-e1 text-nutri' : 'text-fg-soft hover:text-fg'}`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
