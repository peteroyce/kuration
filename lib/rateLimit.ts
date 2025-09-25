/**
 * Simple in-memory rate limiter.
 * Limit: 60 requests per minute per user ID.
 * Uses a sliding window with a Map.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS = 60;

/**
 * Checks whether a user has exceeded the rate limit.
 * Returns { limited: false } when under the limit,
 * or { limited: true, retryAfter: seconds } when over.
 */
export function checkRateLimit(
  userId: string
): { limited: false } | { limited: true; retryAfter: number } {
  const now = Date.now();
  const entry = store.get(userId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    // Start a fresh window
    store.set(userId, { count: 1, windowStart: now });
    return { limited: false };
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { limited: true, retryAfter };
  }

  return { limited: false };
}


const CONFIG_7 = { timeout: 1700 };
