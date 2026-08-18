import React, { useState, useMemo } from 'react';
import { useProfile } from '../../contexts/ProfileContext';
import { useLogs, useLogActions } from '../../contexts/LogsContext';
import { Card } from '../ui/Card';
import { Field } from '../ui/Field';
import { UserProfile, WeightEntry } from '../../types';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { Button } from '../ui/Button';


/**
 * Extracted verbatim from Dashboard, along with the derived values and local
 * input state it owns — they were only in Dashboard because this block was.
 */
export const WeightPanel: React.FC = () => {
  const { profile } = useProfile();
  const { weightHistory } = useLogs();
  const { onLogWeight } = useLogActions();
  const [weightInput, setWeightInput] = useState('');

  // Last 14 entries.
  const weightChartData = useMemo(
    () => weightHistory.slice(-14).map(e => ({ date: e.date.slice(5), kg: e.kg })),
    [weightHistory]
  );

  // Prefer the tagged baseline entry; fall back to first entry, then profile weight.
  const startingWeight = (weightHistory.find(e => e.isBaseline) ?? weightHistory[0])?.kg ?? profile.weightKg;
  const currentWeight = weightHistory.length > 0 ? weightHistory[weightHistory.length - 1].kg : profile.weightKg;
  const weightDelta = +(currentWeight - startingWeight).toFixed(1);

  const handleLogWeightSubmit = () => {
    const kg = parseFloat(weightInput);
    if (!isNaN(kg) && kg > 20 && kg < 400) {
      onLogWeight(kg);
      setWeightInput('');
    }
  };

  return (
        <Card title="Body Weight">
          <div className="flex gap-6 mb-4">
            <div>
              <p className="text-[11px] text-fg-mute font-semibold uppercase tracking-wide">Starting</p>
              <p className="nums text-2xl font-bold text-fg">{startingWeight} <span className="text-sm font-normal text-fg-mute">kg</span></p>
            </div>
            <div>
              <p className="text-[11px] text-fg-mute font-semibold uppercase tracking-wide">Current</p>
              <p className="nums text-2xl font-bold text-fg">{currentWeight} <span className="text-sm font-normal text-fg-mute">kg</span></p>
            </div>
            <div>
              <p className="text-[11px] text-fg-mute font-semibold uppercase tracking-wide">Change</p>
              <p className={`nums text-2xl font-bold ${weightDelta < 0 ? 'text-nutri' : weightDelta > 0 ? 'text-fat' : 'text-fg-mute'}`}>
                {weightDelta > 0 ? '+' : ''}{weightDelta} <span className="text-sm font-normal">kg</span>
              </p>
            </div>
          </div>

          {weightChartData.length >= 2 && (
            <div className="h-36 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightChartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10, fill: '#94a3b8' }} width={32} />
                  <Tooltip formatter={(v: number) => [`${v} kg`, 'Weight']} contentStyle={{ background: 'rgb(var(--surface-card))', border: '1px solid rgb(var(--edge))', borderRadius: 12, color: 'rgb(var(--fg))' }} />
                  <Line type="monotone" dataKey="kg" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: '#22c55e' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <Field
              label="Today's weight"
              labelHidden
              className="flex-1"
              accent="spark"
              suffix="kg"
              type="number"
              step="0.1"
              placeholder={`Today's weight (kg)`}
              value={weightInput}
              onChange={e => setWeightInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogWeightSubmit()}
            />
            <Button onClick={handleLogWeightSubmit} disabled={!weightInput}>Log</Button>
          </div>
        </Card>
  );
};
