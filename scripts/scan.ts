import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { runScan } from "../lib/scan/run";
import { isSnapshot, normalizeSnapshot } from "../lib/snapshot";

const inputPath = process.env.SNAPSHOT_IN;
const outputPath = process.env.SNAPSHOT_OUT ?? path.join(process.cwd(), "data", "snapshot.json");

async function readPrevious() {
  if (!inputPath) return null;
  try {
    const raw = await readFile(inputPath, "utf8");
    if (!raw.trim()) return null;
    const json: unknown = JSON.parse(raw);
    if (!isSnapshot(json)) {
      console.warn("Önceki dosya snapshot değil, geçmiş çağrılar sıfırdan tutulacak.");
      return null;
    }
    return normalizeSnapshot(json);
  } catch (error) {
    console.warn(`Önceki snapshot okunamadı: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

async function main() {
  const previous = await readPrevious();
  const snapshot = await runScan(previous);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`);

  const failed = Object.entries(snapshot.sources)
    .filter(([, status]) => !status.ok)
    .map(([name]) => name);

  console.log(
    JSON.stringify(
      {
        updatedAt: snapshot.updatedAt,
        discovered: snapshot.meta.discovered,
        scored: snapshot.meta.scored,
        listed: snapshot.tokens.length,
        rejected: snapshot.meta.rejected,
        rugcheck: snapshot.meta.rugcheckFetched,
        newCalls: snapshot.meta.newCalls,
        openCalls: snapshot.stats.open,
        totalCalls: snapshot.stats.total,
        durationMs: snapshot.meta.durationMs,
        failed,
        top: snapshot.tokens.slice(0, 8).map((token) => ({
          symbol: token.symbol,
          score: token.score,
          tier: token.tier,
          risk: token.risk,
          liq: Math.round(token.liquidityUsd),
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
