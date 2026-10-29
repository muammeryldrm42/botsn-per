import { passesCallGate } from "./score";
import { THRESHOLDS } from "./thresholds";
import type { CallRecord, CallStatus, ScoreInput, ScoreResult, Stats, TokenView } from "./types";
import { mean, median } from "./num";

function roundPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

const TRACK_MS = THRESHOLDS.trackHours * 3_600_000;
const WINDOW_MS = THRESHOLDS.callWindowHours * 3_600_000;
const MATURE_MS = THRESHOLDS.matureMinutes * 60_000;

export function hasRecentCall(calls: CallRecord[], mint: string, nowMs: number): boolean {
  return calls.some((call) => {
    if (call.mint !== mint) return false;
    if (call.status === "acik") return true;
    return nowMs - Date.parse(call.calledAt) < WINDOW_MS;
  });
}

export function refreshCall(
  call: CallRecord,
  obs: {
    price: number | null;
    liquidityUsd: number | null;
    rugged: boolean;
    nowMs: number;
  },
): CallRecord {
  let last = call.lastPrice;
  let maxPrice = call.maxPrice;
  let minPrice = call.minPrice;
  if (obs.price != null && obs.price > 0 && call.entryPrice > 0) {
    last = obs.price;
    maxPrice = Math.max(maxPrice, obs.price);
    minPrice = Math.min(minPrice, obs.price);
  }

  let status: CallStatus = call.status;
  let closeReason = call.closeReason;
  if (status === "acik") {
    if (obs.rugged || (obs.liquidityUsd != null && obs.liquidityUsd < THRESHOLDS.collapseLiquidityUsd)) {
      status = "coktu";
      closeReason = obs.rugged ? "Rug işareti." : "Likidite çöktü.";
    } else if (obs.nowMs - Date.parse(call.calledAt) >= TRACK_MS) {
      status = "kapandi";
      closeReason = "48 saat doldu.";
    }
  }

  const currentPct = roundPct(call.entryPrice > 0 ? (last / call.entryPrice - 1) * 100 : 0);
  const maxGainPct = roundPct(call.entryPrice > 0 ? (maxPrice / call.entryPrice - 1) * 100 : 0);
  const maxDrawdownPct = roundPct(call.entryPrice > 0 ? (minPrice / call.entryPrice - 1) * 100 : 0);

  return {
    ...call,
    lastPrice: last,
    maxPrice,
    minPrice,
    currentPct,
    maxGainPct,
    maxDrawdownPct,
    status,
    closeReason,
    lastCheckedAt: new Date(obs.nowMs).toISOString(),
  };
}

export interface CallCandidate {
  mint: string;
  symbol: string;
  name: string;
  pairAddress: string | null;
  imageUrl: string | null;
  priceUsd: number;
  liquidityUsd: number;
  marketCapUsd: number | null;
  rugged: boolean;
  input: ScoreInput;
  result: ScoreResult;
}

export function nextCalls(
  previous: CallRecord[],
  candidates: CallCandidate[],
  nowMs: number,
  extra: Map<string, { price: number | null; liquidityUsd: number | null; rugged: boolean }> = new Map(),
): { calls: CallRecord[]; opened: CallRecord[] } {
  const byMint = new Map(candidates.map((candidate) => [candidate.mint, candidate]));
  const refreshed = previous.map((call) => {
    const candidate = byMint.get(call.mint);
    const quote = extra.get(call.mint);
    return refreshCall(call, {
      price: candidate?.priceUsd ?? quote?.price ?? null,
      liquidityUsd: candidate ? candidate.liquidityUsd : (quote?.liquidityUsd ?? null),
      rugged: candidate?.rugged ?? quote?.rugged ?? false,
      nowMs,
    });
  });

  const opened: CallRecord[] = [];
  for (const candidate of candidates) {
    if (hasRecentCall(refreshed, candidate.mint, nowMs)) continue;
    const gate = passesCallGate(candidate.result, candidate.input);
    if (!gate.ok) continue;
    if (!(candidate.priceUsd > 0)) continue;
    const calledAt = new Date(nowMs).toISOString();
    const call: CallRecord = {
      id: `${candidate.mint}:${calledAt}`,
      mint: candidate.mint,
      symbol: candidate.symbol,
      name: candidate.name,
      pairAddress: candidate.pairAddress,
      imageUrl: candidate.imageUrl,
      calledAt,
      entryPrice: candidate.priceUsd,
      entryLiquidityUsd: candidate.liquidityUsd,
      entryMarketCapUsd: candidate.marketCapUsd,
      score: candidate.result.score,
      risk: candidate.result.risk,
      tier: candidate.result.tier,
      reasons: candidate.result.reasons,
      warnings: candidate.result.warnings,
      breakdown: candidate.result.breakdown,
      lastPrice: candidate.priceUsd,
      maxPrice: candidate.priceUsd,
      minPrice: candidate.priceUsd,
      maxGainPct: 0,
      maxDrawdownPct: 0,
      currentPct: 0,
      lastCheckedAt: calledAt,
      status: "acik",
      closeReason: null,
    };
    opened.push(call);
    refreshed.push(call);
  }

  return { calls: capCalls(refreshed), opened };
}

function sameCallWindow(left: CallRecord, right: CallRecord): boolean {
  return left.mint === right.mint && Math.abs(Date.parse(left.calledAt) - Date.parse(right.calledAt)) < WINDOW_MS;
}

/** Collapse duplicate calls two writers opened for the same mint inside the 12 hour window. */
export function dedupeCalls(calls: CallRecord[]): CallRecord[] {
  const sorted = [...calls].sort(
    (left, right) => Date.parse(left.calledAt) - Date.parse(right.calledAt) || left.id.localeCompare(right.id),
  );
  const kept: CallRecord[] = [];
  for (const call of sorted) {
    const index = kept.findIndex((item) => sameCallWindow(item, call));
    if (index === -1) {
      kept.push(call);
      continue;
    }
    kept[index] = foldCalls(kept[index]!, call);
  }
  return capCalls(kept);
}

function foldCalls(earlier: CallRecord, later: CallRecord): CallRecord {
  const newerCheck = Date.parse(later.lastCheckedAt) >= Date.parse(earlier.lastCheckedAt) ? later : earlier;
  const rugged = earlier.status === "coktu" || later.status === "coktu";
  const folded: CallRecord = {
    ...newerCheck,
    id: earlier.id,
    calledAt: earlier.calledAt,
    entryPrice: earlier.entryPrice,
    entryLiquidityUsd: earlier.entryLiquidityUsd,
    entryMarketCapUsd: earlier.entryMarketCapUsd,
    maxPrice: Math.max(earlier.maxPrice, later.maxPrice),
    minPrice: Math.min(earlier.minPrice, later.minPrice),
    lastPrice: newerCheck.lastPrice,
    status: rugged ? "coktu" : newerCheck.status,
    closeReason: rugged
      ? earlier.status === "coktu"
        ? earlier.closeReason
        : later.closeReason
      : newerCheck.closeReason,
  };
  const checkedAt = Date.parse(newerCheck.lastCheckedAt);
  return refreshCall(folded, {
    price: folded.lastPrice,
    liquidityUsd: null,
    rugged: false,
    nowMs: Number.isFinite(checkedAt) ? checkedAt : Date.parse(earlier.calledAt),
  });
}

export function capCalls(calls: CallRecord[], max = 180): CallRecord[] {
  const sorted = [...calls].sort((a, b) => Date.parse(b.calledAt) - Date.parse(a.calledAt));
  if (sorted.length <= max) return sorted;
  const open = sorted.filter((call) => call.status === "acik");
  const closed = sorted.filter((call) => call.status !== "acik");
  const room = Math.max(0, max - open.length);
  return [...open, ...closed.slice(0, room)].sort((a, b) => Date.parse(b.calledAt) - Date.parse(a.calledAt));
}

export function computeStats(calls: CallRecord[], nowMs: number): Stats {
  const mature = calls.filter((call) => {
    const age = nowMs - Date.parse(call.calledAt);
    return call.status !== "acik" || age >= MATURE_MS;
  });
  const hit = mature.filter((call) => call.maxGainPct >= THRESHOLDS.hitGainPct);
  const rugs = calls.filter((call) => call.status === "coktu" || call.maxDrawdownPct <= -50);
  return {
    total: calls.length,
    open: calls.filter((call) => call.status === "acik").length,
    mature: mature.length,
    hitCount: hit.length,
    hitRate: mature.length ? hit.length / mature.length : null,
    rugCount: rugs.length,
    avgMaxGainPct: mean(mature.map((call) => call.maxGainPct)),
    medianCurrentPct: median(mature.map((call) => call.currentPct)),
    targetPct: THRESHOLDS.hitGainPct,
  };
}

export function attachOpenCalls(tokens: TokenView[], calls: CallRecord[]): TokenView[] {
  const latest = new Map<string, CallRecord>();
  for (const call of calls) {
    const prev = latest.get(call.mint);
    if (!prev || Date.parse(call.calledAt) > Date.parse(prev.calledAt)) latest.set(call.mint, call);
  }
  return tokens.map((token) => {
    const call = latest.get(token.mint);
    if (!call) return { ...token, openCall: null };
    return {
      ...token,
      openCall: {
        calledAt: call.calledAt,
        entryPrice: call.entryPrice,
        currentPct: call.currentPct,
        maxGainPct: call.maxGainPct,
        maxDrawdownPct: call.maxDrawdownPct,
        status: call.status,
      },
    };
  });
}
