import { nextCalls, attachOpenCalls, computeStats, type CallCandidate } from "../calls";
import { DENY_MINTS, DENY_SYMBOLS, tokenLinks } from "../constants";
import { sleep } from "../http";
import { uniq } from "../num";
import { scoreToken } from "../score";
import { fetchDexList, fetchDexTokens } from "../sources/dexscreener";
import { fetchGeckoPools } from "../sources/geckoterminal";
import { fetchJupiterList, fetchJupiterPrices } from "../sources/jupiter";
import { THRESHOLDS } from "../thresholds";
import type { SafetyCacheEntry, ScoreInput, ScoreResult, Snapshot, SourceStatus, TokenView } from "../types";
import { isEstablished, mergeSafety, mergeToken, safetyFromAudit, type PartialToken } from "./market";
import { fetchRugcheck } from "./rugcheck";

const TOKEN_CAP = 70;
const RUG_LIMIT = 12;
const RUG_DELAY_MS = 400;

async function timed<T>(
  sources: Record<string, SourceStatus>,
  name: string,
  fn: () => Promise<T>,
  count?: (value: T) => number,
): Promise<T | null> {
  const started = Date.now();
  try {
    const value = await fn();
    sources[name] = { ok: true, ms: Date.now() - started, count: count?.(value) };
    return value;
  } catch (error) {
    sources[name] = {
      ok: false,
      ms: Date.now() - started,
      error: error instanceof Error ? error.message.slice(0, 180) : String(error).slice(0, 180),
    };
    return null;
  }
}

function toInput(token: PartialToken, cache: Record<string, SafetyCacheEntry>): ScoreInput {
  const market = token.market;
  const merged = mergeSafety(safetyFromAudit(token.audit), cache[token.mint]?.safety ?? null);
  return {
    priceUsd: market?.priceUsd ?? 0,
    priceChangeM5: market?.priceChangeM5 ?? null,
    priceChangeH1: market?.priceChangeH1 ?? null,
    priceChangeH6: market?.priceChangeH6 ?? null,
    priceChangeH24: market?.priceChangeH24 ?? null,
    volumeM5Usd: market?.volumeM5Usd ?? 0,
    volumeH1Usd: market?.volumeH1Usd ?? 0,
    volumeH24Usd: market?.volumeH24Usd ?? 0,
    buysM5: market?.buysM5 ?? 0,
    sellsM5: market?.sellsM5 ?? 0,
    buysH1: market?.buysH1 ?? 0,
    sellsH1: market?.sellsH1 ?? 0,
    liquidityUsd: market?.liquidityUsd ?? 0,
    fdvUsd: market?.fdvUsd ?? null,
    marketCapUsd: market?.marketCapUsd ?? null,
    pairCreatedAtMs: market?.pairCreatedAtMs ?? null,
    liquidityChangeH1: market?.liquidityChangeH1 ?? null,
    safety: merged.safety,
    safetyCoverage: merged.coverage,
  };
}

function withPromo(result: ScoreResult, promoted: boolean): ScoreResult {
  if (!promoted) return result;
  return {
    ...result,
    warnings: uniq([
      ...result.warnings,
      "DexScreener'da öne çıkarılmış olabilir; bu bir kalite puanı değildir.",
    ]).slice(0, 6),
  };
}

function toView(
  token: PartialToken,
  result: ScoreResult,
  merged: ReturnType<typeof mergeSafety>,
): TokenView {
  const market = token.market;
  return {
    mint: token.mint,
    symbol: token.symbol,
    name: token.name,
    pairAddress: market?.pairAddress ?? null,
    dex: market?.dex ?? null,
    imageUrl: token.imageUrl,
    priceUsd: market?.priceUsd ?? 0,
    priceChange: {
      m5: market?.priceChangeM5 ?? null,
      h1: market?.priceChangeH1 ?? null,
      h6: market?.priceChangeH6 ?? null,
      h24: market?.priceChangeH24 ?? null,
    },
    volume: {
      m5: market?.volumeM5Usd ?? 0,
      h1: market?.volumeH1Usd ?? 0,
      h24: market?.volumeH24Usd ?? 0,
    },
    txns: {
      m5: { buys: market?.buysM5 ?? 0, sells: market?.sellsM5 ?? 0 },
      h1: { buys: market?.buysH1 ?? 0, sells: market?.sellsH1 ?? 0 },
    },
    liquidityUsd: market?.liquidityUsd ?? 0,
    fdvUsd: market?.fdvUsd ?? null,
    marketCapUsd: market?.marketCapUsd ?? null,
    pairCreatedAt: market?.pairCreatedAtMs ? new Date(market.pairCreatedAtMs).toISOString() : null,
    score: result.score,
    tier: result.tier,
    risk: result.risk,
    rejected: result.rejected,
    rejectReasons: result.rejectReasons,
    breakdown: result.breakdown,
    reasons: result.reasons,
    warnings: result.warnings,
    safetyCoverage: merged.coverage,
    safety: viewSafety(merged),
    links: tokenLinks(token.mint, market?.pairAddress ?? null),
    discoveredFrom: token.sources,
    promoted: token.promoted,
    openCall: null,
  };
}

function viewSafety(merged: ReturnType<typeof mergeSafety>): TokenView["safety"] {
  if (!merged.safety) return null;
  const safety = merged.safety;
  return {
    mintAuthorityDisabled: safety.mintAuthorityDisabled,
    freezeAuthorityDisabled: safety.freezeAuthorityDisabled,
    topHolderPct: safety.topHolderPct,
    top10HolderPct: safety.top10HolderPct,
    lpLockedPct: safety.lpLockedPct,
    transferFeePct: safety.transferFeePct,
    rugcheckRisk: safety.rugcheckRisk,
    dangerFlags: safety.dangerFlags,
    warnFlags: safety.warnFlags,
    devBalancePct: safety.devBalancePct,
    devMigrations: safety.devMigrations,
  };
}

function pickDexTargets(book: Map<string, PartialToken>, promo: string[]): string[] {
  const ranked = [...book.values()]
    .filter((token) => !DENY_MINTS.has(token.mint) && !DENY_SYMBOLS.has(token.symbol.toUpperCase()))
    .map((token) => ({
      mint: token.mint,
      heat: (token.market?.volumeH1Usd ?? 0) + (token.market?.liquidityUsd ?? 0),
    }))
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 45)
    .map((token) => token.mint);
  return [...new Set([...ranked, ...promo])].slice(0, 60);
}

function pruneCache(cache: Record<string, SafetyCacheEntry>, keep = 250): Record<string, SafetyCacheEntry> {
  return Object.fromEntries(
    Object.entries(cache)
      .sort((a, b) => Date.parse(b[1].fetchedAt) - Date.parse(a[1].fetchedAt))
      .slice(0, keep),
  );
}

/**
 * Discover Solana memecoins from keyless public APIs, score them, refresh
 * RugCheck for the shortlist, and fold the result into call history.
 */
export async function runScan(previous: Snapshot | null, now = new Date()): Promise<Snapshot> {
  const started = Date.now();
  const nowMs = now.getTime();
  const sources: Record<string, SourceStatus> = {};
  const book = new Map<string, PartialToken>();

  const absorb = (tokens: PartialToken[] | null, preferIncomingMarket = false) => {
    for (const token of tokens ?? []) {
      book.set(token.mint, mergeToken(book.get(token.mint), token, preferIncomingMarket));
    }
  };

  const [recent, trend5m, trend1h, traded1h, geckoNew, geckoTrend, boosts, boostTop, profiles, cto] =
    await Promise.all([
      timed(sources, "jupiter_recent", () => fetchJupiterList("recent", "jupiter_recent"), (rows) => rows.length),
      timed(
        sources,
        "jupiter_trend_5m",
        () => fetchJupiterList("toptrending/5m?limit=40", "jupiter_trend"),
        (rows) => rows.length,
      ),
      timed(
        sources,
        "jupiter_trend_1h",
        () => fetchJupiterList("toptrending/1h?limit=30", "jupiter_trend"),
        (rows) => rows.length,
      ),
      timed(
        sources,
        "jupiter_traded_1h",
        () => fetchJupiterList("toptraded/1h?limit=30", "jupiter_traded"),
        (rows) => rows.length,
      ),
      timed(sources, "gecko_new", () => fetchGeckoPools("new_pools", "gecko_new"), (rows) => rows.length),
      timed(sources, "gecko_trend", () => fetchGeckoPools("trending_pools", "gecko_trend"), (rows) => rows.length),
      timed(sources, "dex_boosts_latest", () => fetchDexList("/token-boosts/latest/v1"), (rows) => rows.length),
      timed(sources, "dex_boosts_top", () => fetchDexList("/token-boosts/top/v1"), (rows) => rows.length),
      timed(sources, "dex_profiles", () => fetchDexList("/token-profiles/latest/v1"), (rows) => rows.length),
      timed(sources, "dex_cto", () => fetchDexList("/community-takeovers/latest/v1"), (rows) => rows.length),
    ]);

  const promoted = new Set([...(boosts ?? []), ...(boostTop ?? []), ...(profiles ?? []), ...(cto ?? [])]);
  absorb(recent);
  absorb(trend5m);
  absorb(trend1h);
  absorb(traded1h);
  absorb(geckoNew);
  absorb(geckoTrend);

  const missingPromo = [...promoted].filter((mint) => !book.has(mint) && !DENY_MINTS.has(mint));
  const dexTokens = await timed(
    sources,
    "dex_tokens",
    () => fetchDexTokens(pickDexTargets(book, missingPromo)),
    (rows) => rows.length,
  );
  absorb(dexTokens, true);
  for (const mint of promoted) {
    const token = book.get(mint);
    if (token) token.promoted = true;
  }

  if (!Object.values(sources).some((status) => status.ok)) {
    throw new Error("Tüm veri kaynakları başarısız. Önceki snapshot korunuyor.");
  }

  const eligible = [...book.values()].filter((token) => {
    if (DENY_MINTS.has(token.mint)) return false;
    if (DENY_SYMBOLS.has(token.symbol.toUpperCase())) return false;
    const cap = token.market?.marketCapUsd ?? token.market?.fdvUsd ?? null;
    return !isEstablished(cap, token.market?.pairCreatedAtMs ?? null, nowMs);
  });
  if (!eligible.length) {
    throw new Error("Tarama token üretemedi. Önceki snapshot korunuyor.");
  }

  const cache: Record<string, SafetyCacheEntry> = { ...(previous?.safetyCache ?? {}) };
  const openMints = new Set((previous?.calls ?? []).filter((call) => call.status === "acik").map((call) => call.mint));

  const ranked = eligible
    .map((token) => ({ token, result: scoreToken(toInput(token, cache), nowMs) }))
    .sort((a, b) => b.result.score - a.result.score);

  const toCheck: string[] = [];
  for (const row of ranked) {
    if (toCheck.length >= RUG_LIMIT) break;
    if ((row.token.market?.liquidityUsd ?? 0) < THRESHOLDS.displayLiquidityUsd) continue;
    if (row.result.score < 42 && !openMints.has(row.token.mint)) continue;
    const cached = cache[row.token.mint];
    if (cached && nowMs - Date.parse(cached.fetchedAt) < 40 * 60_000) continue;
    toCheck.push(row.token.mint);
  }
  for (const mint of openMints) {
    if (toCheck.length >= RUG_LIMIT + 4) break;
    if (toCheck.includes(mint)) continue;
    const cached = cache[mint];
    if (cached && nowMs - Date.parse(cached.fetchedAt) < 20 * 60_000) continue;
    toCheck.push(mint);
  }

  const rugStarted = Date.now();
  let rugcheckFetched = 0;
  let rugcheckFailed = 0;
  for (const mint of toCheck) {
    try {
      const safety = await fetchRugcheck(mint);
      cache[mint] = { fetchedAt: new Date(nowMs).toISOString(), safety };
      rugcheckFetched += 1;
    } catch (error) {
      rugcheckFailed += 1;
      console.warn(`RugCheck ${mint}: ${error instanceof Error ? error.message : error}`);
    }
    await sleep(RUG_DELAY_MS);
  }
  sources.rugcheck = {
    ok: rugcheckFailed === 0 || rugcheckFetched > 0,
    ms: Date.now() - rugStarted,
    count: rugcheckFetched,
    error: rugcheckFailed ? `${rugcheckFailed} istek başarısız` : undefined,
  };

  const finalRows = eligible
    .map((token) => {
      const result = withPromo(scoreToken(toInput(token, cache), nowMs), token.promoted);
      return { token, result, input: toInput(token, cache) };
    })
    .sort((a, b) => b.result.score - a.result.score || (b.token.market?.volumeH1Usd ?? 0) - (a.token.market?.volumeH1Usd ?? 0));

  const candidates: CallCandidate[] = finalRows.map((row) => ({
    mint: row.token.mint,
    symbol: row.token.symbol,
    name: row.token.name,
    pairAddress: row.token.market?.pairAddress ?? null,
    imageUrl: row.token.imageUrl,
    priceUsd: row.token.market?.priceUsd ?? 0,
    liquidityUsd: row.token.market?.liquidityUsd ?? 0,
    marketCapUsd: row.token.market?.marketCapUsd ?? null,
    rugged: row.input.safety?.rugged === true,
    input: row.input,
    result: row.result,
  }));

  const missingOpen = [...openMints].filter((mint) => !book.has(mint));
  const extra = new Map<string, { price: number | null; liquidityUsd: number | null; rugged: boolean }>();
  if (missingOpen.length) {
    const prices = await timed(sources, "jupiter_open_prices", () => fetchJupiterPrices(missingOpen.slice(0, 40)), (rows) =>
      Object.keys(rows).length,
    );
    for (const mint of missingOpen) {
      const cached = cache[mint];
      const fresh = cached != null && nowMs - Date.parse(cached.fetchedAt) < 3 * 3_600_000;
      extra.set(mint, {
        price: prices?.[mint] ?? null,
        liquidityUsd: null,
        rugged: fresh && cached?.safety.rugged === true,
      });
    }
  }

  const { calls, opened } = nextCalls(previous?.calls ?? [], candidates, nowMs, extra);

  const visible = finalRows
    .filter((row) => openMints.has(row.token.mint) || opened.some((call) => call.mint === row.token.mint) || (!row.result.rejected && row.result.score >= 40))
    .slice(0, TOKEN_CAP);

  const tokens = attachOpenCalls(
    visible.map((row) =>
      toView(row.token, row.result, mergeSafety(safetyFromAudit(row.token.audit), cache[row.token.mint]?.safety ?? null)),
    ),
    calls,
  );

  const filteredOut = finalRows
    .filter((row) => row.result.rejected && (row.token.market?.liquidityUsd ?? 0) >= THRESHOLDS.displayLiquidityUsd)
    .slice(0, 8)
    .map((row) => ({
      mint: row.token.mint,
      symbol: row.token.symbol,
      name: row.token.name,
      score: row.result.score,
      liquidityUsd: row.token.market?.liquidityUsd ?? 0,
      rejectReasons: row.result.rejectReasons,
    }));

  return {
    version: 1,
    updatedAt: new Date(nowMs).toISOString(),
    livePriceAt: null,
    sources,
    tokens,
    filteredOut,
    calls,
    stats: computeStats(calls, nowMs),
    safetyCache: pruneCache(cache),
    meta: {
      discovered: book.size,
      scored: eligible.length,
      rejected: finalRows.filter((row) => row.result.rejected).length,
      rugcheckFetched,
      newCalls: opened.map((call) => call.symbol),
      durationMs: Date.now() - started,
    },
  };
}
