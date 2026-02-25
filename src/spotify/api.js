export const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

async function spotifyFetch({ accessToken, path, method = "GET", body } = {}) {
  if (!accessToken) {
    throw new Error("Missing access token.");
  }

  const response = await fetch(`${SPOTIFY_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify API failed (${method} ${path}): ${response.status} ${text}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function spotifyGet({ accessToken, path }) {
  return spotifyFetch({ accessToken, path, method: "GET" });
}

export async function spotifyPut({ accessToken, path, body }) {
  return spotifyFetch({ accessToken, path, method: "PUT", body });
}

export async function spotifyPost({ accessToken, path, body }) {
  return spotifyFetch({ accessToken, path, method: "POST", body });
}

export async function fetchRecentlyPlayed({ accessToken, limit = 50 }) {
  return spotifyGet({
    accessToken,
    path: `/me/player/recently-played?limit=${Math.min(50, Math.max(1, limit))}`
  });
}

export async function fetchSavedAlbums({ accessToken, limit = 50, offset = 0 }) {
  return spotifyGet({
    accessToken,
    path: `/me/albums?limit=${Math.min(50, Math.max(1, limit))}&offset=${Math.max(0, offset)}`
  });
}

export async function fetchTopTracks({ accessToken, limit = 10, timeRange = "short_term" }) {
  return spotifyGet({
    accessToken,
    path: `/me/top/tracks?limit=${Math.min(50, Math.max(1, limit))}&time_range=${timeRange}`
  });
}

export async function fetchTopArtists({ accessToken, limit = 10, timeRange = "short_term" }) {
  return spotifyGet({
    accessToken,
    path: `/me/top/artists?limit=${Math.min(50, Math.max(1, limit))}&time_range=${timeRange}`
  });
}

export async function fetchRecommendations({
  accessToken,
  limit = 50,
  seedTracks = [],
  seedArtists = []
}) {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(100, Math.max(1, limit))));

  if (seedTracks.length > 0) {
    params.set("seed_tracks", seedTracks.slice(0, 5).join(","));
  }

  if (seedArtists.length > 0) {
    params.set("seed_artists", seedArtists.slice(0, 5).join(","));
  }

  return spotifyGet({
    accessToken,
    path: `/recommendations?${params.toString()}`
  });
}

export async function fetchPlaybackState({ accessToken }) {
  return spotifyGet({ accessToken, path: "/me/player" });
}

export async function fetchDevices({ accessToken }) {
  return spotifyGet({ accessToken, path: "/me/player/devices" });
}

export async function fetchAlbumTracks({ accessToken, albumId, limit = 50, offset = 0 }) {
  if (!albumId) {
    throw new Error("Missing album id.");
  }

  return spotifyGet({
    accessToken,
    path: `/albums/${encodeURIComponent(albumId)}/tracks?limit=${Math.min(50, Math.max(1, limit))}&offset=${Math.max(0, offset)}`
  });
}

export async function playContext({ accessToken, contextUri, deviceId }) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyPut({
    accessToken,
    path: `/me/player/play${query}`,
    body: { context_uri: contextUri }
  });
}

export async function resumePlayback({ accessToken, deviceId }) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyPut({
    accessToken,
    path: `/me/player/play${query}`
  });
}

export async function pausePlayback({ accessToken, deviceId }) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyPut({
    accessToken,
    path: `/me/player/pause${query}`
  });
}

export async function skipToNext({ accessToken, deviceId }) {
  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyPost({
    accessToken,
    path: `/me/player/next${query}`
  });
}

export async function playTrack({ accessToken, trackUri, deviceId }) {
  if (!trackUri) {
    throw new Error("Missing track URI.");
  }

  const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
  return spotifyPut({
    accessToken,
    path: `/me/player/play${query}`,
    body: { uris: [trackUri] }
  });
}
