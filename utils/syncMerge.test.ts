import { describe, it, expect } from 'vitest';
import { mergeSyncData, SyncData, SyncEnvelope } from './syncMerge';

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
