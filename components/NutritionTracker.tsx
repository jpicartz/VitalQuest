import React, { useState, useRef, useMemo } from 'react';
import { Button } from './ui/Button';
import { FoodItem, MealLog, MealType, MacroTargets, MealSuggestion, UserProfile, WellnessPlan, WaterLog, WeightEntry } from '../types';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { parseFoodLog, suggestMeals } from '../services/claudeService';
import { getLastNDaysSummaries, getWeeklyMacroTotals, computeMicroScore, PRIORITY_MICROS } from '../utils/nutritionAggregates';
import { toISODateString, addDaysISO, formatNavigatorLabel } from '../utils/dateUtils';
import { TrendCharts } from './TrendCharts';
import { NutritionInsights } from './NutritionInsights';
// @ts-ignore
import html2canvas from 'html2canvas';
// @ts-ignore
import { jsPDF } from 'jspdf';
import { RecipeModal } from './RecipeModal';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

interface NutritionTrackerProps {
  logs: MealLog[];
  onAddFood: (meal: MealType, food: FoodItem) => void;
  onUpdateLog: (log: MealLog) => void;
  onDeleteLog: (logId: string) => void;
  targets: MacroTargets;
  profile: UserProfile;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  allFoodLogs: MealLog[];
  onResetTodayLog: () => void;
  plan?: WellnessPlan;
  // Water
  waterLog: WaterLog;
  onLogWater: (ml: number) => void;
  onResetWater: () => void;
  // Weight (for PDF export summary)
  weightHistory: WeightEntry[];
  // Favourites
  favouriteFoods: FoodItem[];
  onAddFavourite: (food: FoodItem) => void;
  onRemoveFavourite: (foodId: string) => void;
  onQuickAddFavourite: (food: FoodItem, mealType: MealType) => void;
}

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const rangeOptions = [7, 14, 30];

export const NutritionTracker: React.FC<NutritionTrackerProps> = ({
  logs, onAddFood, onUpdateLog, onDeleteLog, targets, profile,
  onResetTodayLog, selectedDate, onSelectDate, allFoodLogs, plan,
  waterLog, onLogWater, onResetWater, weightHistory,
  favouriteFoods, onAddFavourite, onRemoveFavourite, onQuickAddFavourite,
}) => {
  const [activeTab, setActiveTab] = useState<'log' | 'trends' | 'analysis'>('log');

  const [rangeDays, setRangeDays] = useState(7);
  const insightsSummaries = useMemo(() => getLastNDaysSummaries(allFoodLogs, 7), [allFoodLogs]);
  const trendDailySummaries = useMemo(
    () => getLastNDaysSummaries(allFoodLogs, rangeDays),
    [allFoodLogs, rangeDays]
  );
  const trendTotals = useMemo(
    () => getWeeklyMacroTotals(trendDailySummaries),
    [trendDailySummaries]
  );
  const [isAdding, setIsAdding] = useState(false);
  const [isAddingSunlight, setIsAddingSunlight] = useState(false);
  const [isMealBuilderOpen, setIsMealBuilderOpen] = useState(false);
  
  const [selectedMeal, setSelectedMeal] = useState<MealType>('Breakfast');
  const [aiInput, setAiInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedNutrient, setSelectedNutrient] = useState<string | null>(null);
  const [mealCriteria, setMealCriteria] = useState('');
const [mealSuggestions, setMealSuggestions] = useState<MealSuggestion[]>([]);
const [isMealLoading, setIsMealLoading] = useState(false);
const [targetMeal, setTargetMeal] = useState<MealType>('Lunch');
const [mealError, setMealError] = useState<string | null>(null);
const [sunlightMins, setSunlightMins] = useState('');
const [showResetConfirm, setShowResetConfirm] = useState(false);
const [recipeModal, setRecipeModal] = useState<MealSuggestion | null>(null);
const [isAddingWater, setIsAddingWater] = useState(false);
const [waterInput, setWaterInput] = useState('');
const [showFavourites, setShowFavourites] = useState(false);
const [favMealType, setFavMealType] = useState<MealType>('Breakfast');

// Water goal: 35 ml/kg capped at 3500 ml
const waterGoalMl = Math.min(Math.round(profile.weightKg * 35), 3500);
const waterPct = Math.min(Math.round((waterLog.mlConsumed / waterGoalMl) * 100), 100);
const isViewingToday = selectedDate === toISODateString();

  // Export state
  const reportRef = useRef<HTMLDivElement>(null);
  
  // -- Derived Data with robust Number casting to prevent string concatenation --
  const consumedMacros = logs.reduce((acc, log) => ({
    calories: acc.calories + Number(log.food.calories || 0),
    protein: acc.protein + Number(log.food.protein || 0),
    carbs: acc.carbs + Number(log.food.carbs || 0),
    fat: acc.fat + Number(log.food.fat || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Consolidate micros using Number() for accuracy
  const consumedMicros: Record<string, number> = {};
  logs.forEach(log => {
    if (log.food.micros) {
      Object.entries(log.food.micros).forEach(([name, amount]) => {
        consumedMicros[name] = (consumedMicros[name] || 0) + Number(amount || 0);
      });
    }
  });

  const microScore = computeMicroScore(logs, selectedDate);

  // Find "nailed" nutrients (>= 100% of target)
  const nailedNutrients = Object.keys(NUTRIENT_INFO)
    .filter(key => {
      const info = NUTRIENT_INFO[key];
      if (!info || !info.targetVal) return false;
      const current = consumedMicros[key] || 0;
      return current >= info.targetVal;
    });

  // Priority nutrients below 50% of daily target
  const nutrientGaps = PRIORITY_MICROS.flatMap((key) => {
    const info = NUTRIENT_INFO[key];
    if (!info?.targetVal) return [];
    const current = consumedMicros[key] || 0;
    const pct = Math.round((current / info.targetVal) * 100);
    if (pct >= 50) return [];
    return [{
      key,
      displayPct: current > 0 ? `${pct}%` : '0%',
      sources: info.sources.slice(0, 3),
    }];
  });

  // -- Handlers --
  const handleAiParse = async () => {
    if(!aiInput.trim()) return;
    setIsAiLoading(true);
    const foods = await parseFoodLog(aiInput);
    foods.forEach(f => onAddFood(selectedMeal, f));
    setIsAiLoading(false);
    setAiInput('');
    setIsAdding(false);
  };

  const handleManualAdd = (food: FoodItem) => {
    onAddFood(selectedMeal, food);
    setIsAdding(false);
  };

  const deleteLog = (id: string) => {
    if (window.confirm("Are you sure you want to delete this item?")) {
        onDeleteLog(id);
    }
  };

  const ProgressBar = ({ current, target, colorClass, label, unit }: any) => {
    const val = Number(current || 0);
    const tgt = Number(target || 1);
    const pct = Math.min((val / tgt) * 100, 100);
    return (
      <div className="mb-4 break-inside-avoid">
        <div className="flex justify-between text-sm font-bold text-slate-700 mb-1">
          <span>{label}</span>
          <span>{Math.round(val * 10) / 10} / {Math.round(tgt)}{unit}</span>
        </div>
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-500 ${colorClass}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };



  const handleSaveSunlight = () => {
      const val = parseInt(sunlightMins);
      if (val > 0) {
           const vitD = Math.round(val * 0.7); 
           const sunItem: FoodItem = {
               id: `sun-${Date.now()}`,
               name: '☀️ Sunlight Exposure',
               servingSize: `${val} mins`,
               calories: 0,
               protein: 0,
               carbs: 0,
               fat: 0,
               micros: { "Vitamin D": vitD }
           };
           onAddFood('Snack', sunItem);
           setIsAddingSunlight(false);
           setSunlightMins('');
      }
  };

  const handleSaveWater = (ml: number) => {
    onLogWater(ml);
    setWaterInput('');
    setIsAddingWater(false);
  };

  const handleCustomWater = () => {
    const ml = parseInt(waterInput);
    if (ml > 0) handleSaveWater(ml);
  };

  const handleMealGenerate = async () => {
    if (!mealCriteria.trim()) return;
    setIsMealLoading(true);
    setMealError(null);
    try {
      console.log('Calling suggestMeals with:', mealCriteria);
      const results = await suggestMeals(mealCriteria, profile, targets);
      console.log('suggestMeals returned:', results);
      if (!results || results.length === 0) {
        setMealError('No suggestions returned. Check console for details.');
      }
      setMealSuggestions(results);
    } catch (e: any) {
      console.error('handleMealGenerate error:', e);
      setMealError(e?.message || 'Unknown error occurred');
    } finally {
      setIsMealLoading(false);
    }
  };

  const handleAddMealSuggestion = (s: MealSuggestion) => {
    const item: FoodItem = {
      id: `suggestion-${Date.now()}`,
      name: s.name,
      servingSize: "1 Meal",
      calories: s.calories,
      protein: s.protein,
      carbs: s.carbs,
      fat: s.fat,
      micros: s.micros
    };
    onAddFood(targetMeal, item);
    setIsMealBuilderOpen(false);
    setMealSuggestions([]);
    setMealCriteria('');
  };

  const handleExportPDF = async () => {
    if (!reportRef.current) return;
    try {
      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('nutrition-report.pdf');
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit overflow-x-auto">
            <button onClick={() => setActiveTab('log')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'log' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Food Log</button>
            <button onClick={() => setActiveTab('trends')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'trends' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Trends</button>
            <button onClick={() => setActiveTab('analysis')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === 'analysis' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Analysis</button>
        </div>
        {activeTab === 'log' && isViewingToday && (
          <Button variant="outline" onClick={() => setShowResetConfirm(true)} className="text-sm font-bold text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700">
            Reset Today's Log
          </Button>
        )}
      </div>

      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-slate-800">Reset Today's Log?</h3>
                <button onClick={() => setShowResetConfirm(false)} className="text-slate-400 hover:text-slate-600">×</button>
             </div>
             <p className="text-sm text-slate-500">
                Are you sure you want to clear all food logs for today? This action cannot be undone.
             </p>
             <div className="flex gap-3 pt-2">
               <Button variant="outline" className="flex-1" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
               <Button variant="primary" className="flex-1 bg-red-500 hover:bg-red-600 border-red-700 shadow-red-500/30" onClick={() => {
                 onResetTodayLog();
                 setShowResetConfirm(false);
               }}>
                  Yes, Reset
               </Button>
             </div>
          </div>
        </div>
      )}

      {activeTab === 'log' && (
        <div className="animate-fade-in">
          {!isAdding ? (
            <>
              {/* Date Navigator */}
              {(() => {
                const { title, subtitle } = formatNavigatorLabel(selectedDate);
                const tomorrowISO = addDaysISO(toISODateString(), 1);
                return (
                  <div className="flex items-center justify-between bg-white p-3 rounded-2xl shadow-sm border border-slate-100 mb-4">
                    <button
                      onClick={() => onSelectDate(addDaysISO(selectedDate, -1))}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 font-bold text-lg"
                    >
                      ‹
                    </button>
                    <div className="text-center">
                      <p className="font-bold text-slate-800 text-sm">{title}</p>
                      <p className="text-xs text-slate-400">{subtitle}</p>
                    </div>
                    <button
                      onClick={() => {
                        const next = addDaysISO(selectedDate, 1);
                        if (next <= tomorrowISO) onSelectDate(next);
                      }}
                      className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 font-bold text-lg"
                    >
                      ›
                    </button>
                  </div>
                );
              })()}<div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6 flex justify-between items-center">
                <div>
                   <h3 className="font-bold text-slate-500 text-sm uppercase">Calories Remaining</h3>
                   <div className="text-4xl font-black text-slate-800">{Math.max(0, Math.round(targets.calories - consumedMacros.calories))}</div>
                </div>
                <div className="text-right">
                   <div className="text-sm text-slate-500">Eaten</div>
                   <div className="font-bold text-xl text-green-600">{Math.round(consumedMacros.calories)} kcal</div>
                </div>
              </div>

              {/* Today-only trackers: water + sunlight */}
              {isViewingToday ? (
                <>
                  {/* Water progress bar */}
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-blue-700 text-sm">💧 Water Today</span>
                      <span className="text-sm font-bold text-slate-600">{waterLog.mlConsumed} / {waterGoalMl} ml <span className="text-slate-400 font-normal">({waterPct}%)</span></span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-blue-400 transition-all duration-500 rounded-full" style={{ width: `${waterPct}%` }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => onLogWater(250)} className="flex-1 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors">+250 ml</button>
                      <button onClick={() => onLogWater(500)} className="flex-1 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors">+500 ml</button>
                      <button onClick={() => setIsAddingWater(true)} className="flex-1 py-1.5 text-xs font-bold bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 border border-blue-200 transition-colors">Custom</button>
                      {waterLog.mlConsumed > 0 && (
                        <button onClick={onResetWater} className="py-1.5 px-2 text-xs font-bold bg-slate-50 text-slate-400 rounded-lg hover:bg-slate-100 border border-slate-200 transition-colors">↺</button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button onClick={() => setIsAddingSunlight(true)} className="py-3 bg-amber-50 rounded-xl font-bold text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200">☀️ Sunlight</button>
                    <button onClick={() => setIsMealBuilderOpen(true)} className="py-3 bg-indigo-50 rounded-xl font-bold text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200">✨ Builder</button>
                  </div>
                </>
              ) : (
                <>
                  {/* Past-day banner */}
                  <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-4 text-sm text-slate-500">
                    <span className="text-base">📅</span>
                    <span>Viewing a past day — water &amp; sunlight tracking only available for today.</span>
                  </div>

                  {/* Meal builder still available for past-day edits */}
                  <div className="mb-6">
                    <button onClick={() => setIsMealBuilderOpen(true)} className="w-full py-3 bg-indigo-50 rounded-xl font-bold text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200">✨ Builder</button>
                  </div>
                </>
              )}

              {/* Favourites quick-add */}
              {favouriteFoods.length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowFavourites(f => !f)}
                    className="w-full py-3 bg-yellow-50 rounded-xl font-bold text-yellow-700 hover:bg-yellow-100 transition-colors border border-yellow-200 text-sm mb-2"
                  >
                    ⭐ Favourites ({favouriteFoods.length}) {showFavourites ? '▲' : '▼'}
                  </button>
                  {showFavourites && (
                    <div className="bg-white rounded-xl border border-yellow-200 overflow-hidden">
                      <div className="bg-yellow-50 px-4 py-2 border-b border-yellow-100 flex items-center justify-between">
                        <span className="text-xs font-bold text-yellow-700 uppercase tracking-wide">Quick Add to:</span>
                        <select
                          value={favMealType}
                          onChange={e => setFavMealType(e.target.value as MealType)}
                          className="text-xs font-bold bg-white border border-yellow-200 rounded-lg px-2 py-1 text-slate-700"
                        >
                          {MEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                        {favouriteFoods.map(food => (
                          <div key={food.id} className="px-4 py-3 flex justify-between items-center hover:bg-yellow-50 transition-colors">
                            <div className="flex-1">
                              <p className="font-medium text-slate-800 text-sm">{food.name}</p>
                              <p className="text-xs text-slate-400">{food.calories} kcal · P:{food.protein}g C:{food.carbs}g F:{food.fat}g</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => onQuickAddFavourite(food, favMealType)}
                                className="text-xs font-bold bg-green-500 text-white px-3 py-1.5 rounded-lg hover:bg-green-600 transition-colors"
                              >+ Add</button>
                              <button
                                onClick={() => onRemoveFavourite(food.id)}
                                className="text-slate-300 hover:text-red-400 transition-colors text-sm"
                                title="Remove from favourites"
                              >★</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-6">
                {MEAL_TYPES.map(type => {
                  const mealLogs = logs.filter(l => l.type === type);
                  return (
                    <div key={type} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <div className="bg-slate-50 p-4 flex justify-between items-center border-b border-slate-100">
                        <h4 className="font-bold text-slate-800">{type}</h4>
                        <span className="text-sm text-slate-500">{mealLogs.reduce((acc, l) => acc + Number(l.food.calories || 0), 0)} kcal</span>
                      </div>
                      <div className="divide-y divide-slate-100">
                        {mealLogs.length === 0 ? (
                          <div className="p-4 text-center text-slate-400 text-sm italic">Empty</div>
                        ) : (
                          mealLogs.map(log => (
                            <div key={log.id} className="p-4 flex justify-between items-center hover:bg-slate-50 transition-colors group">
                               <div className="flex-1">
                                 <div className="font-medium text-slate-800">{log.food.name} <span className="text-green-600 text-xs ml-2">({log.food.servingSize})</span></div>
                                 <div className="text-xs text-slate-400">P: {log.food.protein}g • C: {log.food.carbs}g • F: {log.food.fat}g</div>
                               </div>
                               <div className="flex items-center gap-3">
                                   <div className="font-bold text-slate-600">{log.food.calories}</div>
                                   <div className="flex gap-1.5">
                                       <button
                                         onClick={() => onAddFavourite(log.food)}
                                         title="Save to favourites"
                                         className={`p-1.5 transition-colors ${favouriteFoods.some(f => f.name === log.food.name) ? 'text-yellow-400' : 'text-slate-300 hover:text-yellow-400'}`}
                                       >★</button>
                                       <button onClick={() => deleteLog(log.id)} className="p-1.5 text-slate-400 hover:text-red-600">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                       </button>
                                   </div>
                               </div>
                            </div>
                          ))
                        )}
                        <button onClick={() => { setSelectedMeal(type); setIsAdding(true); }} className="w-full p-3 text-sm font-bold text-green-600 hover:bg-green-50">+ Add Food</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="bg-white rounded-2xl shadow-lg p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Add to {selectedMeal}</h3>
                <button onClick={() => setIsAdding(false)} className="text-slate-400">Cancel</button>
              </div>
              <div className="mb-8">
                 <label className="block text-sm font-bold mb-2">✨ Quick Add with AI</label>
                 <div className="flex gap-2">
                   <input type="text" value={aiInput} onChange={e => setAiInput(e.target.value)} placeholder="e.g. 2 eggs and a banana" className="flex-1 p-3 border-2 rounded-xl" />
                   <Button onClick={handleAiParse} disabled={isAiLoading || !aiInput}>{isAiLoading ? '...' : 'Add'}</Button>
                 </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'trends' && (
        <div className="animate-fade-in space-y-6">
          <NutritionInsights
            dailySummaries={insightsSummaries}
            targets={targets}
            profile={profile}
            plan={plan}
          />
          <div className="flex justify-end">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {rangeOptions.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setRangeDays(days)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                    rangeDays === days
                      ? 'bg-white shadow text-green-600'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {days}D
                </button>
              ))}
            </div>
          </div>
          <TrendCharts
            dailySummaries={trendDailySummaries}
            weeklyTotals={trendTotals}
            calorieTarget={targets.calories}
            proteinTarget={targets.protein}
            rangeDays={rangeDays}
          />

          <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-1">Micronutrient Snapshot</h3>
            <p className="text-xs text-slate-400 mb-6">Today&apos;s progress toward priority nutrient targets</p>
            <div className="space-y-4">
              {PRIORITY_MICROS.map((key) => {
                const info = NUTRIENT_INFO[key];
                if (!info?.targetVal) return null;
                const current = consumedMicros[key] || 0;
                const pct = Math.round((current / info.targetVal) * 100);
                const barPct = Math.min(pct, 100);
                const colorClass =
                  pct >= 80 ? 'bg-green-500' : pct >= 40 ? 'bg-amber-400' : 'bg-red-500';
                const displayAmount =
                  current > 0 ? Math.round(current * 10) / 10 : 0;

                return (
                  <div key={key}>
                    <div className="flex justify-between items-baseline gap-3 mb-1.5">
                      <span className="text-sm font-bold text-slate-700">{key}</span>
                      <span className="text-xs text-slate-500 shrink-0">
                        {displayAmount}
                        {info.unit}
                        <span className="mx-1 text-slate-300">·</span>
                        <span className={`font-bold ${pct >= 80 ? 'text-green-600' : pct >= 40 ? 'text-amber-600' : 'text-red-600'}`}>
                          {pct}% DV
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${colorClass}`}
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'analysis' && (
        <div className="animate-fade-in space-y-8">
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExportPDF} className="text-sm font-bold">
              📄 Export PDF
            </Button>
          </div>
          <div ref={reportRef} className="space-y-8">

           {/* ── Daily Summary (water + weight) — included in PDF export ── */}
           <section className="bg-white p-6 rounded-3xl border shadow-sm">
             <h3 className="text-lg font-bold mb-4">Daily Summary</h3>
             <div className="grid grid-cols-2 gap-4">
               {/* Water */}
               <div className="bg-blue-50 rounded-2xl p-4">
                 <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-1">💧 Water</p>
                 <p className="text-2xl font-black text-blue-700">{waterLog.mlConsumed} <span className="text-sm font-normal text-blue-400">/ {Math.min(Math.round(profile.weightKg * 35), 3500)} ml</span></p>
                 <div className="h-1.5 bg-blue-100 rounded-full mt-2 overflow-hidden">
                   <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.min(Math.round((waterLog.mlConsumed / Math.min(Math.round(profile.weightKg * 35), 3500)) * 100), 100)}%` }} />
                 </div>
               </div>
               {/* Weight */}
               <div className="bg-slate-50 rounded-2xl p-4">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">⚖️ Weight</p>
                 {weightHistory.length > 0 ? (
                   <>
                     <p className="text-2xl font-black text-slate-700">{weightHistory[weightHistory.length - 1].kg} <span className="text-sm font-normal text-slate-400">kg</span></p>
                     {weightHistory.length > 1 && (() => {
                       const baseline = (weightHistory.find(e => e.isBaseline) ?? weightHistory[0]).kg;
                       const current = weightHistory[weightHistory.length - 1].kg;
                       const delta = +(current - baseline).toFixed(1);
                       return (
                         <p className={`text-xs font-bold mt-1 ${delta < 0 ? 'text-green-600' : delta > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                           {delta > 0 ? '+' : ''}{delta} kg from start
                         </p>
                       );
                     })()}
                   </>
                 ) : (
                   <p className="text-sm text-slate-400 italic mt-1">Not logged yet</p>
                 )}
               </div>
             </div>
           </section>

           {/* ── Macro donut chart ── */}
           {(() => {
             const proteinKcal = Math.round(consumedMacros.protein * 4);
             const carbsKcal   = Math.round(consumedMacros.carbs * 4);
             const fatKcal     = Math.round(consumedMacros.fat * 9);
             const totalKcal   = proteinKcal + carbsKcal + fatKcal;
             const COLORS = ['#3b82f6', '#f59e0b', '#f43f5e'];
             const macroSlices = [
               { name: 'Protein',  kcal: proteinKcal, grams: Math.round(consumedMacros.protein), color: COLORS[0] },
               { name: 'Carbs',    kcal: carbsKcal,   grams: Math.round(consumedMacros.carbs),   color: COLORS[1] },
               { name: 'Fat',      kcal: fatKcal,     grams: Math.round(consumedMacros.fat),     color: COLORS[2] },
             ];
             const hasData = totalKcal > 0;
             return (
               <section className="bg-white p-6 rounded-3xl border shadow-sm">
                 <h3 className="text-lg font-bold mb-4">Calorie Breakdown</h3>
                 {hasData ? (
                   <div className="flex flex-col sm:flex-row items-center gap-6">
                     <div className="relative w-44 h-44 shrink-0">
                       <ResponsiveContainer width="100%" height="100%">
                         <PieChart>
                           <Pie data={macroSlices.filter(s => s.kcal > 0)} dataKey="kcal"
                             cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={3} startAngle={90} endAngle={-270}>
                             {macroSlices.filter(s => s.kcal > 0).map(s => (
                               <Cell key={s.name} fill={s.color} stroke="none" />
                             ))}
                           </Pie>
                           <Tooltip formatter={(v: number) => [`${v} kcal`]} />
                         </PieChart>
                       </ResponsiveContainer>
                       <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                         <span className="text-2xl font-black text-slate-800">{totalKcal}</span>
                         <span className="text-xs text-slate-400 font-medium">kcal</span>
                       </div>
                     </div>
                     <div className="flex flex-col gap-3 flex-1 w-full">
                       {macroSlices.map(s => (
                         <div key={s.name} className="flex items-center gap-3">
                           <div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                           <span className="text-sm font-semibold text-slate-700 w-16">{s.name}</span>
                           <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                             <div className="h-full rounded-full transition-all duration-500"
                               style={{ width: `${totalKcal > 0 ? Math.round((s.kcal / totalKcal) * 100) : 0}%`, background: s.color }} />
                           </div>
                           <span className="text-sm font-bold text-slate-600 w-12 text-right">{s.grams}g</span>
                           <span className="text-xs text-slate-400 w-8 text-right">{totalKcal > 0 ? Math.round((s.kcal / totalKcal) * 100) : 0}%</span>
                         </div>
                       ))}
                     </div>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                     <span className="text-4xl mb-2">🍽️</span>
                     <p className="text-sm font-medium">Log food to see your macro breakdown</p>
                   </div>
                 )}
               </section>
             );
           })()}

           <section className="p-6 rounded-3xl text-white shadow-lg" style={{background: 'linear-gradient(135deg, #22c55e, #15803d)'}}>
             <div className="flex justify-between items-center mb-4">
                <div><h3 className="text-xl font-bold">Micronutrient Score</h3></div>
                <div className="text-5xl font-black">{microScore}</div>
             </div>
             <div className="h-2 bg-black/20 rounded-full overflow-hidden mb-6">
                <div className="h-full bg-green-400 transition-all duration-1000" style={{ width: `${microScore}%` }} />
             </div>
             
             {nailedNutrients.length > 0 && (
                <div className="bg-white/10 p-4 rounded-2xl backdrop-blur-sm border border-white/20">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-white/70 mb-2">🔥 You're nailing these:</h4>
                    <div className="flex flex-wrap gap-2">
                        {nailedNutrients.map(n => (
                            <span key={n} className="bg-white/20 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                                <span className="text-green-400">✓</span> {n}
                            </span>
                        ))}
                    </div>
                </div>
             )}
             {nailedNutrients.length === 0 && (
                <div className="text-sm text-white/70 italic">
                  Track more nutrient-dense whole foods to see your essential wins here!
                </div>
             )}
           </section>

           <section className="bg-white p-6 rounded-3xl border shadow-sm">
             <h3 className="text-lg font-bold mb-6">Macro Targets</h3>
             <ProgressBar label="Protein" current={consumedMacros.protein} target={targets.protein} unit="g" colorClass="bg-blue-500" />
             <ProgressBar label="Carbohydrates" current={consumedMacros.carbs} target={targets.carbs} unit="g" colorClass="bg-amber-400" />
             <ProgressBar label="Fats" current={consumedMacros.fat} target={targets.fat} unit="g" colorClass="bg-rose-400" />
             <ProgressBar label="Fiber" current={consumedMicros["Fiber"] || 0} target={NUTRIENT_INFO["Fiber"].targetVal || 28} unit="g" colorClass="bg-emerald-500" />
           </section>

           <section className="bg-white p-6 rounded-3xl border shadow-sm">
              <h3 className="text-lg font-bold mb-6">Micronutrient Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                 {Object.keys(NUTRIENT_INFO).filter(k => !['Protein','Carbohydrates','Fats','Fiber','Sugar'].includes(k)).map(key => {
                    const amount = Number(consumedMicros[key] || 0);
                    const info = NUTRIENT_INFO[key];
                    const target = info.targetVal;
                    return (
                      <button key={key} onClick={() => setSelectedNutrient(key)} className="p-4 rounded-xl border bg-slate-50 flex flex-col justify-between hover:border-green-500 text-left transition-all active:scale-[0.98]">
                         <div className="text-[10px] font-bold text-slate-400 uppercase truncate" title={key}>{key}</div>
                         <div className="text-lg font-black text-slate-800">{amount > 0 ? Math.round(amount * 10) / 10 : '-'}<span className="text-xs font-normal text-slate-500 ml-1">{info.unit}</span></div>
                         {target && amount > 0 && <div className="text-[10px] font-bold text-green-600 mt-1">{Math.round((amount / target) * 100)}% DV</div>}
                      </button>
                    )
                 })}
              </div>
           </section>

           <section className="rounded-3xl border shadow-sm overflow-hidden">
              {nutrientGaps.length > 0 ? (
                <>
                  <div className="bg-gradient-to-r from-amber-500 to-red-500 px-6 py-4">
                    <h3 className="text-lg font-bold text-white">What You&apos;re Missing Today</h3>
                    <p className="text-sm text-white/80 mt-1">
                      Priority nutrients below 50% of your daily target
                    </p>
                  </div>
                  <div className="bg-amber-50/80 p-6 space-y-4">
                    {nutrientGaps.map(({ key, displayPct, sources }) => (
                      <div
                        key={key}
                        className="bg-white p-4 rounded-2xl border border-amber-200 shadow-sm"
                      >
                        <div className="flex justify-between items-start gap-3 mb-3">
                          <h4 className="font-bold text-amber-900">{key}</h4>
                          <span className="text-sm font-black text-red-600 bg-red-50 px-2.5 py-1 rounded-lg border border-red-100 shrink-0">
                            {displayPct} DV
                          </span>
                        </div>
                        <p className="text-xs font-bold text-amber-700/70 uppercase tracking-wider mb-2">
                          Top food sources
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {sources.map((source, idx) => (
                            <span
                              key={idx}
                              className="text-sm font-semibold text-amber-900 bg-amber-100 px-3 py-1.5 rounded-xl border border-amber-200"
                            >
                              {source}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="bg-gradient-to-br from-emerald-50 to-green-50 p-6 border border-emerald-200">
                  <div className="flex items-start gap-4">
                    <span className="text-3xl" aria-hidden>✓</span>
                    <div>
                      <h3 className="text-lg font-bold text-emerald-800">All priority nutrients on track</h3>
                      <p className="text-sm text-emerald-700 mt-1">
                        Every priority micronutrient is at least 50% of your daily target today. Keep it up!
                      </p>
                    </div>
                  </div>
                </div>
              )}
           </section>
          </div>
        </div>
      )}
      {selectedNutrient && NUTRIENT_INFO[selectedNutrient] && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelectedNutrient(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
               <h3 className="text-2xl font-black text-slate-800">{selectedNutrient}</h3>
               <button onClick={() => setSelectedNutrient(null)} className="text-slate-400 hover:text-slate-800 text-xl font-bold p-1">×</button>
            </div>
            <div className="space-y-6">
              <p className="text-slate-600 leading-relaxed text-sm">{NUTRIENT_INFO[selectedNutrient].description}</p>
              
              <div className="flex justify-between items-center bg-green-50 p-4 rounded-xl border border-green-100">
                 <span className="font-bold text-green-800 text-sm">Daily Target</span>
                 <span className="font-black text-xl text-green-900">{NUTRIENT_INFO[selectedNutrient].dailyValue}</span>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Suggested Food Sources</h4>
                <div className="flex flex-wrap gap-2">
                  {NUTRIENT_INFO[selectedNutrient].sources.map((source, idx) => (
                    <div key={idx} className="bg-slate-50 text-slate-700 px-3 py-2 rounded-xl text-sm font-bold border border-slate-200 flex items-center gap-2">
                      <span className="text-xs">🥦</span> {source}
                    </div>
                  ))}
                </div>
              </div>

              {NUTRIENT_INFO[selectedNutrient].caution && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-[11px] text-amber-700 leading-tight">
                  <span className="font-bold">⚠️ PRECAUTION:</span> {NUTRIENT_INFO[selectedNutrient].caution}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {isAddingSunlight && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsAddingSunlight(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
                 <div className="flex justify-between items-center">
                    <h3 className="text-xl font-bold text-slate-800">☀️ Log Sunlight</h3>
                    <button onClick={() => setIsAddingSunlight(false)} className="text-slate-400 hover:text-slate-600">×</button>
                 </div>
                 <p className="text-sm text-slate-500">
                    Sun exposure helps your body produce Vitamin D. 
                 </p>
                 <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Duration (Minutes)</label>
                    <input 
                        type="number"
                        autoFocus
                        className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-amber-400 focus:outline-none text-lg font-bold text-slate-800"
                        placeholder="e.g. 15"
                        value={sunlightMins}
                        onChange={e => setSunlightMins(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveSunlight()}
                    />
                 </div>
                 <Button variant="primary" className="bg-amber-500 hover:bg-amber-600 border-amber-700 shadow-amber-500/30 w-full" onClick={handleSaveSunlight}>
                    Add Vitamin D
                 </Button>
            </div>
        </div>
      )}
      {isAddingWater && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsAddingWater(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-slate-800">💧 Log Water</h3>
              <button onClick={() => setIsAddingWater(false)} className="text-slate-400 hover:text-slate-600">×</button>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Amount (ml)</label>
              <input
                type="number"
                autoFocus
                className="w-full p-3 border-2 border-slate-200 rounded-xl focus:border-blue-400 focus:outline-none text-lg font-bold text-slate-800"
                placeholder="e.g. 350"
                value={waterInput}
                onChange={e => setWaterInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomWater()}
              />
            </div>
            <Button variant="primary" className="bg-blue-500 hover:bg-blue-600 border-blue-700 shadow-blue-500/30 w-full" onClick={handleCustomWater}>
              Add Water
            </Button>
          </div>
        </div>
      )}
      {isMealBuilderOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setIsMealBuilderOpen(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-black text-slate-800">✨ Smart Meal Builder</h3>
              <button onClick={() => setIsMealBuilderOpen(false)} className="text-slate-400 hover:text-slate-800 text-2xl font-bold">×</button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-slate-700 mb-2">Describe what you need</label>
              <textarea
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-green-500 focus:outline-none text-slate-800 mb-3"
                placeholder="e.g., 'A high protein vegan breakfast under 400 calories'"
                rows={2}
                value={mealCriteria}
                onChange={e => setMealCriteria(e.target.value)}
              />
              <div className="flex gap-4 items-center">
                <select
                  value={targetMeal}
                  onChange={e => setTargetMeal(e.target.value as MealType)}
                  className="p-3 border-2 border-slate-200 rounded-xl font-medium bg-white"
                >
                  {MEAL_TYPES.map(t => <option key={t} value={t}>Plan for {t}</option>)}
                </select>
                <Button onClick={handleMealGenerate} disabled={isMealLoading || !mealCriteria} className="flex-1">
                  {isMealLoading ? 'Thinking...' : 'Generate Ideas'}
                </Button>
              </div>
              {mealError && (
                <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
                  ❌ {mealError}
                </div>
              )}
            </div>
            {mealSuggestions.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-bold text-slate-400 uppercase text-xs tracking-wider">Suggestions</h4>
                <div className="grid gap-4">
                  {mealSuggestions.map((s, idx) => (
                    <div key={idx} className="border border-slate-200 rounded-2xl p-5 hover:border-green-300 transition-colors bg-slate-50 cursor-pointer" onClick={() => setRecipeModal(s)}>
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-bold text-xl text-green-800">{s.name}</h5>
                        <Button variant="outline" className="!py-1 !px-3 text-xs" onClick={(e) => { e.stopPropagation(); handleAddMealSuggestion(s); }}>
                          Add to Log
                        </Button>
                      </div>
                      <p className="text-slate-600 text-sm mb-3">{s.description}</p>
                      <div className="flex gap-3 text-sm">
                        <span className="font-bold text-slate-800">{s.calories} kcal</span>
                        <span className="text-slate-500">P: <span className="font-semibold text-slate-700">{s.protein}g</span></span>
                        <span className="text-slate-500">C: <span className="font-semibold text-slate-700">{s.carbs}g</span></span>
                        <span className="text-slate-500">F: <span className="font-semibold text-slate-700">{s.fat}g</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
{recipeModal && (
        <RecipeModal
          meal={recipeModal}
          profile={profile}
          onClose={() => setRecipeModal(null)}
          onAddToLog={() => {
            onAddFood(targetMeal, {
              id: `meal-${Date.now()}`,
              name: recipeModal.name,
              servingSize: '1 serving',
              calories: recipeModal.calories,
              protein: recipeModal.protein,
              carbs: recipeModal.carbs,
              fat: recipeModal.fat,
              micros: recipeModal.micros,
            });
          }}
        />
      )}
    </div>
  );
};
