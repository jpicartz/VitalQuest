import React from 'react';
import { Card } from '../ui/Card';
import { GamificationState } from '../../types';
import { BADGE_MAP, BADGE_DEFINITIONS } from '../../data/badgeDefinitions';

interface AchievementsPanelProps {
  gamification: GamificationState;
}

/** Extracted verbatim from Dashboard. Behaviour unchanged. */
export const AchievementsPanel: React.FC<AchievementsPanelProps> = ({ gamification }) => (
        <Card title="Achievements">
          {gamification.badges.length === 0 ? (
            <p className="text-sm text-fg-mute italic">No badges yet — complete quests, log food, and build your streak to earn them!</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {gamification.badges.map(id => {
                const b = BADGE_MAP[id];
                if (!b) return null;
                return (
                  <div key={id} className="flex flex-col items-center gap-1 p-4 rounded-tile bg-spark/10 border border-spark/25 text-center">
                    <b.Icon size={30} className="text-spark" stroke={1.75} />
                    <span className="font-bold text-fg text-sm">{b.title}</span>
                    <span className="text-xs text-fg-soft">{b.description}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Locked badges */}
          {(() => {
            const locked = BADGE_DEFINITIONS.filter(b => !gamification.badges.includes(b.id));
            if (locked.length === 0) return null;
            return (
              <div className="mt-4">
                <p className="text-xs font-semibold text-fg-mute uppercase tracking-wider mb-3">Locked</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {locked.map(b => (
                    <div key={b.id} className="flex flex-col items-center gap-1 p-4 rounded-tile bg-raised border border-edge text-center opacity-60">
                      <b.Icon size={30} className="text-fg-mute" stroke={1.75} />
                      <span className="font-bold text-fg text-sm">{b.title}</span>
                      <span className="text-xs text-fg-soft">{b.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </Card>
);
