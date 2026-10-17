import { describe, expect, it } from "vitest";
import { buildPosterWall } from "./posterWall";

const posters = (count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${i}`, src: `/img/${i}.jpg` }));

describe("buildPosterWall", () => {
  it("never repeats a poster across or within rows", () => {
    const { rows } = buildPosterWall(posters(20), 3, 8);
    const all = rows.flat().map((p) => p.src);
    expect(new Set(all).size).toBe(all.length);
  });

  it("removes the same title arriving from several lists", () => {
    const duplicated = [...posters(12), ...posters(12).map((p) => ({ ...p, id: `other-${p.id}` }))];
    const { rows } = buildPosterWall(duplicated, 3, 8);
    const all = rows.flat().map((p) => p.src);
    expect(all).toHaveLength(12);
    expect(new Set(all).size).toBe(12);
  });

  it("fills every row evenly and respects the per-row cap", () => {
    const { rows, perRow } = buildPosterWall(posters(40), 3, 8);
    expect(perRow).toBe(8);
    expect(rows.map((row) => row.length)).toEqual([8, 8, 8]);
  });

  it("uses fewer rows instead of wrapping when posters run short", () => {
    const { rows, perRow } = buildPosterWall(posters(9), 4, 8);
    expect(rows.length).toBe(2);
    expect(perRow).toBe(4);
    const all = rows.flat().map((p) => p.src);
    expect(new Set(all).size).toBe(all.length);
  });

  it("still returns one short row for a tiny set and nothing for an empty one", () => {
    expect(buildPosterWall(posters(2), 3, 8)).toEqual({ rows: [posters(2)], perRow: 2 });
    expect(buildPosterWall([], 3, 8)).toEqual({ rows: [], perRow: 0 });
  });

  it("ignores posters without a source", () => {
    const { rows } = buildPosterWall([{ id: "x", src: "" }, ...posters(8)], 2, 8);
    expect(rows.flat().every((p) => p.src)).toBe(true);
  });
});
