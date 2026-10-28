import { describe, expect, it } from "vitest";
import { isEstablished, mergeMarket, mergeSafety, preferImage, safetyFromAudit, emptyMarket } from "./market";
import { parseRugcheck } from "./rugcheck";

describe("parseRugcheck", () => {
  it("ignores pool and AMM wallets when measuring holder concentration", () => {
    const safety = parseRugcheck({
      mintAuthority: null,
      freezeAuthority: null,
      score_normalised: 12,
      rugged: false,
      transferFee: { pct: 0 },
      risks: [{ name: "Copycat token", level: "warn" }],
      markets: [
        {
          pubkey: "POOL",
          lp: { lpLockedPct: 99, lpLockedUSD: 40_000 },
          liquidityAAccount: { owner: "POOL" },
        },
      ],
      knownAccounts: { AMM1: { type: "AMM", name: "Pump Fun" } },
      topHolders: [
        { pct: 60, owner: "POOL", address: "VAULT" },
        { pct: 20, owner: "AMM1", address: "X" },
        { pct: 9.5, owner: "WALLET", address: "Y" },
        { pct: 4, owner: "OTHER", address: "Z" },
      ],
    });

    expect(safety.topHolderPct).toBe(9.5);
    expect(safety.top10HolderPct).toBeCloseTo(13.5);
    expect(safety.lpLockedPct).toBe(99);
    expect(safety.mintAuthorityDisabled).toBe(true);
    expect(safety.freezeAuthorityDisabled).toBe(true);
    expect(safety.rugcheckRisk).toBe(12);
    expect(safety.rugged).toBe(false);
    expect(safety.warnFlags).toEqual(["Copycat token"]);
  });

  it("keeps the lock ratio of the deepest market", () => {
    const safety = parseRugcheck({
      mintAuthority: "MintAuth11111111111111111111111111111111",
      freezeAuthority: null,
      markets: [
        { pubkey: "TINY", lp: { lpLockedPct: 0, baseUSD: 10 } },
        { pubkey: "DEEP", lp: { lpLockedPct: 100, baseUSD: 80_000 } },
      ],
      topHolders: [],
    });
    expect(safety.lpLockedPct).toBe(100);
    expect(safety.mintAuthorityDisabled).toBe(false);
  });
});

describe("market merge", () => {
  it("keeps DexScreener price changes and fills a missing liquidity figure", () => {
    const dex = emptyMarket();
    dex.priceUsd = 0.1;
    dex.priceChangeH1 = 12;
    dex.volumeH1Usd = 1_000;
    dex.liquidityUsd = null;
    dex.pairAddress = "PAIR";

    const gecko = emptyMarket();
    gecko.priceUsd = 0.09;
    gecko.priceChangeH1 = -4;
    gecko.volumeH1Usd = 50_000;
    gecko.liquidityUsd = 30_000;
    gecko.pairCreatedAtMs = 10;
    dex.pairCreatedAtMs = 50;

    const merged = mergeMarket(dex, gecko);
    expect(merged?.priceUsd).toBe(0.1);
    expect(merged?.priceChangeH1).toBe(12);
    expect(merged?.volumeH1Usd).toBe(1_000);
    expect(merged?.liquidityUsd).toBe(30_000);
    expect(merged?.pairAddress).toBe("PAIR");
    expect(merged?.pairCreatedAtMs).toBe(10);
  });

  it("drops a dead primary book in favour of a live fallback", () => {
    const dead = emptyMarket();
    const live = emptyMarket();
    live.priceUsd = 0.2;
    live.liquidityUsd = 12_000;
    expect(mergeMarket(dead, live)?.priceUsd).toBe(0.2);
  });

  it("prefers a CDN logo over an IPFS gateway", () => {
    expect(
      preferImage("https://ipfs.io/ipfs/abc", "https://cdn.dexscreener.com/cms/images/x"),
    ).toBe("https://cdn.dexscreener.com/cms/images/x");
    expect(preferImage("https://cdn.dexscreener.com/cms/images/x", null)).toBe(
      "https://cdn.dexscreener.com/cms/images/x",
    );
  });

  it("treats a multi-million-dollar month-old asset as established", () => {
    const now = Date.parse("2026-10-28T00:00:00.000Z");
    expect(isEstablished(40_000_000, now - 40 * 86_400_000, now)).toBe(true);
    expect(isEstablished(40_000_000, now - 2 * 86_400_000, now)).toBe(false);
    expect(isEstablished(500_000, null, now)).toBe(false);
  });

  it("upgrades partial audit safety when RugCheck arrives", () => {
    const audit = safetyFromAudit({
      mintAuthorityDisabled: true,
      freezeAuthorityDisabled: true,
      topHoldersPercentage: 4,
      devBalancePercentage: 3,
      devMigrations: 1,
    });
    const rug = safetyFromAudit(null);
    expect(rug).toBeNull();
    const merged = mergeSafety(audit, {
      mintAuthorityDisabled: true,
      freezeAuthorityDisabled: true,
      topHolderPct: null,
      top10HolderPct: 20,
      lpLockedPct: 100,
      honeypot: null,
      transferFeePct: 0,
      rugged: false,
      rugcheckRisk: 8,
      dangerFlags: [],
      warnFlags: [],
      devMigrations: null,
      devBalancePct: null,
    });
    expect(merged.coverage).toBe("tam");
    expect(merged.safety?.topHolderPct).toBe(4);
    expect(merged.safety?.devMigrations).toBe(1);
    expect(merged.safety?.lpLockedPct).toBe(100);
  });
});
