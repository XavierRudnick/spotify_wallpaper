# Codex Agents — Spotify Wallpaper Engine UI (Option A)

## Project Name
**SpotWall WE** (working title)

## One-liner
A Wallpaper Engine HTML wallpaper that shows three continuously scrolling rows of Spotify album covers (Recent / Saved / Suggested) on a pure black background, with hover + drag interaction and a minimal playback control bar.

---

## Purpose
Create an **always-on Spotify visual launcher** that lives in **Wallpaper Engine** as an HTML wallpaper. The wallpaper displays **only album cover art** (no text) in three horizontally moving rows. Clicking a cover triggers Spotify playback through Spotify Connect (Spotify app handles audio). A minimal dark play control sits below the rows.

---

## Target Platform
- **Windows 10/11**
- **Wallpaper Engine (Steam)** using an **HTML/JS** wallpaper project
- Spotify Desktop app recommended for the active playback device

---

## UX / Visual Spec (Hard Requirements)

### Layout
- Fullscreen **solid black background**.
- **Three horizontal rows** of album covers:
  1. **Recent** (Spotify recently played)
  2. **Saved Albums** (user library)
  3. **Suggested** (recommendations based on seeds)
- **No words anywhere** in the UI.
- Only album art tiles + a minimal play control region.

### Motion (Ambient)
- Each row scrolls **constantly to the right**.
- As covers exit the right edge, **new covers enter from the left** (infinite loop).
- Rows move at **different speeds**:
  - Row 1: slow
  - Row 2: slightly slower/faster (distinct but still calm)
  - Row 3: slowest/fastest (distinct but still calm)
- Motion must remain smooth and low CPU/GPU.

### Interaction
- On hover:
  - Album cover “lifts” subtly (scale + glow/shadow or outline).
  - Neighboring covers may slightly separate or “fan” (subtle).
- On click:
  - Plays that album (context play) on Spotify.
- Row interaction:
  - User can **drag/slide left or right** to browse manually.
  - When interacting, the row should:
    - slow down or pause ambient scrolling
    - resume smoothly after inactivity
- Minimal controls below rows:
  - A **dark play button** (icon only).
  - Optional additional icons (pause/next/prev) only if they can remain wordless and minimal.

---

## Primary Goals (MVP)
1. **Wallpaper Engine HTML wallpaper runs smoothly**
   - 60 fps target; minimal repaint.
   - No heavy frameworks.

2. **Spotify OAuth works reliably**
   - User connects Spotify once.
   - Token persistence across restarts.

3. **Content sources**
   - Recent row: `recently-played`
   - Saved row: `saved albums`
   - Suggested row: recommendations API using seeds derived from:
     - top artists/tracks OR recent items

4. **Playback control**
   - Click album cover → start playback on Spotify
   - Global play button:
     - toggles play/pause (if a device is active)

5. **Device handling**
   - Detect active Spotify device
   - If none:
     - show a minimal icon state (no text) and/or a small “settings overlay” icon
     - (if text is absolutely disallowed, use a discrete warning dot + tooltip only on hover; default is silent fail with retry)

---

## Non-goals (for now)
- Full Spotify browsing/search
- Lyrics, track lists, queue UI
- In-wallpaper audio playback
- Accounts, cloud backend, database
- Complex settings menus (keep it minimal)

---

## Tech Stack

### Wallpaper Runtime
- **Wallpaper Engine HTML Wallpaper**
  - Uses Chromium-based rendering via WE
  - Supports wallpaper properties and audio visualization hooks (not required)

### Frontend
- **HTML + CSS + JavaScript**
- **Vite** bundler for dev/build
- Animation approach:
  - CSS transforms + `requestAnimationFrame` only where needed
  - Prefer `translate3d` for GPU-accelerated movement
  - Use Intersection / virtualized tiling to avoid huge DOM

### Spotify Integration
- **Spotify Web API**
- OAuth 2.0: **Authorization Code with PKCE** (preferred)
  - Avoid client secret in wallpaper
- Token storage:
  - `localStorage` or WE storage mechanisms (if available)
- Content fetch + caching:
  - local cache of album art URLs and Spotify URIs

---

## Spotify Constraints (Operational)
- Playback control requires an **active Spotify device** (Spotify desktop app open and active).
- Playback control may require **Spotify Premium** depending on endpoint behavior and account features.
- Handle `NO_ACTIVE_DEVICE` and rate limiting gracefully.

---

## Required Scopes (MVP)
- `user-read-recently-played`
- `user-library-read`
- `user-read-playback-state`
- `user-modify-playback-state`
- For suggested:
  - `user-top-read` (if using top tracks/artists as recommendation seeds)

Keep scopes minimal; add only if feature requires it.

---

## Core Endpoints (MVP)
### Content
- `GET /v1/me/player/recently-played`
- `GET /v1/me/albums`
- `GET /v1/me/top/artists` and/or `GET /v1/me/top/tracks` (for seeds)
- `GET /v1/recommendations` (suggested row)

### Playback
- `GET /v1/me/player`
- `GET /v1/me/player/devices`
- `PUT /v1/me/player/play`
- `PUT /v1/me/player/pause`

---

## Animation / Rendering Requirements (Performance)
- Use **one transform layer per row** (not per tile) whenever possible.
- Keep album cover elements static; move the row container.
- Use a **circular buffer** approach:
  - Maintain N visible tiles + small offscreen buffer.
  - When a tile exits right, recycle it to the left with a new item.
- Limit row tile count to what’s needed for the screen width + buffer.
- Avoid layout thrashing:
  - No continuous reading of layout properties in a loop.
- Provide a “reduced motion” toggle (optional) if WE users want it.

---

## Data / Cache Strategy
- Fetch initial sets:
  - Recent: 30–50 items
  - Saved: 30–50 items (paged if needed)
  - Suggested: 30–50 items, refresh seeds periodically
- Cache:
  - store cover URLs + Spotify URIs
  - refresh content every X minutes (e.g., 10–30 minutes)
- If API fails:
  - keep showing cached art
  - retry with exponential backoff

---

## Repo Structure (suggested)
spotwall-we/
src/
main.js
spotify/
auth_pkce.js
api.js
cache.js
models.js
ui/
rows.js
rowScroller.js
interactions.js
playerControls.js
styles/
base.css
wallpaper.css
public/
icons/
docs/
wallpaper-engine-setup.md
spotify-setup.md
troubleshooting.md
vite.config.js
package.json


---

## Development Workflow
1. Run locally in browser for rapid iteration:
   - `npm install`
   - `npm run dev`
2. Validate OAuth flow in a normal browser first.
3. Build:
   - `npm run build`
4. Load into Wallpaper Engine as an HTML wallpaper:
   - point WE to the built `index.html`
5. Test:
   - idle CPU/GPU
   - smooth scrolling
   - hover/drag behavior
   - click-to-play reliability

---

## Milestones
### M0 — Visual Prototype
- Black background + 3 rows of placeholder cover art
- Infinite rightward motion with distinct speeds
- Hover animation + drag/slide per row

### M1 — Spotify Auth + Real Data
- PKCE OAuth integrated
- Rows populate from Spotify endpoints (recent/saved/suggested)
- Local caching

### M2 — Playback
- Click cover to play album
- Play button toggles play/pause
- Active-device detection and graceful failure behavior

### M3 — Polish + Performance
- Circular buffer tile recycling
- Image prefetching and lazy loading
- Backoff + offline cache behavior
- Minimal “error state” visuals (icon-only)

---

## Definition of Done (MVP)
- Runs as a Wallpaper Engine HTML wallpaper on Windows.
- Shows 3 continuously moving rows of album covers (no text).
- Rows have distinct slow speeds; infinite loop with seamless recycling.
- Hover and drag-to-browse interactions feel smooth.
- Clicking an album reliably starts playback on Spotify (when device active).
- Minimal dark play button below rows toggles play/pause.
- Low idle resource usage and stable across restarts.

---

## Agent Implementation Rules
- Preserve “no text UI” requirement (icons only).
- Keep dependencies minimal (avoid React unless absolutely necessary).
- Prefer GPU-accelerated transforms over per-frame layout updates.
- Design for “No active device” as the common failure case without adding text.
- Never store secrets in repo; use PKCE or a localhost-only helper if unavoidable.
- Any change that increases idle CPU usage must be justified and optionally gated behind a setting.