const PREALLOCATED_TILE_COUNT = 72;
const ROW_WARMUP_CAP = 120;
const LEFT_BUFFER_TILES = 6;
const RIGHT_BUFFER_TILES = 10;

function makeTile() {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "tile";
  tile.setAttribute("aria-label", "album-tile");
  tile.draggable = false;

  const cover = document.createElement("img");
  cover.className = "tile-cover";
  cover.alt = "";
  cover.loading = "eager";
  cover.decoding = "async";
  tile.appendChild(cover);

  return tile;
}

function applyTileData(tile, item, revealDelayMs = 0) {
  const cover = tile.querySelector(".tile-cover");
  tile.dataset.itemId = item.id;
  tile.dataset.contextUri = item.contextUri ?? "";
  tile.style.setProperty("--hue-a", String(item.hueA));
  tile.style.setProperty("--hue-b", String(item.hueB));
  tile.style.setProperty("--tile-glow", String(item.glow));
  tile.style.setProperty("--reveal-delay", `${Math.max(0, revealDelayMs)}ms`);

  if (cover) {
    if (item.imageUrl) {
      if (cover.src !== item.imageUrl) {
        cover.src = item.imageUrl;
      }
      tile.classList.add("has-cover");
    } else {
      cover.removeAttribute("src");
      tile.classList.remove("has-cover");
    }
  }
}

function makeRuntimeRow(row) {
  return {
    ...row,
    leftIndex: 0,
    offset: 0,
    tileSpan: 1,
    baseSpeed: row.speed,
    ambientFactor: 1,
    dragSpeed: 0,
    holdAmbientUntil: 0,
    pointerActive: false,
    pointerId: null,
    pointerX: 0,
    pointerMoved: false,
    entryPeekRatio: 0.5,
    applyTimer: 0,
    maxTileCount: 0,
    leftBufferTiles: LEFT_BUFFER_TILES,
    applyRevision: 0
  };
}

function assignTileCount(runtimeRow) {
  const gap = parseFloat(getComputedStyle(runtimeRow.track).columnGap || "0");
  const sample = runtimeRow.track.querySelector(".tile");
  const tileWidth = sample ? sample.getBoundingClientRect().width : 140;
  runtimeRow.tileSpan = Math.max(1, tileWidth + gap);

  const viewportWidth = runtimeRow.viewport.getBoundingClientRect().width;
  const needed = Math.max(
    10,
    Math.ceil(viewportWidth / runtimeRow.tileSpan) + runtimeRow.leftBufferTiles + RIGHT_BUFFER_TILES
  );
  runtimeRow.maxTileCount = Math.max(runtimeRow.maxTileCount, needed, PREALLOCATED_TILE_COUNT);
  const target = runtimeRow.maxTileCount;

  while (runtimeRow.track.childElementCount < target) {
    const tile = makeTile();
    const slot = runtimeRow.track.childElementCount;
    const index = (runtimeRow.leftIndex + slot) % runtimeRow.pool.length;
    applyTileData(tile, runtimeRow.pool[index], Math.min(500, slot * 36));
    runtimeRow.track.appendChild(tile);
  }
}

function rotateRight(runtimeRow) {
  const moved = runtimeRow.track.lastElementChild;
  if (!moved) {
    return;
  }

  runtimeRow.leftIndex = (runtimeRow.leftIndex - 1 + runtimeRow.pool.length) % runtimeRow.pool.length;
  applyTileData(moved, runtimeRow.pool[runtimeRow.leftIndex]);
  runtimeRow.track.prepend(moved);
}

function rotateLeft(runtimeRow) {
  const moved = runtimeRow.track.firstElementChild;
  if (!moved) {
    return;
  }

  const tailIndex = (runtimeRow.leftIndex + runtimeRow.track.childElementCount) % runtimeRow.pool.length;
  applyTileData(moved, runtimeRow.pool[tailIndex]);
  runtimeRow.track.append(moved);
  runtimeRow.leftIndex = (runtimeRow.leftIndex + 1) % runtimeRow.pool.length;
}

function normalizeOffset(runtimeRow) {
  const maxOffset = -runtimeRow.tileSpan * runtimeRow.leftBufferTiles;
  const minOffset = -runtimeRow.tileSpan * (runtimeRow.leftBufferTiles + 1);

  while (runtimeRow.offset >= maxOffset) {
    runtimeRow.offset -= runtimeRow.tileSpan;
    rotateRight(runtimeRow);
  }

  while (runtimeRow.offset <= minOffset) {
    runtimeRow.offset += runtimeRow.tileSpan;
    rotateLeft(runtimeRow);
  }
}

function attachRowInput(runtimeRow, onTileClick) {
  runtimeRow.track.addEventListener("pointerdown", (event) => {
    runtimeRow.pointerActive = true;
    runtimeRow.pointerId = event.pointerId;
    runtimeRow.pointerX = event.clientX;
    runtimeRow.pointerMoved = false;
    runtimeRow.dragSpeed = 0;
    runtimeRow.holdAmbientUntil = performance.now() + 1200;
    runtimeRow.track.classList.add("is-dragging");
    runtimeRow.track.setPointerCapture(event.pointerId);
  });

  runtimeRow.track.addEventListener("pointermove", (event) => {
    if (!runtimeRow.pointerActive || runtimeRow.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - runtimeRow.pointerX;
    runtimeRow.pointerX = event.clientX;
    if (Math.abs(deltaX) > 2) {
      runtimeRow.pointerMoved = true;
    }
    runtimeRow.offset += deltaX;
    runtimeRow.dragSpeed = deltaX * 25;
    runtimeRow.holdAmbientUntil = performance.now() + 1200;
    normalizeOffset(runtimeRow);
  });

  const onPointerEnd = (event) => {
    if (!runtimeRow.pointerActive || runtimeRow.pointerId !== event.pointerId) {
      return;
    }

    runtimeRow.pointerActive = false;
    runtimeRow.pointerId = null;
    runtimeRow.holdAmbientUntil = performance.now() + 1200;
    runtimeRow.track.classList.remove("is-dragging");
  };

  runtimeRow.track.addEventListener("pointerup", onPointerEnd);
  runtimeRow.track.addEventListener("pointercancel", onPointerEnd);

  runtimeRow.track.addEventListener("click", (event) => {
    const tile = event.target.closest(".tile");
    if (!tile || !runtimeRow.track.contains(tile) || runtimeRow.pointerMoved) {
      return;
    }

    onTileClick?.({
      rowId: runtimeRow.id,
      itemId: tile.dataset.itemId ?? "",
      contextUri: tile.dataset.contextUri ?? ""
    });
  });
}

export function startRowScroller(rows, { onTileClick, motionFactor = 1 } = {}) {
  const runtimeRows = rows.map(makeRuntimeRow);
  const rowById = new Map(runtimeRows.map((row) => [row.id, row]));

  for (const row of runtimeRows) {
    assignTileCount(row);
    row.offset = -row.tileSpan * (row.leftBufferTiles + row.entryPeekRatio);
    attachRowInput(row, onTileClick);
    row.track.style.transform = `translate3d(${row.offset.toFixed(3)}px, 0, 0)`;
  }

  const onResize = () => {
    for (const row of runtimeRows) {
      assignTileCount(row);
      normalizeOffset(row);
    }
  };
  let resizeTimer = 0;
  const onResizeDebounced = () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(onResize, 140);
  };

  window.addEventListener("resize", onResizeDebounced);

  let lastTick = performance.now();
  let frameId = 0;
  let paused = false;
  let speedFactor = Math.max(0, motionFactor);

  const clearRowApplyTimer = (row) => {
    if (!row.applyTimer) {
      return;
    }
    window.clearTimeout(row.applyTimer);
    row.applyTimer = 0;
  };

  const warmRowImages = (items) => {
    const seen = new Set();
    let count = 0;

    for (const item of items) {
      const url = item?.imageUrl;
      if (!url || seen.has(url)) {
        continue;
      }
      seen.add(url);
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      count += 1;
      if (count >= ROW_WARMUP_CAP) {
        break;
      }
    }
  };

  const hydrateRowProgressively = (row) => {
    clearRowApplyTimer(row);
    row.applyRevision += 1;
    const revision = row.applyRevision;

    const tiles = Array.from(row.track.children);
    const baseLeftIndex = row.leftIndex;
    const poolSize = row.pool.length;
    let cursor = 0;

    const step = () => {
      if (revision !== row.applyRevision) {
        row.applyTimer = 0;
        return;
      }

      if (cursor >= tiles.length) {
        row.applyTimer = 0;
        return;
      }

      const chunk = 2;
      for (let i = 0; i < chunk && cursor < tiles.length; i += 1) {
        const poolIndex = (baseLeftIndex + cursor) % poolSize;
        applyTileData(tiles[cursor], row.pool[poolIndex], 0);
        cursor += 1;
      }

      row.applyTimer = window.setTimeout(step, 80);
    };

    step();
  };

  const tick = (now) => {
    if (paused) {
      return;
    }

    const deltaSeconds = Math.min(0.04, (now - lastTick) / 1000);
    lastTick = now;

    for (const row of runtimeRows) {
      const shouldDampen = row.pointerActive || now < row.holdAmbientUntil;
      const targetAmbient = shouldDampen ? 0.08 : 1;
      row.ambientFactor += (targetAmbient - row.ambientFactor) * Math.min(1, deltaSeconds * 5);

      row.dragSpeed *= Math.pow(0.12, deltaSeconds);

      const velocity = row.baseSpeed * speedFactor * row.ambientFactor + row.dragSpeed;
      row.offset += velocity * deltaSeconds;
      normalizeOffset(row);
      row.track.style.transform = `translate3d(${row.offset.toFixed(3)}px, 0, 0)`;
    }

    frameId = window.requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (frameId || paused) {
      return;
    }
    lastTick = performance.now();
    frameId = window.requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (!frameId) {
      return;
    }
    window.cancelAnimationFrame(frameId);
    frameId = 0;
  };

  startLoop();

  return {
    setRowItems(rowId, items) {
      const row = rowById.get(rowId);
      if (!row || !Array.isArray(items) || items.length === 0) {
        return;
      }

      row.pool = items;
      warmRowImages(items);
      row.leftIndex = row.leftIndex % row.pool.length;
      assignTileCount(row);
      hydrateRowProgressively(row);
    },
    setPaused(nextPaused) {
      paused = Boolean(nextPaused);
      if (paused) {
        stopLoop();
        return;
      }
      startLoop();
    },
    setMotionFactor(nextFactor) {
      speedFactor = Math.max(0, Number(nextFactor) || 0);
    },
    destroy() {
      stopLoop();
      clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResizeDebounced);
      for (const row of runtimeRows) {
        clearRowApplyTimer(row);
      }
    }
  };
}
