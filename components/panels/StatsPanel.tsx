import React from 'react';
import { Card } from '../ui/Card';
import { StatTile } from '../ui/StatTile';
import { GamificationState } from '../../types';

interface StatsPanelProps {
  gamification: GamificationState;
}

/** Extracted verbatim from Dashboard for the v2 restructure. Behaviour unchanged. */
export const StatsPanel: React.FC<StatsPanelProps> = ({ gamification }) => (
        <Card title="Stats">
          <div className="grid grid-cols-2 gap-3">
            {([
              { label: 'Total XP', value: gamification.xp, unit: 'xp', tone: 'nutri' },
              { label: 'Current Level', value: gamification.level, unit: undefined, tone: 'neutral' },
              { label: 'Day Streak', value: gamification.streak, unit: 'days', tone: 'spark' },
              { label: 'Badges Earned', value: gamification.badges.length, unit: undefined, tone: 'neutral' },
            ] as const).map(stat => (
              <StatTile key={stat.label} label={stat.label} value={stat.value} unit={stat.unit} tone={stat.tone} />
            ))}
          </div>
        </Card>
);
