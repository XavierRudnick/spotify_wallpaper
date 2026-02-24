const AUTH_BASE = "https://accounts.spotify.com";
const AUTH_URL = `${AUTH_BASE}/authorize`;
const TOKEN_URL = `${AUTH_BASE}/api/token`;

const TOKEN_KEY = "spotwall:spotify:token";
const PKCE_KEY = "spotwall:spotify:pkce";

const DEFAULT_SCOPES = [
  "user-read-recently-played",
  "user-library-read",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-top-read"
];

function randomString(size = 64) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
}

function encodeBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function codeChallenge(verifier) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return encodeBase64Url(digest);
}

function getStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveToken(token) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
}

function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function nowEpoch() {
  return Math.floor(Date.now() / 1000);
}

function tokenIsFresh(token) {
  if (!token?.access_token || !token?.expires_at) {
    return false;
  }
  return token.expires_at - nowEpoch() > 45;
}

async function requestToken(body) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Spotify token request failed (${response.status}): ${text}`);
  }

  return response.json();
}

async function exchangeCodeForToken({ clientId, code, redirectUri, verifier }) {
  const payload = await requestToken({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier
  });

  const existing = getStoredToken();
  const token = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: nowEpoch() + Number(payload.expires_in ?? 3600)
  };
  saveToken(token);
  return token;
}

async function refreshAccessToken({ clientId, refreshToken }) {
  const payload = await requestToken({
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken
  });

  const token = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token ?? refreshToken,
    expires_at: nowEpoch() + Number(payload.expires_in ?? 3600)
  };
  saveToken(token);
  return token;
}

function clearAuthQuery() {
  const cleaned = `${window.location.origin}${window.location.pathname}${window.location.hash}`;
  window.history.replaceState({}, document.title, cleaned);
}

export async function beginPkceAuth({ clientId, redirectUri, scopes = DEFAULT_SCOPES } = {}) {
  if (!clientId) {
    throw new Error("Missing Spotify client id.");
  }

  const verifier = randomString(96);
  const state = randomString(32);
  const challenge = await codeChallenge(verifier);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));

  const authorizeUrl = new URL(AUTH_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("scope", scopes.join(" "));
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("code_challenge", challenge);

  window.location.assign(authorizeUrl.toString());
}

export async function createSpotifyAuthSession({
  clientId = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? "",
  redirectUri = import.meta.env.VITE_SPOTIFY_REDIRECT_URI ?? window.location.origin + window.location.pathname,
  scopes = DEFAULT_SCOPES
} = {}) {
  async function finishRedirectIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      clearAuthQuery();
      throw new Error(`Spotify authorization error: ${error}`);
    }

    if (!code) {
      return null;
    }

    const stored = sessionStorage.getItem(PKCE_KEY);
    sessionStorage.removeItem(PKCE_KEY);
    clearAuthQuery();

    if (!stored) {
      throw new Error("Missing PKCE verifier in session storage.");
    }

    const parsed = JSON.parse(stored);
    if (state !== parsed.state) {
      throw new Error("Spotify auth state mismatch.");
    }

    return exchangeCodeForToken({
      clientId,
      code,
      redirectUri,
      verifier: parsed.verifier
    });
  }

  async function getAccessToken({ interactive = false } = {}) {
    if (!clientId) {
      return null;
    }

    const token = getStoredToken();
    if (tokenIsFresh(token)) {
      return token.access_token;
    }

    if (token?.refresh_token) {
      const refreshed = await refreshAccessToken({
        clientId,
        refreshToken: token.refresh_token
      });
      return refreshed.access_token;
    }

    if (interactive) {
      await beginPkceAuth({ clientId, redirectUri, scopes });
    }

    return null;
  }

  function status() {
    const token = getStoredToken();
    return {
      hasClientId: Boolean(clientId),
      connected: tokenIsFresh(token) || Boolean(token?.refresh_token),
      expiresAt: token?.expires_at ?? 0
    };
  }

  function disconnect() {
    clearToken();
  }

  const callbackToken = await finishRedirectIfPresent();
  return { callbackToken, getAccessToken, beginPkceAuth, status, disconnect, clientId, redirectUri, scopes };
}
