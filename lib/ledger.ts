import { dedupeCalls, computeStats } from "./calls";
import { THRESHOLDS } from "./thresholds";
import type { SafetyCacheEntry, Snapshot } from "./types";

export function needsScan(updatedAt: string | null | undefined, nowMs: number, freshMs = THRESHOLDS.freshMs): boolean {
  if (!updatedAt) return true;
  const age = nowMs - Date.parse(updatedAt);
  return !Number.isFinite(age) || age > freshMs;
}

/** Union call history and the newest safety notes. The newest snapshot supplies the token list. */
export function mergeLedgers(ledgers: Array<Snapshot | null | undefined>, nowMs = Date.now()): Snapshot | null {
  const rows = ledgers.filter((item): item is Snapshot => !!item && item.version === 1 && Array.isArray(item.calls));
  if (!rows.length) return null;
  const newest = rows.reduce((best, row) => (Date.parse(row.updatedAt) > Date.parse(best.updatedAt) ? row : best));
  const safetyCache: Record<string, SafetyCacheEntry> = {};
  for (const row of rows) {
    for (const [mint, entry] of Object.entries(row.safetyCache ?? {})) {
      const previous = safetyCache[mint];
      if (!previous || Date.parse(entry.fetchedAt) > Date.parse(previous.fetchedAt)) safetyCache[mint] = entry;
    }
  }
  const calls = dedupeCalls(rows.flatMap((row) => row.calls ?? []));
  return {
    ...newest,
    calls,
    safetyCache,
    stats: computeStats(calls, nowMs),
  };
}

/** Runtime cache items are capped at 2 MB. Drop older safety notes before that. */
export function fitLedger(snapshot: Snapshot): Snapshot {
  let current = snapshot;
  if (JSON.stringify(current).length <= 1_600_000) return current;
  const safetyCache = Object.fromEntries(
    Object.entries(current.safetyCache ?? {})
      .sort((left, right) => Date.parse(right[1].fetchedAt) - Date.parse(left[1].fetchedAt))
      .slice(0, 30),
  );
  current = { ...current, safetyCache };
  if (JSON.stringify(current).length <= 1_600_000) return current;
  return { ...current, safetyCache: {} };
}
