import { fitLedger } from "./ledger";
import { isSnapshot, normalizeSnapshot } from "./snapshot";
import type { Snapshot } from "./types";

const CACHE_KEY = "botsn-per-ledger-v1";
const TTL_SECONDS = 14 * 24 * 60 * 60;

type CacheLike = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, options?: { ttl?: number }): Promise<unknown>;
};

async function vercelCache(): Promise<CacheLike | null> {
  try {
    const mod = await import("@vercel/functions");
    if (typeof mod.getCache !== "function") return null;
    return mod.getCache({ namespace: "botsn-per" });
  } catch {
    return null;
  }
}

export async function readStoredLedger(): Promise<Snapshot | null> {
  const cache = await vercelCache();
  if (!cache) return null;
  try {
    const value = await cache.get(CACHE_KEY);
    if (!isSnapshot(value)) return null;
    return normalizeSnapshot(value);
  } catch (error) {
    console.warn(`Defter okunamadı: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

export async function writeStoredLedger(snapshot: Snapshot): Promise<void> {
  const cache = await vercelCache();
  if (!cache) return;
  try {
    await cache.set(CACHE_KEY, fitLedger(snapshot), { ttl: TTL_SECONDS });
  } catch (error) {
    console.warn(`Defter yazılamadı: ${error instanceof Error ? error.message : error}`);
  }
}
