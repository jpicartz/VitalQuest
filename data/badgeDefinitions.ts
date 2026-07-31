import type { Icon } from '@tabler/icons-react';
import {
  IconShoe, IconAward, IconStar, IconFlame,
  IconTrophy, IconTargetArrow, IconDroplet, IconDna2,
} from '@tabler/icons-react';

export interface BadgeDefinition {
  id: string;
  Icon: Icon;
  title: string;
  description: string;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    id: 'first-steps',
    Icon: IconShoe,
    title: 'First Steps',
    description: 'Completed your very first quest.',
  },
  {
    id: 'century',
    Icon: IconAward,
    title: 'Century',
    description: 'Earned 100 XP total.',
  },
  {
    id: 'level-5',
    Icon: IconStar,
    title: 'Level 5',
    description: 'Reached level 5.',
  },
  {
    id: 'week-warrior',
    Icon: IconFlame,
    title: 'Week Warrior',
    description: 'Maintained a 7-day logging streak.',
  },
  {
    id: 'iron-will',
    Icon: IconTrophy,
    title: 'Iron Will',
    description: 'Maintained a 30-day logging streak.',
  },
  {
    id: 'quest-master',
    Icon: IconTargetArrow,
    title: 'Quest Master',
    description: 'Completed 25 quests in total.',
  },
  {
    id: 'hydration-hero',
    Icon: IconDroplet,
    title: 'Hydration Hero',
    description: 'Logged 2,000 ml of water in a single day.',
  },
  {
    id: 'nutrition-nerd',
    Icon: IconDna2,
    title: 'Nutrition Nerd',
    description: 'Achieved a Micronutrient Score of 70 or above.',
  },
];

export const BADGE_MAP: Record<string, BadgeDefinition> = Object.fromEntries(
  BADGE_DEFINITIONS.map(b => [b.id, b])
);
