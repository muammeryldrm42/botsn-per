import { BURN_OWNERS } from "../constants";
import { fetchJson } from "../http";
import { num } from "../num";
import type { SafetyInput } from "../types";

interface RugHolder {
  address?: string;
  owner?: string;
  pct?: number;
}

interface RugMarket {
  pubkey?: string;
  lp?: { lpLockedPct?: number; lpLockedUSD?: number; baseUSD?: number; quoteUSD?: number };
  liquidityAAccount?: { owner?: string };
  liquidityBAccount?: { owner?: string };
}

interface RugReport {
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  token?: { mintAuthority?: string | null; freezeAuthority?: string | null };
  score_normalised?: number;
  rugged?: boolean;
  transferFee?: { pct?: number };
  risks?: { name?: string; level?: string }[];
  markets?: RugMarket[];
  knownAccounts?: Record<string, { type?: string; name?: string }>;
  topHolders?: RugHolder[];
}

const NONE_AUTHORITY = "11111111111111111111111111111111";

function authorityDisabled(value: unknown): boolean | null {
  if (value == null) return true;
  if (typeof value !== "string") return null;
  if (value === "" || value === NONE_AUTHORITY) return true;
  return false;
}

function marketLiquidity(market: RugMarket): number {
  const lp = market.lp;
  if (!lp) return 0;
  return (num(lp.lpLockedUSD) ?? 0) + (num(lp.baseUSD) ?? 0) + (num(lp.quoteUSD) ?? 0);
}

/** Turn a RugCheck report into the safety input the scorer understands. Pool wallets are not "holders". */
export function parseRugcheck(report: RugReport): SafetyInput {
  const risks = report.risks ?? [];
  const dangerFlags = risks
    .filter((risk) => risk.level === "danger" && risk.name)
    .map((risk) => risk.name as string);
  const warnFlags = risks
    .filter((risk) => risk.level === "warn" && risk.name)
    .map((risk) => risk.name as string);

  const markets = report.markets ?? [];
  let bestLock: { liq: number; pct: number } | null = null;
  const skipOwners = new Set<string>(BURN_OWNERS);
  for (const market of markets) {
    if (market.pubkey) skipOwners.add(market.pubkey);
    if (market.liquidityAAccount?.owner) skipOwners.add(market.liquidityAAccount.owner);
    if (market.liquidityBAccount?.owner) skipOwners.add(market.liquidityBAccount.owner);
    const pct = num(market.lp?.lpLockedPct);
    if (pct == null) continue;
    const liq = marketLiquidity(market);
    if (!bestLock || liq >= bestLock.liq) bestLock = { liq, pct };
  }
  for (const [address, meta] of Object.entries(report.knownAccounts ?? {})) {
    const type = (meta.type || "").toUpperCase();
    if (type === "AMM" || type === "LOCKER" || type === "BURN" || type === "MARKET") {
      skipOwners.add(address);
    }
  }

  const holders = (report.topHolders ?? [])
    .filter((holder) => {
      if (holder.owner && skipOwners.has(holder.owner)) return false;
      if (holder.address && skipOwners.has(holder.address)) return false;
      return num(holder.pct) != null;
    })
    .sort((a, b) => (num(b.pct) ?? 0) - (num(a.pct) ?? 0));
  const topHolderPct = holders.length ? num(holders[0]?.pct) : null;
  const top10HolderPct = holders.length
    ? holders.slice(0, 10).reduce((sum, holder) => sum + (num(holder.pct) ?? 0), 0)
    : null;

  const mintAuthority = report.mintAuthority !== undefined ? report.mintAuthority : report.token?.mintAuthority;
  const freezeAuthority =
    report.freezeAuthority !== undefined ? report.freezeAuthority : report.token?.freezeAuthority;
  const mintKnown = report.mintAuthority !== undefined || report.token?.mintAuthority !== undefined;
  const freezeKnown = report.freezeAuthority !== undefined || report.token?.freezeAuthority !== undefined;

  return {
    mintAuthorityDisabled: mintKnown ? authorityDisabled(mintAuthority) : null,
    freezeAuthorityDisabled: freezeKnown ? authorityDisabled(freezeAuthority) : null,
    topHolderPct,
    top10HolderPct,
    lpLockedPct: bestLock ? bestLock.pct : null,
    honeypot: dangerFlags.some((flag) => /honeypot/i.test(flag)) ? true : null,
    transferFeePct: num(report.transferFee?.pct),
    rugged: typeof report.rugged === "boolean" ? report.rugged : null,
    rugcheckRisk: num(report.score_normalised),
    dangerFlags,
    warnFlags,
    devMigrations: null,
    devBalancePct: null,
  };
}

export async function fetchRugcheck(mint: string): Promise<SafetyInput> {
  const report = await fetchJson<RugReport>(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`, {
    timeoutMs: 18_000,
    retries: 1,
  });
  return parseRugcheck(report);
}
