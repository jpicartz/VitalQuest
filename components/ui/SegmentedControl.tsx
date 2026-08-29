import React, { useRef } from 'react';

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
  /**
   * `tablist` when each segment reveals a different view (the app's navigation);
   * `radiogroup` when it picks a value that reshapes the current view.
   */
  role?: 'radiogroup' | 'tablist';
  /** Tabular figures for numeric segments (7D / 14D / 30D). */
  nums?: boolean;
  className?: string;
  /** Per-segment overrides, for controls that are not a plain pill row. */
  segmentClassName?: string;
}

/**
 * Single-choice control for a small, stable set of options.
 *
 * Owns both the segmented control and the tab bar, because they are the same
 * interaction with different semantics — and both owe the user the same
 * keyboard contract. Three of these were hand-rolled, so a keyboard user got
 * three different experiences; the app's primary navigation was a `tablist`
 * with no arrow keys and no roving tabindex at all, which ARIA requires.
 *
 * Arrow keys move between segments, Home/End jump to the ends, and only the
 * selected segment is in the tab order — so Tab moves past the whole group
 * rather than through every option.
 */
export function SegmentedControl<T extends string | number>({
  segments, value, onChange, label,
  role = 'radiogroup', nums = false, className = '', segmentClassName = '',
}: SegmentedControlProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  const move = (to: number) => {
    const next = segments[to];
    if (!next) return;
    onChange(next.value);
    // Focus follows selection, which is what both patterns expect.
    ref.current?.querySelectorAll<HTMLButtonElement>('[data-seg]')[to]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = segments.findIndex((s) => s.value === value);
    const last = segments.length - 1;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': e.preventDefault(); move(i >= last ? 0 : i + 1); break;
      case 'ArrowLeft':  case 'ArrowUp':   e.preventDefault(); move(i <= 0 ? last : i - 1); break;
      case 'Home':                         e.preventDefault(); move(0); break;
      case 'End':                          e.preventDefault(); move(last); break;
    }
  };

  const isTabs = role === 'tablist';

  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={className || 'flex gap-1 bg-raised p-1 rounded-control w-fit max-w-full overflow-x-auto'}
    >
      {segments.map((s) => {
        const selected = s.value === value;
        return (
          <button
            key={String(s.value)}
            data-seg
            type="button"
            role={isTabs ? 'tab' : 'radio'}
            {...(isTabs ? { 'aria-selected': selected } : { 'aria-checked': selected })}
            aria-label={s.ariaLabel}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(s.value)}
            className={`${nums ? 'nums ' : ''}${
              segmentClassName ||
              'px-4 py-1.5 rounded-[8px] text-sm font-semibold whitespace-nowrap'
            } transition-colors focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-raised
              ${selected ? 'bg-card shadow-e1 text-accent' : 'text-fg-soft hover:text-fg'}`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
