import "./styles/base.css";
import "./styles/wallpaper.css";
import { createSpotifyAuthSession } from "./spotify/auth_pkce.js";
import {
  fetchRowsFromSpotify,
  fetchSavedOnlyRowsFromSpotify,
  readRowsCache,
  readSavedOnlyRowsCache,
  startRowsSync,
  writeRowsCache,
  writeSavedOnlyRowsCache
} from "./spotify/content.js";
import { createPlayerController } from "./spotify/player.js";
import { createRowsShell } from "./ui/rows.js";
import { createPlayerControlsShell } from "./ui/playerControls.js";
import { createSongCubesShell, paintSongCubes } from "./ui/songCubes.js";
import { startRowScroller } from "./ui/rowScroller.js";
import { enforceIconOnlyUi, wireRowHoverState } from "./ui/interactions.js";

const app = document.querySelector("#app");

if (!app) {
  throw new Error("Missing #app root element.");
}

const wallpaper = document.createElement("main");
wallpaper.className = "wallpaper";
app.appendChild(wallpaper);

function resolveReducedMotion() {
  const query = new URLSearchParams(window.location.search).get("reducedMotion");
  if (query === "1") {
    return true;
  }
  if (query === "0") {
    return false;
  }
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

const reducedMotion = resolveReducedMotion();
document.body.classList.toggle("reduced-motion", reducedMotion);

const { element: rowsSection, rows } = createRowsShell();
const {
  controls: controlsSection,
  record,
  connectButton,
  playButton,
  skipButton,
  progressFill,
  statusDot,
  modeDefaultButton,
  modeSavedButton
} = createPlayerControlsShell();
const { container: songCubesSection, grid: songCubesGrid } = createSongCubesShell();

wallpaper.append(rowsSection, controlsSection, songCubesSection);

enforceIconOnlyUi(document.body);
wireRowHoverState(rows);

let player = null;
let playbackTicker = 0;
let playbackPollTimer = 0;
let progressModel = {
  isPlaying: false,
  progressMs: 0,
  durationMs: 0,
  stamp: performance.now()
};
let songCubeModel = {
  albumId: "",
  currentTrackUri: "",
  tracks: [],
  loadingAlbumId: ""
};
let rowMode = "default";
let rowDataByMode = {
  default: null,
  savedOnly: null
};

function stopPlaybackLoops() {
  if (playbackTicker) {
    window.cancelAnimationFrame(playbackTicker);
    playbackTicker = 0;
  }
  clearInterval(playbackPollTimer);
  playbackPollTimer = 0;
}

function renderProgress(now = performance.now()) {
  const elapsed = progressModel.isPlaying ? now - progressModel.stamp : 0;
  const current = Math.min(progressModel.durationMs, progressModel.progressMs + elapsed);
  const ratio = progressModel.durationMs > 0 ? current / progressModel.durationMs : 0;
  progressFill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio)).toFixed(4)})`;
}

function startPlaybackTicker() {
  if (playbackTicker) {
    return;
  }

  const loop = (now) => {
    renderProgress(now);
    playbackTicker = window.requestAnimationFrame(loop);
  };

  playbackTicker = window.requestAnimationFrame(loop);
}

function startPlaybackPoll() {
  if (playbackPollTimer || !player) {
    return;
  }

  playbackPollTimer = window.setInterval(() => {
    player?.refreshPlaybackState();
  }, 5000);
}

const runtime = startRowScroller(rows, {
  motionFactor: reducedMotion ? 0.35 : 1,
  onTileClick: ({ contextUri }) => {
    if (!contextUri) {
      return;
    }
    player?.playAlbum(contextUri);
  }
});
window.addEventListener("beforeunload", () => runtime.destroy(), { once: true });
document.addEventListener("visibilitychange", () => {
  runtime.setPaused(document.hidden);
});

function applyRowData(rowData) {
  if (!rowData) {
    return;
  }

  if (Array.isArray(rowData.recent) && rowData.recent.length > 0) {
    runtime.setRowItems("recent", rowData.recent);
  }
  if (Array.isArray(rowData.saved) && rowData.saved.length > 0) {
    runtime.setRowItems("saved", rowData.saved);
  }
  if (Array.isArray(rowData.suggested) && rowData.suggested.length > 0) {
    runtime.setRowItems("suggested", rowData.suggested);
  }
}

function paintRowMode() {
  modeDefaultButton.classList.toggle("is-active", rowMode === "default");
  modeSavedButton.classList.toggle("is-active", rowMode === "savedOnly");
}

function applyCurrentRowMode() {
  applyRowData(rowDataByMode[rowMode]);
}

function paintAuthState(state) {
  statusDot.classList.toggle("is-connected", state.connected);
  statusDot.classList.toggle("is-disconnected", !state.connected);
  statusDot.classList.toggle("is-missing-config", !state.hasClientId);
  statusDot.classList.toggle("is-warning", Boolean(state.noDevice));
  connectButton.classList.toggle("is-ready", state.connected);
  playButton.classList.toggle("is-ready", state.connected && !state.noDevice);
  skipButton.classList.toggle("is-ready", state.connected && !state.noDevice);
}

function paintPlaybackState(state) {
  playButton.classList.toggle("is-playing", Boolean(state.isPlaying));
  playButton.classList.toggle("is-no-device", Boolean(state.noDevice));
  skipButton.classList.toggle("is-no-device", Boolean(state.noDevice));
  statusDot.classList.toggle("is-warning", Boolean(state.noDevice));
  record.classList.toggle("is-spinning", Boolean(state.isPlaying));

  if (typeof state.albumImageUrl === "string") {
    if (state.albumImageUrl) {
      record.style.setProperty("--record-cover", `url("${state.albumImageUrl}")`);
      record.classList.add("has-cover");
    } else {
      record.style.removeProperty("--record-cover");
      record.classList.remove("has-cover");
    }
  }

  if (typeof state.progressMs === "number") {
    progressModel.progressMs = Math.max(0, state.progressMs);
  }
  if (typeof state.durationMs === "number") {
    progressModel.durationMs = Math.max(0, state.durationMs);
  }
  if (typeof state.isPlaying === "boolean") {
    progressModel.isPlaying = state.isPlaying;
  }
  progressModel.stamp = performance.now();
  renderProgress(progressModel.stamp);
}

function repaintSongCubes() {
  songCubesSection.classList.toggle("is-hidden", songCubeModel.tracks.length === 0);
  paintSongCubes(songCubesGrid, songCubeModel.tracks, songCubeModel.currentTrackUri, (trackUri) => {
    player?.playSong(trackUri);
  });
}

async function syncSongCubesFromPlaybackState(state) {
  if (!player) {
    songCubeModel = { albumId: "", currentTrackUri: "", tracks: [], loadingAlbumId: "" };
    repaintSongCubes();
    return;
  }

  if (typeof state?.trackUri === "string" && state.trackUri !== songCubeModel.currentTrackUri) {
    songCubeModel.currentTrackUri = state.trackUri;
    repaintSongCubes();
  }

  const hasAlbumId = Object.prototype.hasOwnProperty.call(state ?? {}, "albumId");
  if (!hasAlbumId) {
    return;
  }

  const nextAlbumId = typeof state?.albumId === "string" ? state.albumId : "";
  if (!nextAlbumId) {
    return;
  }

  if (nextAlbumId === songCubeModel.albumId || nextAlbumId === songCubeModel.loadingAlbumId) {
    return;
  }

  songCubeModel.loadingAlbumId = nextAlbumId;
  const tracks = await player.fetchAlbumTrackList(nextAlbumId);

  if (songCubeModel.loadingAlbumId !== nextAlbumId) {
    return;
  }

  songCubeModel.albumId = nextAlbumId;
  songCubeModel.loadingAlbumId = "";
  songCubeModel.tracks = tracks;
  repaintSongCubes();
}

async function initAuth() {
  const MODE_LONG_PRESS_MS = 560;
  const auth = await createSpotifyAuthSession();
  let sync = null;
  let loadingDefaultRows = false;
  let loadingSavedOnly = false;

  const cached = readRowsCache({ allowStale: true });
  rowDataByMode.default = cached;
  rowDataByMode.savedOnly = readSavedOnlyRowsCache({ allowStale: true });
  applyCurrentRowMode();
  paintRowMode();

  const ensureSavedOnlyRows = async ({ force = false } = {}) => {
    if (loadingSavedOnly) {
      return rowDataByMode.savedOnly;
    }
    if (!force && rowDataByMode.savedOnly) {
      return rowDataByMode.savedOnly;
    }

    loadingSavedOnly = true;
    modeSavedButton.classList.add("is-loading");

    try {
      const accessToken = await auth.getAccessToken();
      if (!accessToken) {
        return rowDataByMode.savedOnly;
      }
      const rowsData = await fetchSavedOnlyRowsFromSpotify(accessToken);
      rowDataByMode.savedOnly = rowsData;
      writeSavedOnlyRowsCache(rowsData);
      return rowsData;
    } catch {
      return rowDataByMode.savedOnly;
    } finally {
      loadingSavedOnly = false;
      modeSavedButton.classList.remove("is-loading");
    }
  };

  const forceRefreshDefaultRows = async () => {
    if (loadingDefaultRows) {
      return rowDataByMode.default;
    }

    loadingDefaultRows = true;
    modeDefaultButton.classList.add("is-loading");

    try {
      const accessToken = await auth.getAccessToken();
      if (!accessToken) {
        return rowDataByMode.default;
      }
      const rowsData = await fetchRowsFromSpotify(accessToken);
      rowDataByMode.default = rowsData;
      writeRowsCache(rowsData);
      return rowsData;
    } catch {
      return rowDataByMode.default;
    } finally {
      loadingDefaultRows = false;
      modeDefaultButton.classList.remove("is-loading");
    }
  };

  const wireModeButtonPress = (button, { onShortPress, onLongPress }) => {
    let pressTimer = 0;
    let pressedPointerId = null;
    let longPressHandled = false;
    let suppressNextClick = false;

    const clearPressTimer = () => {
      if (!pressTimer) {
        return;
      }
      window.clearTimeout(pressTimer);
      pressTimer = 0;
    };

    button.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) {
        return;
      }

      pressedPointerId = event.pointerId;
      longPressHandled = false;
      clearPressTimer();
      pressTimer = window.setTimeout(async () => {
        longPressHandled = true;
        suppressNextClick = true;
        await onLongPress?.();
      }, MODE_LONG_PRESS_MS);
    });

    button.addEventListener("pointerup", (event) => {
      if (pressedPointerId !== event.pointerId) {
        return;
      }
      pressedPointerId = null;
      clearPressTimer();
      if (!longPressHandled) {
        onShortPress?.();
      }
    });

    const cancelPress = (event) => {
      if (pressedPointerId !== null && pressedPointerId !== event.pointerId) {
        return;
      }
      pressedPointerId = null;
      clearPressTimer();
    };

    button.addEventListener("pointercancel", cancelPress);
    button.addEventListener("pointerleave", cancelPress);
    button.addEventListener("click", (event) => {
      if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        return;
      }
      if (event.detail === 0) {
        onShortPress?.();
      }
    });
  };

  const startSync = () => {
    sync?.stop();
    sync = startRowsSync({
      getAccessToken: auth.getAccessToken,
      onData: (rowsData) => {
        rowDataByMode.default = rowsData;
        if (rowMode === "default") {
          applyRowData(rowsData);
        }
      },
      onState: ({ mode }) => {
        statusDot.classList.toggle("is-syncing", mode === "loading");
      }
    });
  };

  const authState = auth.status();
  paintAuthState(authState);
  if (auth.status().connected) {
    player?.dispose();
    stopPlaybackLoops();
    player = createPlayerController({
      getAccessToken: auth.getAccessToken,
      onState: (state) => {
        paintPlaybackState(state);
        paintAuthState({ ...auth.status(), ...state });
        void syncSongCubesFromPlaybackState(state);
      }
    });
    player.checkDevice();
    player.refreshPlaybackState();
    startPlaybackTicker();
    startPlaybackPoll();
    startSync();
  }

  playButton.addEventListener("click", async () => {
    await player?.togglePlayPause();
  });
  skipButton.addEventListener("click", async () => {
    await player?.nextTrack();
  });
  wireModeButtonPress(modeDefaultButton, {
    onShortPress: () => {
      rowMode = "default";
      paintRowMode();
      applyCurrentRowMode();
    },
    onLongPress: async () => {
      rowMode = "default";
      paintRowMode();
      const rowsData = await forceRefreshDefaultRows();
      if (rowsData && rowMode === "default") {
        applyRowData(rowsData);
      }
    }
  });

  wireModeButtonPress(modeSavedButton, {
    onShortPress: async () => {
      rowMode = "savedOnly";
      paintRowMode();
      const rowsData = await ensureSavedOnlyRows();
      if (rowsData && rowMode === "savedOnly") {
        applyRowData(rowsData);
      }
    },
    onLongPress: async () => {
      rowMode = "savedOnly";
      paintRowMode();
      const rowsData = await ensureSavedOnlyRows({ force: true });
      if (rowsData && rowMode === "savedOnly") {
        applyRowData(rowsData);
      }
    }
  });

  connectButton.addEventListener("click", async () => {
    const current = auth.status();
    if (!current.hasClientId) {
      return;
    }

    if (current.connected) {
      auth.disconnect();
      sync?.stop();
      player?.dispose();
      player = null;
      stopPlaybackLoops();
      paintPlaybackState({ isPlaying: false, noDevice: false });
      void syncSongCubesFromPlaybackState({});
      paintAuthState(auth.status());
      return;
    }

    await auth.beginPkceAuth({
      clientId: auth.clientId,
      redirectUri: auth.redirectUri,
      scopes: auth.scopes
    });
  });
}

initAuth().catch(() => {
  paintAuthState({ connected: false, hasClientId: false });
});
