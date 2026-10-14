# Noir Editorial Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine MovieReckon's shared UI layer (tokens, panels, type scale, nav, grids) so every page is more consistent and phone-friendly while still looking like the current design.

**Architecture:** All changes are in shared CSS (`src/frontend/styles/index.css`) and four shared components (BottomNav, Header, ContentCard, GlassPageFrame). Class names stay stable, so pages inherit the refinement without edits. A headless-Chromium screenshot harness (kept outside the repo) records before/after shots at 360, 768 and 1440px and checks for horizontal overflow.

**Tech Stack:** Next.js 16 (webpack), React, Tailwind v4 via `@config`, Vitest + Testing Library, playwright-core (scratchpad only, not a project dependency).

**Spec:** `docs/superpowers/specs/2026-10-14-noir-editorial-foundation-design.md`

## Global Constraints

- Keep brand red `--primary: 357 92% 48%`, fonts (Inter), `--radius: 0.5rem`, gradient panels and the floating pill bottom nav look.
- No routing, API or data changes. Do not touch `src/backend/services/watchSources/`, `src/app/api/`, `src/shared/types/watchSources.ts`, `docs/watch-source-importer.md`, `.env.example`, `vercel.json`, `package.json`, `package-lock.json` (user's unrelated work).
- No horizontal scroll at 360px width on any checked route.
- Tap targets at least 44px (`size-11` / `h-11 w-11`).
- Body text contrast at least 4.5:1, large text at least 3:1.
- No `backdrop-filter` on content panels under `max-width: 639px`.
- `vitest run`, `tsc --noEmit` and `eslint src` stay clean after every task.
- Do not commit unless the user has asked; if committing, stage only the files each task lists.

## Review Focus

- Viewport exactly 399px vs 400px: bottom nav must show 5 tabs at 399px and 6 at 400px (Task 4 test pins the class contract; Task 1 harness checks 360px).
- A card title that is very long or has no spaces in a 2-column grid at 360px must not overflow the card (Task 5 asserts `line-clamp-2` plus `break-words`; harness overflow check covers the page).
- Users who prefer reduced transparency/motion must not get blurred panels (Task 3 test).
- Header on a user with no avatar and a long username must keep the three action buttons on one row at 360px (Task 6 harness check via screenshot and overflow assertion).
- iOS home-indicator devices: bottom nav padding must keep `env(safe-area-inset-bottom)` (already in `.safe-area-bottom`; Task 4 test asserts the class stays on the nav).

---

## File Structure

- `src/frontend/styles/index.css`: tokens, `--page-gradient`, type scale, small-screen panel rules, content grid.
- `src/frontend/styles/tokens.test.ts` (create): reads `index.css` and asserts tokens, contrast and rules.
- `src/frontend/components/BottomNav.tsx` (modify) and `BottomNav.test.tsx` (create).
- `src/frontend/components/Header.tsx` (modify): 44px action buttons.
- `src/frontend/components/ContentCard.tsx` (modify): two-line title clamp.
- `src/frontend/components/GlassPageFrame.tsx` (modify): no blur filter on phones.
- Scratchpad (not committed): `.../scratchpad/pw/ui-shots.mjs`, output in `.../scratchpad/shots/{before,after}`.

Scratchpad root used below: `SP=/private/tmp/claude-501/-Users-maheralivijapura-Desktop-Development-projects-moviereckon/c82a8710-fda9-48e3-8cf1-c4888fd55fab/scratchpad`

---

### Task 1: Screenshot harness and baseline

**Files:**
- Create: `$SP/pw/ui-shots.mjs` (scratchpad, not in repo)

**Interfaces:**
- Produces: `node ui-shots.mjs <outDir>` writes `<outDir>/<route>-<width>.png` and prints one JSON line per shot `{route,width,scrollWidth,innerWidth,overflow}`; later tasks compare `before/` and `after/`.

- [ ] **Step 1: Write the harness**

```js
// $SP/pw/ui-shots.mjs
import { chromium } from "playwright-core";
import { mkdirSync, readdirSync } from "fs";

const outDir = process.argv[2];
if (!outDir) throw new Error("usage: node ui-shots.mjs <outDir>");
mkdirSync(outDir, { recursive: true });

const base = process.env.BASE_URL || "http://localhost:3111";
const shellDir = process.env.HOME + "/Library/Caches/ms-playwright/chromium_headless_shell-1228/";
const shell = readdirSync(shellDir).find((d) => d.startsWith("chrome-headless"));
const browser = await chromium.launch({ executablePath: `${shellDir}${shell}/chrome-headless-shell` });

const posters = ["/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg", "/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg", "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg", "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg", "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg"];
const results = Array.from({ length: 20 }, (_, i) => ({
  id: i + 1,
  title: i === 3 ? "Supercalifragilisticexpialidocious_Extraordinarily_Long_Title_Without_Spaces" : `Sample Movie ${i + 1}`,
  name: `Sample Show ${i + 1}`,
  overview: "Sample overview for layout checks only.",
  poster_path: posters[i % posters.length],
  backdrop_path: posters[i % posters.length],
  release_date: "2025-03-01",
  first_air_date: "2025-03-01",
  vote_average: 7.5,
  vote_count: 800,
  popularity: 50,
  genre_ids: [18],
  original_language: "en",
}));
const fakeUser = { id: "507f1f77bcf86cd799439011", email: "demo@example.com", username: "a_really_long_demo_username", role: "user", avatar_url: null, created_at: "2025-01-01", updated_at: "2025-01-01", emailVerified: true };

const routes = ["/", "/auth", "/about", "/home", "/reckon", "/movies", "/series", "/upcoming", "/search", "/profile", "/theater"];
const widths = [[360, 780], [768, 1024], [1440, 900]];

for (const [width, height] of widths) {
  const context = await browser.newContext({ viewport: { width, height } });
  await context.addCookies([{ name: "moviereckon_access", value: "fake", url: base }]);
  const page = await context.newPage();
  await page.route("**/api/auth/me", (r) => r.fulfill({ json: { user: fakeUser } }));
  await page.route("**/api/tmdb?*", (r) => r.fulfill({ json: { page: 1, results, total_pages: 3, total_results: 60, genres: [{ id: 18, name: "Drama" }] } }));
  await page.route("**/api/user/**", (r) => r.fulfill({ json: { data: [] } }));
  for (const route of routes) {
    await page.goto(base + route, { waitUntil: "load" });
    await page.waitForTimeout(2500);
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    const name = (route === "/" ? "root" : route.slice(1).replace(/\//g, "_")) + `-${width}`;
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
    console.log(JSON.stringify({ route, width, ...metrics, overflow: metrics.scrollWidth > metrics.innerWidth }));
  }
  await context.close();
}
await browser.close();
```

- [ ] **Step 2: Start the dev server**

Run: `cd /Users/maheralivijapura/Desktop/Development/projects/moviereckon && (npx next dev --webpack -p 3111 > $SP/dev.log 2>&1 &)` then wait until `curl -s -o /dev/null -w "%{http_code}" http://localhost:3111/` prints `200`.

- [ ] **Step 3: Record the baseline**

Run: `cd $SP/pw && node ui-shots.mjs $SP/shots/before | tee $SP/shots/before.jsonl`
Expected: 33 JSON lines. Note which `overflow` values are `true` (existing problems); they must be fixed or explained by Task 7.

- [ ] **Step 4: Eyeball two baselines**

Open `$SP/shots/before/movies-360.png` and `$SP/shots/before/home-360.png`. Confirm they show real pages (nav, posters), not a redirect to `/`. If they redirect, fix the fake-session setup in the harness before continuing.

No commit (scratchpad only).

---

### Task 2: Warm tokens and one page-gradient token

**Files:**
- Modify: `src/frontend/styles/index.css:9-34` (`:root`), `:75-100` (`.dark`), the `/* Custom MovieReckon tokens */` block, `.app-page`
- Create: `src/frontend/styles/tokens.test.ts`

**Interfaces:**
- Produces: CSS variable `--page-gradient`; `.app-page` uses `background: var(--page-gradient)`.

- [ ] **Step 1: Write the failing test**

```ts
// src/frontend/styles/tokens.test.ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "index.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`missing ${selector}`);
  return css.slice(start, css.indexOf("\n  }", start));
}

function hsl(block: string, name: string): [number, number, number] {
  const match = new RegExp(`--${name}:\\s*(\\d+(?:\\.\\d+)?)\\s+(\\d+(?:\\.\\d+)?)%\\s+(\\d+(?:\\.\\d+)?)%`).exec(block);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/frontend/styles/tokens.test.ts`
Expected: FAIL (hue is 0 for neutrals; `--page-gradient` missing).

- [ ] **Step 3: Warm the tokens (both `:root` and `.dark`)**

In `index.css`, in **both** blocks replace exactly these lines:

```css
--background: 0 0% 4%;      →  --background: 20 6% 4%;
--foreground: 0 0% 98%;     →  --foreground: 20 8% 98%;
--card: 0 0% 7%;            →  --card: 20 5% 7%;
--popover: 0 0% 7%;         →  --popover: 20 5% 7%;
--muted: 0 0% 15%;          →  --muted: 20 5% 15%;
--muted-foreground: 0 0% 64%; →  --muted-foreground: 20 6% 64%;
--border: 0 0% 18%;         →  --border: 20 5% 18%;
--input: 0 0% 18%;          →  --input: 20 5% 18%;
```

Also warm the body/app-page fades: replace `hsl(0 0% 6%)` with `hsl(20 6% 6%)` and `hsl(0 0% 3%)` with `hsl(20 6% 3%)` wherever they appear in `body`, `.landing-cinema` and `.app-page` backgrounds.

- [ ] **Step 4: Add `--page-gradient` and use it**

In the `/* Custom MovieReckon tokens */` block (after `--shadow-glow`), add:

```css
    --page-gradient:
      radial-gradient(circle at 12% 5%, hsl(var(--primary) / 0.13), transparent 26rem),
      radial-gradient(circle at 88% 10%, hsl(var(--brand-red-bright) / 0.11), transparent 26rem),
      linear-gradient(180deg, hsl(20 6% 6% / 0.92), hsl(var(--background)) 34rem);
```

Replace the `.app-page` rule's `background: ...;` declaration (the three-layer gradient) with:

```css
    background: var(--page-gradient);
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/frontend/styles/tokens.test.ts`
Expected: PASS (all cases for `:root` and `.dark`).

- [ ] **Step 6: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: all clean.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/frontend/styles/index.css src/frontend/styles/tokens.test.ts
git commit -m "style: warm neutrals and single page-gradient token"
```

---

### Task 3: Type scale and phone-safe panels

**Files:**
- Modify: `src/frontend/styles/index.css` (after `.empty-state`; near `.page-kicker`/`.page-title`)
- Modify: `src/frontend/styles/tokens.test.ts` (append tests)

**Interfaces:**
- Consumes: Task 2's `block()` helper in the same test file.
- Produces: utility classes `.section-title`, `.caption-text`; rule that disables panel blur under `max-width: 639px` and under `prefers-reduced-transparency`.

- [ ] **Step 1: Write the failing tests (append to tokens.test.ts)**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/frontend/styles/tokens.test.ts`
Expected: FAIL (`.section-title`, `.caption-text` and media blocks missing).

- [ ] **Step 3: Add the type utilities**

Directly after the existing `.page-title { ... }` rule, add:

```css
  .section-title {
    @apply text-xl font-bold tracking-tight md:text-2xl;
  }

  .caption-text {
    @apply text-xs leading-5 text-muted-foreground;
  }
```

- [ ] **Step 4: Add the panel rules (directly after `.empty-state { ... }`)**

```css
  @media (max-width: 639px) {
    .surface-panel,
    .glass-detail-panel,
    .filter-panel,
    .empty-state,
    .select-surface,
    .section-glass-icon,
    .page-heading-icon {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    .surface-panel,
    .glass-detail-panel,
    .filter-panel,
    .empty-state,
    .select-surface,
    .section-glass-icon,
    .page-heading-icon {
      -webkit-backdrop-filter: none;
      backdrop-filter: none;
    }
  }
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run src/frontend/styles/tokens.test.ts`
Expected: PASS.

- [ ] **Step 6: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean.

- [ ] **Step 7: Commit (only if user asked)**

```bash
git add src/frontend/styles/index.css src/frontend/styles/tokens.test.ts
git commit -m "style: add section/caption type scale, drop panel blur on phones"
```

---

### Task 4: BottomNav shows 5 tabs under 400px

**Files:**
- Modify: `src/frontend/components/BottomNav.tsx:6-14` (navItems), grid line, link className
- Create: `src/frontend/components/BottomNav.test.tsx`

**Interfaces:**
- Produces: `navItems` entries gain optional `hideOnNarrow?: boolean`; the Upcoming item sets it. Links with it carry class `max-[399px]:hidden`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/frontend/components/BottomNav.test.tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", () => ({
  motion: {
    nav: ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => <nav {...props}>{children}</nav>,
    span: (props: React.HTMLAttributes<HTMLSpanElement>) => <span {...props} />,
  },
}));

import BottomNav from "./BottomNav";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
    </MemoryRouter>,
  );
}

describe("BottomNav", () => {
  it("renders six tabs and marks the active route", () => {
    renderAt("/reckon");
    const links = screen.getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(["Home", "Reckon", "Movies", "Series", "Upcoming", "Search"]);
    expect(screen.getByRole("link", { name: "Reckon" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("hides only Upcoming below 400px and switches the grid to five columns", () => {
    renderAt("/home");
    const hidden = screen.getAllByRole("link").filter((link) => link.className.includes("max-[399px]:hidden"));
    expect(hidden.map((link) => link.textContent)).toEqual(["Upcoming"]);
    expect(screen.getByRole("navigation").innerHTML).toContain("max-[399px]:grid-cols-5");
  });

  it("keeps the iOS safe-area padding on the nav", () => {
    renderAt("/home");
    expect(screen.getByRole("navigation")).toHaveClass("safe-area-bottom");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/frontend/components/BottomNav.test.tsx`
Expected: FAIL (no `max-[399px]` classes).

- [ ] **Step 3: Implement**

In `BottomNav.tsx` change the Upcoming item and the type of `navItems`:

```tsx
const navItems: Array<{
  href: string;
  label: string;
  icon: typeof Home;
  hideOnNarrow?: boolean;
}> = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/reckon", label: "Reckon", icon: Sparkles },
  { href: "/movies", label: "Movies", icon: Clapperboard },
  { href: "/series", label: "Series", icon: Tv },
  { href: "/upcoming", label: "Upcoming", icon: CalendarDays, hideOnNarrow: true },
  { href: "/search", label: "Search", icon: Search },
];
```

Change the grid container class from `grid h-14 grid-cols-6 items-center gap-0.5 sm:gap-1` to:

```tsx
<div className="grid h-14 grid-cols-6 items-center gap-0.5 max-[399px]:grid-cols-5 sm:gap-1">
```

In the `<Link>` `className={cn(...)}` add `item.hideOnNarrow && "max-[399px]:hidden"` as an extra argument after the active/inactive branch, and change `h-full` to `h-full min-h-11`.

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/frontend/components/BottomNav.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Full checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/frontend/components/BottomNav.tsx src/frontend/components/BottomNav.test.tsx
git commit -m "feat: bottom nav shows five tabs below 400px"
```

---

### Task 5: Two-column phone grid and two-line card titles

**Files:**
- Modify: `src/frontend/styles/index.css` (`.content-grid`)
- Modify: `src/frontend/components/ContentCard.tsx:262`
- Modify: `src/frontend/styles/tokens.test.ts` (append)

**Interfaces:**
- Produces: `.content-grid` is `grid-cols-2` by default, 3 from 480px, then unchanged from `sm` up.

- [ ] **Step 1: Write the failing test (append to tokens.test.ts)**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/frontend/styles/tokens.test.ts -t "content grid"`
Expected: FAIL.

- [ ] **Step 3: Update the grid**

Replace the `.content-grid` `@apply` line with:

```css
    @apply grid grid-cols-2 gap-3 transition-opacity duration-200 min-[480px]:grid-cols-3 sm:grid-cols-4 sm:gap-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7;
```

- [ ] **Step 4: Two-line title clamp**

In `ContentCard.tsx` line 262 change the `<h3>` class to:

```tsx
<h3 className="mt-2 break-words text-sm font-medium leading-snug line-clamp-2 group-hover/card:text-primary transition-colors">
```

- [ ] **Step 5: Run tests and checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean, content grid test passes.

- [ ] **Step 6: Commit (only if user asked)**

```bash
git add src/frontend/styles/index.css src/frontend/styles/tokens.test.ts src/frontend/components/ContentCard.tsx
git commit -m "style: two-column phone grid and two-line card titles"
```

---

### Task 6: 44px header actions and lighter page entry on phones

**Files:**
- Modify: `src/frontend/components/Header.tsx` (search, profile, menu buttons)
- Modify: `src/frontend/components/GlassPageFrame.tsx:21-47`

**Interfaces:**
- Consumes: none. Produces: header buttons `size-11`; page entry animation without `filter` on viewports under 768px.

- [ ] **Step 1: Header touch targets**

In `Header.tsx`:
- Search button: `className="text-muted-foreground hover:text-foreground"` becomes `className="size-11 text-muted-foreground hover:text-foreground"`.
- Profile button: replace `h-10 w-10` with `size-11` (keep the rest of its classes).
- Menu toggle: `className="text-muted-foreground hover:text-foreground lg:hidden"` becomes `className="size-11 text-muted-foreground hover:text-foreground lg:hidden"`.

- [ ] **Step 2: GlassPageFrame entry without blur on phones**

Replace the `if (page) { gsap.fromTo(...) }` block with:

```tsx
      if (page) {
        const isPhone =
          typeof window.matchMedia === "function" &&
          window.matchMedia("(max-width: 767px)").matches;
        gsap.fromTo(
          page,
          { autoAlpha: 0, y: 14, ...(isPhone ? {} : { filter: "blur(3px)" }) },
          {
            autoAlpha: 1,
            y: 0,
            ...(isPhone ? {} : { filter: "blur(0px)" }),
            duration: 0.42,
            ease: "power3.out",
          },
        );
      }
```

- [ ] **Step 3: Checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: clean.

- [ ] **Step 4: Commit (only if user asked)**

```bash
git add src/frontend/components/Header.tsx src/frontend/components/GlassPageFrame.tsx
git commit -m "style: 44px header actions, no blur entry on phones"
```

---

### Task 7: After screenshots and verification

**Files:** none modified (fixes found here go back to the owning task's files).

- [ ] **Step 1: Capture after-shots**

With the dev server from Task 1 still running (restart per Task 1 Step 2 if not):
Run: `cd $SP/pw && node ui-shots.mjs $SP/shots/after | tee $SP/shots/after.jsonl`

- [ ] **Step 2: Overflow check**

Run: `grep '"width":360' $SP/shots/after.jsonl | grep '"overflow":true'`
Expected: no output. Any route listed has horizontal scroll at 360px: find the offending element (`document.querySelectorAll('*')` with `getBoundingClientRect().right > innerWidth`), fix it in its page or the shared CSS, rerun.

- [ ] **Step 3: Visual comparison**

Open these pairs from `before/` and `after/` and confirm the page still looks like current MovieReckon (red glows, gradient panels, floating nav), warmer blacks, two columns at 360px, five tabs at 360px, readable titles: `movies-360`, `home-360`, `reckon-360`, `search-360`, `movies-1440`, `home-768`. Record anything off.

- [ ] **Step 4: Final automated checks**

Run: `npx vitest run && npx tsc --noEmit && npx eslint src`
Expected: all clean. Stop the dev server: `pkill -f "next dev --webpack -p 3111"`.

- [ ] **Step 5: Report**

Summarize: tasks done, overflow results, any visual deviations, files changed. Do not commit unless asked.
