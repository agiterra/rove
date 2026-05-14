# Rove Design System

**Product**: Rove — agentic UX evaluation for the agent-readable web. Walks any web app as both human personas (Nielsen / WCAG / ISO rubric) and agent personas (`agent.*` heuristics: semantic HTML, stable selectors, a11y tree completeness…). Files findings, not pass/fail assertions.

**Audience**: senior product engineers, design leads, and tech-forward founders evaluating whether their app is ready for the rising tide of AI agents using it on users' behalf.

## Atmosphere

Dark-first. Quiet, confident, technically dense without feeling noisy. Reads like a flight-deck readout, not a marketing landing page. The brand colors carry a sense of motion (something is observing, traversing, finding). Use motion *sparingly* — it should feel like a high-end IDE, not a SaaS demo.

Anti-patterns to avoid:
- Generic startup-purple gradients or "AI shimmer" effects
- Big rounded cards everywhere — Rove uses 14–16px radius, never 24+
- Pastel surfaces, off-white backgrounds, soft drop shadows
- Emoji-heavy empty states
- Status indicators that rely on color alone

## Palette

**Surfaces** (dark navy, never pure black — depth comes from layered tones):

- `bg`: `#07090f` — page background
- `bg-2`: `#0b0f18` — secondary surface (nav bg, etc.)
- `panel`: `#0f1422` — standard panel
- `panel-2`: `#141a2a` — elevated panel
- `border`: `#1f2740` — hairlines
- `border-strong`: `#2c3654` — emphasized borders

**Type** (cool off-white descending into deep slate):

- `text`: `#e8edf7` — primary
- `text-muted`: `#8a93ab` — secondary
- `text-faint`: `#5a6480` — tertiary / footnote

**Brand** (the Rove signature — cyan to navy diagonal gradient):

- `brand-cyan`: `#3fc9cb` — primary accent
- `brand-navy`: `#102c57` — gradient end
- `accent`: `#3fc9cb` — same as brand-cyan, semantic alias
- `accent-soft`: `rgba(63, 201, 203, 0.16)` — chip background
- `accent-2`: `#6ea8ff` — secondary accent (sky blue)
- `accent-2-soft`: `rgba(110, 168, 255, 0.18)`

**Brand gradient** (used on the mark, on outcome statements, and on primary CTAs only):

- 135deg from `#3fc9cb` to `#102c57`
- As text fill (`text-brand-gradient`) and as background (`bg-brand-gradient`)
- Never as a screen-wide background — that's the "AI shimmer" trap

**Severity** (findings carry one of four levels; colors are semantic):

- `critical`: `#f43f5e` (rose)
- `major`: `#fb923c` (orange)
- `minor`: `#facc15` (amber)
- `nit`: `#94a3b8` (slate)

## Typography

- **Body / UI font**: Geist Sans
- **Mono font**: Geist Mono — used for code, IDs, selectors, JSON, run hashes, URLs
- **Feature settings**: `ss01, cv11, cv01` on for refined glyphs

Scale (define once, use everywhere — no `text-[10px]` literals scattered through markup):

- `eyebrow` — 10–11px, line-height 1, letter-spacing 0.18em, uppercase, `text-faint`, weight 500
- `caption` — 11–12px, regular, `text-muted`
- `body-sm` — 13px / 1.5, regular, `text`
- `body` — 14px / 1.55, regular, `text`
- `lead` — 16px / 1.5, regular, `text`
- `h3` — 20px / 1.3, semibold, `text`
- `h2` — 28px / 1.2, semibold, `text`
- `h1` — 40px / 1.1, semibold, `text`
- `display` — 56px / 1.05, semibold, `text` — reserved for hero outcome statements with optional `.glow-accent` or `.glow-rose`

## Shape & spacing

- **Radius**: 4 (chips/pills), 8 (buttons/inputs), 14 (panels), 16 (hero surfaces)
- **Spacing scale**: 2, 4, 8, 12, 16, 24, 32, 48 (px)
- **Page container**: max-width 1280px, 24px gutters
- **Card padding**: 16–24px depending on density

## Elevation

Three levels, no shadow-dust on individual buttons or inputs:

- `surface` — panel background + 1px hairline border + 14px radius
- `surface-raised` — `panel-2` background + same border + same radius
- `surface-elevated` — `panel` background with a subtle top-edge cyan inner highlight, `border-strong`, 16px radius, and a brand-tinted outer shadow `0 24px 64px -32px rgba(16, 44, 87, 0.55)`. Reserved for the *single* "this is the thing on the page" panel per view.

## Motion

- Base transition: 120ms ease for hover, color, transform
- Kinetic hover (cards / rows): translateY(-1px) + panel brightening
- Pulse for "running" state: 1.6s ease-in-out infinite, opacity 0.6 → 1
- New-step entry: fade + slide-from-right 180ms
- Lightbox open: scale 0.96 → 1 + fade, 200ms
- **All motion respects `prefers-reduced-motion: reduce`** — substitutes opacity for transform, removes pulses

## Distinctive surfaces

- **Aurora** (`.aurora`) — atmospheric brand wash near the top of a hero section. Layered cyan + sky-blue radial gradients at 8% / 7% opacity. Adds depth, never grabs attention.
- **Divider-grad** (`.divider-grad`) — 1px line that fades from a brand-tinted center, replacing solid `<hr>`.
- **Glow-accent / glow-rose** — text-shadow halos for outcome statements (e.g., "Goal reached" / "Goal not reached"). Read confidently at 20ft, not garish at 6".
- **Brand-gradient outlines** — used sparingly on the primary-action button border and on form input focus rings.

## Iconography

Lucide-react only. 14–16px in dense rows, 18–20px for primary actions, 24+ for hero-scale glyphs. Stroke 1.5–2. Never decorative — every icon has a label or is paired with one.

## Component patterns

### Buttons

- **Primary**: brand-gradient text on `bg-2` with a 1px gradient border, `radius-8`, 12px vertical padding, font-weight 500. On hover, the gradient brightens 8%.
- **Secondary**: text-color text on transparent with a hairline border. Hover: panel-2 fill.
- **Ghost**: text-muted text, no border. Hover: panel-2 fill + text-color text.
- **Destructive**: rose-600 text on transparent, rose border on hover. Confirm modal required.
- **Loading state**: spinner icon left of label, disabled cursor, no opacity change (keep readable).

### Badges & Pills

- **Severity badge**: solid semantic color, dark text, radius-4, 10–11px, uppercase.
- **Status pill**: hairline border + soft fill in semantic color, 11–12px, sentence case, with a 6×6px filled dot prefix. Variants: online (cyan), offline / stopped (slate), paused (amber), errored (rose).
- **Count chip**: `accent-soft` fill, monospace numerals, radius-full.

### Inputs

- 8px radius, 1px border, 12px horizontal padding, 36–40px height.
- Focus: `2px` cyan outline (`outline-offset-2`), no layout shift, no shadow.
- Errored: 1px rose border + rose 11px helper text below.

### Empty states

- Lucide icon @ 32px in `text-faint`, headline at `body-sm` semibold, subline at `caption` regular, primary action button if applicable. Centered, with breathing room — no full-page "lonely empty" feeling.

### Tables

- Header row: `eyebrow-lg` style on a `panel-2/60` fill, `border-b border-border`.
- Body rows: `border-b border-border/50`, hover `kinetic-hover`, 12px vertical padding.
- Cells: never mix font sizes within a row.

## Live walk — the screens this design system primarily exists to support

The Rove run-detail page (`/runs/[id]`) is the product's flagship surface. It shows an agent's walk through a target app, **live as it happens**:

- **Filmstrip**: horizontal scrollable row of step tiles. Each tile shows a 240×135 screenshot thumbnail, a step number badge, a status dot (running / done / errored), the tool name (small mono), and the duration.
- **NowDoing pill**: a small banner near the top of the page describing the agent's current action in natural language — `Clicking "Create job"`, `Reading the page at /admin/scheduling`. Pulses while running, freezes when the walk completes.
- **Step list view**: vertical alternative to the filmstrip. One row per step. Expandable inline to show aria-snapshot tree and raw result.
- **Lightbox**: full-screen screenshot viewer with the aria-snapshot rendered as a collapsible tree on the right and tool call details on the bottom. Keyboard-driven (← / → / esc), pointer second.
- **FindingsStream**: a feed of findings the agent has filed during the walk. New findings fade in at the top. Each carries severity badge, title, heuristic chip, and a thumbnail of the screenshot at file-time.
- **Hero**: persona + flow + target URL + run status + the brand-gradient goal statement. When the walk is running, the status reads "Walking…" with the NowDoing pill below. When complete, it reads "Goal reached" / "Goal not reached" with the appropriate glow.

This page is the **demo artifact** for the product. Treat it as the highest-design-quality surface in the dashboard.
