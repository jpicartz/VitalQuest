import React from 'react';

type Tone = 'neutral' | 'nutri' | 'hydro' | 'spark' | 'fat';

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** Small trailing unit, kept at body weight so it never competes with the value. */
  unit?: string;
  /** Secondary line under the value — a delta, a target, a caption. */
  caption?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: Tone;
  className?: string;
}

const TONE: Record<Tone, { surface: string; label: string; value: string }> = {
  neutral: { surface: 'bg-raised', label: 'text-fg-mute', value: 'text-fg' },
  nutri:   { surface: 'bg-nutri/10', label: 'text-nutri', value: 'text-nutri' },
  hydro:   { surface: 'bg-hydro/10', label: 'text-hydro', value: 'text-hydro' },
  spark:   { surface: 'bg-spark/10', label: 'text-spark', value: 'text-spark' },
  fat:     { surface: 'bg-fat/10', label: 'text-fat', value: 'text-fat' },
};

/**
 * A labelled number.
 *
 * On a tinted surface the label takes its colour from that same hue rather than
 * a neutral grey -- grey secondary text on a tinted panel is the detail that
 * makes a UI look assembled instead of designed.
 */
export const StatTile: React.FC<StatTileProps> = ({
  label, value, unit, caption, icon, tone = 'neutral', className = '',
}) => {
  const t = TONE[tone];
  return (
    <div className={`${t.surface} rounded-tile p-4 ${className}`}>
      <p className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-widest ${t.label} mb-1`}>
        {icon}
        {label}
      </p>
      <p className={`nums text-2xl font-bold leading-none ${t.value}`}>
        {value}
        {unit && <span className="text-sm font-normal opacity-70 ml-1">{unit}</span>}
      </p>
      {caption && <div className="text-xs mt-1.5">{caption}</div>}
    </div>
  );
};
