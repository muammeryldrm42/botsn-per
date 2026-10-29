export type Tier = "guclu" | "cagri" | "izle" | "zayif" | "elendi";

export type RiskLevel = "dusuk" | "orta" | "yuksek" | "cok_yuksek";

export type SafetyCoverage = "yok" | "kismi" | "tam";

export type CallStatus = "acik" | "kapandi" | "coktu";

export interface SafetyInput {
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  /** Largest non-pool wallet, percent of supply (0-100). */
  topHolderPct: number | null;
  top10HolderPct: number | null;
  /** 0-100. Null when the source does not report LP lock. */
  lpLockedPct: number | null;
  honeypot: boolean | null;
  transferFeePct: number | null;
  rugged: boolean | null;
  /** RugCheck score_normalised, 0-100, higher is worse. */
  rugcheckRisk: number | null;
  dangerFlags: string[];
  warnFlags: string[];
  devMigrations: number | null;
  devBalancePct: number | null;
}

export interface ScoreInput {
  priceUsd: number;
  priceChangeM5: number | null;
  priceChangeH1: number | null;
  priceChangeH6: number | null;
  priceChangeH24: number | null;
  volumeM5Usd: number;
  volumeH1Usd: number;
  volumeH24Usd: number;
  buysM5: number;
  sellsM5: number;
  buysH1: number;
  sellsH1: number;
  liquidityUsd: number;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  pairCreatedAtMs: number | null;
  /** Percent change in liquidity over 1h, when a source reports it. */
  liquidityChangeH1: number | null;
  safety: SafetyInput | null;
  safetyCoverage: SafetyCoverage;
}

export interface ScoreBreakdown {
  momentum: number;
  liquidity: number;
  age: number;
  market: number;
  safety: number;
}

export interface ScoreResult {
  score: number;
  tier: Tier;
  risk: RiskLevel;
  rejected: boolean;
  rejectReasons: string[];
  breakdown: ScoreBreakdown;
  reasons: string[];
  warnings: string[];
}

export interface TokenView {
  mint: string;
  symbol: string;
  name: string;
  pairAddress: string | null;
  dex: string | null;
  imageUrl: string | null;
  priceUsd: number;
  priceChange: {
    m5: number | null;
    h1: number | null;
    h6: number | null;
    h24: number | null;
  };
  volume: { m5: number; h1: number; h24: number };
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
  };
  liquidityUsd: number;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  pairCreatedAt: string | null;
  score: number;
  tier: Tier;
  risk: RiskLevel;
  rejected: boolean;
  rejectReasons: string[];
  breakdown: ScoreBreakdown;
  reasons: string[];
  warnings: string[];
  safetyCoverage: SafetyCoverage;
  safety: {
    mintAuthorityDisabled: boolean | null;
    freezeAuthorityDisabled: boolean | null;
    topHolderPct: number | null;
    top10HolderPct: number | null;
    lpLockedPct: number | null;
    transferFeePct: number | null;
    rugcheckRisk: number | null;
    dangerFlags: string[];
    warnFlags: string[];
    devBalancePct: number | null;
    devMigrations: number | null;
  } | null;
  links: {
    dexscreener: string;
    solscan: string;
    birdeye: string;
    geckoterminal: string | null;
  };
  discoveredFrom: string[];
  promoted: boolean;
  openCall: {
    calledAt: string;
    entryPrice: number;
    currentPct: number;
    maxGainPct: number;
    maxDrawdownPct: number;
    status: CallStatus;
  } | null;
}

export interface FilteredOut {
  mint: string;
  symbol: string;
  name: string;
  score: number;
  liquidityUsd: number;
  rejectReasons: string[];
}

export interface CallRecord {
  id: string;
  mint: string;
  symbol: string;
  name: string;
  pairAddress: string | null;
  imageUrl: string | null;
  calledAt: string;
  entryPrice: number;
  entryLiquidityUsd: number;
  entryMarketCapUsd: number | null;
  score: number;
  risk: RiskLevel;
  tier: Tier;
  reasons: string[];
  warnings: string[];
  breakdown: ScoreBreakdown;
  lastPrice: number;
  maxPrice: number;
  minPrice: number;
  maxGainPct: number;
  maxDrawdownPct: number;
  currentPct: number;
  lastCheckedAt: string;
  status: CallStatus;
  closeReason: string | null;
}

export interface Stats {
  total: number;
  open: number;
  mature: number;
  hitCount: number;
  /** Null until at least one mature call exists. */
  hitRate: number | null;
  rugCount: number;
  avgMaxGainPct: number | null;
  medianCurrentPct: number | null;
  targetPct: number;
}

export interface SourceStatus {
  ok: boolean;
  ms: number;
  error?: string;
  count?: number;
}

export interface SafetyCacheEntry {
  fetchedAt: string;
  safety: SafetyInput;
}

export interface Snapshot {
  version: 1;
  updatedAt: string;
  /** Set when the Vercel app itself ran the scanner. Absent on GitHub Actions snapshots. */
  producedBy?: "site";
  /** Set by the website when it overlays a fresher public price. Not persisted by the scanner. */
  livePriceAt?: string | null;
  sources: Record<string, SourceStatus>;
  tokens: TokenView[];
  filteredOut: FilteredOut[];
  calls: CallRecord[];
  stats: Stats;
  safetyCache: Record<string, SafetyCacheEntry>;
  meta: {
    discovered: number;
    scored: number;
    rejected: number;
    rugcheckFetched: number;
    newCalls: string[];
    durationMs: number;
  };
}
