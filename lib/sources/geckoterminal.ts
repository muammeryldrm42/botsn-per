import { QUOTE_MINTS } from "../constants";
import { fetchJson } from "../http";
import { cleanText, num } from "../num";
import { emptyMarket, type PartialToken } from "../scan/market";

interface GeckoToken {
  id?: string;
  attributes?: {
    address?: string;
    name?: string;
    symbol?: string;
    image_url?: string;
  };
}

interface GeckoPool {
  attributes?: {
    address?: string;
    name?: string;
    pool_created_at?: string;
    base_token_price_usd?: string;
    quote_token_price_usd?: string;
    fdv_usd?: string | null;
    market_cap_usd?: string | null;
    reserve_in_usd?: string;
    price_change_percentage?: Record<string, string>;
    transactions?: Record<string, { buys?: number; sells?: number }>;
    volume_usd?: Record<string, string>;
  };
  relationships?: {
    base_token?: { data?: { id?: string } };
    quote_token?: { data?: { id?: string } };
    dex?: { data?: { id?: string } };
  };
}

interface GeckoPayload {
  data?: GeckoPool[];
  included?: GeckoToken[];
}

function mintOf(id: string | undefined): string | null {
  if (!id) return null;
  const mint = id.includes("_") ? id.split("_").slice(1).join("_") : id;
  return mint.length >= 32 ? mint : null;
}

export function parseGeckoPools(payload: GeckoPayload, source: string): PartialToken[] {
  const tokens = new Map<string, GeckoToken["attributes"]>();
  const dexNames = new Map<string, string>();
  for (const item of payload.included ?? []) {
    if (!item || typeof item !== "object" || !("id" in item)) continue;
    const id = (item as { id?: string }).id;
    if (!id) continue;
    const attrs = (item as { attributes?: { name?: string; address?: string } }).attributes;
    if (id.startsWith("solana_") && attrs && "address" in attrs) tokens.set(id, attrs);
    else if (attrs?.name) dexNames.set(id, attrs.name);
  }

  const parsed: PartialToken[] = [];
  for (const pool of payload.data ?? []) {
    const baseId = pool.relationships?.base_token?.data?.id;
    const quoteId = pool.relationships?.quote_token?.data?.id;
    const baseMint = mintOf(baseId);
    const quoteMint = mintOf(quoteId);
    if (!baseMint || !quoteMint) continue;

    const baseIsQuote = QUOTE_MINTS.has(baseMint);
    const quoteIsQuote = QUOTE_MINTS.has(quoteMint);
    if (baseIsQuote && quoteIsQuote) continue;
    if (!baseIsQuote && !quoteIsQuote) continue;

    const tokenMint = baseIsQuote ? quoteMint : baseMint;
    const attrs = pool.attributes ?? {};
    const change = attrs.price_change_percentage ?? {};
    const tx = attrs.transactions ?? {};
    const vol = attrs.volume_usd ?? {};
    const market = emptyMarket();
    market.priceUsd = num(baseIsQuote ? attrs.quote_token_price_usd : attrs.base_token_price_usd);
    market.priceChangeM5 = num(change.m5);
    market.priceChangeH1 = num(change.h1);
    market.priceChangeH6 = num(change.h6);
    market.priceChangeH24 = num(change.h24);
    market.volumeM5Usd = num(vol.m5) ?? 0;
    market.volumeH1Usd = num(vol.h1) ?? 0;
    market.volumeH24Usd = num(vol.h24) ?? 0;
    market.buysM5 = num(tx.m5?.buys) ?? 0;
    market.sellsM5 = num(tx.m5?.sells) ?? 0;
    market.buysH1 = num(tx.h1?.buys) ?? 0;
    market.sellsH1 = num(tx.h1?.sells) ?? 0;
    market.liquidityUsd = num(attrs.reserve_in_usd);
    market.fdvUsd = num(attrs.fdv_usd);
    market.marketCapUsd = num(attrs.market_cap_usd);
    market.pairCreatedAtMs = attrs.pool_created_at ? Date.parse(attrs.pool_created_at) : null;
    if (market.pairCreatedAtMs != null && !Number.isFinite(market.pairCreatedAtMs)) market.pairCreatedAtMs = null;
    market.pairAddress = attrs.address ?? null;
    const dexId = pool.relationships?.dex?.data?.id;
    market.dex = (dexId && dexNames.get(dexId)) || dexId || null;

    const meta = tokens.get(baseIsQuote ? quoteId! : baseId!);
    parsed.push({
      mint: tokenMint,
      symbol: cleanText(meta?.symbol, 16) || cleanText(attrs.name?.split("/")[0], 16) || "?",
      name: cleanText(meta?.name, 64) || cleanText(attrs.name, 64) || "Adsız",
      imageUrl: typeof meta?.image_url === "string" && meta.image_url.startsWith("http") ? meta.image_url : null,
      market,
      audit: null,
      sources: [source],
      promoted: false,
    });
  }
  return parsed;
}

export async function fetchGeckoPools(kind: "new_pools" | "trending_pools", source: string): Promise<PartialToken[]> {
  const payload = await fetchJson<GeckoPayload>(
    `https://api.geckoterminal.com/api/v2/networks/solana/${kind}?page=1&include=base_token,quote_token,dex`,
    { timeoutMs: 15_000 },
  );
  return parseGeckoPools(payload, source);
}
