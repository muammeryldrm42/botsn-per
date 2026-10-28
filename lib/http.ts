import { USER_AGENT } from "./constants";

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchJson<T>(
  url: string,
  opts?: {
    timeoutMs?: number;
    retries?: number;
    headers?: Record<string, string>;
    revalidate?: number;
  },
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? 12_000;
  const retries = opts?.retries ?? 2;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const init: RequestInit & { next?: { revalidate: number } } = {
        signal: ctrl.signal,
        headers: {
          accept: "application/json",
          "user-agent": USER_AGENT,
          ...opts?.headers,
        },
      };
      if (opts?.revalidate != null && process.env.NEXT_RUNTIME) {
        init.next = { revalidate: opts.revalidate };
      }
      const res = await fetch(url, init);
      if (res.status === 404 || res.status === 400) {
        throw new HttpError(res.status, url, false);
      }
      if (res.status === 429 || res.status >= 500) {
        throw new HttpError(res.status, url, true);
      }
      if (!res.ok) {
        throw new HttpError(res.status, url, false);
      }
      return (await res.json()) as T;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof HttpError ? error.retryable : true;
      if (!retryable || attempt === retries) break;
      const backoff = 350 * 2 ** attempt + Math.floor(Math.random() * 200);
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export class HttpError extends Error {
  constructor(
    public status: number,
    url: string,
    public retryable: boolean,
  ) {
    super(`HTTP ${status} ${url}`);
  }
}
