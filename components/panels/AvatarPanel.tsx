import React, { useEffect, useMemo, useRef } from 'react';
import { Card } from '../ui/Card';
import { AvatarFigure } from '../Avatar';
import { GamificationState } from '../../types';
import { useProfile } from '../../contexts/ProfileContext';
import { useLogs } from '../../contexts/LogsContext';
import { useTargets } from '../../contexts/useTargets';
import {
  computeVitality, computeBuild, pendingAchievements,
  VITALITY_COPY, AvatarSignals,
} from '../../utils/avatar';
import {
  computeConsumedMicros, scoreFromConsumed, sumMacros, getLastNDaysSummaries,
} from '../../utils/nutritionAggregates';
import { isSameISODate } from '../../utils/dateUtils';
import { IconBolt } from '@tabler/icons-react';

interface AvatarPanelProps {
  gamification: GamificationState;
  /**
   * Credits a BATCH of achievements in one state update.
   *
   * A batch, not one call per achievement: awarding them one at a time made
   * each call compute the next state from the same stale `gamification`
   * closure, so simultaneous awards overwrote each other and XP silently came
   * up short — a perfect day credited 65 of its 120 XP.
   */
  onAward: (achievements: { id: string; xp: number }[]) => void;
}

/** Recent window used for BUILD only — physique should not move on one day. */
const BUILD_WINDOW_DAYS = 28;

export const AvatarPanel: React.FC<AvatarPanelProps> = ({ gamification, onAward }) => {
  const { profile } = useProfile();
  const { foodLogs, allFoodLogs, waterLog, weightHistory, weightGoal } = useLogs();
  const targets = useTargets();

  const waterGoalMl = Math.min(Math.round((Number(profile?.weightKg) || 0) * 35), 3500);

  const signals: AvatarSignals = useMemo(() => {
    const macros = sumMacros(foodLogs);
    const micros = computeConsumedMicros(foodLogs);

    // Build looks back further than today, and counts only days with meals.
    const recent = getLastNDaysSummaries(allFoodLogs, BUILD_WINDOW_DAYS);
    const loggedDays = recent.filter((d) => d.mealCount > 0);
    const proteinDaysOnTarget = loggedDays.filter(
      (d) => targets.protein > 0 && d.protein / targets.protein >= 0.9,
    ).length;

    return {
      microScore: scoreFromConsumed(micros),
      proteinG: macros.protein,
      caloriesKcal: macros.calories,
      waterMl: Number(waterLog?.mlConsumed) || 0,
      targets,
      waterGoalMl,
      daysLoggedInRange: loggedDays.length,
      proteinDaysOnTarget,
    };
  }, [foodLogs, allFoodLogs, waterLog, targets, waterGoalMl]);

  const vitality = useMemo(() => computeVitality(signals), [signals]);
  const build = useMemo(
    () => computeBuild(signals, profile, weightHistory, weightGoal?.targetKg ?? null),
    [signals, profile, weightHistory, weightGoal],
  );

  // ── XP ──────────────────────────────────────────────────────────────────
  // Achievements are credited as a side effect of the data changing, not a
  // click, so this must be idempotent: `completedQuestIds` is the guard and it
  // already resets daily. The ref stops a second award firing from the same
  // render pass before the parent state has come back round.
  const awardedThisPass = useRef<Set<string>>(new Set());
  const pending = useMemo(
    () => pendingAchievements(signals, vitality, gamification.completedQuestIds ?? []),
    [signals, vitality, gamification.completedQuestIds],
  );

  useEffect(() => {
    const fresh = pending.filter((a) => !awardedThisPass.current.has(a.id));
    if (fresh.length === 0) return;
    for (const a of fresh) awardedThisPass.current.add(a.id);
    onAward(fresh.map((a) => ({ id: a.id, xp: a.xp })));
  }, [pending, onAward]);

  // A new day clears the guard, matching resetQuestsIfNewDay.
  useEffect(() => {
    if ((gamification.completedQuestIds ?? []).length === 0) awardedThisPass.current.clear();
  }, [gamification.completedQuestIds]);

  const copy = VITALITY_COPY[vitality.band];
  const earnedToday = (gamification.completedQuestIds ?? []).length;

  return (
    <Card
      title="Your character"
      description="Reacts to what you have eaten today. Build changes slowly, with protein and your own weight goal."
    >
      <div className="flex flex-col sm:flex-row items-center gap-6">
        <div className="shrink-0">
          <AvatarFigure vitality={vitality} build={build} size={190} />
        </div>

        <div className="min-w-0 flex-1 w-full">
          <div className="font-display text-xl font-bold text-fg leading-tight">{copy.title}</div>
          <p className="text-sm text-fg-soft mt-1 leading-snug">{copy.line}</p>

          {/* The working, so the character never feels arbitrary. */}
          <div className="mt-4 space-y-2">
            {vitality.parts.map((part) => (
              <div key={part.label} className="flex items-center gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-fg-mute w-20 shrink-0">
                  {part.label}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-raised overflow-hidden">
                  <div
                    className="h-full rounded-full bg-nutri transition-all duration-700"
                    style={{ width: `${part.pct}%` }}
                  />
                </div>
                <span className="nums text-[11px] font-bold text-fg-soft w-9 text-right">{part.pct}%</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <span className="text-fg-mute">
              Build: <span className="font-semibold text-fg capitalize">{build.tone}</span>
              <span className="text-fg-mute"> · {build.caption}</span>
            </span>
          </div>

          {earnedToday > 0 && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-nutri bg-nutri/10 px-2.5 py-1 rounded-control">
              <IconBolt size={13} />
              <span className="nums">{earnedToday}</span> earned today
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};
