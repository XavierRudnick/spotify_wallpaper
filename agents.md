# AGENTS.md - SpotWall WE

## 1) Mission
Build and maintain a Wallpaper Engine HTML wallpaper that shows three animated rows of Spotify album covers and minimal icon-only playback controls.

Primary runtime target:
- Windows 10/11 + Wallpaper Engine (HTML wallpaper mode)
- Spotify Desktop app as playback device

## 2) Current MVP Status
Implemented:
- Three continuously scrolling rows of album covers on black background
- Distinct row directions/speeds:
  - `recent`: right (`+26`)
  - `saved`: left (`-26`)
  - `suggested`: right (`+22`)
- Hover interaction with center-pop and neighbor spread
- Hover pauses row motion
- Drag-to-browse rows
- Tap album cover to play album context
- Controls: connect, play/pause, skip-next, status dot, progress bar
- Spotify PKCE auth with token refresh/persistence
- Data pipeline: recent/saved/top + suggested fallback when recommendations API fails
- Cache + retry/backoff + image prefetch
- Reduced motion support and visibility pause

## 3) Non-Negotiable UX Rules
- No visible words in wallpaper UI (icons only)
- Black background
- Album-art-first experience
- Smooth motion and low idle overhead
- Graceful no-device behavior (icon state, no text banners)

## 4) Repo Map
- `src/main.js`
  - App composition, auth bootstrapping, row sync wiring, control handlers, progress updates
- `src/ui/rows.js`
  - Row blueprints (ids + speeds)
- `src/ui/rowScroller.js`
  - Infinite row motion, tile recycling, drag behavior, hover pause, tap/drag disambiguation
- `src/ui/interactions.js`
  - Icon-only guard + hover class choreography
- `src/ui/playerControls.js`
  - Control bar DOM: connect/play/skip/progress/status
- `src/spotify/auth_pkce.js`
  - OAuth PKCE flow + token storage + refresh
- `src/spotify/api.js`
  - Spotify API wrappers for content and playback endpoints
- `src/spotify/content.js`
  - Fetch/normalize/cache/retry/prefetch for row datasets
- `src/spotify/player.js`
  - Device detection + play/pause/skip + playback state reads
- `src/styles/base.css`, `src/styles/wallpaper.css`
  - Global and wallpaper styling
- `docs/wallpaper-engine-setup.md`
  - Local run + build + Wallpaper Engine loading steps

## 5) Spotify Contract
Required scopes:
- `user-read-recently-played`
- `user-library-read`
- `user-read-playback-state`
- `user-modify-playback-state`
- `user-top-read`

Notes:
- Use PKCE only in frontend; do not use client secret in this app.
- Recommendations endpoint may return `404` for some app types; fallback logic is required.
- Playback requires active Spotify device.

## 6) Runbook
Local dev:
1. `npm install`
2. Configure `.env.local`:
   - `VITE_SPOTIFY_CLIENT_ID=...`
   - `VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/`
3. `npm run dev`

Build:
1. `npm run build`
2. Load `dist/index.html` in Wallpaper Engine HTML project

## 7) Agent Workflow (Recommended)
When making changes:
1. Read impacted modules first (`main.js` + feature modules).
2. Keep edits minimal and localized.
3. Preserve icon-only UI policy.
4. Avoid adding heavy dependencies/frameworks.
5. Run `npm run build` before handing off.
6. Report:
   - Files changed
   - Behavior changed
   - Validation result

## 8) Performance Guardrails
- Prefer transform-based animation; avoid layout thrash in loops.
- Recycle tiles; do not grow DOM unbounded.
- Avoid unnecessary row re-application when data unchanged.
- Pause or reduce work when hidden/reduced-motion.
- Any CPU/GPU increase must be justified.

## 9) Known Constraints
- Wallpaper Engine login text input may be unreliable in-wallpaper.
- OAuth is most reliable when completed in normal browser first.
- Spotify device availability can be intermittent; no-device handling must stay robust.

## 10) Next Iteration Candidates
- External-browser auth handoff flow for Wallpaper Engine
- Optional previous-track icon
- Optional Wallpaper Engine property bindings (speed/motion/scale)
- Additional diagnostics toggle for API/device troubleshooting
