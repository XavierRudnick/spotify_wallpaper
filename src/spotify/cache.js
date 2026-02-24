const CACHE_PREFIX = "spotwall-cache";

export function cacheKey(key) {
  return `${CACHE_PREFIX}:${key}`;
}

export function readCache(key, { maxAgeMs = Number.POSITIVE_INFINITY } = {}) {
  try {
    const raw = localStorage.getItem(cacheKey(key));
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    if (typeof parsed?.updatedAt !== "number") {
      return null;
    }

    const age = Date.now() - parsed.updatedAt;
    if (age > maxAgeMs) {
      return null;
    }

    return parsed.data ?? null;
  } catch {
    return null;
  }
}

export function writeCache(key, data) {
  localStorage.setItem(
    cacheKey(key),
    JSON.stringify({
      updatedAt: Date.now(),
      data
    })
  );
}

export function clearCache(key) {
  localStorage.removeItem(cacheKey(key));
}
