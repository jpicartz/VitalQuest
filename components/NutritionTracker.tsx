import React, { useState, useRef, useMemo } from 'react';
import { Button } from './ui/Button';
import { FoodItem, MealLog, MealType, MacroTargets, MealSuggestion, UserProfile, WellnessPlan, WaterLog, WeightEntry } from '../types';
import { NUTRIENT_INFO } from '../data/nutrientData';
import { parseFoodLog, suggestMeals } from '../services/claudeService';
import { getLastNDaysSummaries, getWeeklyMacroTotals, computeMicroScore, computeConsumedMicros, PRIORITY_MICROS } from '../utils/nutritionAggregates';
import { toISODateString, addDaysISO, formatNavigatorLabel } from '../utils/dateUtils';
import { TrendCharts } from './TrendCharts';
import { NutritionInsights } from './NutritionInsights';
import { RecipeModal } from './RecipeModal';
import { Modal } from './ui/Modal';
import { BodySystems } from './BodySystems';
import { Coach } from './Coach';
import type { BodySystemScore } from '../utils/bodySystems';
import { useSpeechInput } from '../utils/useSpeechInput';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import {
  IconX, IconChevronLeft, IconChevronRight, IconDroplet, IconRefresh, IconSun,
  IconSparkles, IconCalendar, IconStar, IconStarFilled, IconChevronDown, IconChevronUp,
  IconPlus, IconTrash, IconScale, IconFileText, IconBowl, IconFlame, IconCheck,
  IconMicrophone, IconPlayerStopFilled,
} from '@tabler/icons-react';

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
  /**
   * Which surface to render. Supplied by Dashboard in the v2 IA, where these
   * three views live under different top-level tabs; the internal sub-tab bar
   * is hidden when set. Left undefined, the component keeps its own sub-tabs.
   */
  view?: 'log' | 'trends' | 'analysis';
}

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const rangeOptions = [7, 14, 30];

export const NutritionTracker: React.FC<NutritionTrackerProps> = ({
  logs, onAddFood, onUpdateLog, onDeleteLog, targets, profile,
  onResetTodayLog, selectedDate, onSelectDate, allFoodLogs, plan,
  waterLog, onLogWater, onResetWater, weightHistory,
  favouriteFoods, onAddFavourite, onRemoveFavourite, onQuickAddFavourite, view,
}) => {
  const [ownTab, setOwnTab] = useState<'log' | 'trends' | 'analysis'>('log');
  // When Dashboard drives the view, the internal sub-tabs are redundant.
  const activeTab = view ?? ownTab;
  const setActiveTab = setOwnTab;

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
  const [aiError, setAiError] = useState<string | null>(null);
  // Dictation writes into the same aiInput the typed path uses, so the AI
  // parser is shared and speech is purely additive.
  const speech = useSpeechInput((text) => setAiInput((prev) => (prev ? `${prev} ${text}` : text)));
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
const [coach, setCoach] = useState<{ subject: BodySystemScore; systems: BodySystemScore[] } | null>(null);
const [isExporting, setIsExporting] = useState(false);
const [exportError, setExportError] = useState<string | null>(null);
const [favMealType, setFavMealType] = useState<MealType>('Breakfast');

// Water goal: 35 ml/kg capped at 3500 ml
const waterGoalMl = Math.min(Math.round(profile.weightKg * 35), 3500);
const waterPct = Math.min(Math.round((waterLog.mlConsumed / waterGoalMl) * 100), 100);
const isViewingToday = selectedDate === toISODateString();

  // Export state
  const reportRef = useRef<HTMLDivElement>(null);
  
  // `Number(x) || 0`, NOT `Number(x || 0)` — a string value like "420 kcal"
  // yields NaN under the latter and poisons every total it reaches.
  const consumedMacros = logs.reduce((acc, log) => ({
    calories: acc.calories + (Number(log.food.calories) || 0),
    protein: acc.protein + (Number(log.food.protein) || 0),
    carbs: acc.carbs + (Number(log.food.carbs) || 0),
    fat: acc.fat + (Number(log.food.fat) || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // `logs` is already the selected day's logs, so no date filter is needed here.
  // Shared with computeMicroScore so the tiles and the score can never disagree.
  const consumedMicros = useMemo(() => computeConsumedMicros(logs), [logs]);

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
    setAiError(null);
    try {
      const foods = await parseFoodLog(aiInput);
      if (foods.length === 0) {
        // Request succeeded but nothing was recognised — keep the text so the
        // user can reword it rather than silently closing the form.
        setAiError("We couldn't recognise any food in that. Try something like \"2 eggs and a slice of toast\".");
        return;
      }
      foods.forEach(f => onAddFood(selectedMeal, f));
      setAiInput('');
      setIsAdding(false);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsAiLoading(false);
    }
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
    // Same coercion rule as everywhere else: Number(x) || fallback.
    const val = Number(current) || 0;
    const tgt = Number(target) || 1;
    const pct = Math.min((val / tgt) * 100, 100);
    return (
      <div className="mb-4 break-inside-avoid">
        <div className="flex justify-between text-sm font-semibold text-fg mb-1">
          <span>{label}</span>
          <span className="nums text-fg-soft">{Math.round(val * 10) / 10} / {Math.round(tgt)}{unit}</span>
        </div>
        <div className="h-3 bg-track rounded-full overflow-hidden">
          <div className={`h-full transition-all duration-500 rounded-full ${colorClass}`} style={{ width: `${pct}%` }} />
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
               name: 'Sunlight Exposure',
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
      const results = await suggestMeals(mealCriteria, profile, targets);
      if (!results || results.length === 0) {
        setMealError("We couldn't come up with meals for that. Try describing it differently.");
      }
      setMealSuggestions(results);
    } catch (e) {
      console.error('handleMealGenerate error:', e);
      setMealError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
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
    setIsExporting(true);
    setExportError(null);
    try {
      // Loaded on demand: html2canvas + jspdf are ~200 KB gzipped and this is a
      // rarely-used action, so they shouldn't sit in the initial bundle.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      const canvas = await html2canvas(reportRef.current, { scale: 2 });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgHeight = (canvas.height * pageWidth) / canvas.width;

      // The report is far taller than one A4 page, so walk down the image one
      // page at a time instead of clipping everything past the first page.
      let remaining = imgHeight;
      let offset = 0;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, imgHeight);
      remaining -= pageHeight;
      while (remaining > 0) {
        offset -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, offset, pageWidth, imgHeight);
        remaining -= pageHeight;
      }

      pdf.save(`vitalquest-report-${selectedDate}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
      setExportError("Couldn't generate the PDF. Please try again.");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Hidden when Dashboard drives the view: the top-level tabs replace it.
          The Reset button still needs a home, so the row stays either way. */}
      <div className={`flex flex-wrap justify-between items-center gap-3 ${view ? 'justify-end' : ''}`}>
        {!view && (
          <div className={`flex gap-1 bg-raised p-1 rounded-control w-fit max-w-full overflow-x-auto `}>
              <button onClick={() => setActiveTab('log')} className={`px-4 py-2 rounded-[8px] text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'log' ? 'bg-card shadow-sm dark:shadow-none text-nutri' : 'text-fg-soft hover:text-fg'}`}>Food Log</button>
              <button onClick={() => setActiveTab('trends')} className={`px-4 py-2 rounded-[8px] text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'trends' ? 'bg-card shadow-sm dark:shadow-none text-nutri' : 'text-fg-soft hover:text-fg'}`}>Trends</button>
              <button onClick={() => setActiveTab('analysis')} className={`px-4 py-2 rounded-[8px] text-sm font-semibold transition-all whitespace-nowrap ${activeTab === 'analysis' ? 'bg-card shadow-sm dark:shadow-none text-nutri' : 'text-fg-soft hover:text-fg'}`}>Analysis</button>
          </div>
        )}
        {activeTab === 'log' && isViewingToday && (
          <Button variant="outline" onClick={() => setShowResetConfirm(true)} className="text-sm font-bold text-fat border-fat/30 hover:bg-fat/10 hover:text-fat">
            Reset Today's Log
          </Button>
        )}
      </div>

      {showResetConfirm && (
        <Modal onClose={() => setShowResetConfirm(false)} labelledBy="reset-modal-title" className="bg-card rounded-modal p-6 max-w-sm w-full shadow-2xl space-y-4">
             <div className="flex justify-between items-center">
                <h3 id="reset-modal-title" className="text-xl font-bold text-fg">Reset Today's Log?</h3>
                <button onClick={() => setShowResetConfirm(false)} aria-label="Close" className="text-fg-mute hover:text-fg"><IconX size={18} /></button>
             </div>
             <p className="text-sm text-fg-soft">
                Are you sure you want to clear all food logs for today? This action cannot be undone.
             </p>
             <div className="flex gap-3 pt-2">
               <Button variant="outline" className="flex-1" onClick={() => setShowResetConfirm(false)}>Cancel</Button>
               <Button variant="primary" className="flex-1 bg-red-500 hover:brightness-105" onClick={() => {
                 onResetTodayLog();
                 setShowResetConfirm(false);
               }}>
                  Yes, Reset
               </Button>
             </div>
        </Modal>
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
                  <div className="flex items-center justify-between bg-card p-2.5 rounded-card shadow-sm dark:shadow-none border border-edge mb-4">
                    <button
                      onClick={() => onSelectDate(addDaysISO(selectedDate, -1))}
                      aria-label="Previous day"
                      className="p-2 rounded-control hover:bg-raised text-fg-soft"
                    >
                      <IconChevronLeft size={20} />
                    </button>
                    <div className="text-center">
                      <p className="font-semibold text-fg text-sm">{title}</p>
                      <p className="text-xs text-fg-mute">{subtitle}</p>
                    </div>
                    <button
                      onClick={() => {
                        const next = addDaysISO(selectedDate, 1);
                        if (next <= tomorrowISO) onSelectDate(next);
                      }}
                      aria-label="Next day"
                      className="p-2 rounded-control hover:bg-raised text-fg-soft"
                    >
                      <IconChevronRight size={20} />
                    </button>
                  </div>
                );
              })()}<div className="bg-card p-6 rounded-card shadow-sm dark:shadow-none border border-edge mb-5 flex justify-between items-center">
                <div>
                   <h3 className="font-semibold text-fg-soft text-xs uppercase tracking-wide">Calories Remaining</h3>
                   <div className="nums text-4xl font-bold text-fg">{Math.max(0, Math.round(targets.calories - consumedMacros.calories))}</div>
                </div>
                <div className="text-right">
                   <div className="text-xs text-fg-soft uppercase tracking-wide">Eaten</div>
                   <div className="nums font-bold text-xl text-nutri">{Math.round(consumedMacros.calories)} kcal</div>
                </div>
              </div>

              {/* Today-only trackers: water + sunlight */}
              {isViewingToday ? (
                <>
                  {/* Water progress bar */}
                  <div className="bg-card p-4 rounded-card shadow-sm dark:shadow-none border border-edge mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-hydro text-sm"><IconDroplet size={16} /> Water Today</span>
                      <span className="nums text-sm font-semibold text-fg-soft">{waterLog.mlConsumed} / {waterGoalMl} ml <span className="text-fg-mute font-normal">({waterPct}%)</span></span>
                    </div>
                    <div className="h-2.5 bg-track rounded-full overflow-hidden mb-3">
                      <div className="h-full bg-hydro transition-all duration-500 rounded-full" style={{ width: `${waterPct}%` }} />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => onLogWater(250)} className="flex-1 py-1.5 text-xs font-bold bg-hydro/10 text-hydro rounded-control hover:bg-hydro/20 transition-colors">+250 ml</button>
                      <button onClick={() => onLogWater(500)} className="flex-1 py-1.5 text-xs font-bold bg-hydro/10 text-hydro rounded-control hover:bg-hydro/20 transition-colors">+500 ml</button>
                      <button onClick={() => setIsAddingWater(true)} className="flex-1 py-1.5 text-xs font-bold bg-hydro/10 text-hydro rounded-control hover:bg-hydro/20 transition-colors">Custom</button>
                      {waterLog.mlConsumed > 0 && (
                        <button onClick={onResetWater} aria-label="Reset water" className="py-1.5 px-2 text-fg-mute bg-raised rounded-control hover:text-fg transition-colors"><IconRefresh size={14} /></button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-6">
                    <button onClick={() => setIsAddingSunlight(true)} className="inline-flex items-center justify-center gap-2 py-3 bg-spark/10 rounded-tile font-bold text-spark hover:bg-spark/20 transition-colors"><IconSun size={18} /> Sunlight</button>
                    <button onClick={() => setIsMealBuilderOpen(true)} className="inline-flex items-center justify-center gap-2 py-3 bg-nutri/10 rounded-tile font-bold text-nutri hover:bg-nutri/20 transition-colors"><IconSparkles size={18} /> Builder</button>
                  </div>
                </>
              ) : (
                <>
                  {/* Past-day banner */}
                  <div className="flex items-center gap-3 bg-raised border border-edge rounded-card px-4 py-3 mb-4 text-sm text-fg-soft">
                    <IconCalendar size={18} className="text-fg-mute shrink-0" />
                    <span>Viewing a past day — water &amp; sunlight tracking only available for today.</span>
                  </div>

                  {/* Meal builder still available for past-day edits */}
                  <div className="mb-6">
                    <button onClick={() => setIsMealBuilderOpen(true)} className="w-full inline-flex items-center justify-center gap-2 py-3 bg-nutri/10 rounded-tile font-bold text-nutri hover:bg-nutri/20 transition-colors"><IconSparkles size={18} /> Builder</button>
                  </div>
                </>
              )}

              {/* Favourites quick-add */}
              {favouriteFoods.length > 0 && (
                <div className="mb-6">
                  <button
                    onClick={() => setShowFavourites(f => !f)}
                    className="w-full inline-flex items-center justify-center gap-2 py-3 bg-spark/10 rounded-tile font-bold text-spark hover:bg-spark/20 transition-colors text-sm mb-2"
                  >
                    <IconStar size={16} /> Favourites ({favouriteFoods.length}) {showFavourites ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                  </button>
                  {showFavourites && (
                    <div className="bg-card rounded-card border border-edge overflow-hidden">
                      <div className="bg-raised px-4 py-2 border-b border-edge flex items-center justify-between">
                        <span className="text-xs font-semibold text-fg-soft uppercase tracking-wide">Quick add to:</span>
                        <select
                          value={favMealType}
                          onChange={e => setFavMealType(e.target.value as MealType)}
                          className="text-xs font-semibold bg-card border border-edge rounded-control px-2 py-1 text-fg"
                        >
                          {MEAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="divide-y divide-edge max-h-64 overflow-y-auto">
                        {favouriteFoods.map(food => (
                          <div key={food.id} className="px-4 py-3 flex justify-between items-center hover:bg-raised transition-colors">
                            <div className="flex-1">
                              <p className="font-medium text-fg text-sm">{food.name}</p>
                              <p className="nums text-xs text-fg-mute">{food.calories} kcal · P:{food.protein}g C:{food.carbs}g F:{food.fat}g</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => onQuickAddFavourite(food, favMealType)}
                                className="inline-flex items-center gap-1 text-xs font-bold bg-nutri-strong text-white dark:text-[#08210f] px-3 py-1.5 rounded-control hover:brightness-[1.05] transition-all"
                              ><IconPlus size={14} stroke={2.5} /> Add</button>
                              <button
                                onClick={() => onRemoveFavourite(food.id)}
                                className="text-spark hover:text-fat transition-colors"
                                aria-label="Remove from favourites"
                              ><IconStarFilled size={16} /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {MEAL_TYPES.map(type => {
                  const mealLogs = logs.filter(l => l.type === type);
                  return (
                    <div key={type} className="bg-card rounded-card border border-edge shadow-sm dark:shadow-none overflow-hidden">
                      <div className="bg-raised p-4 flex justify-between items-center border-b border-edge">
                        <h4 className="font-bold text-fg">{type}</h4>
                        <span className="nums text-sm text-fg-soft">{mealLogs.reduce((acc, l) => acc + (Number(l.food.calories) || 0), 0)} kcal</span>
                      </div>
                      <div className="divide-y divide-edge">
                        {mealLogs.length === 0 ? (
                          <div className="p-4 text-center text-fg-mute text-sm italic">Empty</div>
                        ) : (
                          mealLogs.map(log => (
                            <div key={log.id} className="p-4 flex justify-between items-center hover:bg-raised transition-colors group">
                               <div className="flex-1">
                                 <div className="font-medium text-fg">{log.food.name} <span className="text-nutri text-xs ml-2">({log.food.servingSize})</span></div>
                                 <div className="nums text-xs text-fg-mute">P: {log.food.protein}g • C: {log.food.carbs}g • F: {log.food.fat}g</div>
                               </div>
                               <div className="flex items-center gap-3">
                                   <div className="nums font-bold text-fg-soft">{log.food.calories}</div>
                                   <div className="flex gap-1.5">
                                       {(() => {
                                         const existingFav = favouriteFoods.find(f => f.name === log.food.name);
                                         return (
                                           <button
                                             onClick={() => existingFav ? onRemoveFavourite(existingFav.id) : onAddFavourite(log.food)}
                                             aria-label={existingFav ? 'Remove from favourites' : 'Save to favourites'}
                                             className={`p-1.5 transition-colors ${existingFav ? 'text-spark' : 'text-fg-mute hover:text-spark'}`}
                                           >{existingFav ? <IconStarFilled size={16} /> : <IconStar size={16} />}</button>
                                         );
                                       })()}
                                       <button onClick={() => deleteLog(log.id)} aria-label="Delete food" className="p-1.5 text-fg-mute hover:text-fat transition-colors">
                                         <IconTrash size={16} />
                                       </button>
                                   </div>
                               </div>
                            </div>
                          ))
                        )}
                        <button onClick={() => { setSelectedMeal(type); setIsAdding(true); }} className="w-full inline-flex items-center justify-center gap-1.5 p-3 text-sm font-bold text-nutri hover:bg-nutri/5 transition-colors"><IconPlus size={16} stroke={2.5} /> Add Food</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="bg-card rounded-modal shadow-lg dark:shadow-none border border-edge p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-fg">Add to {selectedMeal}</h3>
                <button onClick={() => setIsAdding(false)} className="text-fg-soft hover:text-fg text-sm font-medium">Cancel</button>
              </div>
              <div className="mb-8">
                 <label htmlFor="ai-food-input" className="inline-flex items-center gap-1.5 text-sm font-bold text-fg mb-2"><IconSparkles size={16} className="text-nutri" /> Quick add with AI</label>
                 <div className="flex gap-2">
                   <input
                     id="ai-food-input"
                     type="text"
                     value={aiInput}
                     onChange={e => setAiInput(e.target.value)}
                     onKeyDown={e => { if (e.key === 'Enter' && !isAiLoading && aiInput) handleAiParse(); }}
                     placeholder="e.g. 2 eggs and a banana"
                     aria-invalid={!!aiError}
                     aria-describedby={aiError ? 'ai-food-error' : undefined}
                     className="flex-1 p-3 bg-card border-2 border-edge rounded-control text-fg placeholder:text-fg-mute focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page"
                   />
                   {speech.supported && (
                     <button
                       type="button"
                       onClick={speech.listening ? speech.stop : speech.start}
                       aria-label={speech.listening ? 'Stop dictating' : 'Dictate your food'}
                       aria-pressed={speech.listening}
                       disabled={isAiLoading}
                       className={`shrink-0 w-12 rounded-control border-2 flex items-center justify-center transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50 ${
                         speech.listening
                           ? 'border-fat bg-fat/10 text-fat animate-pulse'
                           : 'border-edge text-fg-soft hover:border-nutri hover:text-nutri'
                       }`}
                     >
                       {speech.listening ? <IconPlayerStopFilled size={18} /> : <IconMicrophone size={18} />}
                     </button>
                   )}
                   <Button onClick={handleAiParse} disabled={isAiLoading || !aiInput}>{isAiLoading ? 'Adding…' : 'Add'}</Button>
                 </div>
                 {speech.listening && (
                   <p className="mt-2 text-sm text-fg-soft" aria-live="polite">Listening… say what you ate.</p>
                 )}
                 {(aiError || speech.error) && (
                   <p id="ai-food-error" role="alert" className="mt-2 text-sm text-fat">{aiError ?? speech.error}</p>
                 )}
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
            <div className="flex gap-1 bg-raised p-1 rounded-control">
              {rangeOptions.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setRangeDays(days)}
                  className={`nums px-4 py-1.5 rounded-[8px] text-sm font-semibold transition-all ${
                    rangeDays === days
                      ? 'bg-card shadow-sm dark:shadow-none text-nutri'
                      : 'text-fg-soft hover:text-fg'
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

          <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
            <h3 className="text-lg font-bold text-fg mb-1">Micronutrient Snapshot</h3>
            <p className="text-xs text-fg-mute mb-6">Today&apos;s progress toward priority nutrient targets</p>
            <div className="space-y-4">
              {PRIORITY_MICROS.map((key) => {
                const info = NUTRIENT_INFO[key];
                if (!info?.targetVal) return null;
                const current = consumedMicros[key] || 0;
                const pct = Math.round((current / info.targetVal) * 100);
                const barPct = Math.min(pct, 100);
                const colorClass =
                  pct >= 80 ? 'bg-nutri' : pct >= 40 ? 'bg-spark' : 'bg-fat';
                const displayAmount =
                  current > 0 ? Math.round(current * 10) / 10 : 0;

                return (
                  <div key={key}>
                    <div className="flex justify-between items-baseline gap-3 mb-1.5">
                      <span className="text-sm font-semibold text-fg">{key}</span>
                      <span className="nums text-xs text-fg-soft shrink-0">
                        {displayAmount}
                        {info.unit}
                        <span className="mx-1 text-fg-mute">·</span>
                        <span className={`font-bold ${pct >= 80 ? 'text-nutri' : pct >= 40 ? 'text-spark' : 'text-fat'}`}>
                          {pct}% DV
                        </span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-track rounded-full overflow-hidden">
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
          <div className="flex flex-col items-end gap-2">
            <Button
              variant="outline"
              onClick={handleExportPDF}
              disabled={isExporting}
              className="inline-flex items-center gap-1.5 text-sm font-bold"
            >
              <IconFileText size={16} /> {isExporting ? 'Preparing…' : 'Export PDF'}
            </Button>
            {exportError && (
              <p role="alert" className="text-sm text-fat">{exportError}</p>
            )}
          </div>
          <div ref={reportRef} className="space-y-8">

           {/* ── Daily Summary (water + weight) — included in PDF export ── */}
           <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
             <h3 className="text-lg font-bold text-fg mb-4">Daily Summary</h3>
             <div className="grid grid-cols-2 gap-4">
               {/* Water */}
               <div className="bg-hydro/10 rounded-tile p-4">
                 <p className="inline-flex items-center gap-1 text-xs font-semibold text-hydro uppercase tracking-widest mb-1"><IconDroplet size={13} /> Water</p>
                 <p className="nums text-2xl font-bold text-hydro">{waterLog.mlConsumed} <span className="text-sm font-normal opacity-70">/ {Math.min(Math.round(profile.weightKg * 35), 3500)} ml</span></p>
                 <div className="h-1.5 bg-hydro/20 rounded-full mt-2 overflow-hidden">
                   <div className="h-full bg-hydro rounded-full" style={{ width: `${Math.min(Math.round((waterLog.mlConsumed / Math.min(Math.round(profile.weightKg * 35), 3500)) * 100), 100)}%` }} />
                 </div>
               </div>
               {/* Weight */}
               <div className="bg-raised rounded-tile p-4">
                 <p className="inline-flex items-center gap-1 text-xs font-semibold text-fg-mute uppercase tracking-widest mb-1"><IconScale size={13} /> Weight</p>
                 {weightHistory.length > 0 ? (
                   <>
                     <p className="nums text-2xl font-bold text-fg">{weightHistory[weightHistory.length - 1].kg} <span className="text-sm font-normal text-fg-mute">kg</span></p>
                     {weightHistory.length > 1 && (() => {
                       const baseline = (weightHistory.find(e => e.isBaseline) ?? weightHistory[0]).kg;
                       const current = weightHistory[weightHistory.length - 1].kg;
                       const delta = +(current - baseline).toFixed(1);
                       return (
                         <p className={`nums text-xs font-bold mt-1 ${delta < 0 ? 'text-nutri' : delta > 0 ? 'text-spark' : 'text-fg-mute'}`}>
                           {delta > 0 ? '+' : ''}{delta} kg from start
                         </p>
                       );
                     })()}
                   </>
                 ) : (
                   <p className="text-sm text-fg-mute italic mt-1">Not logged yet</p>
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
             // Concrete hex (not CSS vars) so the SVG fill renders in Safari too; these vivid hues read on both light and dark.
             const COLORS = ['#22c55e', '#f59e0b', '#f43f5e'];
             const macroSlices = [
               { name: 'Protein',  kcal: proteinKcal, grams: Math.round(consumedMacros.protein), color: COLORS[0] },
               { name: 'Carbs',    kcal: carbsKcal,   grams: Math.round(consumedMacros.carbs),   color: COLORS[1] },
               { name: 'Fat',      kcal: fatKcal,     grams: Math.round(consumedMacros.fat),     color: COLORS[2] },
             ];
             const hasData = totalKcal > 0;
             return (
               <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
                 <h3 className="text-lg font-bold text-fg mb-4">Calorie Breakdown</h3>
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
                         <span className="nums text-2xl font-bold text-fg">{totalKcal}</span>
                         <span className="text-xs text-fg-mute font-medium">kcal</span>
                       </div>
                     </div>
                     <div className="flex flex-col gap-3 flex-1 w-full">
                       {macroSlices.map(s => (
                         <div key={s.name} className="flex items-center gap-3">
                           <div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                           <span className="text-sm font-semibold text-fg w-16">{s.name}</span>
                           <div className="flex-1 h-2 bg-track rounded-full overflow-hidden">
                             <div className="h-full rounded-full transition-all duration-500"
                               style={{ width: `${totalKcal > 0 ? Math.round((s.kcal / totalKcal) * 100) : 0}%`, background: s.color }} />
                           </div>
                           <span className="nums text-sm font-bold text-fg-soft w-12 text-right">{s.grams}g</span>
                           <span className="nums text-xs text-fg-mute w-8 text-right">{totalKcal > 0 ? Math.round((s.kcal / totalKcal) * 100) : 0}%</span>
                         </div>
                       ))}
                     </div>
                   </div>
                 ) : (
                   <div className="flex flex-col items-center justify-center py-8 text-fg-mute">
                     <IconBowl size={40} className="mb-2 opacity-60" />
                     <p className="text-sm font-medium">Log food to see your macro breakdown</p>
                   </div>
                 )}
               </section>
             );
           })()}

           <section className="p-6 rounded-modal text-white shadow-lg" style={{background: 'linear-gradient(135deg, #16a34a, #15803d)'}}>
             <div className="flex justify-between items-center mb-4">
                <div><h3 className="text-xl font-bold">Micronutrient Score</h3></div>
                <div className="nums text-5xl font-bold">{microScore}</div>
             </div>
             <div className="h-2 bg-black/20 rounded-full overflow-hidden mb-6">
                <div className="h-full bg-white/90 transition-all duration-1000" style={{ width: `${microScore}%` }} />
             </div>

             {nailedNutrients.length > 0 && (
                <div className="bg-white/10 p-4 rounded-tile backdrop-blur-sm border border-white/20">
                    <h4 className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-white/70 mb-2"><IconFlame size={14} /> You're nailing these:</h4>
                    <div className="flex flex-wrap gap-2">
                        {nailedNutrients.map(n => (
                            <span key={n} className="bg-white/20 px-2 py-1 rounded-lg text-xs font-bold flex items-center gap-1">
                                <IconCheck size={13} stroke={3} /> {n}
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

           <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
             <h3 className="text-lg font-bold text-fg mb-6">Macro Targets</h3>
             <ProgressBar label="Protein" current={consumedMacros.protein} target={targets.protein} unit="g" colorClass="bg-protein" />
             <ProgressBar label="Carbohydrates" current={consumedMacros.carbs} target={targets.carbs} unit="g" colorClass="bg-carbs" />
             <ProgressBar label="Fats" current={consumedMacros.fat} target={targets.fat} unit="g" colorClass="bg-fat" />
             <ProgressBar label="Fiber" current={consumedMicros["Fiber"] || 0} target={NUTRIENT_INFO["Fiber"].targetVal || 28} unit="g" colorClass="bg-nutri" />
           </section>

           {/* Body-system support: the legible layer over the raw per-nutrient
               percentages below. Deterministic, no AI call. */}
           <BodySystems
             consumedMicros={consumedMicros}
             consumedMacros={consumedMacros}
             targets={targets}
             onAskCoach={(subject, systems) => setCoach({ subject, systems })}
           />

           <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
              <h3 className="text-lg font-bold text-fg mb-6">Micronutrient Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                 {Object.keys(NUTRIENT_INFO).filter(k => !['Protein','Carbohydrates','Fats','Fiber','Sugar'].includes(k)).map(key => {
                    const amount = Number(consumedMicros[key] || 0);
                    const info = NUTRIENT_INFO[key];
                    const target = info.targetVal;
                    return (
                      <button key={key} onClick={() => setSelectedNutrient(key)} className="p-4 rounded-tile border border-edge bg-raised flex flex-col justify-between hover:border-nutri text-left transition-all active:scale-[0.98]">
                         <div className="text-[10px] font-semibold text-fg-mute uppercase truncate" title={key}>{key}</div>
                         <div className="nums text-lg font-bold text-fg">{amount > 0 ? Math.round(amount * 10) / 10 : '-'}<span className="text-xs font-normal text-fg-soft ml-1">{info.unit}</span></div>
                         {target && amount > 0 && <div className="nums text-[10px] font-bold text-nutri mt-1">{Math.round((amount / target) * 100)}% DV</div>}
                      </button>
                    )
                 })}
              </div>
           </section>

           <section className="rounded-card border border-edge shadow-sm dark:shadow-none overflow-hidden">
              {nutrientGaps.length > 0 ? (
                <>
                  <div className="bg-gradient-to-r from-spark to-fat px-6 py-4">
                    <h3 className="text-lg font-bold text-white">What You&apos;re Missing Today</h3>
                    <p className="text-sm text-white/85 mt-1">
                      Priority nutrients below 50% of your daily target
                    </p>
                  </div>
                  <div className="bg-spark/5 p-6 space-y-4">
                    {nutrientGaps.map(({ key, displayPct, sources }) => (
                      <div
                        key={key}
                        className="bg-card p-4 rounded-tile border border-edge shadow-sm dark:shadow-none"
                      >
                        <div className="flex justify-between items-start gap-3 mb-3">
                          <h4 className="font-bold text-fg">{key}</h4>
                          <span className="nums text-sm font-black text-fat bg-fat/10 px-2.5 py-1 rounded-control border border-fat/20 shrink-0">
                            {displayPct} DV
                          </span>
                        </div>
                        <p className="text-xs font-bold text-fg-mute uppercase tracking-wider mb-2">
                          Top food sources
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {sources.map((source, idx) => (
                            <span
                              key={idx}
                              className="text-sm font-semibold text-fg bg-raised px-3 py-1.5 rounded-control border border-edge"
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
                <div className="bg-nutri/5 p-6 border border-nutri/20">
                  <div className="flex items-start gap-4">
                    <span className="w-9 h-9 rounded-full bg-nutri/15 text-nutri flex items-center justify-center shrink-0"><IconCheck size={20} stroke={2.5} /></span>
                    <div>
                      <h3 className="text-lg font-bold text-fg">All priority nutrients on track</h3>
                      <p className="text-sm text-fg-soft mt-1">
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
      {coach && (
        <Coach
          profile={profile}
          systems={coach.systems}
          subject={coach.subject}
          planFocus={plan?.nutritionFocus}
          dailyCalorieTarget={targets.calories}
          onClose={() => setCoach(null)}
        />
      )}

      {selectedNutrient && NUTRIENT_INFO[selectedNutrient] && (
        <Modal onClose={() => setSelectedNutrient(null)} labelledBy="nutrient-modal-title" className="bg-card rounded-modal p-6 max-w-md w-full shadow-2xl">
            <div className="flex justify-between items-start mb-4">
               <h3 id="nutrient-modal-title" className="text-2xl font-bold text-fg">{selectedNutrient}</h3>
               <button onClick={() => setSelectedNutrient(null)} aria-label="Close" className="text-fg-mute hover:text-fg p-1"><IconX size={20} /></button>
            </div>
            <div className="space-y-6">
              <p className="text-fg-soft leading-relaxed text-sm">{NUTRIENT_INFO[selectedNutrient].description}</p>

              <div className="flex justify-between items-center bg-nutri/10 p-4 rounded-control">
                 <span className="font-bold text-nutri text-sm">Daily Target</span>
                 <span className="nums font-bold text-xl text-nutri">{NUTRIENT_INFO[selectedNutrient].dailyValue}</span>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-fg-mute uppercase tracking-widest mb-3">Suggested Food Sources</h4>
                <div className="flex flex-wrap gap-2">
                  {NUTRIENT_INFO[selectedNutrient].sources.map((source, idx) => (
                    <div key={idx} className="bg-raised text-fg px-3 py-2 rounded-control text-sm font-semibold border border-edge">
                      {source}
                    </div>
                  ))}
                </div>
              </div>

              {NUTRIENT_INFO[selectedNutrient].caution && (
                <div className="bg-spark/10 p-3 rounded-control text-[11px] text-fg-soft leading-tight">
                  <span className="font-bold text-spark">Precaution:</span> {NUTRIENT_INFO[selectedNutrient].caution}
                </div>
              )}
            </div>
        </Modal>
      )}
      {isAddingSunlight && (
        <Modal onClose={() => setIsAddingSunlight(false)} labelledBy="sunlight-modal-title" className="bg-card rounded-modal p-6 max-w-sm w-full shadow-2xl space-y-4">
                 <div className="flex justify-between items-center">
                    <h3 id="sunlight-modal-title" className="inline-flex items-center gap-2 text-xl font-bold text-fg"><IconSun size={20} className="text-spark" /> Log Sunlight</h3>
                    <button onClick={() => setIsAddingSunlight(false)} aria-label="Close" className="text-fg-mute hover:text-fg"><IconX size={18} /></button>
                 </div>
                 <p className="text-sm text-fg-soft">
                    Sun exposure helps your body produce Vitamin D.
                 </p>
                 <div>
                    <label className="block text-xs font-semibold text-fg-soft uppercase mb-1">Duration (Minutes)</label>
                    <input
                        type="number"
                        autoFocus
                        className="w-full p-3 bg-card border-2 border-edge rounded-control focus:border-spark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page text-lg font-bold text-fg placeholder:text-fg-mute"
                        placeholder="e.g. 15"
                        value={sunlightMins}
                        onChange={e => setSunlightMins(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSaveSunlight()}
                    />
                 </div>
                 <Button variant="primary" className="bg-spark hover:brightness-105 w-full" onClick={handleSaveSunlight}>
                    Add Vitamin D
                 </Button>
        </Modal>
      )}
      {isAddingWater && (
        <Modal onClose={() => setIsAddingWater(false)} labelledBy="water-modal-title" className="bg-card rounded-modal p-6 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center">
              <h3 id="water-modal-title" className="inline-flex items-center gap-2 text-xl font-bold text-fg"><IconDroplet size={20} className="text-hydro" /> Log Water</h3>
              <button onClick={() => setIsAddingWater(false)} aria-label="Close" className="text-fg-mute hover:text-fg"><IconX size={18} /></button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-fg-soft uppercase mb-1">Amount (ml)</label>
              <input
                type="number"
                autoFocus
                className="w-full p-3 bg-card border-2 border-edge rounded-control focus:border-hydro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page text-lg font-bold text-fg placeholder:text-fg-mute"
                placeholder="e.g. 350"
                value={waterInput}
                onChange={e => setWaterInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCustomWater()}
              />
            </div>
            <Button variant="primary" className="bg-hydro hover:brightness-105 w-full" onClick={handleCustomWater}>
              Add Water
            </Button>
        </Modal>
      )}
      {isMealBuilderOpen && (
        <Modal onClose={() => setIsMealBuilderOpen(false)} labelledBy="mealbuilder-modal-title" className="bg-card rounded-modal p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 id="mealbuilder-modal-title" className="inline-flex items-center gap-2 text-2xl font-bold text-fg"><IconSparkles size={22} className="text-nutri" /> Smart Meal Builder</h3>
              <button onClick={() => setIsMealBuilderOpen(false)} aria-label="Close" className="text-fg-mute hover:text-fg"><IconX size={22} /></button>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold text-fg mb-2">Describe what you need</label>
              <textarea
                className="w-full p-4 bg-card border-2 border-edge rounded-control focus:border-nutri focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nutri focus-visible:ring-offset-2 focus-visible:ring-offset-page text-fg placeholder:text-fg-mute mb-3"
                placeholder="e.g., 'A high protein vegan breakfast under 400 calories'"
                rows={2}
                value={mealCriteria}
                onChange={e => setMealCriteria(e.target.value)}
              />
              <div className="flex gap-4 items-center">
                <select
                  value={targetMeal}
                  onChange={e => setTargetMeal(e.target.value as MealType)}
                  className="p-3 border-2 border-edge rounded-control font-medium bg-card text-fg"
                >
                  {MEAL_TYPES.map(t => <option key={t} value={t}>Plan for {t}</option>)}
                </select>
                <Button onClick={handleMealGenerate} disabled={isMealLoading || !mealCriteria} className="flex-1">
                  {isMealLoading ? 'Thinking...' : 'Generate Ideas'}
                </Button>
              </div>
              {mealError && (
                <div className="mt-3 inline-flex items-center gap-2 p-3 bg-fat/10 rounded-control text-fat text-sm font-medium">
                  <IconX size={16} stroke={2.5} /> {mealError}
                </div>
              )}
            </div>
            {mealSuggestions.length > 0 && (
              <div className="space-y-4">
                <h4 className="font-semibold text-fg-mute uppercase text-xs tracking-wider">Suggestions</h4>
                <div className="grid gap-4">
                  {mealSuggestions.map((s, idx) => (
                    <div key={idx} className="border border-edge rounded-card p-5 hover:border-nutri/50 transition-colors bg-raised cursor-pointer" onClick={() => setRecipeModal(s)}>
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-bold text-xl text-fg">{s.name}</h5>
                        <Button variant="outline" className="!py-1 !px-3 text-xs" onClick={(e) => { e.stopPropagation(); handleAddMealSuggestion(s); }}>
                          Add to Log
                        </Button>
                      </div>
                      <p className="text-fg-soft text-sm mb-3">{s.description}</p>
                      <div className="nums flex gap-3 text-sm">
                        <span className="font-bold text-fg">{s.calories} kcal</span>
                        <span className="text-fg-soft">P: <span className="font-semibold text-fg">{s.protein}g</span></span>
                        <span className="text-fg-soft">C: <span className="font-semibold text-fg">{s.carbs}g</span></span>
                        <span className="text-fg-soft">F: <span className="font-semibold text-fg">{s.fat}g</span></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </Modal>
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
