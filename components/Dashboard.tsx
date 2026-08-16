import React, { useState, useMemo } from 'react';
import {
  CalculatedMetrics, GamificationState, UserProfile, WellnessPlan,
  MealLog, MealType, FoodItem, WaterLog, WeightEntry, ExerciseEntry, StoredWeightGoal,
} from '../types';
import { PlanDisplay } from './PlanDisplay';
import { Button } from './ui/Button';
import { NutritionTracker } from './NutritionTracker';
import { BADGE_MAP, BADGE_DEFINITIONS } from '../data/badgeDefinitions';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { toISODateString } from '../utils/dateUtils';
import { ScoreRing } from './ui/ScoreRing';
import { Modal } from './ui/Modal';
import { GoalPanel } from './GoalPanel';
import {
  IconFlame, IconApple, IconTrophy, IconActivity, IconMap2, IconBowl, IconCheck, IconPlus, IconX,
  IconRun, IconWalk, IconBike, IconSwimming, IconBarbell, IconYoga, IconBolt, IconStretching,
} from '@tabler/icons-react';

interface DashboardProps {
  profile: UserProfile;
  metrics: CalculatedMetrics;
  plan: WellnessPlan;
  gamification: GamificationState;
  onUpdateGamification: (newState: GamificationState, questsCompletedDelta?: number) => void;
  onReset: () => void;
  foodLogs: MealLog[];
  onAddFood: (meal: MealType, food: FoodItem) => void;
  onUpdateLog: (log: MealLog) => void;
  onDeleteLog: (logId: string) => void;
  onResetTodayLog: () => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  allFoodLogs: MealLog[];
  // Water
  waterLog: WaterLog;
  onLogWater: (ml: number) => void;
  onResetWater: () => void;
  // Weight
  weightHistory: WeightEntry[];
  onLogWeight: (kg: number) => void;
  weightGoal: StoredWeightGoal | null;
  onSetWeightGoal: (goal: StoredWeightGoal | null) => void;
  // Favourites
  favouriteFoods: FoodItem[];
  onAddFavourite: (food: FoodItem) => void;
  onRemoveFavourite: (foodId: string) => void;
  onQuickAddFavourite: (food: FoodItem, mealType: MealType) => void;
  // Exercise
  exerciseLogs: ExerciseEntry[];
  onLogExercise: (type: string, durationMin: number, notes?: string) => void;
  onDeleteExercise: (id: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  profile,
  metrics,
  plan,
  gamification,
  onUpdateGamification,
  onReset,
  foodLogs,
  onAddFood,
  onUpdateLog,
  selectedDate,
  onSelectDate,
  allFoodLogs,
  onDeleteLog,
  onResetTodayLog,
  waterLog,
  onLogWater,
  onResetWater,
  weightHistory,
  onLogWeight,
  weightGoal,
  onSetWeightGoal,
  favouriteFoods,
  onAddFavourite,
  onRemoveFavourite,
  onQuickAddFavourite,
  exerciseLogs,
  onLogExercise,
  onDeleteExercise,
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'quests' | 'nutrition' | 'progress'>('plan');
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  // Exercise log modal state
  const [isLoggingExercise, setIsLoggingExercise] = useState(false);
  const [exType, setExType] = useState('Running');
  const [exDuration, setExDuration] = useState('');
  const [exNotes, setExNotes] = useState('');

  const completeQuest = (questId: string, xpReward: number) => {
    if (gamification.completedQuestIds.includes(questId)) return;
    const newXp = gamification.xp + xpReward;
    const newLevel = Math.floor(newXp / 100) + 1;
    const newState: GamificationState = {
      ...gamification,
      xp: newXp,
      level: newLevel,
      completedQuestIds: [...gamification.completedQuestIds, questId],
    };
    onUpdateGamification(newState, 1);
  };

  // The plan comes from the AI, so never assume its arrays are present.
  const dailyQuests = plan.dailyQuests ?? [];

  const calculateProgress = () => {
    const total = dailyQuests.length;
    const completed = gamification.completedQuestIds.length;
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  };

  const caloriesConsumed = foodLogs.reduce((acc, l) => acc + l.food.calories, 0);

  // Weight chart data (last 14 entries)
  const weightChartData = useMemo(() => {
    return weightHistory.slice(-14).map(e => ({
      date: e.date.slice(5), // MM-DD
      kg: e.kg,
    }));
  }, [weightHistory]);

  // Prefer the tagged baseline entry; fall back to first entry, then profile weight
  const startingWeight = (weightHistory.find(e => e.isBaseline) ?? weightHistory[0])?.kg ?? profile.weightKg;
  const currentWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].kg : profile.weightKg;
  const weightDelta = +(currentWeight - startingWeight).toFixed(1);

  const handleLogWeightSubmit = () => {
    const kg = parseFloat(weightInput);
    if (!isNaN(kg) && kg > 20 && kg < 400) {
      onLogWeight(kg);
      setWeightInput('');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-center gap-5 bg-card rounded-card border border-edge shadow-sm dark:shadow-none p-5 mb-5 animate-fade-in">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <ScoreRing value={gamification.xp % 100} max={100} size={88} centerValue={gamification.level} label="Level" colorClass="text-nutri" />
          <div>
            <div className="nums text-2xl font-bold text-fg leading-none">
              {gamification.xp} <span className="text-base font-semibold text-fg-soft">XP</span>
            </div>
            <p className="text-xs text-fg-soft mt-1.5">{100 - (gamification.xp % 100)} to level {gamification.level + 1}</p>
          </div>
        </div>
        <div className="flex gap-3 w-full sm:w-auto sm:ml-auto">
          <div className="flex-1 sm:flex-none flex items-center gap-2.5 bg-raised rounded-tile px-4 py-2.5">
            <IconFlame size={20} className="text-spark" />
            <div>
              <div className="nums text-lg font-bold text-fg leading-none">{gamification.streak}</div>
              <div className="text-[11px] text-fg-soft">day streak</div>
            </div>
          </div>
          <div className="flex-1 sm:flex-none flex items-center gap-2.5 bg-raised rounded-tile px-4 py-2.5">
            <IconApple size={20} className="text-nutri" />
            <div>
              <div className="nums text-lg font-bold text-fg leading-none">
                {caloriesConsumed}<span className="text-xs font-normal text-fg-soft"> / {Math.round(metrics.tdee)}</span>
              </div>
              <div className="text-[11px] text-fg-soft">kcal eaten</div>
            </div>
          </div>
        </div>
      </header>

      {/* Badges row */}
      {gamification.badges.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4 animate-fade-in">
          {gamification.badges.map(id => {
            const b = BADGE_MAP[id];
            if (!b) return null;
            return (
              <span
                key={id}
                title={b.description}
                className="inline-flex items-center gap-1.5 bg-spark/10 border border-spark/25 text-fg text-xs font-semibold px-3 py-1.5 rounded-full"
              >
                <b.Icon size={14} className="text-spark" /> {b.title}
              </span>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      {/* 4-up grid on phones so every tab is reachable without a hidden
          horizontal scroll; inline row from sm: upward. */}
      <div className="grid grid-cols-4 sm:flex gap-1 mb-6 bg-raised p-1 rounded-control w-full sm:w-fit mx-auto md:mx-0" role="tablist">
        {(['plan', 'nutrition', 'quests', 'progress'] as const).map((tab) => {
          const meta = {
            plan: { label: 'My Plan', Icon: IconMap2 },
            nutrition: { label: 'Nutrition', Icon: IconBowl },
            quests: { label: 'Quests', Icon: IconTrophy },
            progress: { label: 'Progress', Icon: IconActivity },
          }[tab];
          const remaining = dailyQuests.length - gamification.completedQuestIds.length;
          return (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`relative flex flex-col sm:inline-flex sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-4 py-2 rounded-[8px] font-semibold text-[11px] sm:text-sm transition-all whitespace-nowrap ${
                activeTab === tab ? 'bg-card text-nutri shadow-sm dark:shadow-none' : 'text-fg-soft hover:text-fg'
              }`}
            >
              <meta.Icon size={16} className="shrink-0" />
              {meta.label}
              {tab === 'quests' && remaining > 0 && (
                <span className="nums absolute top-0.5 right-1 sm:static sm:ml-0.5 bg-nutri-strong text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{remaining}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── My Plan ── */}
      {activeTab === 'plan' && <PlanDisplay plan={plan} />}

      {/* ── Nutrition & Logs ── */}
      {activeTab === 'nutrition' && (
        <NutritionTracker
          logs={foodLogs}
          onAddFood={onAddFood}
          onUpdateLog={onUpdateLog}
          onDeleteLog={onDeleteLog}
          selectedDate={selectedDate}
          onSelectDate={onSelectDate}
          allFoodLogs={allFoodLogs}
          targets={{ calories: metrics.tdee, ...metrics.macros }}
          profile={profile}
          plan={plan}
          onResetTodayLog={onResetTodayLog}
          waterLog={waterLog}
          onLogWater={onLogWater}
          onResetWater={onResetWater}
          weightHistory={weightHistory}
          favouriteFoods={favouriteFoods}
          onAddFavourite={onAddFavourite}
          onRemoveFavourite={onRemoveFavourite}
          onQuickAddFavourite={onQuickAddFavourite}
        />
      )}

      {/* ── Daily Quests ── */}
      {activeTab === 'quests' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-end mb-2">
            <h3 className="text-xl font-bold text-fg">Today's Goals</h3>
            <span className="nums text-sm font-semibold text-nutri">{calculateProgress()}% complete</span>
          </div>
          <div className="h-3 bg-track rounded-full overflow-hidden mb-6">
            <div className="h-full bg-nutri rounded-full transition-all duration-700 ease-out" style={{ width: `${calculateProgress()}%` }} />
          </div>
          <div className="grid gap-3">
            {dailyQuests.map((quest) => {
              const isCompleted = gamification.completedQuestIds.includes(quest.id);
              return (
                <div
                  key={quest.id}
                  onClick={() => !isCompleted && completeQuest(quest.id, quest.xpReward)}
                  className={`flex items-center gap-4 p-4 rounded-card border transition-all ${
                    isCompleted
                      ? 'bg-raised border-edge opacity-70'
                      : 'bg-card border-edge hover:border-nutri/50 cursor-pointer shadow-sm dark:shadow-none'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${isCompleted ? 'bg-nutri-strong text-white' : 'border-2 border-edge'}`}>
                    {isCompleted && <IconCheck size={16} stroke={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className={`font-semibold ${isCompleted ? 'text-fg-soft line-through' : 'text-fg'}`}>{quest.title}</h4>
                    <p className="text-fg-soft text-sm">{quest.description}</p>
                  </div>
                  <span className="nums text-xs font-bold text-spark bg-spark/10 px-2.5 py-1 rounded-full shrink-0">+{quest.xpReward} XP</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Progress ── */}
      {activeTab === 'progress' && (
        <div className="space-y-5 animate-fade-in">
          {/* Goal + trajectory. All safety refusals live in goalProjection. */}
          <GoalPanel
            profile={profile}
            weightHistory={weightHistory}
            goal={weightGoal}
            onSetGoal={onSetWeightGoal}
          />

          {/* Weight Log */}
          <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
            <h3 className="text-lg font-bold text-fg mb-3">Body Weight</h3>
            <div className="flex gap-6 mb-4">
              <div>
                <p className="text-[11px] text-fg-mute font-semibold uppercase tracking-wide">Starting</p>
                <p className="nums text-2xl font-bold text-fg">{startingWeight} <span className="text-sm font-normal text-fg-mute">kg</span></p>
              </div>
              <div>
                <p className="text-[11px] text-fg-mute font-semibold uppercase tracking-wide">Current</p>
                <p className="nums text-2xl font-bold text-fg">{currentWeight} <span className="text-sm font-normal text-fg-mute">kg</span></p>
              </div>
              <div>
                <p className="text-[11px] text-fg-mute font-semibold uppercase tracking-wide">Change</p>
                <p className={`nums text-2xl font-bold ${weightDelta < 0 ? 'text-nutri' : weightDelta > 0 ? 'text-fat' : 'text-fg-mute'}`}>
                  {weightDelta > 0 ? '+' : ''}{weightDelta} <span className="text-sm font-normal">kg</span>
                </p>
              </div>
            </div>

            {weightChartData.length >= 2 && (
              <div className="h-36 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightChartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} width={32} />
                    <Tooltip formatter={(v: number) => [`${v} kg`, 'Weight']} contentStyle={{ background: 'rgb(var(--surface-card))', border: '1px solid rgb(var(--edge))', borderRadius: 12, color: 'rgb(var(--fg))' }} />
                    <Line type="monotone" dataKey="kg" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <input
                type="number"
                step="0.1"
                placeholder={`Today's weight (kg)`}
                value={weightInput}
                onChange={e => setWeightInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogWeightSubmit()}
                className="flex-1 p-3 bg-card border-2 border-edge rounded-control text-fg placeholder:text-fg-mute focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page font-medium"
              />
              <Button onClick={handleLogWeightSubmit} disabled={!weightInput}>Log</Button>
            </div>
          </section>

          {/* Exercise Log */}
          {(() => {
            const today = toISODateString();
            const todayExercise = exerciseLogs.filter(e => e.date === today);
            const todayXp = todayExercise.reduce((s, e) => s + e.xpEarned, 0);
            const EXERCISE_ICONS: Record<string, typeof IconRun> = {
              Running: IconRun, Walking: IconWalk, Cycling: IconBike, Swimming: IconSwimming,
              'Strength Training': IconBarbell, Yoga: IconYoga, HIIT: IconBolt, Other: IconStretching,
            };
            return (
              <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
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
              </section>
            );
          })()}

          {/* Badges */}
          <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
            <h3 className="text-lg font-bold text-fg mb-4">Achievements</h3>
            {gamification.badges.length === 0 ? (
              <p className="text-sm text-fg-mute italic">No badges yet — complete quests, log food, and build your streak to earn them!</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {gamification.badges.map(id => {
                  const b = BADGE_MAP[id];
                  if (!b) return null;
                  return (
                    <div key={id} className="flex flex-col items-center gap-1 p-4 rounded-tile bg-spark/10 border border-spark/25 text-center">
                      <b.Icon size={30} className="text-spark" stroke={1.75} />
                      <span className="font-bold text-fg text-sm">{b.title}</span>
                      <span className="text-xs text-fg-soft">{b.description}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Locked badges */}
            {(() => {
              const locked = BADGE_DEFINITIONS.filter(b => !gamification.badges.includes(b.id));
              if (locked.length === 0) return null;
              return (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-fg-mute uppercase tracking-wider mb-3">Locked</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {locked.map(b => (
                      <div key={b.id} className="flex flex-col items-center gap-1 p-4 rounded-tile bg-raised border border-edge text-center opacity-60">
                        <b.Icon size={30} className="text-fg-mute" stroke={1.75} />
                        <span className="font-bold text-fg text-sm">{b.title}</span>
                        <span className="text-xs text-fg-soft">{b.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Stats */}
          <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
            <h3 className="text-lg font-bold text-fg mb-4">Stats</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Total XP', value: gamification.xp, suffix: 'xp' },
                { label: 'Current Level', value: gamification.level, suffix: '' },
                { label: 'Day Streak', value: gamification.streak, suffix: '' },
                { label: 'Badges Earned', value: gamification.badges.length, suffix: '' },
              ].map(stat => (
                <div key={stat.label} className="bg-raised p-4 rounded-tile">
                  <p className="text-[11px] font-semibold text-fg-mute uppercase tracking-wide">{stat.label}</p>
                  <p className="nums text-2xl font-bold text-fg">{stat.value} <span className="text-sm font-normal text-fg-soft">{stat.suffix}</span></p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="mt-12 text-center">
        <Button variant="ghost" onClick={() => setShowStartOverConfirm(true)} className="text-fg-mute text-sm">Start Over</Button>
      </div>

      {/* ── Exercise log modal ── */}
      {isLoggingExercise && (
        <Modal onClose={() => setIsLoggingExercise(false)} labelledBy="exercise-modal-title" className="bg-card rounded-modal p-6 max-w-sm w-full shadow-2xl space-y-4">
            <h3 id="exercise-modal-title" className="text-xl font-bold text-fg">Log Exercise</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5 block">Type</label>
                <select
                  value={exType}
                  onChange={e => setExType(e.target.value)}
                  className="w-full p-3 bg-card border-2 border-edge rounded-control text-fg focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page font-medium"
                >
                  {['Running','Walking','Cycling','Swimming','Strength Training','Yoga','HIIT','Other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5 block">Duration (minutes)</label>
                <input
                  type="number" min="1" placeholder="e.g. 30"
                  value={exDuration}
                  onChange={e => setExDuration(e.target.value)}
                  className="w-full p-3 bg-card border-2 border-edge rounded-control text-fg placeholder:text-fg-mute focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page font-medium"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-fg-soft uppercase tracking-wider mb-1.5 block">Notes <span className="normal-case font-normal text-fg-mute">(optional)</span></label>
                <input
                  type="text" placeholder="e.g. Morning run, felt great"
                  value={exNotes}
                  onChange={e => setExNotes(e.target.value)}
                  className="w-full p-3 bg-card border-2 border-edge rounded-control text-fg placeholder:text-fg-mute focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page font-medium"
                />
              </div>
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

      {showStartOverConfirm && (
        <Modal
          onClose={() => setShowStartOverConfirm(false)}
          labelledBy="startover-modal-title"
          className="bg-card rounded-modal p-6 max-w-sm w-full shadow-2xl space-y-4"
        >
            <h3 id="startover-modal-title" className="text-xl font-bold text-fg">Start Over?</h3>
            <p className="text-sm text-fg-soft">All your data will be permanently deleted.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowStartOverConfirm(false)}>Cancel</Button>
              <Button variant="primary" className="flex-1 bg-fat hover:brightness-105" onClick={onReset}>Yes, Start Over</Button>
            </div>
        </Modal>
      )}
    </div>
  );
};
