import React from 'react';
import { motion, useReducedMotion, useSpring, useTransform } from 'framer-motion';

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
  /** Big number shown in the centre (defaults to the counting-up value). */
  centerValue?: React.ReactNode;
  /** Small uppercase caption under the centre value. */
  label?: string;
  /**
   * Shared-element id. When two ScoreRings across a view change carry the same
   * one, framer-motion morphs between them instead of cross-fading. Used by
   * BodySystems to travel a ring from its grid tile into the detail sheet.
   */
  layoutId?: string;
}

const R = 42;
const CIRC = 2 * Math.PI * R;

/**
 * Presentational circular gauge — the Vitals signature. Feeds off values the
 * components already compute (micronutrient score, level XP, calories); does
 * not own any logic. Auto-adapts to light/dark via the token color classes.
 *
 * The arc springs in on mount with a slight overshoot and the centre number
 * counts up alongside it, so the ring reads as a measurement settling rather
 * than a value that was already there. Both use the same spring constants, so
 * they stay in step without being wired to each other.
 *
 * REDUCED MOTION IS HANDLED HERE, EXPLICITLY. The global
 * `@media (prefers-reduced-motion: reduce)` rule in index.css zeroes CSS
 * transition and animation durations, which covered the old CSS-transition
 * version of this component completely. framer-motion animates in JavaScript
 * and that media rule does not touch it, so without `useReducedMotion` this
 * would have quietly started ignoring a setting the app claims to respect.
 */
export const ScoreRing: React.FC<ScoreRingProps> = ({
  value,
  max = 100,
  size = 104,
  strokeWidth = 8,
  colorClass = 'text-nutri',
  centerValue,
  label,
  layoutId,
}) => {
  const reduceMotion = useReducedMotion();
  const pct = Math.max(0, Math.min(value / max, 1));
  const target = CIRC * (1 - pct);

  /*
    `stiffness`/`damping` chosen to overshoot by a few percent and settle in
    about a second — enough to feel alive, short of the bouncy-toy register that
    would be wrong for a health readout.
  */
  const spring = { type: 'spring' as const, stiffness: 90, damping: 14 };

  /*
    The centre number rides its own spring with the same constants, so it tracks
    the arc without the two being wired together. An earlier version drove both
    from one `useSpring(motionValue)` chain; it type-checked, rendered, and never
    animated — the arc sat at its start value forever. The declarative
    `initial`/`animate` pair below is the idiomatic API and has far less to go
    wrong.
  */
  const counter = useSpring(reduceMotion ? value : 0, spring);
  const counted = useTransform(counter, (v) => Math.round(v));

  React.useEffect(() => {
    counter.set(value);
  }, [value, counter]);

  return (
    /*
      `layoutId` sits on this DIV, not on the <svg>. framer-motion's layout
      projection does not support SVG elements — putting it on the svg
      type-checks, renders, and produces no travel at all: the target simply
      appears at its final position. The HTML wrapper is what can actually be
      measured and transformed.
    */
    <motion.div
      layoutId={layoutId}
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        className={colorClass}
        aria-hidden="true"
      >
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          strokeWidth={strokeWidth}
          style={{ stroke: 'rgb(var(--track))' }}
        />
        <motion.circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={CIRC}
          transform="rotate(-90 50 50)"
          initial={{ strokeDashoffset: reduceMotion ? target : CIRC }}
          animate={{ strokeDashoffset: target }}
          transition={reduceMotion ? { duration: 0 } : spring}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="nums text-2xl font-bold text-fg leading-none">
          {/*
            The count-up only applies to the default numeric centre. Callers that
            pass their own node — Dashboard passes the XP level, BodySystems
            passes a resized number — get it rendered untouched, because
            animating someone else's element here would be surprising.
          */}
          {centerValue ?? <motion.span>{counted}</motion.span>}
        </span>
        {label && (
          <span className="mt-1 text-[10px] font-medium uppercase tracking-widest text-fg-mute">
            {label}
          </span>
        )}
      </div>
    </motion.div>
  );
};
