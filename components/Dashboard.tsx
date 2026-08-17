import React, { useState, useMemo } from 'react';
import {
  CalculatedMetrics, GamificationState, UserProfile, WellnessPlan,
  MealLog, MealType, FoodItem, WaterLog, WeightEntry, ExerciseEntry, StoredWeightGoal,
} from '../types';
import { PlanDisplay } from './PlanDisplay';
import { Button } from './ui/Button';
import { NutritionTracker } from './NutritionTracker';
import { BADGE_MAP } from '../data/badgeDefinitions';
import { ScoreRing } from './ui/ScoreRing';
import { Modal } from './ui/Modal';
import { GoalPanel } from './GoalPanel';
import { QuestList } from './panels/QuestList';
import { WeightPanel } from './panels/WeightPanel';
import { ExercisePanel } from './panels/ExercisePanel';
import { AchievementsPanel } from './panels/AchievementsPanel';
import { StatsPanel } from './panels/StatsPanel';
import { CoachTabPanel } from './panels/CoachTabPanel';
import { SegmentedControl } from './ui/SegmentedControl';
import { computeConsumedMicros } from '../utils/nutritionAggregates';
import {
  IconFlame, IconApple, IconBowl, IconHeartbeat, IconTargetArrow,
  IconMessageCircle, IconUserCircle, IconX,
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

export type TabId = 'today' | 'body' | 'goal' | 'coach';

/** Four destinations. Each answers one question; see the surface inventory. */
const TABS: { id: TabId; label: string; Icon: typeof IconBowl }[] = [
  { id: 'today', label: 'Today',  Icon: IconBowl },     // what did I eat
  { id: 'body',  label: 'Body',   Icon: IconHeartbeat },// what did it do
  { id: 'goal',  label: 'Goal',   Icon: IconTargetArrow },// where am I heading
  { id: 'coach', label: 'Coach',  Icon: IconMessageCircle },// ask why
];

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
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [showProfile, setShowProfile] = useState(false);
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);

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

  // Today's intake, for the Coach tab. Same single aggregation path the
  // Body tab uses, so the coach can never quote a different number.
  const coachMicros = useMemo(() => computeConsumedMicros(foodLogs), [foodLogs]);
  const coachMacros = useMemo(() => foodLogs.reduce((a, l) => ({
    protein: a.protein + (Number(l.food.protein) || 0),
    carbs:   a.carbs   + (Number(l.food.carbs)   || 0),
    fat:     a.fat     + (Number(l.food.fat)     || 0),
  }), { protein: 0, carbs: 0, fat: 0 }), [foodLogs]);

  // The plan comes from the AI, so never assume its arrays are present.
  const dailyQuests = plan.dailyQuests ?? [];


  const caloriesConsumed = foodLogs.reduce((acc, l) => acc + l.food.calories, 0);




  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
      {/* Header */}
      <header className="flex flex-col sm:flex-row items-center gap-5 bg-card rounded-card border border-edge shadow-e1 p-5 mb-5 animate-fade-in">
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
        <button
          onClick={() => setShowProfile(true)}
          aria-label="Open profile, plan and achievements"
          className="shrink-0 w-10 h-10 rounded-control flex items-center justify-center text-fg-soft hover:bg-raised hover:text-fg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card"
        >
          <IconUserCircle size={22} />
        </button>
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

      {/* Four destinations, one job each. See docs/v2-surface-inventory.md. */}
      <SegmentedControl<TabId>
        role="tablist"
        label="Main navigation"
        value={activeTab}
        onChange={setActiveTab}
        className="grid grid-cols-4 gap-1 mb-6 bg-raised p-1 rounded-control w-full sm:w-fit mx-auto md:mx-0"
        segmentClassName="relative flex flex-col sm:inline-flex sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 px-1 sm:px-4 py-2 rounded-[8px] font-semibold text-[11px] sm:text-sm whitespace-nowrap"
        segments={TABS.map(({ id, label, Icon }) => {
          const remaining = dailyQuests.length - gamification.completedQuestIds.length;
          return {
            value: id,
            label: (
              <>
                <Icon size={16} className="shrink-0" />
                {label}
                {id === 'goal' && remaining > 0 && (
                  <span className="nums absolute top-0.5 right-1 sm:static sm:ml-0.5 bg-nutri-strong text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{remaining}</span>
                )}
              </>
            ),
          };
        })}
      />

      {/* ── Today: log what I ate ── */}
      {activeTab === 'today' && (
        <NutritionTracker
          view="log"
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

      {/* ── Body: understand what it did ── */}
      {activeTab === 'body' && (
        <NutritionTracker
          view="analysis"
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

      {/* ── Goal: where I'm heading and what to do now ── */}
      {activeTab === 'goal' && (
        <div className="space-y-5 animate-fade-in">
          {/* All safety refusals live in goalProjection, not in a prompt. */}
          <GoalPanel
            profile={profile}
            weightHistory={weightHistory}
            goal={weightGoal}
            onSetGoal={onSetWeightGoal}
          />

          {/* Quests are today's actions toward the goal, not free-floating
              gamification — which is why they live here rather than in a tab. */}
          <QuestList dailyQuests={dailyQuests} gamification={gamification} completeQuest={completeQuest} />

          <WeightPanel profile={profile} weightHistory={weightHistory} onLogWeight={onLogWeight} />

          <ExercisePanel exerciseLogs={exerciseLogs} onLogExercise={onLogExercise} onDeleteExercise={onDeleteExercise} />

          {/* Trend charts + AI weekly insights (was the Trends sub-tab). */}
        <NutritionTracker
          view="trends"
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
        </div>
      )}

      {/* ── Coach: ask why ── */}
      {activeTab === 'coach' && (
        <div className="animate-fade-in">
          <CoachTabPanel
            profile={profile}
            consumedMicros={coachMicros}
            consumedMacros={coachMacros}
            targets={{ calories: metrics.tdee, ...metrics.macros }}
            planFocus={plan.nutritionFocus}
          />
        </div>
      )}

      {/* Profile sheet: everything that is not a daily destination.
          PlanDisplay lives HERE, not inside Goal — it carries the AI
          safetyDisclaimer, per-supplement cautions and the isFallback banner,
          and burying the medical-safety surface in a weight tab weakens it. */}
      {showProfile && (
        <Modal
          onClose={() => setShowProfile(false)}
          labelledBy="profile-title"
          className="bg-card rounded-modal p-6 max-w-2xl w-full shadow-e3 max-h-[85vh] overflow-y-auto"
        >
          <div className="flex justify-between items-start gap-3 mb-5">
            <h3 id="profile-title" className="text-2xl font-bold text-fg">Your Plan &amp; Progress</h3>
            <button onClick={() => setShowProfile(false)} aria-label="Close" className="text-fg-mute hover:text-fg p-1">
              <IconX size={20} />
            </button>
          </div>

          <div className="space-y-6">
            <PlanDisplay plan={plan} />
            <AchievementsPanel gamification={gamification} />
            <StatsPanel gamification={gamification} />

            <div className="pt-2 text-center">
              <Button
                variant="ghost"
                onClick={() => { setShowProfile(false); setShowStartOverConfirm(true); }}
                className="text-fg-mute text-sm"
              >
                Start Over
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {showStartOverConfirm && (
        <Modal
          onClose={() => setShowStartOverConfirm(false)}
          labelledBy="startover-modal-title"
          className="bg-card rounded-modal p-6 max-w-sm w-full shadow-e3 space-y-4"
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
