/**
 * Merging two devices' data.
 *
 * This is the part that can lose a meal, so it is deliberate about every slice
 * rather than running one rule over the whole blob.
 *
 * The governing idea: **logs are additive, settings are not.** A food log from
 * the phone and a food log from the laptop are both true and both must survive,
 * so those are unioned by id. A profile or a weight goal has exactly one
 * correct current value, so those take the newer device's version wholesale.
 *
 * Taking the newer envelope for everything would silently drop whichever
 * device logged second. Unioning everything would resurrect deleted entries
 * and duplicate settings. Neither single rule is right.
 */

export const SYNC_ENVELOPE_VERSION = 1;

/** The exact object App.tsx persists to localStorage. */
export interface SyncData {
  profile?: unknown;
  metrics?: unknown;
  plan?: unknown;
  gamification?: unknown;
  foodLogs?: unknown[];
  waterLog?: unknown;
  weightHistory?: unknown[];
  favouriteFoods?: unknown[];
  lifetimeQuestsCompleted?: number;
  exerciseLogs?: unknown[];
  recipes?: unknown[];
  weightGoal?: unknown;
  /**
   * Ids this user has deleted, and when. See mergeTombstones.
   *
   * Without these a union merge is actively destructive: the other device
   * still holds the entry you deleted, so the merge faithfully restores it and
   * pushes it back — your deletion is undone on BOTH devices.
   */
  deletedIds?: Record<string, number>;
}

export interface SyncEnvelope {
  v: number;
  /** Epoch ms of the write that produced this snapshot. */
  syncedAt: number;
  data: SyncData;
}

/**
 * Tombstones expire with the stored row (90 days).
 *
 * Keeping them forever would grow the blob without limit. The risk of dropping
 * one is that a device which has been offline for over 90 days could resurrect
 * a deleted entry — by then it has long since synced, and an unbounded list is
 * the worse failure.
 */
const TOMBSTONE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

/** Union of both devices' deletions, latest wins, expired ones dropped. */
export const mergeTombstones = (
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
  now: number = Date.now(),
): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const source of [a ?? {}, b ?? {}]) {
    for (const [id, at] of Object.entries(source)) {
      const when = Number(at) || 0;
      if (now - when > TOMBSTONE_TTL_MS) continue;
      if (!out[id] || when > out[id]) out[id] = when;
    }
  }
  return out;
};

const asArray = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

const timeOf = (entry: Record<string, unknown>): number => {
  const t = Number(entry?.timestamp);
  return Number.isFinite(t) ? t : 0;
};

/**
 * Union two lists on a key, keeping the better copy of any duplicate.
 *
 * Ids are generated per device, so the same real meal logged on both phones
 * would appear twice — that is correct and not something this can detect. What
 * it does guarantee is that one id never appears twice in the output.
 */
const unionBy = (
  key: string,
  local: unknown,
  remote: unknown,
  better: (a: Record<string, unknown>, b: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown>[] => {
  const merged = new Map<string, Record<string, unknown>>();
  for (const entry of [...asArray(local), ...asArray(remote)]) {
    const id = entry?.[key];
    if (id === undefined || id === null) continue;   // unkeyed rows cannot be merged safely
    const existing = merged.get(String(id));
    merged.set(String(id), existing ? better(existing, entry) : entry);
  }
  return [...merged.values()];
};

/** Later timestamp wins; ties keep the first seen, which is the local copy. */
const newerByTimestamp = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  timeOf(b) > timeOf(a) ? b : a;

/** For date-keyed rows there is no timestamp, so the remote copy is a no-op. */
const keepFirst = (a: Record<string, unknown>) => a;

export interface MergeResult {
  data: SyncData;
  /** What changed, for the UI to report honestly rather than saying "synced". */
  summary: { added: number; fromRemote: boolean };
}

/**
 * Merge a remote snapshot into local data.
 *
 * `localSyncedAt` is when THIS device last wrote. Settings follow whichever
 * side is newer; logs are unioned regardless, because a log the other device
 * has and this one does not is new information no matter which clock is ahead.
 */
export const mergeSyncData = (
  local: SyncData,
  remote: SyncEnvelope | null,
  localSyncedAt: number,
): MergeResult => {
  if (!remote?.data) return { data: local, summary: { added: 0, fromRemote: false } };

  const remoteIsNewer = Number(remote.syncedAt) > Number(localSyncedAt);
  const r = remote.data;

  const deletedIds = mergeTombstones(local.deletedIds, r.deletedIds);

  /**
   * Drop anything either device has deleted.
   *
   * Applied AFTER the union, because the union is what resurrects it. An entry
   * survives its own tombstone only if it was touched after the deletion —
   * which in practice never happens, since every add mints a fresh id.
   */
  const alive = (rows: Record<string, unknown>[]) =>
    rows.filter((row) => {
      const deletedAt = deletedIds[String(row.id)];
      return deletedAt === undefined || timeOf(row) > deletedAt;
    });

  const foodLogs = alive(unionBy('id', local.foodLogs, r.foodLogs, newerByTimestamp));
  const exerciseLogs = alive(unionBy('id', local.exerciseLogs, r.exerciseLogs, newerByTimestamp));
  const recipes = alive(unionBy('id', local.recipes, r.recipes, newerByTimestamp));
  const favouriteFoods = alive(unionBy('id', local.favouriteFoods, r.favouriteFoods, keepFirst));
  const weightHistory = unionBy('date', local.weightHistory, r.weightHistory, keepFirst)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const added =
    (foodLogs.length - asArray(local.foodLogs).length) +
    (exerciseLogs.length - asArray(local.exerciseLogs).length) +
    (recipes.length - asArray(local.recipes).length) +
    (weightHistory.length - asArray(local.weightHistory).length);

  /** Single-valued state: the newer device wins outright. */
  const pick = <T>(localValue: T, remoteValue: T): T =>
    remoteIsNewer && remoteValue !== undefined ? remoteValue : localValue;

  return {
    data: {
      ...local,
      profile: pick(local.profile, r.profile),
      metrics: pick(local.metrics, r.metrics),
      plan: pick(local.plan, r.plan),
      weightGoal: pick(local.weightGoal, r.weightGoal),
      // Water is a single row per day, so a same-day edit on both devices keeps
      // only the newer one. Fixing that properly needs per-field timestamps the
      // schema does not have; it is a known limit, not an oversight.
      waterLog: pick(local.waterLog, r.waterLog),
      // XP only ever goes up, so the larger value is the safe merge — taking
      // the newer device's would hand back levels the user already earned.
      gamification: mergeGamification(local.gamification, r.gamification, remoteIsNewer),
      lifetimeQuestsCompleted: Math.max(
        Number(local.lifetimeQuestsCompleted) || 0,
        Number(r.lifetimeQuestsCompleted) || 0,
      ),
      foodLogs, exerciseLogs, recipes, favouriteFoods, weightHistory,
      deletedIds,
    },
    summary: { added: Math.max(0, added), fromRemote: true },
  };
};

/**
 * Progression never goes backwards.
 *
 * Badges union and XP takes the maximum, so syncing can only ever add to what
 * the user has earned. Everything else follows the newer device.
 */
const mergeGamification = (local: unknown, remote: unknown, remoteIsNewer: boolean): unknown => {
  const l = (local ?? {}) as Record<string, unknown>;
  const rm = (remote ?? {}) as Record<string, unknown>;
  if (remote === undefined) return local;

  const base = remoteIsNewer ? { ...l, ...rm } : { ...rm, ...l };
  return {
    ...base,
    xp: Math.max(Number(l.xp) || 0, Number(rm.xp) || 0),
    level: Math.max(Number(l.level) || 1, Number(rm.level) || 1),
    streak: Math.max(Number(l.streak) || 0, Number(rm.streak) || 0),
    badges: [...new Set([
      ...(Array.isArray(l.badges) ? l.badges : []),
      ...(Array.isArray(rm.badges) ? rm.badges : []),
    ])],
  };
};
