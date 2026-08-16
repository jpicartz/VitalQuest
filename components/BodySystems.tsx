import React, { useState } from 'react';
import { MacroTargets } from '../types';
import { NUTRIENT_INFO } from '../data/nutrientData';
import {
  BodySystemScore, NutrientContribution, ConsumedMacros, computeBodySystems, supportBand,
} from '../utils/bodySystems';
import { Modal } from './ui/Modal';
import { ScoreRing } from './ui/ScoreRing';
import { IconX, IconCheck, IconArrowUpRight, IconMessageCircle } from '@tabler/icons-react';
import { Button } from './ui/Button';

interface BodySystemsProps {
  /** From computeConsumedMicros — the single aggregation path. */
  consumedMicros: Record<string, number>;
  /** Protein never reaches the micros map, so macros come in separately. */
  consumedMacros: ConsumedMacros;
  targets: MacroTargets;
  /** Opens the coach anchored to a specific finding. */
  onAskCoach?: (system: BodySystemScore, all: BodySystemScore[]) => void;
}

/** Colour follows the band, so a glance reads before any number does. */
const bandColor = (score: number) => {
  const band = supportBand(score);
  if (band === 'low') return 'text-fat';
  if (band === 'building') return 'text-spark';
  return 'text-nutri';
};

const BAND_COPY: Record<ReturnType<typeof supportBand>, string> = {
  low: 'Low',
  building: 'Building',
  solid: 'Solid',
  strong: 'Strong',
};

/** One nutrient row inside the detail sheet. */
const ContributionRow: React.FC<{ c: NutrientContribution }> = ({ c }) => {
  const info = NUTRIENT_INFO[c.nutrient];
  const color = c.pct >= 80 ? 'bg-nutri' : c.pct >= 50 ? 'bg-spark' : 'bg-fat';
  return (
    <div>
      <div className="flex justify-between items-baseline gap-3 mb-1">
        <span className="text-sm font-semibold text-fg">{c.nutrient}</span>
        <span className="nums text-xs text-fg-soft shrink-0">
          {c.pct}%
          {c.isCeiling && <span className="ml-1 text-fg-mute">under limit</span>}
        </span>
      </div>
      <div className="h-1.5 bg-track rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${c.pct}%` }} />
      </div>
      {c.pct < 50 && info?.sources?.length > 0 && (
        <p className="text-[11px] text-fg-mute mt-1.5">
          Try: {info.sources.slice(0, 3).join(', ')}
        </p>
      )}
    </div>
  );
};

/**
 * Body-system nutrient support.
 *
 * The copy here is deliberately careful: every label says "support", the header
 * says these reflect *intake*, and nothing claims to describe the user's actual
 * hair, skin or hormones. The app cannot observe those.
 */
export const BodySystems: React.FC<BodySystemsProps> = ({ consumedMicros, consumedMacros, targets, onAskCoach }) => {
  const [open, setOpen] = useState<BodySystemScore | null>(null);
  const systems = computeBodySystems(consumedMicros, targets, consumedMacros);

  return (
    <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
      <h3 className="text-lg font-bold text-fg">Body System Support</h3>
      <p className="text-xs text-fg-mute mt-1 mb-6">
        How well today&apos;s food supports each system. This reflects what you ate —
        not a measurement of your body.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {systems.map((s) => (
          <button
            key={s.id}
            onClick={() => setOpen(s)}
            aria-label={`${s.label} support, ${s.score} percent. View details.`}
            className="flex flex-col items-center gap-2 p-4 rounded-tile bg-raised border border-edge hover:border-nutri transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <ScoreRing
              value={s.score}
              size={72}
              strokeWidth={7}
              colorClass={bandColor(s.score)}
              centerValue={<span className="text-lg">{s.score}</span>}
            />
            <div className="text-center">
              <div className="text-xs font-bold text-fg leading-tight">{s.label}</div>
              <div className={`text-[10px] font-semibold uppercase tracking-wide ${bandColor(s.score)}`}>
                {BAND_COPY[supportBand(s.score)]}
              </div>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <Modal
          onClose={() => setOpen(null)}
          labelledBy="system-detail-title"
          className="bg-card rounded-modal p-6 max-w-md w-full shadow-2xl max-h-[85vh] overflow-y-auto"
        >
          <div className="flex justify-between items-start gap-3 mb-1">
            <h3 id="system-detail-title" className="text-2xl font-bold text-fg">
              {open.label} Support
            </h3>
            <button onClick={() => setOpen(null)} aria-label="Close" className="text-fg-mute hover:text-fg p-1">
              <IconX size={20} />
            </button>
          </div>
          <p className="text-sm text-fg-soft mb-5">{open.blurb}</p>

          <div className="flex items-center gap-4 p-4 rounded-tile bg-raised border border-edge mb-5">
            <ScoreRing value={open.score} size={64} strokeWidth={7} colorClass={bandColor(open.score)} />
            <div>
              <div className={`text-sm font-bold ${bandColor(open.score)}`}>
                {BAND_COPY[supportBand(open.score)]} support today
              </div>
              <p className="text-xs text-fg-mute mt-0.5">
                Average across {open.contributions.length} nutrients
              </p>
            </div>
          </div>

          {open.gaps.length > 0 ? (
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-spark mb-3">
              <IconArrowUpRight size={14} />
              {open.gaps.length} nutrient{open.gaps.length > 1 ? 's' : ''} below half target
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-nutri mb-3">
              <IconCheck size={14} stroke={2.5} /> Every contributor is at least halfway
            </p>
          )}

          <div className="space-y-4">
            {open.contributions.map((c) => (
              <ContributionRow key={c.nutrient} c={c} />
            ))}
          </div>

          {onAskCoach && (
            <Button
              variant="outline"
              className="w-full mt-6 inline-flex items-center justify-center gap-2 text-sm"
              onClick={() => { const s = open; setOpen(null); onAskCoach(s, systems); }}
            >
              <IconMessageCircle size={16} />
              Ask why {open.label} support is {supportBand(open.score) === 'low' ? 'low' : `at ${open.score}%`}
            </Button>
          )}

          <p className="text-[11px] text-fg-mute mt-6 pt-4 border-t border-edge">
            General wellness information based on your logged food. Not medical advice.
          </p>
        </Modal>
      )}
    </section>
  );
};
