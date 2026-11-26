import { describe, it, expect } from 'vitest';
import { mergeSyncData, mergeTombstones, SyncData, SyncEnvelope } from './syncMerge';

const log = (id: string, name: string, timestamp = 1000) => ({
  id, timestamp, type: 'Lunch', food: { id: `f-${id}`, name, calories: 300 },
});

const envelope = (data: SyncData, syncedAt: number): SyncEnvelope =>
  ({ v: 1, syncedAt, data });

describe('food logs are additive', () => {
  it('keeps meals from both devices', () => {
    // The whole point. The laptop logged lunch, the phone logged dinner;
    // losing either one makes the feature worse than not syncing.
    const local: SyncData = { foodLogs: [log('a', 'Laptop lunch')] };
    const remote = envelope({ foodLogs: [log('b', 'Phone dinner')] }, 2000);

    const { data, summary } = mergeSyncData(local, remote, 1000);
    const names = (data.foodLogs as never[]).map((l: never) => (l as { food: { name: string } }).food.name);
    expect(names).toEqual(['Laptop lunch', 'Phone dinner']);
    expect(summary.added).toBe(1);
  });

  it('adds remote meals even when the local device is newer', () => {
    // Logs are not settings: a meal the other device has is new information
    // regardless of which clock is ahead.
    const local: SyncData = { foodLogs: [log('a', 'Local')] };
    const remote = envelope({ foodLogs: [log('b', 'Remote')] }, 500);
    const { data } = mergeSyncData(local, remote, 9999);
    expect(data.foodLogs).toHaveLength(2);
  });

  it('never produces the same id twice', () => {
    const local: SyncData = { foodLogs: [log('a', 'One'), log('b', 'Two')] };
    const remote = envelope({ foodLogs: [log('b', 'Two again'), log('c', 'Three')] }, 2000);
    const ids = (mergeSyncData(local, remote, 1000).data.foodLogs as { id: string }[]).map((l) => l.id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps the later edit of the same entry', () => {
    const local: SyncData = { foodLogs: [log('a', 'Old name', 1000)] };
    const remote = envelope({ foodLogs: [log('a', 'Edited name', 5000)] }, 2000);
    const [first] = mergeSyncData(local, remote, 1000).data.foodLogs as { food: { name: string } }[];
    expect(first.food.name).toBe('Edited name');
  });

  it('drops unkeyed rows rather than duplicating them forever', () => {
    const local: SyncData = { foodLogs: [{ food: { name: 'No id' } }] };
    const remote = envelope({ foodLogs: [log('a', 'Real')] }, 2000);
    expect(mergeSyncData(local, remote, 1000).data.foodLogs).toHaveLength(1);
  });
});

describe('settings follow the newer device', () => {
  it('takes the remote profile when remote is newer', () => {
    const local: SyncData = { profile: { weightKg: 80 } };
    const remote = envelope({ profile: { weightKg: 78 } }, 5000);
    expect(mergeSyncData(local, remote, 1000).data.profile).toEqual({ weightKg: 78 });
  });

  it('keeps the local profile when local is newer', () => {
    const local: SyncData = { profile: { weightKg: 80 } };
    const remote = envelope({ profile: { weightKg: 78 } }, 1000);
    expect(mergeSyncData(local, remote, 5000).data.profile).toEqual({ weightKg: 80 });
  });

  it('keeps the local goal when the remote has none', () => {
    const local: SyncData = { weightGoal: { targetKg: 75 } };
    const remote = envelope({}, 9000);
    expect(mergeSyncData(local, remote, 1000).data.weightGoal).toEqual({ targetKg: 75 });
  });
});

describe('progression never goes backwards', () => {
  it('takes the higher XP, not the newer', () => {
    // Syncing must never hand back levels the user already earned.
    const local: SyncData = { gamification: { xp: 900, level: 10, streak: 12, badges: ['a'] } };
    const remote = envelope({ gamification: { xp: 100, level: 2, streak: 1, badges: ['b'] } }, 9999);
    const g = mergeSyncData(local, remote, 1000).data.gamification as Record<string, unknown>;
    expect(g.xp).toBe(900);
    expect(g.level).toBe(10);
    expect(g.streak).toBe(12);
  });

  it('unions badges from both devices', () => {
    const local: SyncData = { gamification: { badges: ['first-steps', 'week-warrior'] } };
    const remote = envelope({ gamification: { badges: ['week-warrior', 'iron-will'] } }, 2000);
    const g = mergeSyncData(local, remote, 1000).data.gamification as { badges: string[] };
    expect([...g.badges].sort()).toEqual(['first-steps', 'iron-will', 'week-warrior']);
  });

  it('takes the higher lifetime achievement count', () => {
    const local: SyncData = { lifetimeQuestsCompleted: 30 };
    const remote = envelope({ lifetimeQuestsCompleted: 12 }, 9999);
    expect(mergeSyncData(local, remote, 1000).data.lifetimeQuestsCompleted).toBe(30);
  });
});

describe('weight history', () => {
  it('unions by date and stays in order', () => {
    const local: SyncData = { weightHistory: [{ date: '2026-11-01', kg: 82 }, { date: '2026-11-20', kg: 80 }] };
    const remote = envelope({ weightHistory: [{ date: '2026-11-10', kg: 81 }] }, 2000);
    const dates = (mergeSyncData(local, remote, 1000).data.weightHistory as { date: string }[]).map((w) => w.date);
    expect(dates).toEqual(['2026-11-01', '2026-11-10', '2026-11-20']);
  });

  it('does not duplicate a date logged on both devices', () => {
    const local: SyncData = { weightHistory: [{ date: '2026-11-01', kg: 82 }] };
    const remote = envelope({ weightHistory: [{ date: '2026-11-01', kg: 82.5 }] }, 2000);
    expect(mergeSyncData(local, remote, 1000).data.weightHistory).toHaveLength(1);
  });
});

describe('degenerate inputs', () => {
  it('is a no-op with no remote data at all', () => {
    const local: SyncData = { foodLogs: [log('a', 'Mine')], profile: { weightKg: 80 } };
    const result = mergeSyncData(local, null, 1000);
    expect(result.data).toEqual(local);
    expect(result.summary).toEqual({ added: 0, fromRemote: false });
  });

  it('survives an empty remote envelope', () => {
    const local: SyncData = { foodLogs: [log('a', 'Mine')] };
    expect(mergeSyncData(local, envelope({}, 5000), 1000).data.foodLogs).toHaveLength(1);
  });

  it('survives a first sync onto an empty device', () => {
    const remote = envelope({ foodLogs: [log('a', 'From laptop')], profile: { weightKg: 80 } }, 5000);
    const { data, summary } = mergeSyncData({}, remote, 0);
    expect(data.foodLogs).toHaveLength(1);
    expect(data.profile).toEqual({ weightKg: 80 });
    expect(summary.added).toBe(1);
  });

  it('never reports a negative number of added entries', () => {
    // Local has more than remote; "added" must not read as -2 in the UI.
    const local: SyncData = { foodLogs: [log('a', 'A'), log('b', 'B'), log('c', 'C')] };
    expect(mergeSyncData(local, envelope({ foodLogs: [] }, 5000), 1000).summary.added).toBe(0);
  });

  it('tolerates arrays arriving as something else entirely', () => {
    const local = { foodLogs: 'not an array' } as unknown as SyncData;
    const remote = envelope({ foodLogs: null as unknown as unknown[] }, 2000);
    expect(mergeSyncData(local, remote, 1000).data.foodLogs).toEqual([]);
  });
});

describe('deletions actually delete', () => {
  // Real epoch milliseconds. Small numbers like 5000 are January 1970, which
  // the 90-day tombstone prune correctly discards — the first version of these
  // tests failed for exactly that reason.
  const NOW = Date.now();
  const RECENT = NOW - 60_000;        // an entry logged a minute ago
  const DELETED_AT = NOW - 30_000;    // deleted after it was logged
  const LATER = NOW - 1_000;          // touched after the deletion

  it('does not resurrect an entry the other device still has', () => {
    // THE bug: laptop deletes lunch, phone's last snapshot still contains it,
    // union restores it and pushes it back — deleted on neither device.
    const local: SyncData = { foodLogs: [log('b', 'Dinner', RECENT)], deletedIds: { a: DELETED_AT } };
    const remote = envelope({ foodLogs: [log('a', 'Deleted lunch', RECENT), log('b', 'Dinner', RECENT)] }, 2000);

    const ids = (mergeSyncData(local, remote, 1000).data.foodLogs as { id: string }[]).map((l) => l.id);
    expect(ids).toEqual(['b']);
  });

  it('propagates a deletion made on the OTHER device', () => {
    // Phone deleted it; this laptop still has it and must let it go.
    const local: SyncData = { foodLogs: [log('a', 'Lunch', RECENT), log('b', 'Dinner', RECENT)] };
    const remote = envelope({ foodLogs: [log('b', 'Dinner', RECENT)], deletedIds: { a: DELETED_AT } }, 2000);

    const ids = (mergeSyncData(local, remote, 1000).data.foodLogs as { id: string }[]).map((l) => l.id);
    expect(ids).toEqual(['b']);
  });

  it('carries the tombstones forward so the next sync still honours them', () => {
    const local: SyncData = { foodLogs: [], deletedIds: { a: DELETED_AT } };
    const merged = mergeSyncData(local, envelope({ foodLogs: [log('a', 'Zombie', RECENT)] }, 2000), 1000);
    expect(merged.data.deletedIds).toMatchObject({ a: DELETED_AT });
    // Feeding the result back in must not let it return either.
    const again = mergeSyncData(merged.data, envelope({ foodLogs: [log('a', 'Zombie', RECENT)] }, 3000), 2000);
    expect(again.data.foodLogs).toHaveLength(0);
  });

  it('applies to every id-keyed list, not just food', () => {
    const local: SyncData = {
      exerciseLogs: [], recipes: [], favouriteFoods: [],
      deletedIds: { e1: DELETED_AT, r1: DELETED_AT, f1: DELETED_AT },
    };
    const remote = envelope({
      exerciseLogs: [{ id: 'e1', timestamp: RECENT }],
      recipes: [{ id: 'r1', timestamp: RECENT }],
      favouriteFoods: [{ id: 'f1' }],
    }, 2000);
    const { data } = mergeSyncData(local, remote, 1000);
    expect(data.exerciseLogs).toHaveLength(0);
    expect(data.recipes).toHaveLength(0);
    expect(data.favouriteFoods).toHaveLength(0);
  });

  it('lets a re-add win, because every add mints a new id', () => {
    // Re-logging the same meal produces a different id, so the tombstone for
    // the old one cannot suppress it.
    const local: SyncData = { foodLogs: [log('a2', 'Lunch again', LATER)], deletedIds: { a1: DELETED_AT } };
    const { data } = mergeSyncData(local, envelope({ foodLogs: [log('a1', 'Old lunch', RECENT)] }, 2000), 1000);
    expect((data.foodLogs as { id: string }[]).map((l) => l.id)).toEqual(['a2']);
  });

  it('keeps an entry whose own timestamp is newer than the deletion', () => {
    const local: SyncData = { foodLogs: [log('a', 'Edited after delete', LATER)], deletedIds: { a: DELETED_AT } };
    expect(mergeSyncData(local, envelope({}, 2000), 1000).data.foodLogs).toHaveLength(1);
  });

  it('forgets tombstones older than the row they protect', () => {
    const ancient = Date.now() - 91 * 24 * 60 * 60 * 1000;
    const merged = mergeTombstones({ old: ancient, fresh: Date.now() }, {});
    expect(merged.old).toBeUndefined();
    expect(merged.fresh).toBeDefined();
  });

  it('takes the later of two deletions of the same id', () => {
    expect(mergeTombstones({ a: DELETED_AT }, { a: LATER })).toEqual({ a: LATER });
    expect(mergeTombstones({ a: LATER }, { a: DELETED_AT })).toEqual({ a: LATER });
  });
});
