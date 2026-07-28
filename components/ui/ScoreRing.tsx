import React from 'react';

interface ScoreRingProps {
  /** Progress value that drives the arc. */
  value: number;
  /** Full-circle value (default 100). */
  max?: number;
  /** Diameter in px. */
  size?: number;
  /** Ring thickness. */
  strokeWidth?: number;
  /** Tailwind text-color class for the progress arc, e.g. "text-nutri". */
  colorClass?: string;
  /** Big number shown in the centre (defaults to rounded value). */
  centerValue?: React.ReactNode;
  /** Small uppercase caption under the centre value. */
  label?: string;
}

const R = 42;
const CIRC = 2 * Math.PI * R;

/**
 * Presentational circular gauge — the Vitals signature. Feeds off values the
 * components already compute (micronutrient score, level XP, calories); does
 * not own any logic. Auto-adapts to light/dark via the token color classes.
 */
export const ScoreRing: React.FC<ScoreRingProps> = ({
  value,
  max = 100,
  size = 104,
  strokeWidth = 8,
  colorClass = 'text-nutri',
  centerValue,
  label,
}) => {
  const pct = Math.max(0, Math.min(value / max, 1));
  const offset = CIRC * (1 - pct);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} className={colorClass} aria-hidden="true">
        <circle cx="50" cy="50" r={R} fill="none" strokeWidth={strokeWidth} style={{ stroke: 'rgb(var(--track))' }} />
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          style={{ transition: 'stroke-dashoffset 0.7s ease-out' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="nums text-2xl font-bold text-fg leading-none">
          {centerValue ?? Math.round(value)}
        </span>
        {label && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-fg-mute">
            {label}
          </span>
        )}
      </div>
    </div>
  );
};
