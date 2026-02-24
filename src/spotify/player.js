import {
  fetchDevices,
  fetchPlaybackState,
  pausePlayback,
  playContext,
  resumePlayback,
  skipToNext
} from "./api.js";

const DEVICE_POLL_MS = 10000;

function resolveActiveDevice(devicesPayload) {
  const devices = devicesPayload?.devices ?? [];
  return devices.find((device) => device.is_active) ?? devices[0] ?? null;
}

export function createPlayerController({ getAccessToken, onState }) {
  let lastDeviceId = null;
  let noDeviceTimer = 0;
  let disposed = false;

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
      emit({
        isPlaying: Boolean(state?.is_playing),
        progressMs: Number(state?.progress_ms ?? 0),
        durationMs: Number(state?.item?.duration_ms ?? 0)
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

  return {
    checkDevice,
    refreshPlaybackState,
    playAlbum,
    togglePlayPause,
    nextTrack,
    dispose() {
      disposed = true;
      clearTimeout(noDeviceTimer);
    }
  };
}
