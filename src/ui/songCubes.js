export function createSongCubesShell() {
  const container = document.createElement("section");
  container.className = "song-cubes is-hidden";
  container.setAttribute("aria-label", "album-tracks");

  const grid = document.createElement("div");
  grid.className = "song-cubes-grid";
  container.appendChild(grid);

  return { container, grid };
}

export function paintSongCubes(grid, tracks, currentTrackUri, onTrackClick) {
  if (!grid) {
    return;
  }

  if (!Array.isArray(tracks) || tracks.length === 0) {
    grid.dataset.signature = "";
    grid.replaceChildren();
    return;
  }

  const signature = tracks.map((track) => track.uri).join(",");
  const shouldRebuild = grid.dataset.signature !== signature;

  if (shouldRebuild) {
    const frag = document.createDocumentFragment();

    for (const track of tracks) {
      const cube = document.createElement("button");
      cube.type = "button";
      cube.className = "song-cube";
      cube.dataset.song = String(track.trackNumber);
      cube.dataset.trackUri = track.uri;
      cube.setAttribute("aria-label", `track-${track.trackNumber}`);

      cube.addEventListener("click", () => {
        onTrackClick?.(track.uri);
      });

      frag.appendChild(cube);
    }

    grid.replaceChildren(frag);
    grid.dataset.signature = signature;
  }

  const cubes = grid.querySelectorAll(".song-cube");
  for (const cube of cubes) {
    cube.classList.toggle("is-current", cube.dataset.trackUri === currentTrackUri);
  }
}
