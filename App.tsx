import React, { useState, useEffect, useCallback } from 'react';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { ProfileProvider } from './contexts/ProfileContext';
import { LogsProvider } from './contexts/LogsContext';
import {
  UserProfile, CalculatedMetrics, WellnessPlan, GamificationState,
  MealLog, MealType, FoodItem, WaterLog, WeightEntry, ExerciseEntry, StoredWeightGoal,
} from './types';
import { generateWellnessPlan } from './services/claudeService';
import { toISODateString, isSameISODate, timestampForISODate } from './utils/dateUtils';
import { updateStreak, resetQuestsIfNewDay } from './utils/streakUtils';
import { checkBadges } from './utils/badgeUtils';
import { computeMicroScore } from './utils/nutritionAggregates';
import { calculateMetrics } from './utils/metricsUtils';
import { IconBolt, IconSun, IconMoon } from '@tabler/icons-react';

type Theme = 'light' | 'dark';

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
  const [weightGoal, setWeightGoal] = useState<StoredWeightGoal | null>(null);
  const [exerciseLogs, setExerciseLogs] = useState<ExerciseEntry[]>([]);

  // ── Theme (dual-mode) — isolated from vitalQuestData, own localStorage key ──
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('vitalQuestTheme');
    if (saved === 'light' || saved === 'dark') return saved;
    return typeof window !== 'undefined'
      && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('vitalQuestTheme', theme);
  }, [theme]);

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
          setWeightGoal(parsed.weightGoal || null);

          // Water log — reset if new day
          const savedWater: WaterLog = parsed.waterLog || { date: today, mlConsumed: 0 };
          setWaterLog(savedWater.date === today ? savedWater : { date: today, mlConsumed: 0 });

          setWeightHistory(parsed.weightHistory || []);
          setFavouriteFoods(parsed.favouriteFoods || []);
          setExerciseLogs(parsed.exerciseLogs || []);
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
        waterLog, weightHistory, favouriteFoods, lifetimeQuestsCompleted, exerciseLogs,
        weightGoal,
      }));
    }
  }, [profile, metrics, plan, gamification, foodLogs, waterLog, weightHistory, favouriteFoods, lifetimeQuestsCompleted, exerciseLogs, weightGoal]);

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

  // ── Exercise ─────────────────────────────────────────────────────────────
  const handleLogExercise = (type: string, durationMin: number, notes?: string) => {
    const today = toISODateString();
    // 5 XP per 15 min, max 30 XP per entry
    const xpEarned = Math.min(Math.floor(durationMin / 15) * 5, 30);
    const entry: ExerciseEntry = {
      id: `ex-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      date: today,
      type,
      durationMin,
      notes,
      xpEarned,
    };
    setExerciseLogs(prev => [...prev, entry]);
    if (xpEarned > 0) {
      setGamification(prev => {
        const newXp = prev.xp + xpEarned;
        const newLevel = Math.floor(newXp / 100) + 1;
        const updated = { ...prev, xp: newXp, level: Math.max(prev.level, newLevel) };
        runBadgeCheck(updated, lifetimeQuestsCompleted, computeMicroScore(foodLogs, today), waterLog.mlConsumed);
        return updated;
      });
    }
  };

  const handleDeleteExercise = (id: string) => {
    setExerciseLogs(prev => prev.filter(e => e.id !== id));
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
    setExerciseLogs([]);
    setView('onboarding');
    window.location.reload();
  };

  const selectedLogs = foodLogs.filter(
    (log) => log.timestamp && isSameISODate(log.timestamp, selectedDate)
  );

  return (
    <div className="min-h-screen bg-page text-fg flex flex-col font-sans transition-colors">
      <nav className="bg-card/85 backdrop-blur border-b border-edge sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-nutri-strong rounded-[10px] flex items-center justify-center text-white">
              <IconBolt size={18} stroke={2.5} />
            </div>
            <span className="font-extrabold text-xl tracking-tight text-fg">VitalQuest</span>
          </div>
          <div className="flex items-center gap-3">
            {view === 'dashboard' && (
              <span className="inline-flex items-center gap-1 nums text-sm font-semibold text-fg-soft">
                <IconBolt size={15} className="text-spark" /> {gamification.xp} XP
              </span>
            )}
            <button
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              aria-label="Toggle light or dark theme"
              className="w-9 h-9 rounded-control flex items-center justify-center text-fg-soft hover:bg-raised hover:text-fg transition-colors"
            >
              {theme === 'light' ? <IconMoon size={18} /> : <IconSun size={18} />}
            </button>
          </div>
        </div>
      </nav>
      <main className="flex-grow">
        {view === 'onboarding' ? (
          <div className="py-12 px-4">
            <Onboarding onComplete={handleOnboardingComplete} isLoading={isLoading} />
          </div>
        ) : (
          profile && metrics && plan && (
            <ProfileProvider profile={profile} metrics={metrics} plan={plan}>
              <LogsProvider
                logs={{
                  foodLogs: selectedLogs,
                  allFoodLogs: foodLogs,
                  selectedDate,
                  waterLog,
                  weightHistory,
                  favouriteFoods,
                  exerciseLogs,
                  weightGoal,
                }}
                actions={{
                  onAddFood: handleAddFood,
                  onUpdateLog: () => {},
                  onDeleteLog: handleDeleteLog,
                  onResetTodayLog: handleResetTodayLog,
                  onSelectDate: setSelectedDate,
                  onLogWater: handleLogWater,
                  onResetWater: handleResetWater,
                  onLogWeight: handleLogWeight,
                  onSetWeightGoal: setWeightGoal,
                  onAddFavourite: handleAddFavourite,
                  onRemoveFavourite: handleRemoveFavourite,
                  onQuickAddFavourite: handleQuickAddFavourite,
                  onLogExercise: handleLogExercise,
                  onDeleteExercise: handleDeleteExercise,
                }}
              >
                <Dashboard
                  gamification={gamification}
                  onUpdateGamification={handleUpdateGamification}
                  onReset={handleReset}
                />
              </LogsProvider>
            </ProfileProvider>
          )
        )}
      </main>

      <footer className="border-t border-edge mt-auto">
        <div className="max-w-4xl mx-auto px-4 py-6 text-xs text-fg-mute space-y-2">
          <p>
            <strong className="text-fg-soft">Not medical advice.</strong> VitalQuest
            provides general wellness information generated by AI, which can be
            inaccurate. It is not a substitute for professional medical advice,
            diagnosis, or treatment. Always consult a qualified healthcare provider
            before changing your diet, starting a supplement, or altering medication.
          </p>
          <p>
            <strong className="text-fg-soft">Your data.</strong> Everything you log is
            stored only in this browser — there is no account and no database. The
            profile details you enter are sent to Anthropic's API to generate your
            plan and parse food entries. Clearing your browser data deletes everything.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default App;
