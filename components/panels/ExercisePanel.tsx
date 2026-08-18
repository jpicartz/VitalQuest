import React, { useState } from 'react';
import { useLogs, useLogActions } from '../../contexts/LogsContext';
import { Card } from '../ui/Card';
import { Field } from '../ui/Field';
import { toISODateString } from '../../utils/dateUtils';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import {
  IconPlus, IconX, IconRun, IconWalk, IconBike, IconSwimming,
  IconBarbell, IconYoga, IconBolt, IconStretching,
} from '@tabler/icons-react';


/**
 * Extracted verbatim from Dashboard. The log modal travels WITH the panel and
 * owns the state that drives it — separating a component from its modal is
 * exactly how modals get orphaned during a restructure.
 */
export const ExercisePanel: React.FC = () => {
  const { exerciseLogs } = useLogs();
  const { onLogExercise, onDeleteExercise } = useLogActions();
  const [isLoggingExercise, setIsLoggingExercise] = useState(false);
  const [exType, setExType] = useState('Running');
  const [exDuration, setExDuration] = useState('');
  const [exNotes, setExNotes] = useState('');

  return (
    <>
        {(() => {
          const today = toISODateString();
          const todayExercise = exerciseLogs.filter(e => e.date === today);
          const todayXp = todayExercise.reduce((s, e) => s + e.xpEarned, 0);
          const EXERCISE_ICONS: Record<string, typeof IconRun> = {
            Running: IconRun, Walking: IconWalk, Cycling: IconBike, Swimming: IconSwimming,
            'Strength Training': IconBarbell, Yoga: IconYoga, HIIT: IconBolt, Other: IconStretching,
          };
          return (
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-fg">Exercise</h3>
                  {todayXp > 0 && <p className="nums text-xs text-nutri font-semibold">+{todayXp} XP earned today</p>}
                </div>
                <button
                  onClick={() => { setExType('Running'); setExDuration(''); setExNotes(''); setIsLoggingExercise(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-nutri-strong text-white dark:text-[#08210f] text-sm font-bold rounded-control hover:brightness-[1.05] transition-all"
                >
                  <IconPlus size={16} stroke={2.5} /> Log
                </button>
              </div>
              {todayExercise.length === 0 ? (
                <p className="text-sm text-fg-mute italic">No exercise logged today. Keep moving!</p>
              ) : (
                <div className="space-y-2">
                  {todayExercise.map(e => {
                    const ExIcon = EXERCISE_ICONS[e.type] ?? IconStretching;
                    return (
                    <div key={e.id} className="flex items-center gap-3 p-3 bg-raised rounded-tile border border-edge">
                      <ExIcon size={22} className="text-nutri shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-fg text-sm">{e.type}</p>
                        <p className="nums text-xs text-fg-mute">{e.durationMin} min{e.notes ? ` · ${e.notes}` : ''}</p>
                      </div>
                      <span className="nums text-xs font-bold text-spark bg-spark/10 px-2 py-1 rounded-lg shrink-0">+{e.xpEarned} XP</span>
                      <button onClick={() => onDeleteExercise(e.id)} aria-label={`Delete ${e.type} entry`} className="text-fg-mute hover:text-fat transition-colors ml-1"><IconX size={16} /></button>
                    </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })()}

    {isLoggingExercise && (
      <Modal onClose={() => setIsLoggingExercise(false)} labelledBy="exercise-modal-title" className="bg-card rounded-modal p-6 max-w-sm w-full shadow-e3 space-y-4">
          <h3 id="exercise-modal-title" className="text-xl font-bold text-fg">Log Exercise</h3>
          <div className="space-y-3">
            <div>
              <label htmlFor="exercise-type" className="block text-xs font-semibold uppercase tracking-wider text-fg-soft mb-1.5">Type</label>
              <select
                id="exercise-type"
                value={exType}
                onChange={e => setExType(e.target.value)}
                className="w-full p-3 bg-card border-2 border-edge rounded-control text-fg focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page font-medium"
              >
                {['Running','Walking','Cycling','Swimming','Strength Training','Yoga','HIIT','Other'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <Field
              label="Duration (minutes)"
              type="number" min="1" placeholder="e.g. 30"
              value={exDuration}
              onChange={e => setExDuration(e.target.value)}
            />
            <Field
              label="Notes (optional)"
              type="text" placeholder="e.g. Morning run, felt great"
              value={exNotes}
              onChange={e => setExNotes(e.target.value)}
            />
            {exDuration && Number(exDuration) > 0 && (
              <p className="nums text-sm text-nutri font-semibold bg-nutri/10 px-3 py-2 rounded-control">
                +{Math.min(Math.floor(Number(exDuration) / 15) * 5, 30)} XP
              </p>
            )}
          </div>
          <div className="flex gap-3 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setIsLoggingExercise(false)}>Cancel</Button>
            <Button
              className="flex-1"
              disabled={!exDuration || Number(exDuration) < 1}
              onClick={() => {
                onLogExercise(exType, Number(exDuration), exNotes.trim() || undefined);
                setIsLoggingExercise(false);
              }}
            >
              Save
            </Button>
          </div>
      </Modal>
    )}
    </>
  );
};
