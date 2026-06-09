import React, { useState, useEffect } from 'react';
import { Button } from './ui/Button';
import { MacroTargets, UserProfile, WellnessPlan, NutritionInsight } from '../types';
import { DailyNutritionSummary, buildInsightsPayload } from '../utils/nutritionAggregates';
import { generateNutritionInsights } from '../services/claudeService';

interface NutritionInsightsProps {
  dailySummaries: DailyNutritionSummary[];
  targets: MacroTargets;
  profile: UserProfile;
  plan?: WellnessPlan;
}

export const NutritionInsights: React.FC<NutritionInsightsProps> = ({
  dailySummaries,
  targets,
  profile,
  plan,
}) => {
  const [insights, setInsights] = useState<NutritionInsight | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const daysLogged = dailySummaries.filter((d) => d.mealCount > 0).length;

  const loadInsights = async () => {
    if (daysLogged === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      const payload = buildInsightsPayload(dailySummaries, targets.calories, targets.protein);
      const result = await generateNutritionInsights(payload, profile, plan);
      setInsights(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load insights');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (daysLogged >= 2) loadInsights();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysLogged, dailySummaries.map((d) => d.calories).join(',')]);

  if (daysLogged === 0) {
    return (
      <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl">
        <h3 className="font-bold text-indigo-900 mb-2">AI Pattern Insights</h3>
        <p className="text-sm text-indigo-700">Log meals across a few days — Claude will analyze your last 7 days and surface patterns.</p>
      </div>
    );
  }

  if (daysLogged === 1) {
    return (
      <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl">
        <h3 className="font-bold text-indigo-900 mb-2">AI Pattern Insights</h3>
        <p className="text-sm text-indigo-700">Log one more day to unlock weekly pattern analysis ({daysLogged}/2 days logged).</p>
      </div>
    );
  }

  return (
    <div className="p-6 rounded-3xl text-white shadow-lg" style={{background: 'linear-gradient(135deg, #6366f1, #7c3aed)'}}>
      <div className="flex justify-between items-start mb-4 gap-4">
        <div>
          <h3 className="text-xl font-bold">AI Pattern Insights</h3>
          <p className="text-sm text-white/70 mt-1">Based on your last 7 days ({daysLogged} days logged)</p>
        </div>
        <Button variant="outline" className="!py-1.5 !px-3 text-xs bg-white/10 border-white/30 text-white hover:bg-white/20 shrink-0" onClick={loadInsights} disabled={isLoading}>
          {isLoading ? 'Analyzing…' : 'Refresh'}
        </Button>
      </div>
      {isLoading && !insights && <p className="text-white/80 text-sm py-4">Reading your logs…</p>}
      {error && <p className="text-sm bg-white/10 p-3 rounded-xl">{error} <button onClick={loadInsights} className="underline font-bold ml-1">Retry</button></p>}
      {insights && (
        <div className="space-y-4">
          <p className="text-lg font-bold">{insights.headline}</p>
          {insights.patterns.length > 0 && (
            <ul className="space-y-2 text-sm bg-white/10 p-4 rounded-2xl">
              {insights.patterns.map((p, i) => <li key={i}>→ {p}</li>)}
            </ul>
          )}
          {insights.recommendations.length > 0 && (
            <ul className="space-y-2 text-sm">
              {insights.recommendations.map((r, i) => <li key={i} className="bg-white/10 px-3 py-2 rounded-xl">✓ {r}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
