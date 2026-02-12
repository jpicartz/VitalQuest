import React, { useState, useEffect } from 'react';
import { CalculatedMetrics, GamificationState, UserProfile, WellnessPlan, Habit, MealLog, MealType, FoodItem } from '../types';
import { PlanDisplay } from './PlanDisplay';
import { Button } from './ui/Button';
import { NutritionTracker } from './NutritionTracker';

interface DashboardProps {
  profile: UserProfile;
  metrics: CalculatedMetrics;
  plan: WellnessPlan;
  gamification: GamificationState;
  onUpdateGamification: (newState: GamificationState) => void;
  onReset: () => void;
  // New props for food logging handled in App container for now
  foodLogs: MealLog[];
  onAddFood: (meal: MealType, food: FoodItem) => void;
  onUpdateLog: (log: MealLog) => void;
  onDeleteLog: (logId: string) => void;
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
  onDeleteLog
}) => {
  const [activeTab, setActiveTab] = useState<'plan' | 'quests' | 'nutrition'>('plan');

  const completeQuest = (questId: string, xpReward: number) => {
    if (gamification.completedQuestIds.includes(questId)) return;
    
    // Play sound or confetti effect here in a full app
    const newXp = gamification.xp + xpReward;
    const newLevel = Math.floor(newXp / 100) + 1;
    
    onUpdateGamification({
      ...gamification,
      xp: newXp,
      level: newLevel,
      completedQuestIds: [...gamification.completedQuestIds, questId]
    });
  };

  const calculateProgress = () => {
    const total = plan.dailyQuests.length;
    const completed = gamification.completedQuestIds.length;
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  };

  // Calculate consumed for header
  const caloriesConsumed = foodLogs.reduce((acc, l) => acc + l.food.calories, 0);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 pb-20">
      
      {/* Gamification Header */}
      <header className="flex flex-col md:flex-row justify-between items-center bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-6 gap-4">
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center text-2xl shadow-inner">
            ⚡
          </div>
          <div>
            <h2 className="font-bold text-slate-800 text-lg">Level {gamification.level}</h2>
            <div className="w-32 h-2 bg-slate-100 rounded-full mt-1 overflow-hidden">
              <div 
                className="h-full bg-amber-400 transition-all duration-500" 
                style={{ width: `${gamification.xp % 100}%` }} 
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">{gamification.xp % 100} / 100 XP to next level</p>
          </div>
        </div>
        
        <div className="flex gap-6 text-center">
            <div>
                <span className="block text-xl font-black text-brand-600">{gamification.streak} 🔥</span>
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

      {/* Tabs */}
      <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl w-fit mx-auto md:mx-0 overflow-x-auto">
        <button 
          onClick={() => setActiveTab('plan')}
          className={`px-6 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'plan' ? 'bg-white shadow text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          My Plan
        </button>
        <button 
          onClick={() => setActiveTab('nutrition')}
          className={`px-6 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'nutrition' ? 'bg-white shadow text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Nutrition & Logs
        </button>
        <button 
          onClick={() => setActiveTab('quests')}
          className={`px-6 py-2 rounded-lg font-bold text-sm transition-all whitespace-nowrap ${activeTab === 'quests' ? 'bg-white shadow text-brand-600' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Daily Quests
          {plan.dailyQuests.length - gamification.completedQuestIds.length > 0 && (
             <span className="ml-2 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
               {plan.dailyQuests.length - gamification.completedQuestIds.length}
             </span>
          )}
        </button>
      </div>

      {activeTab === 'plan' && <PlanDisplay plan={plan} />}

      {activeTab === 'nutrition' && (
        <NutritionTracker 
          logs={foodLogs} 
          onAddFood={onAddFood}
          onUpdateLog={onUpdateLog}
          onDeleteLog={onDeleteLog}
          targets={{
             calories: metrics.tdee,
             ...metrics.macros
          }}
        />
      )}

      {activeTab === 'quests' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-end mb-2">
            <h3 className="text-xl font-bold text-slate-800">Today's Goals</h3>
            <span className="text-sm font-semibold text-brand-600">{calculateProgress()}% Complete</span>
          </div>
          
          {/* Progress Bar */}
          <div className="h-4 bg-slate-200 rounded-full overflow-hidden mb-6">
             <div 
               className="h-full bg-brand-500 transition-all duration-1000 ease-out"
               style={{ width: `${calculateProgress()}%` }}
             />
          </div>

          <div className="grid gap-4">
            {plan.dailyQuests.map(quest => {
              const isCompleted = gamification.completedQuestIds.includes(quest.id);
              return (
                <div 
                  key={quest.id} 
                  onClick={() => !isCompleted && completeQuest(quest.id, quest.xpReward)}
                  className={`relative p-5 rounded-2xl border-2 transition-all cursor-pointer group
                    ${isCompleted 
                      ? 'bg-brand-50 border-brand-200 opacity-60' 
                      : 'bg-white border-slate-200 hover:border-brand-400 hover:shadow-md'
                    }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-white transition-colors
                      ${isCompleted ? 'bg-brand-500 border-brand-500' : 'border-slate-300 group-hover:border-brand-400'}`}>
                      {isCompleted && '✓'}
                    </div>
                    <div className="flex-1">
                      <h4 className={`font-bold text-lg ${isCompleted ? 'text-brand-800 line-through' : 'text-slate-800'}`}>{quest.title}</h4>
                      <p className="text-slate-500 text-sm">{quest.description}</p>
                    </div>
                    <div className="text-amber-500 font-bold text-sm bg-amber-50 px-2 py-1 rounded-lg">
                      +{quest.xpReward} XP
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {calculateProgress() === 100 && (
            <div className="mt-8 p-6 bg-gradient-to-r from-yellow-100 to-amber-100 rounded-2xl text-center border border-yellow-200 animate-bounce-slow">
              <div className="text-4xl mb-2">🎉</div>
              <h3 className="text-xl font-black text-yellow-800">All Quests Complete!</h3>
              <p className="text-yellow-700">You're crushing it! Come back tomorrow to keep the streak alive.</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-12 text-center">
         <Button variant="ghost" onClick={onReset} className="text-slate-400 text-sm">Start Over (Debug)</Button>
      </div>

    </div>
  );
};