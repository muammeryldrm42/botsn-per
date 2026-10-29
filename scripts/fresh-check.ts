import { loadSnapshot } from "../lib/loadSnapshot";

async function main() {
  const firstStarted = Date.now();
  const first = await loadSnapshot();
  const firstMs = Date.now() - firstStarted;
  const ageSec = Math.round((Date.now() - Date.parse(first.snapshot.updatedAt)) / 1000);
  console.log(
    JSON.stringify({
      pass: "first",
      ms: firstMs,
      source: first.source,
      updatedAt: first.snapshot.updatedAt,
      ageSec,
      tokens: first.snapshot.tokens.length,
      calls: first.snapshot.calls.length,
      newCalls: first.snapshot.meta.newCalls,
      failed: Object.entries(first.snapshot.sources)
        .filter(([, status]) => !status.ok)
        .map(([name]) => name),
    }),
  );

  const secondStarted = Date.now();
  const second = await loadSnapshot();
  console.log(
    JSON.stringify({
      pass: "second",
      ms: Date.now() - secondStarted,
      sameStamp: second.snapshot.updatedAt === first.snapshot.updatedAt,
      source: second.source,
    }),
  );

  if (first.source !== "anlik") throw new Error(`İlk tur tarama yapmadı: ${first.source}`);
  if (ageSec > 120) throw new Error(`Kayıt ${ageSec} sn eski`);
  if (first.snapshot.tokens.length < 5) throw new Error("Çok az token");
  if (second.snapshot.updatedAt !== first.snapshot.updatedAt) throw new Error("İkinci tur önbelleği kullanmadı");
  if (Date.now() - secondStarted > 3000) throw new Error("İkinci tur yavaş");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
