import { describe, it, expect } from 'vitest';
import { checkBadges } from './badgeUtils';
import { BADGE_MAP } from '../data/badgeDefinitions';
import { GamificationState } from '../types';

const gam = (over: Partial<GamificationState> = {}): GamificationState => ({
  xp: 0,
  level: 1,
  streak: 0,
  completedQuestIds: [],
  badges: [],
  ...over,
});

const ctx = (over: {
  gamification?: Partial<GamificationState>;
  lifetimeQuestsCompleted?: number;
  microScore?: number;
  waterMl?: number;
} = {}) => ({
  gamification: gam(over.gamification),
  lifetimeQuestsCompleted: over.lifetimeQuestsCompleted ?? 0,
  microScore: over.microScore ?? 0,
  waterMl: over.waterMl ?? 0,
});

describe('checkBadges — thresholds', () => {
  it.each([
    ['first-steps',    { lifetimeQuestsCompleted: 1 },              { lifetimeQuestsCompleted: 0 }],
    ['century',        { gamification: { xp: 100 } },               { gamification: { xp: 99 } }],
    ['level-5',        { gamification: { level: 5 } },              { gamification: { level: 4 } }],
    ['week-warrior',   { gamification: { streak: 7 } },             { gamification: { streak: 6 } }],
    ['iron-will',      { gamification: { streak: 30 } },            { gamification: { streak: 29 } }],
    ['quest-master',   { lifetimeQuestsCompleted: 25 },             { lifetimeQuestsCompleted: 24 }],
    ['hydration-hero', { waterMl: 2000 },                           { waterMl: 1999 }],
    ['nutrition-nerd', { microScore: 70 },                          { microScore: 69 }],
  ])('%s is awarded at its threshold and not one below', (id, at, below) => {
    expect(checkBadges(ctx(at))).toContain(id);
    expect(checkBadges(ctx(below))).not.toContain(id);
  });
});

describe('checkBadges — behaviour', () => {
  it('awards nothing for a brand-new user', () => {
    expect(checkBadges(ctx())).toEqual([]);
  });

  it('does not re-award a badge already earned', () => {
    expect(checkBadges(ctx({ gamification: { xp: 500, badges: ['century'] } }))).not.toContain('century');
  });

  it('returns an empty array when every qualifying badge is already held', () => {
    const earned = ['first-steps', 'century', 'week-warrior'];
    const result = checkBadges(ctx({
      gamification: { xp: 150, streak: 7, badges: earned },
      lifetimeQuestsCompleted: 3,
    }));
    expect(result).toEqual([]);
  });

  it('awards both streak badges at once on a 30-day streak', () => {
    const result = checkBadges(ctx({ gamification: { streak: 30 } }));
    expect(result).toContain('week-warrior');
    expect(result).toContain('iron-will');
  });

  it('awards several badges in one call when multiple thresholds are crossed', () => {
    const result = checkBadges(ctx({
      gamification: { xp: 500, level: 6, streak: 7 },
      lifetimeQuestsCompleted: 25,
      microScore: 80,
      waterMl: 2500,
    }));
    expect(result).toEqual([
      'first-steps', 'century', 'level-5', 'week-warrior',
      'quest-master', 'hydration-hero', 'nutrition-nerd',
    ]);
  });

  it('ignores a NaN micro score rather than awarding', () => {
    // computeMicroScore no longer returns NaN, but the comparison must fail
    // safe regardless of what a stale localStorage payload contains.
    expect(checkBadges(ctx({ microScore: NaN }))).not.toContain('nutrition-nerd');
  });
});

describe('checkBadges — cross-file invariant', () => {
  it('every awardable badge id exists in BADGE_MAP', () => {
    // badgeUtils hardcodes its 8 ids and never imports badgeDefinitions, so
    // this is the only thing stopping a badge being awarded but unrenderable.
    const allPossible = checkBadges(ctx({
      gamification: { xp: 9999, level: 99, streak: 999 },
      lifetimeQuestsCompleted: 999,
      microScore: 100,
      waterMl: 9999,
    }));
    expect(allPossible.length).toBeGreaterThan(0);
    for (const id of allPossible) {
      expect(BADGE_MAP[id], `badge "${id}" is awardable but missing from BADGE_MAP`).toBeDefined();
    }
  });

  it('awards all 8 defined badges when every threshold is met', () => {
    const allPossible = checkBadges(ctx({
      gamification: { xp: 9999, level: 99, streak: 999 },
      lifetimeQuestsCompleted: 999,
      microScore: 100,
      waterMl: 9999,
    }));
    expect(allPossible.sort()).toEqual(Object.keys(BADGE_MAP).sort());
  });
});
