export function enforceIconOnlyUi(root) {
  if (!root) {
    return;
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const parentTag = node.parentElement?.tagName;
    const text = node.nodeValue?.trim();

    if (!text) {
      continue;
    }

    if (parentTag === "SCRIPT" || parentTag === "STYLE") {
      continue;
    }

    if (import.meta.env.DEV) {
      throw new Error(`Visible text is not allowed in UI: "${text}"`);
    }
  }
}

function clearHoverState(track) {
  const marked = track.querySelectorAll(".is-hovered, .is-neighbor-before, .is-neighbor-after");
  for (const node of marked) {
    node.classList.remove("is-hovered", "is-neighbor-before", "is-neighbor-after");
  }
}

export function wireRowHoverState(rows) {
  for (const row of rows) {
    const { track } = row;

    track.addEventListener("pointermove", (event) => {
      const tile = event.target.closest(".tile");
      if (!tile || !track.contains(tile)) {
        clearHoverState(track);
        return;
      }

      clearHoverState(track);
      tile.classList.add("is-hovered");
      tile.previousElementSibling?.classList.add("is-neighbor-before");
      tile.nextElementSibling?.classList.add("is-neighbor-after");
    });

    track.addEventListener("pointerleave", () => {
      clearHoverState(track);
    });
  }
}
