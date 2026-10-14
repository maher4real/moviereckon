import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf("\n  }", start));
}

function hsl(source: string, name: string): [number, number, number] {
  const match = new RegExp(`--${name}:\\s*(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`).exec(source);
  if (!match) throw new Error(`missing --${name}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([h, s, l]: [number, number, number]): number {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const channel = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(0) + 0.7152 * f(8) + 0.0722 * f(4);
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens", () => {
  for (const selector of [":root", ".dark"]) {
    describe(selector, () => {
      const tokens = block(selector);

      it("uses warm near-black neutrals", () => {
        for (const name of ["background", "card", "muted", "border"]) {
          const [hue, saturation] = hsl(tokens, name);
          expect(hue, name).toBeGreaterThanOrEqual(15);
          expect(hue, name).toBeLessThanOrEqual(30);
          expect(saturation, name).toBeGreaterThan(0);
        }
      });

      it("keeps the brand red untouched", () => {
        expect(hsl(tokens, "primary")).toEqual([357, 92, 48]);
      });

      it("keeps muted text readable (4.5:1) on background and card", () => {
        const muted = hsl(tokens, "muted-foreground");
        expect(contrast(muted, hsl(tokens, "background"))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(muted, hsl(tokens, "card"))).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  it("defines one page gradient and uses it for app pages", () => {
    expect(css).toMatch(/--page-gradient:/);
    expect(block(".app-page")).toContain("var(--page-gradient)");
  });
});

describe("type scale", () => {
  it.each([".page-kicker", ".page-title", ".section-title", ".caption-text"])("defines %s", (selector) => {
    expect(css).toContain(`${selector} {`);
  });
});

describe("panel blur on small screens", () => {
  const panels = [".surface-panel", ".glass-detail-panel", ".filter-panel", ".empty-state", ".select-surface", ".section-glass-icon"];

  function mediaBlock(query: string): string {
    const start = css.indexOf(`@media ${query}`);
    if (start === -1) throw new Error(`missing @media ${query}`);
    let depth = 0;
    for (let i = css.indexOf("{", start); i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
    throw new Error("unbalanced");
  }

  it.each(["(max-width: 639px)", "(prefers-reduced-transparency: reduce)"])("removes backdrop-filter under %s", (query) => {
    const media = mediaBlock(query);
    for (const panel of panels) expect(media, panel).toContain(panel);
    expect(media).toMatch(/backdrop-filter:\s*none/);
  });
});

describe("content grid", () => {
  it("starts at two columns on phones and adds a third at 480px", () => {
    const grid = block(".content-grid");
    expect(grid).toContain("grid-cols-2");
    expect(grid).toContain("min-[480px]:grid-cols-3");
    expect(grid).not.toMatch(/(^|\s)grid-cols-3(\s|;)/);
    for (const step of ["sm:grid-cols-4", "md:grid-cols-5", "lg:grid-cols-6", "xl:grid-cols-7"]) {
      expect(grid).toContain(step);
    }
  });
});
