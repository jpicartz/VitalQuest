import React from 'react';
import { Card } from './ui/Card';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { StatSeries } from '../utils/nutritionStats';
import { ConsistencySummary } from '../utils/nutritionStats';
import { IconTrendingUp, IconTrendingDown, IconMinus } from '@tabler/icons-react';

/**
 * Ratio stats over time.
 *
 * Each card is a number plus the line behind it, because the number alone
 * answers "where am I" and only the line answers "which way am I going" — and
 * for every one of these, direction is the more useful of the two.
 *
 * Gaps are real gaps: `connectNulls` is off, so an unlogged day breaks the line
 * instead of drawing a straight segment across it. Interpolating would invent
 * data on exactly the days the user did not give any.
 */

const AXIS = '#94a3b8';
const GRID = 'rgba(148,163,184,0.2)';
const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid rgb(var(--edge))',
  background: 'rgb(var(--surface-card))',
  color: 'rgb(var(--fg))',
  fontSize: 13,
};

const TrendIcon: React.FC<{ trend: StatSeries['trend'] }> = ({ trend }) => {
  if (trend === 'up') return <IconTrendingUp size={15} className="text-nutri" />;
  if (trend === 'down') return <IconTrendingDown size={15} className="text-fat" />;
  return <IconMinus size={15} className="text-fg-mute" />;
};

interface StatTrendsProps {
  series: StatSeries[];
  consistency: ConsistencySummary;
  rangeDays: number;
}

export const StatTrends: React.FC<StatTrendsProps> = ({ series, consistency, rangeDays }) => {
  const hasData = series.some((s) => s.points.some((p) => p.value !== null));

  if (!hasData) {
    return (
      <Card title="Your numbers">
        <p className="text-sm text-fg-soft">
          Log a few days and these start to mean something — each one is a ratio, so
          they compare across days regardless of how much you ate.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card
        title="Consistency"
        description={`The habit metric. Days logged, and days that landed within 15% of your calorie target — either side, because starving is not consistency.`}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-raised rounded-tile p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-fg-mute">Days logged</div>
            <div className="nums text-2xl font-bold text-fg mt-1">
              {consistency.daysLogged}
              <span className="text-sm font-normal text-fg-soft"> / {consistency.daysInRange}</span>
            </div>
          </div>
          <div className="bg-nutri/10 rounded-tile p-4">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-nutri">On target</div>
            <div className="nums text-2xl font-bold text-nutri mt-1">
              {consistency.daysOnTarget}
              <span className="text-sm font-normal text-nutri/70"> / {consistency.daysLogged}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        {series.filter((s) => s.key !== 'consistency').map((s) => (
          <Card key={s.key} title={s.label} description={s.blurb}>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="nums text-3xl font-bold text-fg">{s.average}</span>
              <span className="text-sm text-fg-soft">{s.unit}</span>
              <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-fg-mute">
                <TrendIcon trend={s.trend} />
                {s.trend === 'flat' ? 'steady' : s.trend === 'up' ? 'rising' : 'falling'}
              </span>
            </div>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={s.points} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false}
                    interval={rangeDays > 14 ? 'preserveStartEnd' : 0} />
                  <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={44} />
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={(v: number) => [`${v} ${s.unit}`, s.label]} />
                  <ReferenceLine y={s.target} stroke="#22c55e" strokeDasharray="4 4"
                    label={{ value: 'target', position: 'right', fill: AXIS, fontSize: 10 }} />
                  {/* connectNulls stays OFF: an unlogged day is a gap, not a value. */}
                  <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2.5}
                    dot={{ r: 2.5, fill: '#7c3aed' }} activeDot={{ r: 5 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
