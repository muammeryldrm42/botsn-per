import { describe, expect, it } from "vitest";
import { capCalls, computeStats, hasRecentCall, nextCalls, refreshCall } from "./calls";
import { passesCallGate, scoreToken } from "./score";
import type { CallRecord, SafetyInput, ScoreInput } from "./types";

const NOW = Date.parse("2026-10-28T21:00:00.000Z");

function safety(overrides: Partial<SafetyInput> = {}): SafetyInput {
  return {
    mintAuthorityDisabled: true,
    freezeAuthorityDisabled: true,
    topHolderPct: 6,
    top10HolderPct: 28,
    lpLockedPct: 100,
    honeypot: false,
    transferFeePct: 0,
    rugged: false,
    rugcheckRisk: 5,
    dangerFlags: [],
    warnFlags: [],
    devMigrations: 0,
    devBalancePct: 2,
    ...overrides,
  };
}

function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    priceUsd: 0.00012,
    priceChangeM5: 6,
    priceChangeH1: 28,
    priceChangeH6: 40,
    priceChangeH24: 80,
    volumeM5Usd: 4_000,
    volumeH1Usd: 45_000,
    volumeH24Usd: 120_000,
    buysM5: 40,
    sellsM5: 20,
    buysH1: 180,
    sellsH1: 90,
    liquidityUsd: 55_000,
    fdvUsd: 220_000,
    marketCapUsd: 200_000,
    pairCreatedAtMs: NOW - 4 * 3_600_000,
    liquidityChangeH1: 5,
    safety: safety(),
    safetyCoverage: "tam",
    ...overrides,
  };
}

function call(overrides: Partial<CallRecord> = {}): CallRecord {
  return {
    id: "mint:2026-10-28T18:00:00.000Z",
    mint: "mint",
    symbol: "MEME",
    name: "Meme",
    pairAddress: null,
    imageUrl: null,
    calledAt: "2026-10-28T18:00:00.000Z",
    entryPrice: 1,
    entryLiquidityUsd: 40_000,
    entryMarketCapUsd: 200_000,
    score: 80,
    risk: "orta",
    tier: "guclu",
    reasons: ["Mint yetkisi kapalı."],
    warnings: [],
    breakdown: { momentum: 20, liquidity: 18, age: 15, market: 15, safety: 12 },
    lastPrice: 1,
    maxPrice: 1,
    minPrice: 1,
    maxGainPct: 0,
    maxDrawdownPct: 0,
    currentPct: 0,
    lastCheckedAt: "2026-10-28T18:00:00.000Z",
    status: "acik",
    closeReason: null,
    ...overrides,
  };
}

describe("scoreToken", () => {
  it("scores a clean early runner as a strong call and explains why", () => {
    const result = scoreToken(input(), NOW);
    const sum =
      result.breakdown.momentum +
      result.breakdown.liquidity +
      result.breakdown.age +
      result.breakdown.market +
      result.breakdown.safety;

    expect(result.score).toBe(sum);
    expect(result.score).toBe(94);
    expect(result.breakdown).toEqual({ momentum: 29, liquidity: 20, age: 15, market: 15, safety: 15 });
    expect(result.tier).toBe("guclu");
    expect(result.risk).toBe("orta");
    expect(result.rejected).toBe(false);
    expect(result.reasons.join(" ")).toContain("Mint yetkisi kapalı.");
    expect(result.reasons.join(" ")).toContain("alım");
    expect(passesCallGate(result, input()).ok).toBe(true);
  });

  it("penalises a vertical 1h candle versus a controlled impulse", () => {
    const controlled = scoreToken(input(), NOW);
    const vertical = scoreToken(input({ priceChangeH1: 400, priceChangeM5: 80 }), NOW);
    expect(vertical.breakdown.momentum).toBeLessThan(controlled.breakdown.momentum);
    expect(vertical.warnings.join(" ")).toMatch(/tepe kovalama/i);
  });

  it("rewards buy pressure over sell pressure", () => {
    const bids = scoreToken(input(), NOW);
    const asks = scoreToken(input({ buysH1: 40, sellsH1: 200 }), NOW);
    expect(bids.breakdown.momentum).toBeGreaterThan(asks.breakdown.momentum);
    expect(asks.warnings.join(" ")).toMatch(/satış/i);
  });

  it("rejects thin liquidity, honeypots, concentration and open authorities", () => {
    expect(scoreToken(input({ liquidityUsd: 3_000 }), NOW).rejectReasons.join(" ")).toMatch(/Likidite/);
    expect(scoreToken(input({ safety: safety({ honeypot: true }) }), NOW).tier).toBe("elendi");
    expect(scoreToken(input({ safety: safety({ rugged: true }) }), NOW).rejected).toBe(true);
    expect(scoreToken(input({ safety: safety({ topHolderPct: 52 }) }), NOW).rejectReasons.join(" ")).toMatch(
      /Tek cüzdan/,
    );
    const authorities = scoreToken(
      input({
        liquidityUsd: 10_000,
        safety: safety({ mintAuthorityDisabled: false, freezeAuthorityDisabled: false }),
      }),
      NOW,
    );
    expect(authorities.rejectReasons.join(" ")).toMatch(/Mint ve freeze/);
    expect(authorities.tier).toBe("elendi");
  });

  it("rejects creator rug history and a liquidity crash", () => {
    const creator = scoreToken(
      input({ safety: safety({ dangerFlags: ["Creator history of rugged tokens"], rugcheckRisk: 79 }) }),
      NOW,
    );
    expect(creator.rejected).toBe(true);
    expect(creator.rejectReasons.join(" ")).toMatch(/rugged/i);

    const crash = scoreToken(input({ liquidityChangeH1: -80, priceChangeH1: -50 }), NOW);
    expect(crash.rejectReasons.join(" ")).toMatch(/birlikte çöküyor/);
  });

  it("cuts the market score when FDV dwarfs circulating value", () => {
    const tight = scoreToken(input(), NOW);
    const diluted = scoreToken(input({ marketCapUsd: 100_000, fdvUsd: 2_500_000 }), NOW);
    expect(diluted.breakdown.market).toBeLessThan(tight.breakdown.market);
    expect(diluted.breakdown.market).toBe(5);
    expect(diluted.warnings.join(" ")).toMatch(/FDV/);
  });

  it("prefers a few-hour-old pair over a ten-day-old token", () => {
    const fresh = scoreToken(input(), NOW);
    const old = scoreToken(input({ pairCreatedAtMs: NOW - 10 * 24 * 3_600_000 }), NOW);
    expect(fresh.breakdown.age).toBe(15);
    expect(old.breakdown.age).toBe(4);
    expect(old.tier).toBe("izle");
    expect(old.warnings.join(" ")).toMatch(/bir haftadan eski/);
    expect(passesCallGate(old, input({ pairCreatedAtMs: NOW - 10 * 24 * 3_600_000 })).ok).toBe(false);
  });

  it("rejects a serial deployer", () => {
    const serial = scoreToken(input({ safety: safety({ devMigrations: 21 }) }), NOW);
    expect(serial.rejected).toBe(true);
    expect(serial.rejectReasons.join(" ")).toMatch(/seri üretici/);
    expect(passesCallGate(serial, input({ safety: safety({ devMigrations: 21 }) })).ok).toBe(false);
  });

  it("does not promote a token to a call when safety was not checked", () => {
    const blind = input({ safety: null, safetyCoverage: "yok" });
    const result = scoreToken(blind, NOW);
    expect(result.score).toBeGreaterThanOrEqual(48);
    expect(result.tier).toBe("izle");
    expect(result.risk).toBe("cok_yuksek");
    expect(passesCallGate(result, blind).ok).toBe(false);
  });

  it("caps partial Jupiter-only safety below a strong call", () => {
    const partial = input({ safetyCoverage: "kismi" });
    const result = scoreToken(partial, NOW);
    expect(result.tier).toBe("cagri");
    expect(result.risk).toBe("yuksek");
    expect(result.warnings.join(" ")).toMatch(/Jupiter/);
    expect(passesCallGate(result, partial).ok).toBe(true);
  });

  it("stays inside 0-100 for empty and extreme books", () => {
    const empty = scoreToken(
      input({
        priceUsd: 0,
        priceChangeM5: null,
        priceChangeH1: null,
        priceChangeH6: null,
        priceChangeH24: null,
        volumeM5Usd: 0,
        volumeH1Usd: 0,
        volumeH24Usd: 0,
        buysM5: 0,
        sellsM5: 0,
        buysH1: 0,
        sellsH1: 0,
        liquidityUsd: 0,
        fdvUsd: null,
        marketCapUsd: null,
        pairCreatedAtMs: null,
        liquidityChangeH1: null,
        safety: null,
        safetyCoverage: "yok",
      }),
      NOW,
    );
    expect(empty.score).toBeGreaterThanOrEqual(0);
    expect(empty.score).toBeLessThanOrEqual(100);
    expect(empty.rejected).toBe(true);

    const extreme = scoreToken(
      input({
        priceChangeM5: 10_000,
        priceChangeH1: 10_000,
        volumeH1Usd: 50_000_000,
        volumeH24Usd: 1,
        buysH1: 100_000,
        sellsH1: 1,
        liquidityUsd: 50_000_000,
        marketCapUsd: 1,
        fdvUsd: 1,
      }),
      NOW,
    );
    expect(extreme.score).toBeLessThanOrEqual(100);
    expect(extreme.breakdown.momentum).toBeLessThanOrEqual(35);
  });
});

describe("call tracking", () => {
  it("tracks max gain and drawdown from later prices", () => {
    const opened = call();
    const up = refreshCall(opened, { price: 1.5, liquidityUsd: 40_000, rugged: false, nowMs: NOW });
    expect(up.currentPct).toBeCloseTo(50);
    expect(up.maxGainPct).toBeCloseTo(50);
    expect(up.maxDrawdownPct).toBeCloseTo(0);

    const down = refreshCall(up, { price: 0.7, liquidityUsd: 40_000, rugged: false, nowMs: NOW });
    expect(down.currentPct).toBeCloseTo(-30);
    expect(down.maxGainPct).toBeCloseTo(50);
    expect(down.maxDrawdownPct).toBeCloseTo(-30);
    expect(down.status).toBe("acik");
  });

  it("ignores a non-positive price print", () => {
    const next = refreshCall(call({ lastPrice: 1.2, maxPrice: 1.2, currentPct: 20, maxGainPct: 20 }), {
      price: 0,
      liquidityUsd: 10_000,
      rugged: false,
      nowMs: NOW,
    });
    expect(next.lastPrice).toBe(1.2);
    expect(next.maxGainPct).toBeCloseTo(20);
  });

  it("closes a call when rugged, drained, or older than 48 hours", () => {
    expect(
      refreshCall(call(), { price: 1, liquidityUsd: 10_000, rugged: true, nowMs: NOW }).status,
    ).toBe("coktu");
    expect(
      refreshCall(call(), { price: 0.4, liquidityUsd: 500, rugged: false, nowMs: NOW }).closeReason,
    ).toMatch(/Likidite/);
    const old = call({ calledAt: new Date(NOW - 49 * 3_600_000).toISOString() });
    expect(refreshCall(old, { price: 1.1, liquidityUsd: 20_000, rugged: false, nowMs: NOW }).status).toBe(
      "kapandi",
    );
  });

  it("does not open a second call while one is open or still inside the window", () => {
    const candidate = {
      mint: "mint",
      symbol: "MEME",
      name: "Meme",
      pairAddress: null,
      imageUrl: null,
      priceUsd: 1.2,
      liquidityUsd: 55_000,
      marketCapUsd: 200_000,
      rugged: false,
      input: input(),
      result: scoreToken(input(), NOW),
    };
    const blocked = nextCalls([call()], [candidate], NOW);
    expect(blocked.opened).toHaveLength(0);

    const closed = call({
      status: "kapandi",
      closeReason: "48 saat doldu.",
      calledAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    });
    expect(hasRecentCall([closed], "mint", NOW)).toBe(true);

    const stale = call({
      status: "kapandi",
      calledAt: new Date(NOW - 13 * 3_600_000).toISOString(),
    });
    const again = nextCalls([stale], [candidate], NOW);
    expect(again.opened).toHaveLength(1);
    expect(again.opened[0]?.entryPrice).toBe(1.2);
    expect(again.opened[0]?.status).toBe("acik");
  });

  it("keeps open calls when the history cap is hit", () => {
    const closed = Array.from({ length: 10 }, (_, index) =>
      call({
        id: `c${index}`,
        mint: `c${index}`,
        status: "kapandi",
        calledAt: new Date(NOW - index * 3_600_000).toISOString(),
      }),
    );
    const open = call({ id: "open", mint: "open", calledAt: new Date(NOW - 100 * 3_600_000).toISOString() });
    const capped = capCalls([open, ...closed], 4);
    expect(capped.some((item) => item.id === "open")).toBe(true);
    expect(capped).toHaveLength(4);
  });

  it("counts a +25% peak as a hit only after the call has matured", () => {
    const matureHit = call({
      calledAt: new Date(NOW - 2 * 3_600_000).toISOString(),
      maxGainPct: 40,
      currentPct: 10,
      maxDrawdownPct: -5,
    });
    const fresh = call({
      id: "fresh",
      mint: "fresh",
      calledAt: new Date(NOW - 5 * 60_000).toISOString(),
      maxGainPct: 0,
    });
    const matureMiss = call({
      id: "miss",
      mint: "miss",
      calledAt: new Date(NOW - 3 * 3_600_000).toISOString(),
      maxGainPct: 10,
      currentPct: -4,
      status: "kapandi",
    });
    const stats = computeStats([matureHit, fresh, matureMiss], NOW);
    expect(stats.mature).toBe(2);
    expect(stats.hitCount).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.5);
    expect(stats.open).toBe(2);
    expect(stats.targetPct).toBe(25);
    expect(stats.avgMaxGainPct).toBeCloseTo(25);
  });
});
