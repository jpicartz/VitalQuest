import React from 'react';
import { Card } from '../ui/Card';
import { GamificationState } from '../../types';

interface StatsPanelProps {
  gamification: GamificationState;
}

/** Extracted verbatim from Dashboard for the v2 restructure. Behaviour unchanged. */
export const StatsPanel: React.FC<StatsPanelProps> = ({ gamification }) => (
        <Card title="Stats">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Total XP', value: gamification.xp, suffix: 'xp' },
              { label: 'Current Level', value: gamification.level, suffix: '' },
              { label: 'Day Streak', value: gamification.streak, suffix: '' },
              { label: 'Badges Earned', value: gamification.badges.length, suffix: '' },
            ].map(stat => (
              <div key={stat.label} className="bg-raised p-4 rounded-tile">
                <p className="text-[11px] font-semibold text-fg-mute uppercase tracking-wide">{stat.label}</p>
                <p className="nums text-2xl font-bold text-fg">{stat.value} <span className="text-sm font-normal text-fg-soft">{stat.suffix}</span></p>
              </div>
            ))}
          </div>
        </Card>
);
