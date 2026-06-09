import React, { useState, useMemo } from 'react';
import {
  CalculatedMetrics, GamificationState, UserProfile, WellnessPlan,
  MealLog, MealType, FoodItem, WaterLog, WeightEntry,
} from '../types';
import { PlanDisplay } from './PlanDisplay';
import { Button } from './ui/Button';
import { NutritionTracker } from './NutritionTracker';
import { BADGE_MAP, BADGE_DEFINITIONS } from '../data/badgeDefinitions';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';

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
  // Favourites
  favouriteFoods: FoodItem[];
  onAddFavourite: (food: FoodItem) => void;
  onRemoveFavourite: (foodId: string) => void;
  onQuickAddFavourite: (food: FoodItem, mealType: MealType) => void;
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
  favouriteFoods,
  onAddFavourite,
  onRemoveFavourite,
  onQuickAddFavourite,
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'quests' | 'nutrition' | 'progress'>('plan');
  const [showStartOverConfirm, setShowStartOverConfirm] = useState(false);
  const [weightInput, setWeightInput] = useState('');

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

  const calculateProgress = () => {
    const total = plan.dailyQuests.length;
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
      <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl shadow-inner">⚡</div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Level {gamification.level}</h2>
            <div className="w-32 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
              <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${gamification.xp % 100}%` }} />
            </div>
            <p className="text-xs text-slate-500 mt-1">{gamification.xp % 100} / 100 XP to next level</p>
          </div>
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <span className="block text-xl font-black text-green-600">{gamification.streak} 🔥</span>
            <span className="text-xs font-bold text-slate-400 uppercase">Day Streak</span>
          </div>
          <div>
            <span className="block text-xl font-black text-slate-800">
              {caloriesConsumed} <span className="text-slate-400 font-normal text-sm">/ {Math.round(metrics.tdee)}</span>
            </span>
            <span className="text-xs font-bold text-slate-400 uppercase">Kcal Eaten</span>
          </div>
        </div>
      </header>

      {/* Badges row */}
      {gamification.badges.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-4">
          {gamification.badges.map(id => {
            const b = BADGE_MAP[id];
            if (!b) return null;
            return (
              <span
                key={id}
                title={b.description}
                className="inline-flex items-center gap-1 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm"
              >
                {b.emoji} {b.title}
              </span>
            );
          })}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl w-fit mx-auto md:mx-0 overflow-x-auto">
        {(['plan', 'nutrition', 'quests', 'progress'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${
              activeTab === tab ? 'bg-white shadow text-green-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'plan' ? 'My Plan'
              : tab === 'nutrition' ? 'Nutrition & Logs'
              : tab === 'quests' ? 'Daily Quests'
              : 'Progress'}
            {tab === 'quests' && plan.dailyQuests.length - gamification.completedQuestIds.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {plan.dailyQuests.length - gamification.completedQuestIds.length}
              </span>
            )}
          </button>
        ))}
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
        <div className="space-y-4">
          <div className="flex justify-between items-end mb-2">
            <h3 className="text-xl font-bold text-slate-800">Today's Goals</h3>
            <span className="text-sm font-semibold text-green-600">{calculateProgress()}% Complete</span>
          </div>
          <div className="h-4 bg-slate-200 rounded-full overflow-hidden mb-6">
            <div className="h-full bg-green-500 transition-all duration-1000 ease-out" style={{ width: `${calculateProgress()}%` }} />
          </div>
          <div className="grid gap-4">
            {plan.dailyQuests.map((quest) => {
              const isCompleted = gamification.completedQuestIds.includes(quest.id);
              return (
                <div
                  key={quest.id}
                  onClick={() => !isCompleted && completeQuest(quest.id, quest.xpReward)}
                  className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer group ${
                    isCompleted
                      ? 'bg-green-50 border-green-200 opacity-60'
                      : 'bg-white border-slate-200 hover:border-green-400 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-white ${isCompleted ? 'bg-green-500 border-green-500' : 'border-slate-300'}`}>
                      {isCompleted && '✓'}
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-bold text-lg ${isCompleted ? 'text-green-800 line-through' : 'text-slate-800'}`}>{quest.title}</h4>
                      <p className="text-slate-500 text-sm">{quest.description}</p>
                    </div>
                    <div className="text-amber-500 font-bold text-sm bg-amber-50 px-2 py-1 rounded-lg">+{quest.xpReward} XP</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Progress ── */}
      {activeTab === 'progress' && (
        <div className="space-y-6">
          {/* Weight Log */}
          <section className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Body Weight</h3>
            <div className="flex gap-6 mb-4">
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase">Starting</p>
                <p className="text-2xl font-black text-slate-700">{startingWeight} <span className="text-sm font-normal text-slate-400">kg</span></p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase">Current</p>
                <p className="text-2xl font-black text-slate-700">{currentWeight} <span className="text-sm font-normal text-slate-400">kg</span></p>
              </div>
              <div>
                <p className="text-xs text-slate-400 font-bold uppercase">Change</p>
                <p className={`text-2xl font-black ${weightDelta < 0 ? 'text-green-600' : weightDelta > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                  {weightDelta > 0 ? '+' : ''}{weightDelta} <span className="text-sm font-normal">kg</span>
                </p>
              </div>
            </div>

            {weightChartData.length >= 2 && (
              <div className="h-36 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weightChartData}>
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} width={32} />
                    <Tooltip formatter={(v: number) => [`${v} kg`, 'Weight']} />
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
                className="flex-1 p-3 border-2 border-slate-200 rounded-xl focus:border-green-400 focus:outline-none font-medium"
              />
              <Button onClick={handleLogWeightSubmit} disabled={!weightInput}>Log</Button>
            </div>
          </section>

          {/* Badges */}
          <section className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Achievements</h3>
            {gamification.badges.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No badges yet — complete quests, log food, and build your streak to earn them!</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {gamification.badges.map(id => {
                  const b = BADGE_MAP[id];
                  if (!b) return null;
                  return (
                    <div key={id} className="flex flex-col items-center gap-1 p-4 rounded-xl bg-amber-50 border border-amber-200 text-center">
                      <span className="text-3xl">{b.emoji}</span>
                      <span className="font-bold text-amber-800 text-sm">{b.title}</span>
                      <span className="text-xs text-amber-600/80">{b.description}</span>
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
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Locked</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {locked.map(b => (
                      <div key={b.id} className="flex flex-col items-center gap-1 p-4 rounded-xl bg-slate-50 border border-slate-200 text-center opacity-50 grayscale">
                        <span className="text-3xl">{b.emoji}</span>
                        <span className="font-bold text-slate-600 text-sm">{b.title}</span>
                        <span className="text-xs text-slate-500">{b.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Stats */}
          <section className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Total XP', value: gamification.xp, suffix: 'xp' },
                { label: 'Current Level', value: gamification.level, suffix: '' },
                { label: 'Day Streak', value: gamification.streak, suffix: '🔥' },
                { label: 'Badges Earned', value: gamification.badges.length, suffix: '' },
              ].map(stat => (
                <div key={stat.label} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase">{stat.label}</p>
                  <p className="text-2xl font-black text-slate-800">{stat.value} <span className="text-sm font-normal text-slate-500">{stat.suffix}</span></p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <div className="mt-12 text-center">
        <Button variant="ghost" onClick={() => setShowStartOverConfirm(true)} className="text-slate-400 text-sm">Start Over</Button>
      </div>

      {showStartOverConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowStartOverConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-slate-800">Start Over?</h3>
            <p className="text-sm text-slate-500">All your data will be permanently deleted.</p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setShowStartOverConfirm(false)}>Cancel</Button>
              <Button variant="primary" className="flex-1 bg-red-500 hover:bg-red-600 border-red-700" onClick={onReset}>Yes, Start Over</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
