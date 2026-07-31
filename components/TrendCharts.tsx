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

// Concrete hues chosen to read on both the warm-light and deep-dark surfaces
// (SVG attributes can't resolve CSS vars; only the tooltip's style object can).
const MACRO_COLORS = ['#22c55e', '#f59e0b', '#f43f5e']; // protein / carbs / fat
const AXIS = '#94a3b8';
const GRID = 'rgba(148,163,184,0.25)';
const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid rgb(var(--edge))',
  background: 'rgb(var(--surface-card))',
  color: 'rgb(var(--fg))',
  fontSize: 13,
};

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
      <div className="bg-card p-8 rounded-card border border-edge text-center">
        <p className="text-fg-soft font-medium">Log food for a few days to see your {rangeLabel.toLowerCase()} trends.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
        <h3 className="text-lg font-bold text-fg mb-1">{rangeLabel} Calories</h3>
        <p className="text-xs text-fg-mute mb-4">Daily intake vs your TDEE target</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailySummaries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} />
            <YAxis tick={{ fontSize: 12, fill: AXIS }} />
            <Tooltip
              contentStyle={tooltipStyle}
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

      <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
        <h3 className="text-lg font-bold text-fg mb-1">{rangeLabel} Protein</h3>
        <p className="text-xs text-fg-mute mb-4">Grams per day vs target</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailySummaries} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: AXIS }} />
            <YAxis tick={{ fontSize: 12, fill: AXIS }} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value: number) => [`${value}g`, 'Protein']}
            />
            <ReferenceLine
              y={proteinTarget}
              stroke="#22c55e"
              strokeDasharray="4 4"
              label={{ value: 'Target', position: 'right', fill: '#16a34a', fontSize: 11 }}
            />
            <Line
              type="monotone"
              dataKey="protein"
              stroke="#22c55e"
              strokeWidth={3}
              dot={{ fill: '#22c55e', r: 4 }}
              name="Protein"
            />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="bg-card p-6 rounded-card border border-edge shadow-sm dark:shadow-none">
        <h3 className="text-lg font-bold text-fg mb-1">Macro Breakdown</h3>
        <p className="text-xs text-fg-mute mb-4">{rangeLabel} calories from protein, carbs, and fat</p>
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
                  contentStyle={tooltipStyle}
                  formatter={(value: number, _name: string, props: { payload?: { grams: number; name: string } }) => [
                    `${props.payload?.grams ?? 0}g (${value} kcal)`,
                    props.payload?.name ?? '',
                  ]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto flex-1">
              {macroPieData.map((m, i) => (
                <div
                  key={m.name}
                  className="p-4 rounded-tile bg-raised border border-edge text-center"
                >
                  <div
                    className="w-3 h-3 rounded-full mx-auto mb-2"
                    style={{ backgroundColor: MACRO_COLORS[i] }}
                  />
                  <div className="text-xs font-semibold text-fg-mute uppercase">{m.name}</div>
                  <div className="nums text-xl font-bold text-fg">{Math.round(m.grams)}g</div>
                  <div className="nums text-[10px] text-fg-soft">{m.value} kcal</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-fg-mute text-sm text-center py-8">No macro data yet.</p>
        )}
      </section>
    </div>
  );
};
