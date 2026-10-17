export interface WallPoster {
  id: string;
  src: string;
}

export interface PosterWallLayout {
  rows: WallPoster[][];
  perRow: number;
}

const MIN_PER_ROW = 4;

/**
 * Split posters into marquee rows so no poster appears twice on screen.
 *
 * Duplicates are removed first (the same title can arrive from several lists).
 * Each row then takes its own slice. When there are too few posters, the wall
 * gets fewer or shorter rows rather than wrapping around and repeating.
 */
export function buildPosterWall(posters: WallPoster[], rowCount: number, maxPerRow: number): PosterWallLayout {
  const seen = new Set<string>();
  const unique = posters.filter((poster) => {
    if (!poster.src || seen.has(poster.src)) return false;
    seen.add(poster.src);
    return true;
  });
  if (unique.length === 0) return { rows: [], perRow: 0 };

  let rows = Math.max(1, rowCount);
  let perRow = Math.min(maxPerRow, Math.floor(unique.length / rows));
  while (perRow < MIN_PER_ROW && rows > 1) {
    rows -= 1;
    perRow = Math.min(maxPerRow, Math.floor(unique.length / rows));
  }
  perRow = Math.max(1, Math.min(perRow, unique.length));

  return {
    rows: Array.from({ length: rows }, (_, index) => unique.slice(index * perRow, (index + 1) * perRow)),
    perRow,
  };
}
