type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type RateLimitDecision = {
  allowed: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

const BUCKETS = new Map<string, RateLimitBucket>();

function pruneExpiredBuckets(now: number) {
  for (const [key, bucket] of BUCKETS.entries()) {
    if (bucket.resetAt <= now) {
      BUCKETS.delete(key);
    }
  }
}

export function takeRateLimit(key: string, maxRequests: number, windowMs: number): RateLimitDecision {
  const now = Date.now();
  pruneExpiredBuckets(now);

  const current = BUCKETS.get(key);
  if (!current || current.resetAt <= now) {
    BUCKETS.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      retryAfterSeconds: Math.ceil(windowMs / 1000),
      remaining: Math.max(0, maxRequests - 1),
    };
  }

  current.count += 1;

  if (current.count > maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      remaining: 0,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    remaining: Math.max(0, maxRequests - current.count),
  };
}
