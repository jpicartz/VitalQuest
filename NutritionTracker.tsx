
import React, { useState, useRef } from 'react';
import { Button } from './ui/Button';
import { FoodItem, MealLog, MealType, MacroTargets, MealSuggestion, UserProfile } from '../types';
import { MOCK_COMMON_FOODS, NUTRIENT_INFO } from '../data/nutrientData';
import { parseFoodLog, suggestMeals } from '../services/geminiService';
// @ts-ignore
import html2canvas from 'html2canvas';
// @ts-ignore
import { jsPDF } from 'jspdf';

interface NutritionTrackerProps {
  logs: MealLog[];
  onAddFood: (meal: MealType, food: FoodItem) => void;
  onUpdateLog: (log: MealLog) => void;
  onDeleteLog: (logId: string) => void;
  targets: MacroTargets;
  profile: UserProfile;
  onResetTodayLog: () => void;
}

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

const PRIORITY_MICROS = [
  "Fiber", "Vitamin C", "Vitamin D", "Magnesium", "Potassium", 
  "Iron", "Calcium", "Vitamin B12", "Zinc", "Omega-3"
];

export const NutritionTracker: React.FC<NutritionTrackerProps> = ({ logs, onAddFood, onUpdateLog, onDeleteLog, targets, profile, onResetTodayLog }) => {
  const [activeTab, setActiveTab] = useState<'log' | 'analysis'>('log');
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

  const calculateMicroScore = () => {
    let totalRatio = 0;
    let count = 0;

    PRIORITY_MICROS.forEach(key => {
        const info = NUTRIENT_INFO[key];
        if (!info || !info.targetVal) return;

        const current = consumedMicros[key] || 0;
        // Cap at 1.0 (100%)
        const ratio = Math.min(current / info.targetVal, 1);
        totalRatio += ratio;
        count++;
    });

    return count === 0 ? 0 : Math.round((totalRatio / count) * 100);
  };

  const microScore = calculateMicroScore();

  // Find "nailed" nutrients (>= 100% of target)
  const nailedNutrients = Object.keys(NUTRIENT_INFO)
    .filter(key => {
      const info = NUTRIENT_INFO[key];
      if (!info || !info.targetVal) return false;
      const current = consumedMicros[key] || 0;
      return current >= info.targetVal;
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
        <div className="flex gap-2 bg-slate-100 p-1 rounded-xl w-fit">
            <button onClick={() => setActiveTab('log')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'log' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Food Log</button>
            <button onClick={() => setActiveTab('analysis')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'analysis' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}>Analysis</button>
        </div>
        {activeTab === 'log' && (
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
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-6 flex justify-between items-center">
                <div>
                   <h3 className="font-bold text-slate-500 text-sm uppercase">Calories Remaining</h3>
                   <div className="text-4xl font-black text-slate-800">{Math.max(0, Math.round(targets.calories - consumedMacros.calories))}</div>
                </div>
                <div className="text-right">
                   <div className="text-sm text-slate-500">Eaten</div>
                   <div className="font-bold text-xl text-brand-600">{Math.round(consumedMacros.calories)} kcal</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                  <button onClick={() => setIsAddingSunlight(true)} className="py-3 bg-amber-50 rounded-xl font-bold text-amber-700 hover:bg-amber-100 transition-colors border border-amber-200">☀️ Sunlight</button>
                  <button onClick={() => setIsMealBuilderOpen(true)} className="py-3 bg-indigo-50 rounded-xl font-bold text-indigo-700 hover:bg-indigo-100 transition-colors border border-indigo-200">✨ Builder</button>
              </div>

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
                                 <div className="font-medium text-slate-800">{log.food.name} <span className="text-brand-600 text-xs ml-2">({log.food.servingSize})</span></div>
                                 <div className="text-xs text-slate-400">P: {log.food.protein}g • C: {log.food.carbs}g • F: {log.food.fat}g</div>
                               </div>
                               <div className="flex items-center gap-4">
                                   <div className="font-bold text-slate-600">{log.food.calories}</div>
                                   <div className="flex gap-2">
                                       <button onClick={() => deleteLog(log.id)} className="p-1.5 text-slate-400 hover:text-red-600">
                                         <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                       </button>
                                   </div>
                               </div>
                            </div>
                          ))
                        )}
                        <button onClick={() => { setSelectedMeal(type); setIsAdding(true); }} className="w-full p-3 text-sm font-bold text-brand-600 hover:bg-brand-50">+ Add Food</button>
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

      {activeTab === 'analysis' && (
        <div className="animate-fade-in space-y-8">
          <div className="flex justify-end">
            <Button variant="outline" onClick={handleExportPDF} className="text-sm font-bold">
              📄 Export PDF
            </Button>
          </div>
          <div ref={reportRef} className="space-y-8">
           <section className="bg-gradient-to-br from-brand-500 to-brand-700 p-6 rounded-3xl text-white shadow-lg">
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
                      <button key={key} onClick={() => setSelectedNutrient(key)} className="p-4 rounded-xl border bg-slate-50 flex flex-col justify-between hover:border-brand-500 text-left transition-all active:scale-[0.98]">
                         <div className="text-[10px] font-bold text-slate-400 uppercase truncate" title={key}>{key}</div>
                         <div className="text-lg font-black text-slate-800">{amount > 0 ? Math.round(amount * 10) / 10 : '-'}<span className="text-xs font-normal text-slate-500 ml-1">{info.unit}</span></div>
                         {target && amount > 0 && <div className="text-[10px] font-bold text-brand-600 mt-1">{Math.round((amount / target) * 100)}% DV</div>}
                      </button>
                    )
                 })}
              </div>
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
              
              <div className="flex justify-between items-center bg-brand-50 p-4 rounded-xl border border-brand-100">
                 <span className="font-bold text-brand-800 text-sm">Daily Target</span>
                 <span className="font-black text-xl text-brand-900">{NUTRIENT_INFO[selectedNutrient].dailyValue}</span>
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
                className="w-full p-4 border-2 border-slate-200 rounded-xl focus:border-brand-500 focus:outline-none text-slate-800 mb-3"
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
                    <div key={idx} className="border border-slate-200 rounded-2xl p-5 hover:border-brand-300 transition-colors bg-slate-50">
                      <div className="flex justify-between items-start mb-2">
                        <h5 className="font-bold text-xl text-brand-800">{s.name}</h5>
                        <Button variant="outline" className="!py-1 !px-3 text-xs" onClick={() => handleAddMealSuggestion(s)}>
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
    </div>
  );
};
