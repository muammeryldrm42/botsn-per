import bundledJson from "../data/snapshot.json";
import { API_SNAPSHOT_URL, RAW_SNAPSHOT_URL, USER_AGENT } from "./constants";
import { mergeLedgers, needsScan } from "./ledger";
import { readStoredLedger, writeStoredLedger } from "./ledgerStore";
import { runScan } from "./scan/run";
import { isSnapshot, normalizeSnapshot } from "./snapshot";
import type { Snapshot } from "./types";

export type SnapshotSource = "anlik" | "canli" | "yedek";

type Loaded = { snapshot: Snapshot; source: SnapshotSource };

type Slot = { snapshot: Snapshot | null; inflight: Promise<Loaded> | null };

const SLOT = "__perLedgerSlot";

function slot(): Slot {
  const root = globalThis as typeof globalThis & { [SLOT]?: Slot };
  if (!root[SLOT]) root[SLOT] = { snapshot: null, inflight: null };
  return root[SLOT];
}

async function readRemote(): Promise<Snapshot | null> {
  const attempts: Array<{ url: string; headers?: Record<string, string> }> = [
    { url: RAW_SNAPSHOT_URL },
    { url: API_SNAPSHOT_URL, headers: { accept: "application/vnd.github.raw" } },
  ];
  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, {
        cache: "no-store",
        headers: { "user-agent": USER_AGENT, accept: "application/json", ...attempt.headers },
      });
      if (!response.ok) continue;
      const json: unknown = await response.json();
      if (!isSnapshot(json)) continue;
      return normalizeSnapshot(json);
    } catch {
      continue;
    }
  }
  return null;
}

function sourceOf(snapshot: Snapshot): SnapshotSource {
  return snapshot.producedBy === "site" ? "anlik" : "canli";
}

async function compute(): Promise<Loaded> {
  const bundled = normalizeSnapshot(bundledJson as Snapshot);
  const [stored, remote] = await Promise.all([readStoredLedger(), readRemote()]);
  const memory = slot().snapshot;
  const ledger = mergeLedgers([memory, stored, remote, bundled]);
  const freshBase = mergeLedgers([memory, stored, remote]);
  if (freshBase && !needsScan(freshBase.updatedAt, Date.now())) {
    slot().snapshot = freshBase;
    if (!stored || Date.parse(stored.updatedAt) < Date.parse(freshBase.updatedAt)) {
      await writeStoredLedger(freshBase);
    }
    return { snapshot: freshBase, source: sourceOf(freshBase) };
  }

  try {
    const scanned = await runScan(ledger);
    const snapshot = mergeLedgers([{ ...scanned, producedBy: "site" }, ledger]);
    if (!snapshot) throw new Error("Tarama boş döndü");
    snapshot.producedBy = "site";
    snapshot.tokens = scanned.tokens;
    snapshot.filteredOut = scanned.filteredOut;
    snapshot.sources = scanned.sources;
    snapshot.meta = scanned.meta;
    snapshot.updatedAt = scanned.updatedAt;
    slot().snapshot = snapshot;
    await writeStoredLedger(snapshot);
    return { snapshot, source: "anlik" };
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    const fallback = ledger ?? bundled;
    slot().snapshot = fallback;
    return { snapshot: fallback, source: remote ? "canli" : "yedek" };
  }
}

/** Fresh board for the request. A stored snapshot younger than two minutes is reused. */
export async function loadSnapshot(): Promise<Loaded> {
  const state = slot();
  if (state.inflight) return state.inflight;
  state.inflight = compute().finally(() => {
    state.inflight = null;
  });
  return state.inflight;
}
