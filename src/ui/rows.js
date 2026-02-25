const ROW_BLUEPRINTS = [
  { id: "recent", speed: 26 },
  { id: "saved", speed: -26 },
  { id: "suggested", speed: 22 }
];

function hashSeed(seed) {
  let value = 0;
  for (let i = 0; i < seed.length; i += 1) {
    value = (value << 5) - value + seed.charCodeAt(i);
    value |= 0;
  }
  return Math.abs(value);
}

function buildPlaceholderPool(seed, size = 72) {
  const base = hashSeed(seed);

  return Array.from({ length: size }, (_, index) => {
    const wave = Math.sin((index + 1) * 0.42);
    const hueA = (base + index * 19) % 360;
    const hueB = (base * 2 + index * 31) % 360;
    const glow = 0.2 + (wave + 1) * 0.15;

    return {
      id: `${seed}-${index + 1}`,
      hueA,
      hueB,
      glow
    };
  });
}

export function createRowsShell() {
  const section = document.createElement("section");
  section.className = "rows";

  const rows = ROW_BLUEPRINTS.map((blueprint) => {
    const lane = document.createElement("div");
    lane.className = "row-lane";
    lane.dataset.row = blueprint.id;

    const viewport = document.createElement("div");
    viewport.className = "row-viewport";

    const track = document.createElement("div");
    track.className = "row-track";

    viewport.appendChild(track);
    lane.appendChild(viewport);
    section.appendChild(lane);

    return {
      id: blueprint.id,
      speed: blueprint.speed,
      lane,
      viewport,
      track,
      pool: buildPlaceholderPool(blueprint.id)
    };
  });

  return { element: section, rows };
}
