import { describe, expect, it } from "vitest";
import { parseDexPairs, solanaMintsFromList } from "./dexscreener";
import { parseGeckoPools } from "./geckoterminal";
import { parseJupiterToken } from "./jupiter";

describe("source parsers", () => {
  it("reads a Jupiter memecoin and ignores a pool id that is the mint itself", () => {
    const token = parseJupiterToken(
      {
        id: "Mint1111111111111111111111111111111111111",
        symbol: "PEPE",
        name: "Pepe",
        icon: "https://cdn.example/pepe.png",
        usdPrice: 0.002,
        liquidity: 42_000,
        mcap: 180_000,
        fdv: 180_000,
        launchpad: "pump.fun",
        firstPool: { id: "Mint1111111111111111111111111111111111111", createdAt: "2026-10-28T18:00:00Z" },
        graduatedPool: "Pool1111111111111111111111111111111111111",
        audit: { mintAuthorityDisabled: true, freezeAuthorityDisabled: true, topHoldersPercentage: 4.2 },
        stats1h: { priceChange: 22, buyVolume: 8000, sellVolume: 3000, numBuys: 40, numSells: 15, liquidityChange: -5 },
        stats5m: { priceChange: 3, numBuys: 4, numSells: 1 },
      },
      "jupiter_recent",
    );
    expect(token?.market?.pairAddress).toBe("Pool1111111111111111111111111111111111111");
    expect(token?.market?.volumeH1Usd).toBe(11_000);
    expect(token?.market?.priceChangeH1).toBe(22);
    expect(token?.audit?.mintAuthorityDisabled).toBe(true);
    expect(token?.market?.pairCreatedAtMs).toBe(Date.parse("2026-10-28T18:00:00Z"));
  });

  it("keeps the SOL-quoted side of a Gecko pool and skips SOL/USDC", () => {
    const rows = parseGeckoPools(
      {
        included: [
          { id: "solana_Mint1111111111111111111111111111111111111", attributes: { address: "Mint1111111111111111111111111111111111111", symbol: "DOG", name: "Dog", image_url: "https://cdn.example/dog.png" } },
          { id: "pumpswap", attributes: { name: "PumpSwap" } },
        ],
        data: [
          {
            attributes: {
              address: "Pair111111111111111111111111111111111111",
              name: "DOG / SOL",
              pool_created_at: "2026-10-28T19:00:00Z",
              base_token_price_usd: "0.01",
              quote_token_price_usd: "100",
              reserve_in_usd: "25000",
              fdv_usd: "90000",
              market_cap_usd: null,
              price_change_percentage: { m5: "1.5", h1: "12", h6: "-4", h24: "30" },
              transactions: { m5: { buys: 3, sells: 1 }, h1: { buys: 20, sells: 10 } },
              volume_usd: { m5: "100", h1: "5000", h24: "20000" },
            },
            relationships: {
              base_token: { data: { id: "solana_Mint1111111111111111111111111111111111111" } },
              quote_token: { data: { id: "solana_So11111111111111111111111111111111111111112" } },
              dex: { data: { id: "pumpswap" } },
            },
          },
          {
            attributes: { address: "StablePair11111111111111111111111111111111", name: "USDC / SOL", reserve_in_usd: "1000000" },
            relationships: {
              base_token: { data: { id: "solana_EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" } },
              quote_token: { data: { id: "solana_So11111111111111111111111111111111111111112" } },
            },
          },
        ],
      },
      "gecko_trend",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe("DOG");
    expect(rows[0]?.market?.priceUsd).toBe(0.01);
    expect(rows[0]?.market?.liquidityUsd).toBe(25_000);
    expect(rows[0]?.market?.dex).toBe("PumpSwap");
    expect(rows[0]?.market?.buysH1).toBe(20);
  });

  it("picks the deepest DexScreener pair and ignores non-Solana rows", () => {
    const mints = solanaMintsFromList([
      { chainId: "solana", tokenAddress: "Mint1111111111111111111111111111111111111" },
      { chainId: "ethereum", tokenAddress: "0xabc" },
    ]);
    expect(mints).toEqual(["Mint1111111111111111111111111111111111111"]);

    const pairs = parseDexPairs(
      [
        {
          chainId: "solana",
          dexId: "raydium",
          pairAddress: "Shallow11111111111111111111111111111111111",
          baseToken: { address: "Mint1111111111111111111111111111111111111", symbol: "DOG", name: "Dog" },
          quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
          priceUsd: "0.01",
          liquidity: { usd: 1000 },
          priceChange: { h1: 5 },
          volume: { h1: 100 },
          txns: { h1: { buys: 2, sells: 1 } },
        },
        {
          chainId: "solana",
          dexId: "pumpswap",
          pairAddress: "Deep11111111111111111111111111111111111111",
          baseToken: { address: "Mint1111111111111111111111111111111111111", symbol: "DOG", name: "Dog" },
          quoteToken: { address: "So11111111111111111111111111111111111111112", symbol: "SOL" },
          priceUsd: "0.02",
          liquidity: { usd: 40_000 },
          priceChange: { h1: 18 },
          volume: { h1: 9000, h24: 20000 },
          txns: { h1: { buys: 30, sells: 12 } },
          info: { imageUrl: "https://cdn.example/dog.png" },
        },
      ],
      "dexscreener",
    );
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.market?.pairAddress).toBe("Deep11111111111111111111111111111111111111");
    expect(pairs[0]?.market?.priceChangeH1).toBe(18);
    expect(pairs[0]?.imageUrl).toBe("https://cdn.example/dog.png");
  });
});
