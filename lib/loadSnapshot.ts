import bundledJson from "../data/snapshot.json";
import { attachOpenCalls, computeStats, refreshCall } from "./calls";
import { API_SNAPSHOT_URL, RAW_SNAPSHOT_URL, USER_AGENT } from "./constants";
import { fetchJupiterPrices } from "./sources/jupiter";
import { isSnapshot, normalizeSnapshot } from "./snapshot";
import type { Snapshot } from "./types";

async function readJson(url: string, revalidate: number, headers?: Record<string, string>): Promise<Snapshot | null> {
  const response = await fetch(url, {
    headers: { "user-agent": USER_AGENT, accept: "application/json", ...headers },
    next: { revalidate },
  });
  if (!response.ok) return null;
  const json: unknown = await response.json();
  if (!isSnapshot(json)) return null;
  return normalizeSnapshot(json);
}

async function readRemote(): Promise<Snapshot | null> {
  const fromRaw = await readJson(RAW_SNAPSHOT_URL, 60);
  if (fromRaw) return fromRaw;
  // The raw CDN can cache a 404 for a new branch. The contents API is the
  // keyless fallback and is cached for five minutes so a public site stays
  // under the unauthenticated GitHub rate limit.
  return readJson(API_SNAPSHOT_URL, 300, { accept: "application/vnd.github.raw" });
}

async function overlayLivePrices(snapshot: Snapshot): Promise<Snapshot> {
  const updated = Date.parse(snapshot.updatedAt);
  if (!Number.isFinite(updated) || Date.now() - updated < 3 * 60_000) return snapshot;
  const mints = [
    ...new Set([
      ...snapshot.tokens.slice(0, 40).map((token) => token.mint),
      ...snapshot.calls.filter((call) => call.status === "acik").map((call) => call.mint),
    ]),
  ].slice(0, 40);
  if (!mints.length) return snapshot;
  try {
    const prices = await fetchJupiterPrices(mints, 60);
    if (!Object.keys(prices).length) return snapshot;
    const nowMs = Date.now();
    const calls = snapshot.calls.map((call) => {
      const price = prices[call.mint];
      if (price == null) return call;
      return refreshCall(call, { price, liquidityUsd: null, rugged: false, nowMs });
    });
    const tokens = attachOpenCalls(
      snapshot.tokens.map((token) => (prices[token.mint] ? { ...token, priceUsd: prices[token.mint]! } : token)),
      calls,
    );
    return {
      ...snapshot,
      tokens,
      calls,
      stats: computeStats(calls, nowMs),
      livePriceAt: new Date(nowMs).toISOString(),
    };
  } catch {
    return snapshot;
  }
}

export async function loadSnapshot(): Promise<{ snapshot: Snapshot; source: "canli" | "yedek" }> {
  const bundled = normalizeSnapshot(bundledJson as Snapshot);
  let snapshot = bundled;
  let source: "canli" | "yedek" = "yedek";
  try {
    const remote = await readRemote();
    if (remote) {
      const remoteAt = Date.parse(remote.updatedAt);
      const bundledAt = Date.parse(bundled.updatedAt);
      if (!Number.isFinite(bundledAt) || remoteAt >= bundledAt) {
        snapshot = remote;
        source = "canli";
      }
    }
  } catch {
    snapshot = bundled;
    source = "yedek";
  }
  return { snapshot: await overlayLivePrices(snapshot), source };
}
