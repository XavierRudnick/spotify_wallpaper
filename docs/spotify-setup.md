# Spotify Setup

1. Create a Spotify app in the Spotify Developer Dashboard.
2. Add redirect URI(s) that exactly match runtime URLs, e.g. `http://127.0.0.1:5173/` for Vite dev.
3. Set local env vars:
   - `VITE_SPOTIFY_CLIENT_ID`
   - `VITE_SPOTIFY_REDIRECT_URI`
4. Use PKCE only. Do not use or store a client secret in this wallpaper project.
