import type { Snapshot } from "./types";

export function isSnapshot(value: unknown): value is Snapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<Snapshot>;
  return (
    row.version === 1 &&
    typeof row.updatedAt === "string" &&
    Array.isArray(row.tokens) &&
    Array.isArray(row.calls) &&
    row.stats != null &&
    typeof row.stats === "object"
  );
}

export function normalizeSnapshot(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    filteredOut: snapshot.filteredOut ?? [],
    safetyCache: snapshot.safetyCache ?? {},
    sources: snapshot.sources ?? {},
    livePriceAt: snapshot.livePriceAt ?? null,
    meta: snapshot.meta ?? {
      discovered: snapshot.tokens.length,
      scored: snapshot.tokens.length,
      rejected: 0,
      rugcheckFetched: 0,
      newCalls: [],
      durationMs: 0,
    },
  };
}
