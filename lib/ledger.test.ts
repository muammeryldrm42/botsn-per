import { describe, expect, it } from "vitest";
import { mergeLedgers, needsScan } from "./ledger";
import type { CallRecord, Snapshot } from "./types";

const NOW = Date.parse("2026-10-29T08:00:00.000Z");

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: "mint:2026-10-29T07:00:00.000Z",
    mint: "mint",
    symbol: "MEME",
    name: "Meme",
    pairAddress: null,
    imageUrl: null,
    calledAt: "2026-10-29T07:00:00.000Z",
    entryPrice: 1,
    entryLiquidityUsd: 20_000,
    entryMarketCapUsd: 100_000,
    score: 80,
    risk: "yuksek",
    tier: "guclu",
    reasons: [],
    warnings: [],
    breakdown: { momentum: 20, liquidity: 18, age: 15, market: 15, safety: 12 },
    lastPrice: 1,
    maxPrice: 1,
    minPrice: 1,
    maxGainPct: 0,
    maxDrawdownPct: 0,
    currentPct: 0,
    lastCheckedAt: "2026-10-29T07:00:00.000Z",
    status: "acik",
    closeReason: null,
    ...overrides,
  };
}

function snap(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    version: 1,
    updatedAt: "2026-10-29T07:30:00.000Z",
    sources: {},
    tokens: [],
    filteredOut: [],
    calls: [],
    stats: {
      total: 0,
      open: 0,
      mature: 0,
      hitCount: 0,
      hitRate: null,
      rugCount: 0,
      avgMaxGainPct: null,
      medianCurrentPct: null,
      targetPct: 25,
    },
    safetyCache: {},
    meta: { discovered: 0, scored: 0, rejected: 0, rugcheckFetched: 0, newCalls: [], durationMs: 0 },
    ...overrides,
  };
}

describe("needsScan", () => {
  it("scans when the ledger is missing or older than two minutes", () => {
    expect(needsScan(null, NOW)).toBe(true);
    expect(needsScan(new Date(NOW - 3 * 60_000).toISOString(), NOW)).toBe(true);
    expect(needsScan(new Date(NOW - 60_000).toISOString(), NOW)).toBe(false);
  });
});

describe("mergeLedgers", () => {
  it("keeps one call per mint and the wider price path", () => {
    const github = snap({
      updatedAt: "2026-10-29T07:10:00.000Z",
      calls: [call({ maxPrice: 1.2, maxGainPct: 20, lastPrice: 1.1, lastCheckedAt: "2026-10-29T07:10:00.000Z" })],
    });
    const site = snap({
      updatedAt: "2026-10-29T07:40:00.000Z",
      producedBy: "site",
      calls: [
        call({
          id: "mint:2026-10-29T07:20:00.000Z",
          calledAt: "2026-10-29T07:20:00.000Z",
          entryPrice: 1.4,
          maxPrice: 1.8,
          minPrice: 0.9,
          lastPrice: 1.5,
          lastCheckedAt: "2026-10-29T07:40:00.000Z",
        }),
      ],
      safetyCache: {
        mint: { fetchedAt: "2026-10-29T07:40:00.000Z", safety: emptySafety() },
      },
    });
    const merged = mergeLedgers([github, site], NOW);
    expect(merged?.calls).toHaveLength(1);
    expect(merged?.calls[0]?.calledAt).toBe("2026-10-29T07:00:00.000Z");
    expect(merged?.calls[0]?.entryPrice).toBe(1);
    expect(merged?.calls[0]?.maxPrice).toBe(1.8);
    expect(merged?.calls[0]?.minPrice).toBe(0.9);
    expect(merged?.calls[0]?.lastPrice).toBe(1.5);
    expect(merged?.producedBy).toBe("site");
    expect(merged?.safetyCache.mint?.fetchedAt).toBe("2026-10-29T07:40:00.000Z");
  });

  it("keeps a later call once the twelve hour window has passed", () => {
    const merged = mergeLedgers(
      [
        snap({ calls: [call({ status: "kapandi", calledAt: "2026-10-28T12:00:00.000Z", id: "old" })] }),
        snap({
          calls: [call({ calledAt: "2026-10-29T07:30:00.000Z", id: "new" })],
        }),
      ],
      NOW,
    );
    expect(merged?.calls).toHaveLength(2);
  });
});

function emptySafety() {
  return {
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: true,
    topHolderPct: 4,
    top10HolderPct: null,
    lpLockedPct: 100,
    honeypot: null,
    transferFeePct: 0,
    rugged: false,
    rugcheckRisk: 1,
    dangerFlags: [],
    warnFlags: [],
    devMigrations: 0,
    devBalancePct: 1,
  };
}
