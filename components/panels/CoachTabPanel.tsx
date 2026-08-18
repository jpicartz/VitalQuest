import React, { useState, useMemo } from 'react';
import { useProfile } from '../../contexts/ProfileContext';
import { useLogs } from '../../contexts/LogsContext';
import { computeConsumedMicros } from '../../utils/nutritionAggregates';
import { Card } from '../ui/Card';
import { UserProfile, MacroTargets } from '../../types';
import { BodySystemScore, computeBodySystems } from '../../utils/bodySystems';
import { Coach } from '../Coach';
import { Button } from '../ui/Button';
import { IconMessageCircle, IconSparkles } from '@tabler/icons-react';


/**
 * The Coach tab.
 *
 * Even as a top-level destination it stays *anchored*: the tab shows today's
 * weakest system and offers that as the way in, rather than dropping the user
 * into an empty chat. A blank box is both a worse experience — nobody knows
 * what to type — and a wider safety surface than a scoped conversation.
 */
export const CoachTabPanel: React.FC = () => {
  const { profile, plan, targets } = useProfile();
  const { foodLogs } = useLogs();
  const planFocus = plan.nutritionFocus;

  // Derived here rather than handed down: Dashboard was computing these purely
  // to pass along, which made it re-render on every log change for no reason.
  const consumedMicros = useMemo(() => computeConsumedMicros(foodLogs), [foodLogs]);
  const consumedMacros = useMemo(() => foodLogs.reduce((a, l) => ({
    protein: a.protein + (Number(l.food.protein) || 0),
    carbs:   a.carbs   + (Number(l.food.carbs)   || 0),
    fat:     a.fat     + (Number(l.food.fat)     || 0),
  }), { protein: 0, carbs: 0, fat: 0 }), [foodLogs]);
  const [open, setOpen] = useState<BodySystemScore | null>(null);
  const [general, setGeneral] = useState(false);

  const systems = computeBodySystems(consumedMicros, targets, consumedMacros);
  const weakest = [...systems].sort((a, b) => a.score - b.score)[0];
  const hasData = systems.some((s) => s.score > 0);

  return (
    <div className="space-y-5">
      <Card title={<span className="inline-flex items-center gap-2"><IconSparkles size={20} className="text-nutri" /> Coach</span>}>
        <p className="text-sm text-fg-soft mt-1 mb-5">
          {hasData
            ? 'Ask about what you logged today.'
            : 'Log some food first — the coach works from your actual intake.'}
        </p>

        {hasData && (
          <div className="p-4 rounded-tile bg-raised border border-edge mb-4">
            <p className="text-xs font-semibold text-fg-mute uppercase tracking-wide mb-1">
              Today&apos;s weakest area
            </p>
            <p className="text-fg">
              <span className="font-bold">{weakest.label}</span> support is{' '}
              <span className="nums font-bold">{weakest.score}%</span>
              {weakest.gaps.length > 0 && (
                <span className="text-fg-soft">
                  {' '}— short on {weakest.gaps.slice(0, 2).map((g) => g.nutrient).join(' and ')}
                </span>
              )}
              .
            </p>
            <Button
              variant="primary"
              className="mt-4 inline-flex items-center gap-2 text-sm"
              onClick={() => { setGeneral(false); setOpen(weakest); }}
            >
              <IconMessageCircle size={16} />
              Ask why
            </Button>
          </div>
        )}

        <Button
          variant="outline"
          className="w-full text-sm"
          onClick={() => { setGeneral(true); setOpen(null); }}
        >
          Ask something else
        </Button>
      </Card>

      {(open || general) && (
        <Coach
          profile={profile}
          systems={systems}
          subject={open}
          planFocus={planFocus}
          dailyCalorieTarget={targets.calories}
          onClose={() => { setOpen(null); setGeneral(false); }}
        />
      )}
    </div>
  );
};
