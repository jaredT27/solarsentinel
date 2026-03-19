/**
 * In-memory sliding-window rate limiter.
 *
 * Good enough for single-instance Vercel serverless (each cold start resets).
 * For multi-region production, swap this for Upstash Redis (@upstash/ratelimit):
 *
 *   import { Ratelimit } from "@upstash/ratelimit";
 *   import { Redis } from "@upstash/redis";
 *   const ratelimit = new Ratelimit({
 *     redis: Redis.fromEnv(),
 *     limiter: Ratelimit.slidingWindow(5, "60 s"),
 *   });
 */

const hits = new Map<string, number[]>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 5; // per window per key

export function rateLimit(key: string): { ok: boolean; remaining: number } {
  const now = Date.now();
  const timestamps = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS) {
    return { ok: false, remaining: 0 };
  }

  timestamps.push(now);
  hits.set(key, timestamps);
  return { ok: true, remaining: MAX_REQUESTS - timestamps.length };
}
