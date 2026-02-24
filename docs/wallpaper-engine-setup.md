# SpotWall WE - Wallpaper Engine Setup

## Local Development (Browser)
1. Install Node.js 20+.
2. Install dependencies:
   - `npm install`
3. Create env file from template:
   - copy `.env.example` to `.env.local`
4. Set Spotify values in `.env.local`:
   - `VITE_SPOTIFY_CLIENT_ID=<your_client_id>`
   - `VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:5173/`
5. In Spotify Developer Dashboard, add this exact redirect URI:
   - `http://127.0.0.1:5173/`
6. Start dev server:
   - `npm run dev`
7. Open:
   - `http://127.0.0.1:5173/`

Optional reduced-motion preview:
- `http://127.0.0.1:5173/?reducedMotion=1`

## Production Build
1. Build:
   - `npm run build`
2. Optional local preview:
   - `npm run preview`

## Wallpaper Engine Import
1. In Wallpaper Engine, create a new HTML wallpaper project.
2. Point the project entry file to:
   - `dist/index.html`
3. Apply wallpaper.
4. Make sure Spotify Desktop is running and selected as playback device.
5. Use connect icon first, then test tile click and play/pause icon.
