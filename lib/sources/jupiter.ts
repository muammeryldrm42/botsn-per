import { fetchJson } from "../http";
import { cleanText, num } from "../num";
import { emptyMarket, type AuditSnap, type PartialToken } from "../scan/market";

interface JupiterWindow {
  priceChange?: number;
  liquidityChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  numBuys?: number;
  numSells?: number;
}

interface JupiterToken {
  id?: string;
  name?: string;
  symbol?: string;
  icon?: string;
  usdPrice?: number;
  liquidity?: number;
  fdv?: number;
  mcap?: number;
  launchpad?: string;
  graduatedPool?: string;
  createdAt?: string;
  firstPool?: { id?: string; createdAt?: string };
  audit?: {
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
    devBalancePercentage?: number;
    devMigrations?: number;
  };
  stats5m?: JupiterWindow;
  stats1h?: JupiterWindow;
  stats6h?: JupiterWindow;
  stats24h?: JupiterWindow;
}

function volumeOf(window: JupiterWindow | undefined): number {
  return (num(window?.buyVolume) ?? 0) + (num(window?.sellVolume) ?? 0);
}

function parseTime(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function parseJupiterToken(token: JupiterToken, source: string): PartialToken | null {
  const mint = token.id;
  if (!mint || mint.length < 32) return null;
  const market = emptyMarket();
  market.priceUsd = num(token.usdPrice);
  market.priceChangeM5 = num(token.stats5m?.priceChange);
  market.priceChangeH1 = num(token.stats1h?.priceChange);
  market.priceChangeH6 = num(token.stats6h?.priceChange);
  market.priceChangeH24 = num(token.stats24h?.priceChange);
  market.volumeM5Usd = volumeOf(token.stats5m);
  market.volumeH1Usd = volumeOf(token.stats1h);
  market.volumeH24Usd = volumeOf(token.stats24h);
  market.buysM5 = num(token.stats5m?.numBuys) ?? 0;
  market.sellsM5 = num(token.stats5m?.numSells) ?? 0;
  market.buysH1 = num(token.stats1h?.numBuys) ?? 0;
  market.sellsH1 = num(token.stats1h?.numSells) ?? 0;
  market.liquidityUsd = num(token.liquidity);
  market.fdvUsd = num(token.fdv);
  market.marketCapUsd = num(token.mcap);
  market.liquidityChangeH1 = num(token.stats1h?.liquidityChange);
  market.pairCreatedAtMs = parseTime(token.firstPool?.createdAt) ?? parseTime(token.createdAt);
  const graduated = token.graduatedPool && token.graduatedPool !== mint ? token.graduatedPool : null;
  const first = token.firstPool?.id && token.firstPool.id !== mint ? token.firstPool.id : null;
  market.pairAddress = graduated ?? first;
  market.dex = cleanText(token.launchpad, 40) || null;

  const audit: AuditSnap | null = token.audit
    ? {
        mintAuthorityDisabled:
          typeof token.audit.mintAuthorityDisabled === "boolean" ? token.audit.mintAuthorityDisabled : null,
        freezeAuthorityDisabled:
          typeof token.audit.freezeAuthorityDisabled === "boolean" ? token.audit.freezeAuthorityDisabled : null,
        topHoldersPercentage: num(token.audit.topHoldersPercentage),
        devBalancePercentage: num(token.audit.devBalancePercentage),
        devMigrations: num(token.audit.devMigrations),
      }
    : null;

  return {
    mint,
    symbol: cleanText(token.symbol, 16) || "?",
    name: cleanText(token.name, 64) || cleanText(token.symbol, 64) || "Adsız",
    imageUrl: typeof token.icon === "string" && token.icon.startsWith("http") ? token.icon : null,
    market,
    audit,
    sources: [source],
    promoted: false,
  };
}

export async function fetchJupiterList(path: string, source: string): Promise<PartialToken[]> {
  const rows = await fetchJson<JupiterToken[]>(`https://lite-api.jup.ag/tokens/v2/${path}`, {
    timeoutMs: 15_000,
  });
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => parseJupiterToken(row, source)).filter((row): row is PartialToken => row != null);
}

export async function fetchJupiterPrices(mints: string[], revalidate?: number): Promise<Record<string, number>> {
  if (!mints.length) return {};
  const data = await fetchJson<Record<string, { usdPrice?: number }>>(
    `https://lite-api.jup.ag/price/v3?ids=${mints.join(",")}`,
    { timeoutMs: 10_000, retries: 1, revalidate },
  );
  const prices: Record<string, number> = {};
  for (const [mint, row] of Object.entries(data ?? {})) {
    const price = num(row?.usdPrice);
    if (price != null && price > 0) prices[mint] = price;
  }
  return prices;
}
