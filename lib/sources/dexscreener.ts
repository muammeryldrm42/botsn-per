import { QUOTE_MINTS } from "../constants";
import { fetchJson } from "../http";
import { cleanText, num } from "../num";
import { emptyMarket, type PartialToken } from "../scan/market";

interface DexToken {
  address?: string;
  name?: string;
  symbol?: string;
}

interface DexPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: DexToken;
  quoteToken?: DexToken;
  priceUsd?: string;
  txns?: Record<string, { buys?: number; sells?: number }>;
  volume?: Record<string, number>;
  priceChange?: Record<string, number>;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: { imageUrl?: string };
}

interface DexListItem {
  chainId?: string;
  tokenAddress?: string;
}

export function solanaMintsFromList(items: DexListItem[] | null | undefined): string[] {
  if (!Array.isArray(items)) return [];
  const mints: string[] = [];
  for (const item of items) {
    if (item?.chainId !== "solana") continue;
    if (typeof item.tokenAddress === "string" && item.tokenAddress.length >= 32) mints.push(item.tokenAddress);
  }
  return mints;
}

export function parseDexPairs(pairs: DexPair[], source: string): PartialToken[] {
  const best = new Map<string, PartialToken>();
  for (const pair of pairs) {
    if (pair.chainId && pair.chainId !== "solana") continue;
    const base = pair.baseToken?.address;
    const quote = pair.quoteToken?.address;
    if (!base || !quote) continue;
    const baseIsQuote = QUOTE_MINTS.has(base);
    const quoteIsQuote = QUOTE_MINTS.has(quote);
    if (baseIsQuote === quoteIsQuote) continue;
    const token = baseIsQuote ? pair.quoteToken : pair.baseToken;
    const mint = token?.address;
    if (!mint) continue;
    // DexScreener's priceUsd is the base token. Skip inverted books rather than mis-price them.
    if (baseIsQuote) continue;

    const market = emptyMarket();
    market.priceUsd = num(pair.priceUsd);
    market.priceChangeM5 = num(pair.priceChange?.m5);
    market.priceChangeH1 = num(pair.priceChange?.h1);
    market.priceChangeH6 = num(pair.priceChange?.h6);
    market.priceChangeH24 = num(pair.priceChange?.h24);
    market.volumeM5Usd = num(pair.volume?.m5) ?? 0;
    market.volumeH1Usd = num(pair.volume?.h1) ?? 0;
    market.volumeH24Usd = num(pair.volume?.h24) ?? 0;
    market.buysM5 = num(pair.txns?.m5?.buys) ?? 0;
    market.sellsM5 = num(pair.txns?.m5?.sells) ?? 0;
    market.buysH1 = num(pair.txns?.h1?.buys) ?? 0;
    market.sellsH1 = num(pair.txns?.h1?.sells) ?? 0;
    market.liquidityUsd = num(pair.liquidity?.usd);
    market.fdvUsd = num(pair.fdv);
    market.marketCapUsd = num(pair.marketCap);
    market.pairCreatedAtMs = num(pair.pairCreatedAt);
    market.pairAddress = pair.pairAddress ?? null;
    market.dex = cleanText(pair.dexId, 40) || null;

    const image = pair.info?.imageUrl;
    const incoming: PartialToken = {
      mint,
      symbol: cleanText(token?.symbol, 16) || "?",
      name: cleanText(token?.name, 64) || "Adsız",
      imageUrl: typeof image === "string" && image.startsWith("http") ? image : null,
      market,
      audit: null,
      sources: [source],
      promoted: false,
    };
    const prev = best.get(mint);
    if (!prev || (incoming.market?.liquidityUsd ?? 0) > (prev.market?.liquidityUsd ?? 0)) {
      best.set(mint, incoming);
    }
  }
  return [...best.values()];
}

export async function fetchDexList(path: string): Promise<string[]> {
  const data = await fetchJson<DexListItem[]>(`https://api.dexscreener.com${path}`, { timeoutMs: 12_000 });
  return solanaMintsFromList(data);
}

export async function fetchDexTokens(mints: string[]): Promise<PartialToken[]> {
  const chunks: string[][] = [];
  for (let i = 0; i < mints.length; i += 30) chunks.push(mints.slice(i, i + 30));
  const parsed: PartialToken[] = [];
  for (const chunk of chunks) {
    const pairs = await fetchJson<DexPair[]>(
      `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(",")}`,
      { timeoutMs: 15_000 },
    );
    parsed.push(...parseDexPairs(Array.isArray(pairs) ? pairs : [], "dexscreener"));
  }
  return parsed;
}
