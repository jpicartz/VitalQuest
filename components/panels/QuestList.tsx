import React from 'react';
import { Habit, GamificationState } from '../../types';
import { IconCheck } from '@tabler/icons-react';

interface QuestListProps {
  dailyQuests: Habit[];
  gamification: GamificationState;
  completeQuest: (questId: string, xpReward: number) => void;
}

/** Extracted verbatim from Dashboard. Behaviour unchanged. */
export const QuestList: React.FC<QuestListProps> = ({
  dailyQuests, gamification, completeQuest,
}) => {
  const calculateProgress = () => {
    const total = dailyQuests.length;
    const completed = gamification.completedQuestIds.length;
    return total === 0 ? 0 : Math.round((completed / total) * 100);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-end mb-2">
        <h3 className="text-xl font-bold text-fg">Today's Goals</h3>
        <span className="nums text-sm font-semibold text-nutri">{calculateProgress()}% complete</span>
      </div>
      <div className="h-3 bg-track rounded-full overflow-hidden mb-6">
        <div className="h-full bg-nutri rounded-full transition-all duration-700 ease-out" style={{ width: `${calculateProgress()}%` }} />
      </div>
      <div className="grid gap-3">
        {dailyQuests.map((quest) => {
          const isCompleted = gamification.completedQuestIds.includes(quest.id);
          return (
            <div
              key={quest.id}
              onClick={() => !isCompleted && completeQuest(quest.id, quest.xpReward)}
              className={`flex items-center gap-4 p-4 rounded-card border transition-all ${
                isCompleted
                  ? 'bg-raised border-edge opacity-70'
                  : 'bg-card border-edge hover:border-nutri/50 cursor-pointer shadow-e1'
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${isCompleted ? 'bg-nutri-strong text-white' : 'border-2 border-edge'}`}>
                {isCompleted && <IconCheck size={16} stroke={3} />}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className={`font-semibold ${isCompleted ? 'text-fg-soft line-through' : 'text-fg'}`}>{quest.title}</h4>
                <p className="text-fg-soft text-sm">{quest.description}</p>
              </div>
              <span className="nums text-xs font-bold text-spark bg-spark/10 px-2.5 py-1 rounded-full shrink-0">+{quest.xpReward} XP</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
