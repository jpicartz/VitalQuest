export interface BadgeDefinition {
  id: string;
  emoji: string;
  title: string;
  description: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first-steps',
    emoji: '👣',
    title: 'First Steps',
    description: 'Completed your very first quest.',
  },
  {
    id: 'century',
    emoji: '💯',
    title: 'Century',
    description: 'Earned 100 XP total.',
  },
  {
    id: 'level-5',
    emoji: '⭐',
    title: 'Level 5',
    description: 'Reached level 5.',
  },
  {
    id: 'week-warrior',
    emoji: '🔥',
    title: 'Week Warrior',
    description: 'Maintained a 7-day logging streak.',
  },
  {
    id: 'iron-will',
    emoji: '🏆',
    title: 'Iron Will',
    description: 'Maintained a 30-day logging streak.',
  },
  {
    id: 'quest-master',
    emoji: '🎯',
    title: 'Quest Master',
    description: 'Completed 25 quests in total.',
  },
  {
    id: 'hydration-hero',
    emoji: '💧',
    title: 'Hydration Hero',
    description: 'Logged 2,000 ml of water in a single day.',
  },
  {
    id: 'nutrition-nerd',
    emoji: '🧬',
    title: 'Nutrition Nerd',
    description: 'Achieved a Micronutrient Score of 70 or above.',
  },
];

export const BADGE_MAP: Record<string, BadgeDefinition> = Object.fromEntries(
  BADGE_DEFINITIONS.map(b => [b.id, b])
);
