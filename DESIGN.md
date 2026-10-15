---
"name": "MovieReckon"
"description": "Existing dark cinematic browsing interface refined around choosing the next watch."
"colors":
  "primary": "hsl(357 92% 48%)"
  "primary-foreground": "hsl(0 0% 100%)"
  "background": "hsl(20 6% 4%)"
  "foreground": "hsl(20 8% 98%)"
  "card": "hsl(20 5% 7%)"
  "muted": "hsl(20 5% 15%)"
  "muted-foreground": "hsl(20 6% 70%)"
  "border": "hsl(20 5% 18%)"
  "secondary": "hsl(357 78% 28%)"
  "accent": "hsl(357 76% 14%)"
  "destructive": "hsl(0 84% 60%)"
  "rating-gold": "hsl(43 96% 56%)"
"typography":
  "display":
    "fontFamily": "Inter, system-ui, sans-serif"
    "fontSize": "4.25rem"
    "fontWeight": 750
    "lineHeight": 1.03
    "letterSpacing": "-0.035em"
  "headline":
    "fontFamily": "Inter, system-ui, sans-serif"
    "fontSize": "1.875rem"
    "fontWeight": 700
    "lineHeight": 1.2
    "letterSpacing": "-0.025em"
  "title":
    "fontFamily": "Inter, system-ui, sans-serif"
    "fontSize": "1.125rem"
    "fontWeight": 600
    "lineHeight": "1.75rem"
    "letterSpacing": "-0.025em"
  "body":
    "fontFamily": "Inter, system-ui, sans-serif"
    "fontSize": "1rem"
    "fontWeight": 400
    "lineHeight": 1.5
  "label":
    "fontFamily": "Inter, system-ui, sans-serif"
    "fontSize": "0.875rem"
    "fontWeight": 500
    "lineHeight": "1.25rem"
  "caption":
    "fontFamily": "Inter, system-ui, sans-serif"
    "fontSize": "0.75rem"
    "fontWeight": 400
    "lineHeight": "1rem"
"rounded":
  "sm": "4px"
  "md": "6px"
  "lg": "8px"
  "xl": "12px"
  "full": "9999px"
"spacing":
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "6": "24px"
  "8": "32px"
  "12": "48px"
"components":
  "button-primary":
    "backgroundColor": "{colors.primary}"
    "textColor": "{colors.primary-foreground}"
    "rounded": "{rounded.lg}"
    "height": "48px"
    "padding": "0 24px"
  "button-primary-hover":
    "backgroundColor": "hsl(357 92% 48% / 0.9)"
  "button-outline":
    "backgroundColor": "hsl(0 0% 100% / 0.1)"
    "textColor": "{colors.primary-foreground}"
    "rounded": "{rounded.lg}"
    "height": "48px"
    "padding": "0 20px"
  "button-ghost":
    "textColor": "{colors.foreground}"
    "rounded": "{rounded.md}"
    "size": "44px"
  "input":
    "backgroundColor": "{colors.background}"
    "textColor": "{colors.foreground}"
    "rounded": "{rounded.md}"
    "padding": "8px 12px"
  "navigation-link":
    "textColor": "hsl(20 8% 98% / 0.68)"
    "rounded": "{rounded.md}"
    "height": "44px"
    "padding": "0 14px"
  "rating-badge":
    "backgroundColor": "hsl(20 6% 4% / 0.8)"
    "textColor": "{colors.rating-gold}"
    "rounded": "{rounded.md}"
    "padding": "4px 8px"
  "poster-card":
    "backgroundColor": "{colors.card}"
    "rounded": "{rounded.lg}"
  "shelf-arrow":
    "backgroundColor": "hsl(20 8% 98% / 0.035)"
    "textColor": "hsl(20 8% 98% / 0.82)"
    "rounded": "50%"
    "size": "44px"
  "watchlist-item":
    "backgroundColor": "hsl(20 5% 15% / 0.25)"
    "rounded": "{rounded.xl}"
    "padding": "12px"
---

# Design System: MovieReckon

## Overview

**Creative North Star: "MovieReckon's existing cinematic browsing interface"**

MovieReckon retains its warm near-black canvas, red identity, existing logo, and Inter typography. Real film and series artwork carries the visual interest; clear titles, compact metadata, and useful actions support choosing the next watch. Stan, Prime Video, and Netflix inform browsing clarity within this established identity.

This records the implemented shared navigation, home hero, shelves, poster cards, watchlist entries, and recurring detail patterns. Other routes retain some older glass and gradient treatments; this document does not imply a complete migration.

**Key Characteristics:**

- Warm dark neutrals with solid red actions and selected states.
- Catalog photography, readable scrims, and portrait poster shelves.
- One sans-serif family with strong titles and quiet metadata.
- Responsive navigation and visible, separate watchlist status choices.

## Colors

One red family sits over warm dark neutrals. The frontmatter preserves canonical stylesheet HSL values; supporting formats do not replace them.

### Primary

- **MovieReckon Red:** Logo, main actions, active navigation markers, focus rings, and selected reactions.
- **Deep Red / Red Surface:** Existing secondary variants and subdued interaction backgrounds within the same red family.
- **Destructive Red:** Destructive actions such as removing an item, paired with clear labels or icons.

### Tertiary

- **Rating Gold:** Existing catalog rating badges and hero rating metadata.

### Neutral

- **Warm Near Black:** Canvas and media scrims.
- **Raised Charcoal / Muted Charcoal:** Poster frames, popovers, neutral controls, and tonal grouping.
- **Warm White / Action White:** Main content and text on red actions.
- **Warm Gray:** Supporting metadata and secondary copy.
- **Charcoal Stroke:** Inputs, dividers, and restrained boundaries. Input and border share a value; popover and card share a surface value.

**The Red Action Rule.** Use solid brand red for primary actions. Selected controls may use red tints with light labels. Keep ordinary text and resting surfaces neutral so artwork remains prominent.

## Typography

**Display Font:** Inter, with system-ui and sans-serif fallbacks.
**Body Font:** The same established stack.

**Character:** Strong titles contrast with quieter metadata. Labels use sentence or title case; short uppercase language codes remain data labels.

### Hierarchy

- **Display:** Featured title uses the frontmatter role, reducing to (3.5rem) on tablets and (2.75rem) on phones. Long titles use (3.5rem) on desktop and (2.125rem) on phones, with balanced wrapping.
- **Headline:** Shared page titles begin at (1.875rem) and become (2.25rem) on medium screens. Detail titles reach (3rem) on large screens.
- **Title:** Shelf headings begin at (1.125rem) and become (1.5rem) on medium screens. Poster titles use (0.875rem), semibold weight, snug leading, and two lines.
- **Body:** Standard reading copy uses the body role. Hero descriptions use (1.75) leading and three lines; mobile descriptions use (0.875rem). Detail overviews cap reading width at (72ch).
- **Label / Caption:** Navigation and actions use the label role; years use the caption role. The mobile bottom navigation's (10px) labels remain a local compact treatment, not the default caption size.

**The Title Before Metadata Rule.** Place a semibold title below poster artwork, then quieter metadata. Allow two title lines instead of squeezing the type.

## Layout

The refined header, home hero content, and shelves share a centered maximum width (1600px). Horizontal gutters are (48px) on desktop, (32px) at widths from (768px–1199px), and (16px) on phones; mobile hero copy uses (20px). Other routes retain the existing container capped at (1400px).

The fixed header is (72px) tall on larger screens and (64px) on phones. Full text navigation appears at (1024px); narrower widths use the menu. A safe-area-aware bottom bar appears below (768px). It omits its search tab at (400px) or less while header search remains available. Page content reserves bottom space.

Home combines one featured backdrop with portrait shelves. The hero is (68svh), bounded by (580px–760px), or (64svh), bounded by (540px–620px), on phones. Shelf spacing is (40px), increasing to (48px) at medium widths. Posters use a (2:3) ratio, gaps of (12px) then (16px), and widths from (42vw, capped at 170px) on phones through (160px), (180px), (200px), and (210px).

Catalog grids progress from two columns to three at (540px), four at (768px), five at (1024px), and six at (1280px), retaining (16px) column and (24px) row gaps. Watchlist entries place drag handle, poster/title, and remove action in the top row, with visible status choices below.

## Elevation & Depth

Depth comes chiefly from dark tones, thin borders, and scrims over photography. Refined primary actions use a restrained black shadow. The scrolled header adds a black shadow and desktop blur; the floating bottom navigation retains blur. Existing backgrounds carry faint red washes. Older glass panels and large glows are not the default for new catalog surfaces.

### Shadow Vocabulary

- **Primary action rest:** `0 6px 18px hsl(0 0% 0% / 0.2)`.
- **Primary action hover:** `0 8px 24px hsl(0 0% 0% / 0.3)`.

**The Readable Artwork Rule.** Use dark scrims to support text over photography. Keep poster artwork unobstructed at rest apart from useful metadata badges.

## Shapes

Soft rectangles recur: medium radius for small controls and badges, large radius for posters and prominent actions, extra-large radius for watchlist entries. Circles serve avatars, play actions, and shelf arrows. The bottom bar's (24px) enclosure is a local navigation shape. Borders remain thin (1px); active desktop navigation uses a red underline (2px).

## Components

### Buttons

Solid, clearly labeled actions. The primary frontmatter variant describes the featured action. Detail actions share its minimum height (48px), using (20px) horizontal padding. Hero secondary actions use a translucent white fill and stroke over photography; ghost actions use red-tinted hover and pressed states. Focus uses a red ring or outline (2px) with visible separation. Disabled controls reduce opacity and stop pointer interaction.

### Chips

Rating badges pair a filled star and supplied score with dark translucent fill, gold text, and stroke. Language badges use short codes within the red family; detail metadata uses quiet bordered chips. These do not establish extra decorative category colors.

### Cards / Containers

Portrait artwork dominates. Poster strokes brighten on hover; titles and metadata sit below. Current cards use a small hover lift (4px) and tap compression. Quick actions reveal on hover or keyboard focus and remain exposed on coarse pointers. They wrap to two columns on narrow cards, then four when the card container reaches (204px).

### Inputs / Fields

The existing input primitive has a dark fill, charcoal stroke, medium radius, muted placeholder, and red focus ring. Its retained default height is (40px); this documents the primitive, not a completed control-size migration. Refined navigation and watchlist buttons explicitly use (44px).

### Navigation

Header links have muted resting text, a brighter active label, and red underline. Scrolling turns the initial scrim into a more opaque surface. Mobile navigation pairs icons and labels with a tinted red active enclosure. The shared frame stays static and route transitions use opacity so fixed navigation remains anchored.

Shelf arrows are native circular buttons (44px), with quiet border and fill that brighten on hover. Disabled arrows have transparent border and fill at (0.3) opacity. Hide the arrow pair when the shelf fits; display it from medium widths only when horizontal scrolling is available.

### Featured Hero

Real backdrop photography uses a left-weighted desktop scrim and bottom-weighted mobile scrim. Keep supplied metadata, title, short synopsis, and two actions together. Artwork crossfades (400ms); slides rotate after (8s), pause on hover or focus, and expose a pause button. Reduced-motion mode stops automatic rotation and removes crossfade duration.

Landscape shortlist cards reuse the poster card with widescreen artwork, an independent save action, and quieter reaction controls.

### Watchlist Entry

A small portrait and two-line title sit between a dedicated drag handle and remove control. A separate bordered row exposes **Saved**, **Watching**, **Completed**, and **Dropped** as pressed-state buttons with minimum height (44px). They form two columns below (400px) and four from (400px). The active status uses a red tint, red text, and fine inset ring. Pending actions reduce opacity. Long titles must not compress the controls.

## Do's and Don'ts

### Do:

- **Do** preserve the MovieReckon logo, name, red identity, and established font stack.
- **Do** show ratings, release years, and recommendation explanations only when supplied by product data.
- **Do** retain the 44px controls used by refined navigation, poster actions, shelf arrows, and watchlist entries, with visible keyboard focus.
- **Do** show all four watchlist statuses as buttons, with a separate remove action beside the title.
- **Do** retain the hero pause control and interaction pause behavior, including its reduced-motion handling.

### Don't:

- **Don't** fill primary actions with gradients; the refined primary action is solid red.
- **Don't** hide watchlist statuses in a dropdown; the user selected visible choices.
- **Don't** rely on hover alone for essential poster actions; the implemented pattern also responds to focus and coarse pointers.
- **Don't** transform the shared frame or route wrapper around fixed navigation; the frame is static and route transitions change opacity.
- **Don't** promote legacy glass icon tiles, decorative kickers, glyph headings, or large glows into the default for new surfaces.
