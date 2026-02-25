import {
  fetchAlbumTracks,
  fetchDevices,
  fetchPlaybackState,
  pausePlayback,
  playContext,
  playTrack,
  resumePlayback,
  skipToNext
} from "./api.js";

const DEVICE_POLL_MS = 10000;

function resolveActiveDevice(devicesPayload) {
  const devices = devicesPayload?.devices ?? [];
  return devices.find((device) => device.is_active) ?? devices[0] ?? null;
}

function pickAlbumImage(images) {
  if (!Array.isArray(images) || images.length === 0) {
    return "";
  }
  return images[2]?.url ?? images[1]?.url ?? images[0]?.url ?? "";
}

export function createPlayerController({ getAccessToken, onState }) {
  let lastDeviceId = null;
  let noDeviceTimer = 0;
  let disposed = false;
  const albumTracksCache = new Map();

  const emit = (patch) => {
    onState?.(patch);
  };

  const scheduleDeviceRetry = () => {
    clearTimeout(noDeviceTimer);
    noDeviceTimer = window.setTimeout(async () => {
      if (disposed) {
        return;
      }
      await checkDevice({ silent: true });
    }, DEVICE_POLL_MS);
  };

  async function authToken() {
    const token = await getAccessToken();
    if (!token) {
      emit({ connected: false });
      return null;
    }
    return token;
  }

  async function checkDevice({ silent = false } = {}) {
    const token = await authToken();
    if (!token) {
      return null;
    }

    try {
      const devicesPayload = await fetchDevices({ accessToken: token });
      const device = resolveActiveDevice(devicesPayload);

      if (!device) {
        if (!silent) {
          emit({ noDevice: true });
        }
        scheduleDeviceRetry();
        return null;
      }

      clearTimeout(noDeviceTimer);
      lastDeviceId = device.id;
      emit({ noDevice: false, hasDevice: true });
      return device;
    } catch {
      scheduleDeviceRetry();
      return null;
    }
  }

  async function refreshPlaybackState() {
    const token = await authToken();
    if (!token) {
      return null;
    }

    try {
      const state = await fetchPlaybackState({ accessToken: token });
      const track = state?.item ?? null;
      const album = track?.album ?? null;
      emit({
        isPlaying: Boolean(state?.is_playing),
        progressMs: Number(state?.progress_ms ?? 0),
        durationMs: Number(track?.duration_ms ?? 0),
        trackUri: track?.uri ?? "",
        albumId: album?.id ?? "",
        albumImageUrl: pickAlbumImage(album?.images)
      });
      return state;
    } catch {
      return null;
    }
  }

  async function playAlbum(contextUri) {
    if (!contextUri) {
      return false;
    }

    const token = await authToken();
    if (!token) {
      return false;
    }

    const device = await checkDevice();
    if (!device) {
      emit({ noDevice: true });
      return false;
    }

    try {
      await playContext({
        accessToken: token,
        contextUri,
        deviceId: device.id
      });
      emit({ isPlaying: true, noDevice: false });
      return true;
    } catch {
      emit({ noDevice: true });
      scheduleDeviceRetry();
      return false;
    }
  }

  async function togglePlayPause() {
    const token = await authToken();
    if (!token) {
      return false;
    }

    const device = await checkDevice();
    if (!device) {
      emit({ noDevice: true });
      return false;
    }

    const state = await refreshPlaybackState();

    try {
      if (state?.is_playing) {
        await pausePlayback({ accessToken: token, deviceId: device.id });
        emit({ isPlaying: false, noDevice: false });
      } else {
        await resumePlayback({ accessToken: token, deviceId: device.id });
        emit({ isPlaying: true, noDevice: false });
      }
      return true;
    } catch {
      emit({ noDevice: true });
      scheduleDeviceRetry();
      return false;
    }
  }

  async function nextTrack() {
    const token = await authToken();
    if (!token) {
      return false;
    }

    const device = await checkDevice();
    if (!device) {
      emit({ noDevice: true });
      return false;
    }

    try {
      await skipToNext({ accessToken: token, deviceId: device.id });
      window.setTimeout(() => {
        refreshPlaybackState();
      }, 280);
      return true;
    } catch {
      emit({ noDevice: true });
      scheduleDeviceRetry();
      return false;
    }
  }

  async function fetchAlbumTrackList(albumId) {
    if (!albumId) {
      return [];
    }

    if (albumTracksCache.has(albumId)) {
      return albumTracksCache.get(albumId);
    }

    const token = await authToken();
    if (!token) {
      return [];
    }

    try {
      const payload = await fetchAlbumTracks({ accessToken: token, albumId, limit: 50, offset: 0 });
      const tracks = (payload?.items ?? [])
        .map((item, index) => ({
          id: String(item?.id ?? item?.uri ?? `${albumId}-${index + 1}`),
          uri: String(item?.uri ?? ""),
          trackNumber: Number(item?.track_number ?? index + 1)
        }))
        .filter((item) => item.uri)
        .slice(0, 24);

      albumTracksCache.set(albumId, tracks);
      return tracks;
    } catch {
      return [];
    }
  }

  async function playSong(trackUri) {
    if (!trackUri) {
      return false;
    }

    const token = await authToken();
    if (!token) {
      return false;
    }

    const device = (await checkDevice({ silent: true })) ?? (lastDeviceId ? { id: lastDeviceId } : null);
    if (!device?.id) {
      emit({ noDevice: true });
      return false;
    }

    try {
      await playTrack({
        accessToken: token,
        trackUri,
        deviceId: device.id
      });
      emit({ isPlaying: true, noDevice: false, trackUri });
      window.setTimeout(() => {
        refreshPlaybackState();
      }, 280);
      return true;
    } catch {
      emit({ noDevice: true });
      scheduleDeviceRetry();
      return false;
    }
  }

  return {
    checkDevice,
    refreshPlaybackState,
    playAlbum,
    fetchAlbumTrackList,
    playSong,
    togglePlayPause,
    nextTrack,
    dispose() {
      disposed = true;
      clearTimeout(noDeviceTimer);
    }
  };
}
