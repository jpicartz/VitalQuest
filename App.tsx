import React, { useState, useEffect } from 'react';
import { Onboarding } from './components/Onboarding';
import { Dashboard } from './components/Dashboard';
import { UserProfile, CalculatedMetrics, WellnessPlan, GamificationState, ActivityLevel, Goal, MealLog, MealType, FoodItem } from './types';
import { generateWellnessPlan } from './services/geminiService';

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
  return { bmi, bmr, tdee: Math.round(tdee), bmiCategory: bmi < 18.5 ? 'Underweight' : bmi < 25 ? 'Normal' : 'Overweight', macros: { protein: proteinGrams, fat: fatGrams, carbs: carbGrams } };
};

const initialGamification: GamificationState = { xp: 0, level: 1, streak: 1, completedQuestIds: [], badges: [] };

const App: React.FC = () => {
  const [view, setView] = useState<'onboarding' | 'dashboard'>('onboarding');
  const [isLoading, setIsLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [metrics, setMetrics] = useState<CalculatedMetrics | null>(null);
  const [plan, setPlan] = useState<WellnessPlan | null>(null);
  const [gamification, setGamification] = useState<GamificationState>(initialGamification);
  const [foodLogs, setFoodLogs] = useState<MealLog[]>([]);

  useEffect(() => {
    const savedData = localStorage.getItem('vitalQuestData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.profile && parsed.metrics && parsed.plan) {
          setProfile(parsed.profile);
          setMetrics(parsed.metrics);
          setPlan(parsed.plan);
          setGamification(parsed.gamification || initialGamification);
          setFoodLogs(parsed.foodLogs || []);
          setView('dashboard');
        }
      } catch (e) {
        console.error('Failed to parse saved data', e);
      }
    }
  }, []);

  useEffect(() => {
    if (profile && metrics && plan) {
      localStorage.setItem('vitalQuestData', JSON.stringify({
        profile,
        metrics,
        plan,
        gamification,
        foodLogs
      }));
    }
  }, [profile, metrics, plan, gamification, foodLogs]);

  const handleOnboardingComplete = async (userProfile: UserProfile) => {
    setIsLoading(true);
    try {
      const calculated = calculateMetrics(userProfile);
      const generatedPlan = await generateWellnessPlan(userProfile);
      setProfile(userProfile);
      setMetrics(calculated);
      setPlan(generatedPlan);
      setView('dashboard');
    } catch (e) {
      alert("Failed to generate plan. Please check API Key.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFood = (type: MealType, food: FoodItem) => {
    // Generate truly unique ID with timestamp and random string
    const uniqueId = `log-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const newLog: MealLog = {
      id: uniqueId,
      type,
      food,
      timestamp: Date.now()
    };
    setFoodLogs(prev => [...prev, newLog]);
  };

  const handleDeleteLog = (logId: string) => {
    setFoodLogs(prev => prev.filter(log => log.id !== logId));
  };

  const handleReset = () => {
    localStorage.removeItem('vitalQuestData');
    setProfile(null);
    setMetrics(null);
    setPlan(null);
    setFoodLogs([]);
    setGamification(initialGamification);
    setView('onboarding');
    window.location.reload();
  };

  const handleResetTodayLog = () => {
    const today = new Date().toDateString();
    setFoodLogs(prev => prev.filter(log => {
      if (!log.timestamp) return false; // Clear logs from older versions without timestamps
      return new Date(log.timestamp).toDateString() !== today;
    }));
  };

  const today = new Date().toDateString();
  const todayLogs = foodLogs.filter(log => log.timestamp && new Date(log.timestamp).toDateString() === today);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <nav className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-500 rounded flex items-center justify-center text-white font-bold">V</div>
            <span className="font-extrabold text-xl tracking-tight text-slate-900">VitalQuest</span>
          </div>
          {view === 'dashboard' && <div className="text-sm font-semibold text-slate-500">{gamification.xp} XP</div>}
        </div>
      </nav>
      <main className="flex-grow">
        {view === 'onboarding' ? (
          <div className="py-12 px-4"><Onboarding onComplete={handleOnboardingComplete} isLoading={isLoading} /></div>
        ) : (
          profile && metrics && plan && (
            <Dashboard 
              profile={profile} metrics={metrics} plan={plan} gamification={gamification} 
              onUpdateGamification={setGamification} onReset={handleReset} 
              foodLogs={todayLogs} onAddFood={handleAddFood} onUpdateLog={()=>{}} onDeleteLog={handleDeleteLog} 
              onResetTodayLog={handleResetTodayLog}
            />
          )
        )}
      </main>
    </div>
  );
};

export default App;