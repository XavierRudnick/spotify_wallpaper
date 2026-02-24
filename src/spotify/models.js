function hashText(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickImage(images = []) {
  if (!Array.isArray(images) || images.length === 0) {
    return "";
  }

  return images[1]?.url ?? images[0]?.url ?? "";
}

export function normalizeAlbumItem(input) {
  const fallbackId = `fallback-${Math.random().toString(36).slice(2, 10)}`;
  const id = String(input?.id ?? input?.uri ?? fallbackId);
  const source = String(input?.id ?? input?.name ?? input?.uri ?? id);
  const seed = hashText(source);

  return {
    id,
    imageUrl: input?.imageUrl ?? pickImage(input?.images),
    contextUri: input?.contextUri ?? input?.uri ?? "",
    hueA: seed % 360,
    hueB: (seed * 7) % 360,
    glow: 0.2 + ((seed % 60) / 200)
  };
}

export function dedupeAlbums(items) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    if (!item?.id || seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    output.push(item);
  }

  return output;
}
