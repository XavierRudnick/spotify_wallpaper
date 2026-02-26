import {
  fetchRecentlyPlayed,
  fetchRecommendations,
  fetchSavedAlbums,
  fetchTopArtists,
  fetchTopTracks
} from "./api.js";
import { readCache, writeCache } from "./cache.js";
import { dedupeAlbums, normalizeAlbumItem } from "./models.js";

const CACHE_KEY = "rows:v1";
const SAVED_ALPHA_CACHE_KEY = "rows:saved-alpha:v1";
const CACHE_TTL_MS = 20 * 60 * 1000;
const REFRESH_MS = 20 * 60 * 1000;
const RETRY_BASE_MS = 2000;
const RETRY_MAX_MS = 2 * 60 * 1000;
const PREFETCH_CAP = 150;
let recommendationsDisabled = false;

function rowSignature(rows) {
  const key = (items = []) => items.map((item) => item?.id ?? "").join(",");
  return `r:${key(rows?.recent)}|s:${key(rows?.saved)}|g:${key(rows?.suggested)}`;
}

function uniqueImageUrls(rows) {
  const urls = [];
  const seen = new Set();

  for (const key of ["recent", "saved", "suggested"]) {
    for (const item of rows?.[key] ?? []) {
      const url = item?.imageUrl;
      if (!url || seen.has(url)) {
        continue;
      }
      seen.add(url);
      urls.push(url);
      if (urls.length >= PREFETCH_CAP) {
        return urls;
      }
    }
  }

  return urls;
}

function scheduleIdle(task) {
  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(task, { timeout: 1200 });
    return;
  }
  window.setTimeout(task, 120);
}

function prefetchRowImages(rows) {
  const urls = uniqueImageUrls(rows);

  scheduleIdle(() => {
    for (const url of urls) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    }
  });
}

function normalizeRecent(payload) {
  const raw = payload?.items ?? [];
  return dedupeAlbums(
    raw
      .map((item) => {
        const album = item?.track?.album;
        if (!album?.id) {
          return null;
        }

        return normalizeAlbumItem({
          id: album.id,
          uri: album.uri,
          images: album.images
        });
      })
      .filter(Boolean)
  );
}

function normalizeSaved(payload) {
  const raw = payload?.items ?? [];
  return dedupeAlbums(
    raw
      .map((item) => {
        const album = item?.album;
        if (!album?.id) {
          return null;
        }

        const normalized = normalizeAlbumItem({
          id: album.id,
          uri: album.uri,
          images: album.images
        });
        normalized.albumName = String(album?.name ?? "");
        return normalized;
      })
      .filter(Boolean)
  );
}

function resolveAlphabetBucket(albumName) {
  const first = String(albumName ?? "").trim().charAt(0).toUpperCase();
  if (first >= "A" && first <= "G") {
    return "recent";
  }
  if (first >= "H" && first <= "O") {
    return "saved";
  }
  if (first >= "P" && first <= "Z") {
    return "suggested";
  }
  return "saved";
}

function splitSavedRowsByAlphabet(savedAlbums) {
  const byAlbumNameAsc = (left, right) => {
    const leftName = String(left?.albumName ?? "");
    const rightName = String(right?.albumName ?? "");
    const byName = leftName.localeCompare(rightName, undefined, {
      sensitivity: "base",
      numeric: true
    });
    if (byName !== 0) {
      return byName;
    }
    return String(left?.id ?? "").localeCompare(String(right?.id ?? ""));
  };

  const groups = {
    recent: [],
    saved: [],
    suggested: []
  };

  for (const album of savedAlbums) {
    groups[resolveAlphabetBucket(album?.albumName)].push(album);
  }

  if (savedAlbums.length === 0) {
    return groups;
  }

  const fallbackChunk = Math.max(1, Math.ceil(savedAlbums.length / 3));
  if (groups.recent.length === 0) {
    groups.recent = savedAlbums.slice(0, fallbackChunk);
  }
  if (groups.saved.length === 0) {
    groups.saved = savedAlbums.slice(fallbackChunk, fallbackChunk * 2);
  }
  if (groups.suggested.length === 0) {
    groups.suggested = savedAlbums.slice(fallbackChunk * 2);
  }

  if (groups.saved.length === 0) {
    groups.saved = savedAlbums.slice(0, fallbackChunk);
  }
  if (groups.suggested.length === 0) {
    groups.suggested = savedAlbums.slice(0, fallbackChunk);
  }

  groups.recent.sort(byAlbumNameAsc);
  groups.saved.sort(byAlbumNameAsc);
  groups.suggested.sort(byAlbumNameAsc);

  return groups;
}

async function fetchAllSavedAlbums(accessToken, { pageSize = 50, maxPages = 80 } = {}) {
  const items = [];
  let offset = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await fetchSavedAlbums({
      accessToken,
      limit: pageSize,
      offset
    });
    const chunk = payload?.items ?? [];
    if (chunk.length === 0) {
      break;
    }

    items.push(...chunk);

    if (!payload?.next) {
      break;
    }
    offset += pageSize;
  }

  return { items };
}

function normalizeSuggested(payload) {
  const raw = payload?.tracks ?? [];
  return dedupeAlbums(
    raw
      .map((track) => {
        const album = track?.album;
        if (!album?.id) {
          return null;
        }

        return normalizeAlbumItem({
          id: album.id,
          uri: album.uri,
          images: album.images
        });
      })
      .filter(Boolean)
  );
}

function normalizeTopTrackAlbums(payload) {
  const raw = payload?.items ?? [];
  return dedupeAlbums(
    raw
      .map((track) => {
        const album = track?.album;
        if (!album?.id) {
          return null;
        }

        return normalizeAlbumItem({
          id: album.id,
          uri: album.uri,
          images: album.images
        });
      })
      .filter(Boolean)
  );
}

function buildSuggestedFallback({ topTracks, recent, saved }) {
  const topTrackAlbums = normalizeTopTrackAlbums(topTracks);
  const blended = dedupeAlbums([...topTrackAlbums, ...recent, ...saved]);
  return blended.slice(0, 50);
}

function hydrateSeedIds(topTracks, topArtists, fallbackRecent) {
  const trackIds = (topTracks?.items ?? []).map((track) => track?.id).filter(Boolean);
  const artistIds = (topArtists?.items ?? []).map((artist) => artist?.id).filter(Boolean);
  const recentTrackIds = (fallbackRecent?.items ?? [])
    .map((item) => item?.track?.id)
    .filter(Boolean);

  const seeds = {
    seedTracks: [...new Set([...trackIds, ...recentTrackIds])].slice(0, 3),
    seedArtists: [...new Set(artistIds)].slice(0, 2)
  };

  if (seeds.seedTracks.length === 0 && seeds.seedArtists.length === 0) {
    throw new Error("Unable to derive recommendation seeds.");
  }

  return seeds;
}

export async function fetchRowsFromSpotify(accessToken) {
  const [recent, saved, topTracks, topArtists] = await Promise.all([
    fetchRecentlyPlayed({ accessToken, limit: 50 }),
    fetchSavedAlbums({ accessToken, limit: 50 }),
    fetchTopTracks({ accessToken, limit: 10 }),
    fetchTopArtists({ accessToken, limit: 10 })
  ]);

  const seeds = hydrateSeedIds(topTracks, topArtists, recent);
  const normalizedRecent = normalizeRecent(recent);
  const normalizedSaved = normalizeSaved(saved);
  let normalizedSuggested = [];

  if (!recommendationsDisabled) {
    try {
      const suggested = await fetchRecommendations({
        accessToken,
        limit: 50,
        seedTracks: seeds.seedTracks,
        seedArtists: seeds.seedArtists
      });
      normalizedSuggested = normalizeSuggested(suggested);
    } catch (error) {
      const message = String(error?.message ?? "");
      if (message.includes("/recommendations") && message.includes("404")) {
        recommendationsDisabled = true;
      }
    }
  }

  if (normalizedSuggested.length === 0) {
    normalizedSuggested = buildSuggestedFallback({
      topTracks,
      recent: normalizedRecent,
      saved: normalizedSaved
    });
  }

  return {
    recent: normalizedRecent,
    saved: normalizedSaved,
    suggested: normalizedSuggested
  };
}

export function readRowsCache({ allowStale = false } = {}) {
  return readCache(CACHE_KEY, {
    maxAgeMs: allowStale ? Number.POSITIVE_INFINITY : CACHE_TTL_MS
  });
}

export function writeRowsCache(rows) {
  writeCache(CACHE_KEY, rows);
}

export async function fetchSavedOnlyRowsFromSpotify(accessToken) {
  const saved = await fetchAllSavedAlbums(accessToken);
  const normalizedSaved = normalizeSaved(saved);
  return splitSavedRowsByAlphabet(normalizedSaved);
}

export function readSavedOnlyRowsCache({ allowStale = false } = {}) {
  return readCache(SAVED_ALPHA_CACHE_KEY, {
    maxAgeMs: allowStale ? Number.POSITIVE_INFINITY : CACHE_TTL_MS
  });
}

export function writeSavedOnlyRowsCache(rows) {
  writeCache(SAVED_ALPHA_CACHE_KEY, rows);
}

export function startRowsSync({ getAccessToken, onData, onState }) {
  let cancelled = false;
  let timerId = 0;
  let attempt = 0;
  let lastSignature = "";

  const emitIfChanged = (rows, meta) => {
    const signature = rowSignature(rows);
    if (signature === lastSignature) {
      return;
    }
    lastSignature = signature;
    onData(rows, meta);
  };

  const schedule = (delayMs) => {
    if (cancelled) {
      return;
    }

    clearTimeout(timerId);
    timerId = window.setTimeout(runOnce, delayMs);
  };

  const runOnce = async () => {
    if (cancelled) {
      return;
    }

    try {
      onState?.({ mode: "loading", attempt });
      const accessToken = await getAccessToken();
      if (!accessToken) {
        onState?.({ mode: "idle" });
        schedule(REFRESH_MS);
        return;
      }

      const rows = await fetchRowsFromSpotify(accessToken);
      prefetchRowImages(rows);
      writeRowsCache(rows);
      emitIfChanged(rows, { source: "network" });
      attempt = 0;
      onState?.({ mode: "ok" });
      schedule(REFRESH_MS);
    } catch {
      const cached = readRowsCache({ allowStale: true });
      if (cached) {
        emitIfChanged(cached, { source: "cache" });
      }

      attempt += 1;
      onState?.({ mode: "retry", attempt });
      const retryDelay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.max(0, attempt - 1));
      schedule(retryDelay);
    }
  };

  runOnce();

  return {
    stop() {
      cancelled = true;
      clearTimeout(timerId);
    }
  };
}
