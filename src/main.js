import "./styles/base.css";
import "./styles/wallpaper.css";
import { createSpotifyAuthSession } from "./spotify/auth_pkce.js";
import { readRowsCache, startRowsSync } from "./spotify/content.js";
import { createPlayerController } from "./spotify/player.js";
import { createRowsShell } from "./ui/rows.js";
import { createPlayerControlsShell } from "./ui/playerControls.js";
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
const { controls: controlsSection, connectButton, playButton, statusDot } = createPlayerControlsShell();

wallpaper.append(rowsSection, controlsSection);

enforceIconOnlyUi(document.body);
wireRowHoverState(rows);

let player = null;
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

function paintAuthState(state) {
  statusDot.classList.toggle("is-connected", state.connected);
  statusDot.classList.toggle("is-disconnected", !state.connected);
  statusDot.classList.toggle("is-missing-config", !state.hasClientId);
  statusDot.classList.toggle("is-warning", Boolean(state.noDevice));
  connectButton.classList.toggle("is-ready", state.connected);
  playButton.classList.toggle("is-ready", state.connected && !state.noDevice);
}

function paintPlaybackState(state) {
  playButton.classList.toggle("is-playing", Boolean(state.isPlaying));
  playButton.classList.toggle("is-no-device", Boolean(state.noDevice));
  statusDot.classList.toggle("is-warning", Boolean(state.noDevice));
}

async function initAuth() {
  const auth = await createSpotifyAuthSession();
  let sync = null;

  const cached = readRowsCache({ allowStale: true });
  applyRowData(cached);

  const startSync = () => {
    sync?.stop();
    sync = startRowsSync({
      getAccessToken: auth.getAccessToken,
      onData: (rowsData) => {
        applyRowData(rowsData);
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
    player = createPlayerController({
      getAccessToken: auth.getAccessToken,
      onState: (state) => {
        paintPlaybackState(state);
        paintAuthState({ ...auth.status(), ...state });
      }
    });
    player.checkDevice();
    player.refreshPlaybackState();
    startSync();
  }

  playButton.addEventListener("click", async () => {
    await player?.togglePlayPause();
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
      paintPlaybackState({ isPlaying: false, noDevice: false });
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
