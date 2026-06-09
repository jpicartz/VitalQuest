import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { DailyNutritionSummary, WeeklyMacroTotals } from '../utils/nutritionAggregates';

interface TrendChartsProps {
  dailySummaries: DailyNutritionSummary[];
  weeklyTotals: WeeklyMacroTotals;
  calorieTarget: number;
  proteinTarget: number;
  rangeDays: number;
}

const MACRO_COLORS = ['#3b82f6', '#f59e0b', '#f43f5e'];

export const TrendCharts: React.FC<TrendChartsProps> = ({
  dailySummaries,
  weeklyTotals,
  calorieTarget,
  proteinTarget,
  rangeDays,
}) => {
  const rangeLabel = `${rangeDays}-Day`;
  const macroPieData = [
    { name: 'Protein', value: Math.round(weeklyTotals.protein * 4), grams: weeklyTotals.protein },
    { name: 'Carbs', value: Math.round(weeklyTotals.carbs * 4), grams: weeklyTotals.carbs },
    { name: 'Fat', value: Math.round(weeklyTotals.fat * 9), grams: weeklyTotals.fat },
  ].filter((d) => d.value > 0);

  const hasAnyData = dailySummaries.some((d) => d.mealCount > 0);

  if (!hasAnyData) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center">
        <p className="text-slate-500 font-medium">Log food for a few days to see your {rangeLabel.toLowerCase()} trends.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-1">{rangeLabel} Calories</h3>
        <p className="text-xs text-slate-400 mb-4">Daily intake vs your TDEE target</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailySummaries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
              formatter={(value: number) => [`${value} kcal`, 'Calories']}
            />
            <ReferenceLine
              y={calorieTarget}
              stroke="#22c55e"
              strokeDasharray="4 4"
              label={{ value: 'Target', position: 'right', fill: '#16a34a', fontSize: 11 }}
            />
            <Bar dataKey="calories" fill="#22c55e" radius={[6, 6, 0, 0]} name="Calories" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-1">{rangeLabel} Protein</h3>
        <p className="text-xs text-slate-400 mb-4">Grams per day vs target</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailySummaries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
              formatter={(value: number) => [`${value}g`, 'Protein']}
            />
            <ReferenceLine
              y={proteinTarget}
              stroke="#3b82f6"
              strokeDasharray="4 4"
              label={{ value: 'Target', position: 'right', fill: '#2563eb', fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="protein"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="Protein"
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-1">Macro Breakdown</h3>
        <p className="text-xs text-slate-400 mb-4">{rangeLabel} calories from protein, carbs, and fat</p>
        {macroPieData.length > 0 ? (
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="w-[260px] shrink-0">
              <ResponsiveContainer width={260} height={240}>
              <PieChart>
                <Pie
                  data={macroPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                >
                  {macroPieData.map((_, i) => (
                    <Cell key={i} fill={MACRO_COLORS[i % MACRO_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
                  formatter={(value: number, _name: string, props: { payload?: { grams: number; name: string } }) => [
                    `${props.payload?.grams ?? 0}g (${value} kcal)`,
                    props.payload?.name ?? '',
                  ]}
                />
                <Legend />
              </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-3 gap-3 w-full md:w-auto flex-1">
              {macroPieData.map((m, i) => (
                <div
                  key={m.name}
                  className="p-4 rounded-xl bg-slate-50 border border-slate-100 text-center"
                >
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-2"
                    style={{ backgroundColor: MACRO_COLORS[i] }}
                  />
                  <div className="text-xs font-bold text-slate-400 uppercase">{m.name}</div>
                  <div className="text-xl font-black text-slate-800">{Math.round(m.grams)}g</div>
                  <div className="text-[10px] text-slate-500">{m.value} kcal</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-slate-400 text-sm text-center py-8">No macro data yet.</p>
        )}
      </section>
    </div>
  );
};
