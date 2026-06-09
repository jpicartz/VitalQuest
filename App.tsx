import React, { useState, useEffect, useCallback } from 'react';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import {
  UserProfile, CalculatedMetrics, WellnessPlan, GamificationState,
  ActivityLevel, Goal, MealLog, MealType, FoodItem, WaterLog, WeightEntry,
} from './types';
import { generateWellnessPlan } from './services/claudeService';
import { toISODateString, isSameISODate, timestampForISODate } from './utils/dateUtils';
import { updateStreak, resetQuestsIfNewDay } from './utils/streakUtils';
import { checkBadges } from './utils/badgeUtils';
import { computeMicroScore } from './utils/nutritionAggregates';

const calculateMetrics = (profile: UserProfile): CalculatedMetrics => {
  const s = profile.gender === 'Male' ? 5 : -161;
  const bmr = (10 * profile.weightKg) + (6.25 * profile.heightCm) - (5 * profile.age) + s;
  let multiplier = 1.2;
  if (profile.dailySteps && profile.dailySteps > 0) {
    if (profile.dailySteps < 5000) multiplier = 1.2;
    else if (profile.dailySteps < 7500) multiplier = 1.375;
    else if (profile.dailySteps < 10000) multiplier = 1.55;
    else if (profile.dailySteps < 15000) multiplier = 1.725;
    else multiplier = 1.9;
  } else {
    switch (profile.activityLevel) {
      case ActivityLevel.Light: multiplier = 1.375; break;
      case ActivityLevel.Moderate: multiplier = 1.55; break;
      case ActivityLevel.VeryActive: multiplier = 1.725; break;
      case ActivityLevel.ExtraActive: multiplier = 1.9; break;
      default: multiplier = 1.2;
    }
  }
  let tdee = bmr * multiplier;
  if (profile.goal === Goal.FatLoss) tdee -= 500;
  if (profile.goal === Goal.MuscleGain) tdee += 300;
  const bmi = profile.weightKg / Math.pow(profile.heightCm / 100, 2);
  const proteinGrams = Math.round(profile.weightKg * (profile.goal === Goal.MuscleGain ? 2.0 : 1.6));
  const fatGrams = Math.round((tdee * 0.25) / 9);
  const carbGrams = Math.round((tdee - (proteinGrams * 4) - (fatGrams * 9)) / 4);
  return {
    bmi, bmr,
    tdee: Math.round(tdee),
    bmiCategory: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : 'Overweight',
    macros: { protein: proteinGrams, fat: fatGrams, carbs: carbGrams },
  };
};

const initialGamification: GamificationState = {
  xp: 0, level: 1, streak: 0,
  completedQuestIds: [], badges: [],
  lastQuestDate: undefined, lastLogDate: undefined,
};

const App: React.FC = () => {
  const [view, setView] = useState<'onboarding' | 'dashboard'>('onboarding');
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [metrics, setMetrics] = useState<CalculatedMetrics | null>(null);
  const [plan, setPlan] = useState<WellnessPlan | null>(null);
  const [gamification, setGamification] = useState<GamificationState>(initialGamification);
  const [foodLogs, setFoodLogs] = useState<MealLog[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(toISODateString());

  // New state
  const [waterLog, setWaterLog] = useState<WaterLog>({ date: toISODateString(), mlConsumed: 0 });
  const [weightHistory, setWeightHistory] = useState<WeightEntry[]>([]);
  const [favouriteFoods, setFavouriteFoods] = useState<FoodItem[]>([]);
  const [lifetimeQuestsCompleted, setLifetimeQuestsCompleted] = useState<number>(0);

  // ── Load from localStorage ────────────────────────────────────────────────
  useEffect(() => {
    const savedData = localStorage.getItem('vitalQuestData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.profile && parsed.metrics && parsed.plan) {
          setProfile(parsed.profile);
          setMetrics(parsed.metrics);
          setPlan(parsed.plan);

          const today = toISODateString();

          // Strip any completedQuestIds that no longer exist in the current plan
          // (handles plan regeneration — old IDs would otherwise persist silently)
          const validQuestIds = new Set<string>(
            (parsed.plan.dailyQuests as { id: string }[]).map(q => q.id)
          );
          const rawGami: GamificationState = parsed.gamification || initialGamification;
          const sanitisedGami: GamificationState = {
            ...rawGami,
            // Defensive fallbacks for users on old schema that predates these array fields
            badges: rawGami.badges ?? [],
            completedQuestIds: (rawGami.completedQuestIds ?? []).filter(id => validQuestIds.has(id)),
          };

          // Apply daily quest reset on top of the sanitised state
          const gami = resetQuestsIfNewDay(sanitisedGami, today);
          setGamification(gami);

          setFoodLogs(parsed.foodLogs || []);
          setLifetimeQuestsCompleted(parsed.lifetimeQuestsCompleted || 0);

          // Water log — reset if new day
          const savedWater: WaterLog = parsed.waterLog || { date: today, mlConsumed: 0 };
          setWaterLog(savedWater.date === today ? savedWater : { date: today, mlConsumed: 0 });

          setWeightHistory(parsed.weightHistory || []);
          setFavouriteFoods(parsed.favouriteFoods || []);
          setView('dashboard');
        }
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
  }, []);

  // ── Persist to localStorage ───────────────────────────────────────────────
  useEffect(() => {
    if (profile && metrics && plan) {
      localStorage.setItem('vitalQuestData', JSON.stringify({
        profile, metrics, plan, gamification, foodLogs,
        waterLog, weightHistory, favouriteFoods, lifetimeQuestsCompleted,
      }));
    }
  }, [profile, metrics, plan, gamification, foodLogs, waterLog, weightHistory, favouriteFoods, lifetimeQuestsCompleted]);

  // ── Badge checker — runs whenever gamification changes ────────────────────
  const runBadgeCheck = useCallback((
    gami: GamificationState,
    ltq: number,
    microScore = 0,
    waterMl = 0,
  ) => {
    const newBadges = checkBadges({ gamification: gami, lifetimeQuestsCompleted: ltq, microScore, waterMl });
    if (newBadges.length > 0) {
      setGamification(prev => ({ ...prev, badges: [...prev.badges, ...newBadges] }));
    }
  }, []);

  // ── Onboarding ────────────────────────────────────────────────────────────
  const handleOnboardingComplete = async (userProfile: UserProfile) => {
    setIsLoading(true);
    try {
      const calculated = calculateMetrics(userProfile);
      const generatedPlan = await generateWellnessPlan(userProfile);
      const today = toISODateString();
      const freshGami: GamificationState = { ...initialGamification, lastQuestDate: today, streak: 1, lastLogDate: today };
      setProfile(userProfile);
      setMetrics(calculated);
      setPlan(generatedPlan);
      setGamification(freshGami);
      // Seed weight history with onboarding weight, marked as the immutable baseline
      setWeightHistory([{ date: today, kg: userProfile.weightKg, isBaseline: true }]);
      setView('dashboard');
    } catch {
      alert('Failed to generate plan. Please check API Key.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Food logging ──────────────────────────────────────────────────────────
  const handleAddFood = (type: MealType, food: FoodItem) => {
    const today = toISODateString();
    const uniqueId = `log-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const newLog: MealLog = {
      id: uniqueId,
      type,
      food,
      timestamp: timestampForISODate(selectedDate),
    };
    setFoodLogs(prev => [...prev, newLog]);

    // Update streak only when logging for today
    if (selectedDate === today) {
      setGamification(prev => {
        const updated = updateStreak(prev, today);
        // Pass real micro score so Nutrition Nerd badge can unlock
        runBadgeCheck(updated, lifetimeQuestsCompleted, computeMicroScore([...foodLogs, newLog], today));
        return updated;
      });
    }
  };

  const handleDeleteLog = (logId: string) => {
    setFoodLogs(prev => prev.filter(log => log.id !== logId));
  };

  const handleResetTodayLog = () => {
    const today = toISODateString();
    setFoodLogs(prev => prev.filter(log => {
      if (!log.timestamp) return false;
      return !isSameISODate(log.timestamp, today);
    }));
  };

  // ── Gamification (quest completion forwarded from Dashboard) ──────────────
  const handleUpdateGamification = (newState: GamificationState, questsCompletedDelta = 0) => {
    const newLtq = lifetimeQuestsCompleted + questsCompletedDelta;
    if (questsCompletedDelta > 0) setLifetimeQuestsCompleted(newLtq);
    setGamification(newState);
    runBadgeCheck(newState, newLtq, computeMicroScore(foodLogs, toISODateString()), waterLog.mlConsumed);
  };

  // ── Water ─────────────────────────────────────────────────────────────────
  const handleLogWater = (ml: number) => {
    const today = toISODateString();
    setWaterLog(prev => {
      const base = prev.date === today ? prev.mlConsumed : 0;
      const newMl = base + ml;
      // Run badge check with updated water + real micro score
      setGamification(prev2 => {
        runBadgeCheck(prev2, lifetimeQuestsCompleted, computeMicroScore(foodLogs, toISODateString()), newMl);
        return prev2;
      });
      return { date: today, mlConsumed: newMl };
    });
  };

  const handleResetWater = () => {
    setWaterLog({ date: toISODateString(), mlConsumed: 0 });
  };

  // ── Weight ────────────────────────────────────────────────────────────────
  const handleLogWeight = (kg: number) => {
    const today = toISODateString();
    setWeightHistory(prev => {
      // Keep the baseline entry intact; replace any other same-day entry
      const filtered = prev.filter(e => e.isBaseline || e.date !== today);
      return [...filtered, { date: today, kg }].sort((a, b) => a.date.localeCompare(b.date));
    });
    // Update profile's current weight too
    if (profile) {
      setProfile({ ...profile, weightKg: kg });
    }
  };

  // ── Favourites ────────────────────────────────────────────────────────────
  const handleAddFavourite = (food: FoodItem) => {
    setFavouriteFoods(prev => {
      if (prev.some(f => f.id === food.id || f.name === food.name)) return prev;
      const updated = [{ ...food, id: `fav-${food.name}-${Date.now()}` }, ...prev];
      return updated.slice(0, 30); // cap at 30
    });
  };

  const handleRemoveFavourite = (foodId: string) => {
    setFavouriteFoods(prev => prev.filter(f => f.id !== foodId));
  };

  const handleQuickAddFavourite = (food: FoodItem, mealType: MealType) => {
    handleAddFood(mealType, {
      ...food,
      id: `log-fav-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    });
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  const handleReset = () => {
    localStorage.removeItem('vitalQuestData');
    setProfile(null);
    setMetrics(null);
    setPlan(null);
    setFoodLogs([]);
    setGamification(initialGamification);
    setWaterLog({ date: toISODateString(), mlConsumed: 0 });
    setWeightHistory([]);
    setFavouriteFoods([]);
    setLifetimeQuestsCompleted(0);
    setView('onboarding');
    window.location.reload();
  };

  const selectedLogs = foodLogs.filter(
    (log) => log.timestamp && isSameISODate(log.timestamp, selectedDate)
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <nav className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center text-white font-bold">V</div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900">VitalQuest</span>
          </div>
          {view === 'dashboard' && <div className="text-sm font-semibold text-slate-500">{gamification.xp} XP</div>}
        </div>
      </nav>
      <main className="flex-grow">
        {view === 'onboarding' ? (
          <div className="py-12 px-4">
            <Onboarding onComplete={handleOnboardingComplete} isLoading={isLoading} />
          </div>
        ) : (
          profile && metrics && plan && (
            <Dashboard
              profile={profile}
              metrics={metrics}
              plan={plan}
              gamification={gamification}
              onUpdateGamification={handleUpdateGamification}
              onReset={handleReset}
              foodLogs={selectedLogs}
              onAddFood={handleAddFood}
              onUpdateLog={() => {}}
              onDeleteLog={handleDeleteLog}
              onResetTodayLog={handleResetTodayLog}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
              allFoodLogs={foodLogs}
              // Water
              waterLog={waterLog}
              onLogWater={handleLogWater}
              onResetWater={handleResetWater}
              // Weight
              weightHistory={weightHistory}
              onLogWeight={handleLogWeight}
              // Favourites
              favouriteFoods={favouriteFoods}
              onAddFavourite={handleAddFavourite}
              onRemoveFavourite={handleRemoveFavourite}
              onQuickAddFavourite={handleQuickAddFavourite}
            />
          )
        )}
      </main>
    </div>
  );
};

export default App;
