import React, { useState } from 'react';
import { UserProfile, WeightEntry, StoredWeightGoal } from '../types';
import { projectGoal } from '../utils/goalProjection';
import { toISODateString, addDaysISO, parseISODate } from '../utils/dateUtils';
import { Button } from './ui/Button';
import {
  IconTargetArrow, IconAlertTriangle, IconTrendingDown, IconTrendingUp,
  IconCheck, IconPencil,
} from '@tabler/icons-react';

interface GoalPanelProps {
  profile: UserProfile;
  weightHistory: WeightEntry[];
  goal: StoredWeightGoal | null;
  onSetGoal: (goal: StoredWeightGoal | null) => void;
}

const fmtDate = (iso: string) =>
  parseISODate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/**
 * Weight goal and trajectory.
 *
 * All safety logic lives in utils/goalProjection — this component only renders
 * whatever that returns. When the projection refuses a target, the refusal is
 * shown in place of a plan and (where one exists) a safe alternative is offered
 * as a single tap. The UI never works around a refusal.
 */
export const GoalPanel: React.FC<GoalPanelProps> = ({ profile, weightHistory, goal, onSetGoal }) => {
  const currentKg = weightHistory.length
    ? [...weightHistory].sort((a, b) => a.date.localeCompare(b.date)).slice(-1)[0].kg
    : profile.weightKg;

  const [editing, setEditing] = useState(!goal);
  const [targetKg, setTargetKg] = useState(String(goal?.targetKg ?? ''));
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? addDaysISO(toISODateString(), 90));

  // Live projection of whatever is currently in the form.
  const draft = targetKg
    ? projectGoal(profile, { targetKg: Number(targetKg), targetDate }, weightHistory)
    : null;

  // Projection of the saved goal.
  const active = goal
    ? projectGoal(profile, { targetKg: goal.targetKg, targetDate: goal.targetDate }, weightHistory)
    : null;

  const save = (kg: number, date: string) => {
    onSetGoal({ targetKg: kg, targetDate: date, setOn: toISODateString() });
    setTargetKg(String(kg));
    setTargetDate(date);
    setEditing(false);
  };

  const acceptSuggestion = () => {
    if (!draft?.suggestion) return;
    save(draft.suggestion.targetKg, draft.suggestion.targetDate);
  };

  return (
    <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h3 className="inline-flex items-center gap-2 text-lg font-bold text-fg">
          <IconTargetArrow size={20} className="text-nutri" /> Your Goal
        </h3>
        {goal && !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-fg-soft hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card rounded-control px-2 py-1"
          >
            <IconPencil size={14} /> Edit
          </button>
        )}
      </div>

      {!goal && !editing && (
        <p className="text-sm text-fg-soft">Set a target weight and date to see what it takes.</p>
      )}

      {/* ── Editor ─────────────────────────────────────────────────────── */}
      {editing && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-fg-mute">
            You&apos;re currently <span className="nums font-semibold text-fg-soft">{currentKg} kg</span>.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="goal-weight" className="block text-xs font-semibold text-fg-soft mb-1.5">
                Target weight (kg)
              </label>
              <input
                id="goal-weight"
                type="number"
                inputMode="decimal"
                min={30}
                max={300}
                value={targetKg}
                onChange={(e) => setTargetKg(e.target.value)}
                placeholder={String(currentKg)}
                className="nums w-full p-3 rounded-control bg-raised border-2 border-edge text-fg placeholder:text-fg-mute focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              />
            </div>
            <div>
              <label htmlFor="goal-date" className="block text-xs font-semibold text-fg-soft mb-1.5">
                By when
              </label>
              <input
                id="goal-date"
                type="date"
                value={targetDate}
                min={addDaysISO(toISODateString(), 1)}
                onChange={(e) => setTargetDate(e.target.value)}
                className="nums w-full p-3 rounded-control bg-raised border-2 border-edge text-fg focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card"
              />
            </div>
          </div>

          {/* Refusal — shown instead of a plan, never alongside one. */}
          {draft && !draft.ok && (
            <div role="alert" className="bg-spark/10 border border-spark/30 rounded-tile p-4">
              <div className="flex gap-3 items-start">
                <IconAlertTriangle size={18} className="text-spark shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm text-fg leading-relaxed">{draft.message}</p>
                  {draft.suggestion && (
                    <Button
                      variant="outline"
                      onClick={acceptSuggestion}
                      className="mt-3 text-xs px-3 py-1.5"
                    >
                      Use {draft.suggestion.targetKg} kg by {fmtDate(draft.suggestion.targetDate)}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {draft?.ok && (
            <p className="nums text-sm text-fg-soft">
              That&apos;s <span className="font-bold text-fg">{draft.remainingKg} kg</span> over{' '}
              <span className="font-bold text-fg">{draft.daysRemaining} days</span> —
              about {draft.weeklyRateKg} kg per week.
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="primary"
              disabled={!draft?.ok}
              onClick={() => draft?.ok && save(Number(targetKg), targetDate)}
            >
              Set goal
            </Button>
            {goal && (
              <>
                <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                <Button
                  variant="ghost"
                  className="text-fat"
                  onClick={() => { onSetGoal(null); setEditing(true); setTargetKg(''); }}
                >
                  Clear
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Active goal ────────────────────────────────────────────────── */}
      {goal && !editing && active?.ok && (
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'To go', value: `${active.remainingKg}`, unit: 'kg' },
              { label: 'Days left', value: `${active.daysRemaining}`, unit: '' },
              { label: 'Per week', value: `${active.weeklyRateKg}`, unit: 'kg' },
            ].map((s) => (
              <div key={s.label} className="p-3 rounded-tile bg-raised border border-edge">
                <div className="text-[10px] font-semibold text-fg-mute uppercase tracking-wide">{s.label}</div>
                <div className="nums text-xl font-bold text-fg mt-0.5">
                  {s.value}<span className="text-xs font-normal text-fg-soft ml-0.5">{s.unit}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 rounded-tile bg-nutri/10 border border-nutri/20">
            <div className="text-[10px] font-semibold text-fg-mute uppercase tracking-wide">
              Today&apos;s calorie target
            </div>
            <div className="nums text-3xl font-bold text-fg mt-1">
              {active.dailyCalories}
              <span className="text-sm font-normal text-fg-soft ml-1">kcal</span>
            </div>
            <p className="text-xs text-fg-soft mt-1">
              {active.dailyAdjustment === 0
                ? 'Maintenance'
                : `${Math.abs(active.dailyAdjustment)} kcal ${active.dailyAdjustment < 0 ? 'below' : 'above'} maintenance`}
              {' · '}target {active.targetKg} kg by {fmtDate(active.projectedDate)}
            </p>
          </div>

          {active.paceKgPerWeek !== null && (
            <div className={`flex items-center gap-2.5 p-3 rounded-tile border ${
              active.onTrack ? 'bg-nutri/10 border-nutri/20' : 'bg-spark/10 border-spark/25'
            }`}>
              {active.onTrack
                ? <IconCheck size={18} className="text-nutri shrink-0" stroke={2.5} />
                : (active.direction === 'lose'
                    ? <IconTrendingUp size={18} className="text-spark shrink-0" />
                    : <IconTrendingDown size={18} className="text-spark shrink-0" />)}
              <p className="text-sm text-fg">
                <span className="font-semibold">
                  {active.onTrack ? 'On track' : 'Off track'}
                </span>
                {' — '}
                <span className="nums">
                  {active.paceKgPerWeek > 0 ? '+' : ''}{active.paceKgPerWeek} kg/week
                </span>{' '}
                over your logged weigh-ins.
              </p>
            </div>
          )}

          <p className="text-[11px] text-fg-mute">
            Estimates based on your logged weight. Not medical advice — talk to a
            clinician before a significant change.
          </p>
        </div>
      )}

      {/* A saved goal can become unsafe as weight changes; surface it. */}
      {goal && !editing && active && !active.ok && (
        <div role="alert" className="mt-4 bg-spark/10 border border-spark/30 rounded-tile p-4 flex gap-3 items-start">
          <IconAlertTriangle size={18} className="text-spark shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-fg leading-relaxed">{active.message}</p>
            <Button variant="outline" onClick={() => setEditing(true)} className="mt-3 text-xs px-3 py-1.5">
              Update goal
            </Button>
          </div>
        </div>
      )}
    </section>
  );
};
