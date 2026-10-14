# Noir Editorial UI refinement: foundation design

Date: 2026-10-14
Status: revised after feedback ("stay near my current design, with improvements"); awaiting written-spec review

## Goal

Keep MovieReckon's current look (dark theme, current red, current fonts, the red-tinted gradient backdrop, gradient glass-style panels, rounded corners) and make it more consistent, readable and phone-friendly. This is a refinement, not a new identity. This spec covers the **shared foundation layer only**; per-page work (Auth, Reckon, Home, browse, detail, Profile, Theater, info pages) is later sub-projects, each with its own plan.

## Decisions

- Visual direction: Noir Editorial feel, applied as a light touch on top of the existing design. The user's current UI is the reference; nothing should look unfamiliar.
- Keep: brand red `357 92% 48%`, fonts, `--radius`, the dark gradient backdrop, gradient panels, red glows, the floating pill bottom nav style, all current class names.
- Improve: consistency between pages, type hierarchy, spacing, contrast, touch targets, small-screen layouts, and performance on phones.
- No routing, API or data changes.

## Out of scope

- Per-page layout redesigns and the Reckon mapping fix (next sub-projects).
- Landing page (already redesigned; it must keep working).
- The untracked watch-source importer files.

## 1. Tokens and backdrop (`src/frontend/styles/index.css`)

- Slightly warm the neutrals (hue about 20, saturation 4-6%) for `--background`, `--card`, `--muted`, `--border`, so the dark reads like film black, not flat grey. Foreground becomes a soft off-white. Red tokens, `--radius` and fonts do not change.
- `--muted-foreground` is checked for at least 4.5:1 contrast on `--background` and `--card`; raise it if not.
- Add a `--page-gradient` token holding the current `app-page` recipe (two red radial glows and a dark fade) so every page uses one definition instead of copies.
- Define one type scale as utilities: kicker (small red uppercase), page title, section title, body, caption. Used by every page heading so hierarchy matches across the app.
- Both the `:root` and the dark block are updated together (they are currently identical).

## 2. Panels and surfaces

- `.surface-panel`, `.glass-detail-panel`, `.filter-panel`, `.empty-state`, `.select-surface` keep their gradient/glow look and radius. Improvements:
  - One shared border, padding and shadow definition (today they differ slightly), so panels match across pages.
  - On small screens (`max-width: 639px`) and for `prefers-reduced-transparency`/`prefers-reduced-motion`, drop `backdrop-filter` and use a solid equivalent fill. Phones stay fast and text stays readable over posters.
- `.page-heading*` and `.section-glass-icon` use the new type scale and a consistent icon-plus-title layout.
- `GlassPageFrame`: keep the lens and entry animation on `md` and up; skip the blur filter in the entry animation and hide the lens on phones.

## 3. Shared components and phone behaviour

- **Header**: same look. Fix overflow at 360px: logo and search/profile actions only under `md`, with 44px touch targets.
- **BottomNav**: same floating pill look. It currently shows 6 tabs in one row, which is cramped at 360px. Keep all 6 only from 400px up. Under 400px, show 5 (Home, Reckon, Movies, Series, Search) and keep Upcoming reachable from Movies and Series. Touch targets are at least 44px and `safe-area-inset-bottom` is respected.
- **ContentCard / carousels / grids**: same cards. `.content-grid` gets a 2-column layout at 360px (it is 3 today, which crops titles), then 3, 4, 5, 6 and 7 as width grows. Titles use two-line clamping.
- **Footer, AppSkeletons, AuthScreenShell**: only aligned to the new type scale and tokens.
- Main content bottom padding clears the bottom nav on phones.

## Rules every later batch must satisfy

- No horizontal scroll at 360px width.
- Tap targets at least 44px.
- Contrast: body text 4.5:1 or better, large text 3:1 or better.
- Verified with headless screenshots at 360, 768 and 1440px; vitest, `tsc` and `eslint` clean.
- The page must still look like the current MovieReckon at first glance.

## Testing

- Existing tests keep passing; any that assert changed class names are updated alongside.
- New tests: BottomNav shows 6 links at wide widths and 5 under 400px (with `aria-current` on the active route); `.content-grid` utilities are covered by a render test where practical.
- Per-batch headless screenshots at the three widths, compared with a baseline taken before the change.

## Risks

- Class names are stable, so most pages change appearance without a code diff. Mitigation: baseline screenshots of every top-level route at 3 widths before the first change.
- Warming neutrals could shift contrast on muted text. Mitigation: calculate ratios when choosing values.
- Dropping a tab on narrow phones changes navigation habits slightly. Upcoming stays one tap away.

## Next

After spec approval: write the implementation plan (writing-plans), then execute the foundation batch. Later sub-projects, each its own spec and plan: Auth screens, Reckon (mapping fix then redesign), Home, Movies/Series/Upcoming, Search, title and person pages, Profile, Theater, info pages.
