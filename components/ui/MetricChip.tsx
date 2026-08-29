import React from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';

/** Which quantity a chip is reporting. Drives its colour, nothing else. */
export type ChipTone = 'protein' | 'carbs' | 'fat' | 'hydro' | 'nutri';

/*
  Tint plus a matching hairline. At 12% alpha with no border the chip read as
  loose coloured text floating on the page rather than as an object — the ring
  is what makes it a pill at a glance, and it costs nothing in contrast because
  the label sits on the tint, not on the ring.
*/
const TONE: Record<ChipTone, string> = {
  protein: 'bg-protein/15 text-protein-strong ring-1 ring-protein/30',
  carbs: 'bg-carbs/18 text-carbs-strong ring-1 ring-carbs/30',
  fat: 'bg-fat/15 text-fat-strong ring-1 ring-fat/30',
  hydro: 'bg-hydro/15 text-hydro-strong ring-1 ring-hydro/30',
  nutri: 'bg-nutri/15 text-nutri-strong ring-1 ring-nutri/30',
};

export interface Metric {
  /** Stable across a burst so React keeps identity while chips overlap. */
  id: string;
  /** Rendered as-is, e.g. "+34g protein". Formatting belongs to the caller. */
  text: string;
  tone: ChipTone;
}

/**
 * The little pill that pops when something is logged.
 *
 * Chips carry the MACRO'S OWN COLOUR, never the signature accent. The accent
 * owns chrome; here the colour is the information — a protein chip and a fat
 * chip should be distinguishable at a glance without reading them, which is the
 * whole reason this is a chip rather than a toast.
 *
 * Purely presentational. The numbers come from `utils/nutritionAggregates`,
 * already computed; this only knows how to display and dismiss them.
 *
 * Two accessibility notes, both load-bearing:
 *
 * `role="status"` on the rail (not the chip) makes the burst one polite
 * announcement rather than three interrupting ones. Putting it on each chip
 * queues "plus thirty four grams protein" / "plus zero grams carbs" / … as
 * separate live-region updates, which is worse than useless mid-task.
 *
 * And the timers are cleared on unmount. A chip that resolves after its parent
 * has gone would set state on a dead component — easy to miss because it only
 * shows up when you log food and navigate away inside a second.
 */

const HOLD_MS = 1100;
const STAGGER_MS = 90;

export const MetricChipRail: React.FC<{
  metrics: Metric[];
  className?: string;
}> = ({ metrics, className = '' }) => {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = React.useState<Metric[]>([]);
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([]);

  React.useEffect(() => {
    if (metrics.length === 0) return;
    setVisible(metrics);

    const t = setTimeout(() => setVisible([]), HOLD_MS + metrics.length * STAGGER_MS);
    timers.current.push(t);
    return () => {
      clearTimeout(t);
      timers.current = timers.current.filter((x) => x !== t);
    };
  }, [metrics]);

  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-1.5 ${className}`}
    >
      <AnimatePresence>
        {visible.map((m, i) => (
          <motion.span
            key={m.id}
            initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            /*
              Per-property, and that split matters. Running opacity on the same
              spring as scale made the chip pop to full size while still fully
              transparent, then snap visible ~600ms later — and on the way out it
              slid upward at opacity 1 and vanished without ever fading.

              A spring is a position curve. Opacity has no mass, so it gets a
              short tween and arrives with the pop instead of chasing it.
            */
            transition={
              reduceMotion
                ? { duration: 0 }
                : {
                    default: {
                      type: 'spring',
                      stiffness: 520,
                      damping: 24,
                      delay: (i * STAGGER_MS) / 1000,
                    },
                    opacity: { duration: 0.16, delay: (i * STAGGER_MS) / 1000 },
                  }
            }
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -14 }}
            className={`nums inline-flex items-center rounded-full px-2.5 py-1 text-[13px] font-semibold ${TONE[m.tone]}`}
          >
            {m.text}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
};

/**
 * Turn a just-logged item into the chips worth showing.
 *
 * Formatting only — every number here is already on the item. This lives beside
 * the chip rather than in `utils/` because deciding that a zero is not worth a
 * chip is a display judgement, not nutrition logic.
 *
 * Zero-value macros are dropped deliberately: "+0g carbs" is noise, and three
 * chips where one is empty reads as a bug rather than as information.
 */
export function metricsFromFood(
  item: { name?: string; protein?: number; carbs?: number; fat?: number },
  seed: string | number = Date.now(),
): Metric[] {
  const parts: Array<[ChipTone, number, string]> = [
    ['protein', item.protein ?? 0, 'protein'],
    ['carbs', item.carbs ?? 0, 'carbs'],
    ['fat', item.fat ?? 0, 'fat'],
  ];
  return parts
    .filter(([, grams]) => Math.round(grams) > 0)
    .map(([tone, grams, label]) => ({
      id: `${seed}-${tone}`,
      tone,
      text: `+${Math.round(grams)}g ${label}`,
    }));
}

/** Water is logged in millilitres and has no macro split. */
export function metricsFromWater(ml: number, seed: string | number = Date.now()): Metric[] {
  if (ml <= 0) return [];
  return [{ id: `${seed}-hydro`, tone: 'hydro', text: `+${Math.round(ml)} ml` }];
}
