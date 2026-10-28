export const REPO = process.env.NEXT_PUBLIC_GITHUB_REPO || "muammeryldrm42/botsn-per";

export const DATA_BRANCH = "data";

export const RAW_SNAPSHOT_URL = `https://raw.githubusercontent.com/${REPO}/${DATA_BRANCH}/snapshot.json`;

/** Keyless fallback when the raw CDN has not published a brand-new branch yet. */
export const API_SNAPSHOT_URL = `https://api.github.com/repos/${REPO}/contents/snapshot.json?ref=${DATA_BRANCH}`;

export const USER_AGENT = "PER-Sinyal/1.0 (+https://github.com/muammeryldrm42/botsn-per)";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

/** Quote assets we accept on a memecoin pair. */
export const QUOTE_MINTS = new Set([SOL_MINT, USDC_MINT, USDT_MINT]);

/**
 * Liquid staking, stables and infrastructure assets that show up in
 * "trending" lists and are not memecoins.
 */
export const DENY_MINTS = new Set<string>([
  SOL_MINT,
  USDC_MINT,
  USDT_MINT,
  "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
  "jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL",
  "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
  "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
  "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
  "27G8MtK7VtTcCHkpASjSDdkWWYfoqT6ggEuKidVJidD4",
  "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
  "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
  "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
  "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
]);

export const DENY_SYMBOLS = new Set([
  "SOL",
  "WSOL",
  "USDC",
  "USDT",
  "USD1",
  "JUP",
  "JLP",
  "JITOSOL",
  "MSOL",
  "BSOL",
  "PYUSD",
]);

export const BURN_OWNERS = new Set([
  "1nc1nerator11111111111111111111111111111111",
  "11111111111111111111111111111111",
]);

export function tokenLinks(mint: string, pairAddress: string | null) {
  const pair = pairAddress || mint;
  return {
    dexscreener: `https://dexscreener.com/solana/${pair}`,
    solscan: `https://solscan.io/token/${mint}`,
    birdeye: `https://birdeye.so/token/${mint}?chain=solana`,
    geckoterminal: pairAddress
      ? `https://www.geckoterminal.com/solana/pools/${pairAddress}`
      : null,
  };
}
