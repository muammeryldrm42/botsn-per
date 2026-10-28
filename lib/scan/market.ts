import { THRESHOLDS } from "../thresholds";
import type { SafetyInput } from "../types";

export interface MarketSnap {
  priceUsd: number | null;
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
  liquidityUsd: number | null;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  pairCreatedAtMs: number | null;
  liquidityChangeH1: number | null;
  pairAddress: string | null;
  dex: string | null;
}

export interface AuditSnap {
  mintAuthorityDisabled: boolean | null;
  freezeAuthorityDisabled: boolean | null;
  topHoldersPercentage: number | null;
  devBalancePercentage: number | null;
  devMigrations: number | null;
}

export interface PartialToken {
  mint: string;
  symbol: string;
  name: string;
  imageUrl: string | null;
  market: MarketSnap | null;
  audit: AuditSnap | null;
  sources: string[];
  promoted: boolean;
}

export function emptyMarket(): MarketSnap {
  return {
    priceUsd: null,
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
    liquidityUsd: null,
    fdvUsd: null,
    marketCapUsd: null,
    pairCreatedAtMs: null,
    liquidityChangeH1: null,
    pairAddress: null,
    dex: null,
  };
}

function earlier(a: number | null, b: number | null): number | null {
  if (a == null) return b;
  if (b == null) return a;
  return Math.min(a, b);
}

function pickNumber(primary: number | null, fallback: number | null, allowZero = false): number | null {
  if (primary != null && (allowZero || primary > 0)) return primary;
  if (fallback != null && (allowZero || fallback > 0)) return fallback;
  return primary ?? fallback;
}

/** Fill gaps in the preferred book with the fallback book. Price changes prefer the primary source. */
export function mergeMarket(primary: MarketSnap | null, fallback: MarketSnap | null): MarketSnap | null {
  if (!primary) return fallback;
  if (!fallback) return primary;
  const primaryThin = (primary.liquidityUsd ?? 0) <= 0 && primary.volumeH1Usd <= 0 && (primary.priceUsd ?? 0) <= 0;
  const fallbackAlive =
    (fallback.liquidityUsd ?? 0) > 0 || fallback.volumeH1Usd > 0 || (fallback.priceUsd ?? 0) > 0;
  if (primaryThin && fallbackAlive) return mergeMarket(fallback, primary);

  return {
    priceUsd: pickNumber(primary.priceUsd, fallback.priceUsd),
    priceChangeM5: primary.priceChangeM5 ?? fallback.priceChangeM5,
    priceChangeH1: primary.priceChangeH1 ?? fallback.priceChangeH1,
    priceChangeH6: primary.priceChangeH6 ?? fallback.priceChangeH6,
    priceChangeH24: primary.priceChangeH24 ?? fallback.priceChangeH24,
    volumeM5Usd: primary.volumeM5Usd > 0 ? primary.volumeM5Usd : fallback.volumeM5Usd,
    volumeH1Usd: primary.volumeH1Usd > 0 ? primary.volumeH1Usd : fallback.volumeH1Usd,
    volumeH24Usd: primary.volumeH24Usd > 0 ? primary.volumeH24Usd : fallback.volumeH24Usd,
    buysM5: primary.buysM5 + primary.sellsM5 > 0 ? primary.buysM5 : fallback.buysM5,
    sellsM5: primary.buysM5 + primary.sellsM5 > 0 ? primary.sellsM5 : fallback.sellsM5,
    buysH1: primary.buysH1 + primary.sellsH1 > 0 ? primary.buysH1 : fallback.buysH1,
    sellsH1: primary.buysH1 + primary.sellsH1 > 0 ? primary.sellsH1 : fallback.sellsH1,
    liquidityUsd: pickNumber(primary.liquidityUsd, fallback.liquidityUsd),
    fdvUsd: pickNumber(primary.fdvUsd, fallback.fdvUsd),
    marketCapUsd: pickNumber(primary.marketCapUsd, fallback.marketCapUsd),
    pairCreatedAtMs: earlier(primary.pairCreatedAtMs, fallback.pairCreatedAtMs),
    liquidityChangeH1: primary.liquidityChangeH1 ?? fallback.liquidityChangeH1,
    pairAddress: primary.pairAddress ?? fallback.pairAddress,
    dex: primary.dex ?? fallback.dex,
  };
}

export function mergeAudit(primary: AuditSnap | null, extra: AuditSnap | null): AuditSnap | null {
  if (!primary) return extra;
  if (!extra) return primary;
  return {
    mintAuthorityDisabled: primary.mintAuthorityDisabled ?? extra.mintAuthorityDisabled,
    freezeAuthorityDisabled: primary.freezeAuthorityDisabled ?? extra.freezeAuthorityDisabled,
    topHoldersPercentage: primary.topHoldersPercentage ?? extra.topHoldersPercentage,
    devBalancePercentage: primary.devBalancePercentage ?? extra.devBalancePercentage,
    devMigrations: primary.devMigrations ?? extra.devMigrations,
  };
}

/** Prefer a normal CDN over IPFS or Arweave gateways, which often refuse hotlinking. */
export function preferImage(current: string | null, incoming: string | null): string | null {
  const rank = (url: string | null) => {
    if (!url || !url.startsWith("https://")) return 0;
    if (/ipfs\.io|pinata\.cloud|arweave\.net|irys\.xyz|nftstorage|w3s\.link|cf-ipfs/i.test(url)) return 1;
    return 2;
  };
  if (rank(incoming) > rank(current)) return incoming;
  return current || incoming;
}

export function mergeToken(
  current: PartialToken | undefined,
  incoming: PartialToken,
  preferIncomingMarket = false,
): PartialToken {
  if (!current) return incoming;
  const market = preferIncomingMarket
    ? mergeMarket(incoming.market, current.market)
    : mergeMarket(current.market, incoming.market);
  const symbol = current.symbol && current.symbol !== "?" ? current.symbol : incoming.symbol;
  const name = current.name && current.name !== "Adsız" ? current.name : incoming.name;
  return {
    mint: current.mint,
    symbol: symbol || incoming.symbol,
    name: name || incoming.name,
    imageUrl: preferImage(current.imageUrl, incoming.imageUrl),
    market,
    audit: mergeAudit(current.audit, incoming.audit),
    sources: [...new Set([...current.sources, ...incoming.sources])],
    promoted: current.promoted || incoming.promoted,
  };
}

export function isEstablished(mcap: number | null, createdAtMs: number | null, nowMs: number): boolean {
  if (mcap == null || mcap < THRESHOLDS.establishedMcapUsd) return false;
  if (createdAtMs == null) return true;
  return (nowMs - createdAtMs) / 86_400_000 > THRESHOLDS.establishedAgeDays;
}

export function safetyFromAudit(audit: AuditSnap | null): SafetyInput | null {
  if (!audit) return null;
  const hasSignal =
    audit.mintAuthorityDisabled != null ||
    audit.freezeAuthorityDisabled != null ||
    audit.topHoldersPercentage != null;
  if (!hasSignal) return null;
  return {
    mintAuthorityDisabled: audit.mintAuthorityDisabled,
    freezeAuthorityDisabled: audit.freezeAuthorityDisabled,
    topHolderPct: audit.topHoldersPercentage,
    top10HolderPct: null,
    lpLockedPct: null,
    honeypot: null,
    transferFeePct: null,
    rugged: null,
    rugcheckRisk: null,
    dangerFlags: [],
    warnFlags: [],
    devMigrations: audit.devMigrations,
    devBalancePct: audit.devBalancePercentage,
  };
}

export function mergeSafety(
  auditSafety: SafetyInput | null,
  rug: SafetyInput | null,
): { safety: SafetyInput | null; coverage: "yok" | "kismi" | "tam" } {
  if (rug && auditSafety) {
    return {
      coverage: "tam",
      safety: {
        ...rug,
        devMigrations: rug.devMigrations ?? auditSafety.devMigrations,
        devBalancePct: rug.devBalancePct ?? auditSafety.devBalancePct,
        topHolderPct: rug.topHolderPct ?? auditSafety.topHolderPct,
        mintAuthorityDisabled: rug.mintAuthorityDisabled ?? auditSafety.mintAuthorityDisabled,
        freezeAuthorityDisabled: rug.freezeAuthorityDisabled ?? auditSafety.freezeAuthorityDisabled,
      },
    };
  }
  if (rug) return { coverage: "tam", safety: rug };
  if (auditSafety) return { coverage: "kismi", safety: auditSafety };
  return { coverage: "yok", safety: null };
}
