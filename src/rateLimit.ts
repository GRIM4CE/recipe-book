// Fixed-window counter keyed by caller. In-memory, so each warm Lambda
// instance keeps its own counts: the effective cap is per instance and resets
// on cold start. Good enough to stop a runaway client; not a hard quota.
export function createRateLimiter(opts: { max: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    // True if the call is allowed (and counted), false if over the limit.
    take(key: string, now = Date.now()): boolean {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      const entry = hits.get(key);
      if (!entry) {
        hits.set(key, { count: 1, resetAt: now + opts.windowMs });
        return true;
      }
      if (entry.count >= opts.max) return false;
      entry.count++;
      return true;
    },
  };
}
