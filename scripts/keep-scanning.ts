import { spawn } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";

const keepMinutes = Number(process.env.KEEP_MINUTES ?? 330);
const intervalSeconds = Number(process.env.INTERVAL_SECONDS ?? 180);
const started = Date.now();
const previousPath = "/tmp/previous-snapshot.json";
const outputPath = "/tmp/snapshot.json";

function run(command: string, args: string[], env?: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: { ...process.env, ...env },
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} çıkış ${code}`));
    });
  });
}

async function main() {
  const deadline = started + keepMinutes * 60_000;
  while (Date.now() < deadline) {
    const stamp = new Date().toISOString();
    console.log(`tur ${stamp}`);
    try {
      await run("npx", ["tsx", "scripts/scan.ts"], {
        SNAPSHOT_IN: previousPath,
        SNAPSHOT_OUT: outputPath,
      });
      await run("bash", ["scripts/publish-data.sh", outputPath]);
      await copyFile(outputPath, previousPath);
      console.log(`yayınlandı ${stamp}`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
    if (Date.now() + intervalSeconds * 1000 >= deadline) break;
    await sleep(intervalSeconds * 1000);
  }
  console.log(`döngü bitti ${new Date().toISOString()}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
