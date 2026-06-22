# NEXEZ — LIQUID GLASS DESIGN SYSTEM
## Implementation prompt for Claude Code

You are implementing the complete visual identity for nexez.ai — marketing site and in-app product. Two files are the **ground truth** and should be ported verbatim into the codebase before anything else: `nexez-design-system.css` (tokens + components + motion CSS) and `nexez-fx.js` (interaction layer). If they are present in the repo, never re-derive values from this document — this document tells you how to *use and extend* them. If they are absent, reconstruct them exactly from the specs below.

**The one-sentence brief:** matte black liquid glass — iOS-grade physical buttons, restrained frost, light that follows the cursor, color reserved for meaning. Premium comes from restraint.

---

## 0 · Hard rules (violations are bugs)

1. **Never hard-code a color, shadow, blur, or radius.** Every visual value comes from a CSS custom property. If a needed token doesn't exist, add it to BOTH themes, then use it.
2. **No multicolor gradient text.** Headlines use the tonal `--grad-text` fade only. The prism gradient appears exclusively in: 1px hairlines, readiness rings, the logo diagonal, eyebrow ticks.
3. **Color signals meaning, never decoration.** `--signal` persimmon (`#FF6A33`) = importance / interactive / primary; `--signal-solid` (`#DC4F1E`) is the deep fill behind white button text (AA). `--ready` teal = agent-ready/positive states. `--amber` = caution / needs attention. **The platform is restrained** (mono base; persimmon reserved for importance), **the homepage is expressive**. The dashboard canvas is calmed via `.nx-dash` (neutralizes `--signal`/`--signal-solid` to `--fg`; the sidebar re-asserts persimmon on the active nav), and primary buttons read as clean neutral-inverse pills (`--fg` fill / `--bg` text — white pill in dark, black pill in light).
4. **Respect the gloss budget.** Edge highlights, sheens, and glows are already tuned to a matte finish. Do not brighten them. New components inherit `--edge`, `--sheen`, `--card-glow` — never invent stronger ones.
5. **Code/data wells stay dark in BOTH themes** (terminal aesthetic): background `--well`, text `--well-muted`, syntax colors fixed `#FF6A33 / #5FEAD3 / #FFD9A8`.
6. **Every page works in both themes.** Theme = `data-theme="light"` on `<html>`; default (no attribute) is black. `flip()` toggles. Test every new component in both before shipping.
7. **`prefers-reduced-motion: reduce`** must show the full design with entrances skipped. Cursor specular may remain (static, non-animated response).
8. **Semi-transparent elements never straddle a border** (the pricing-badge lesson). Anything overlapping a card edge gets an opaque backing: `linear-gradient(tint,tint), var(--bg)`.

---

## 1 · Design tokens

Fonts (Google Fonts): **Schibsted Grotesk** 500/600/700 (display, letter-spacing −0.035em), **Instrument Sans** (body/UI), **JetBrains Mono** 400/500 (all data: prices, payloads, labels, scores).

### Dark (default — pure black)
```
--bg:#000           --text:#EEF1F8        --muted:rgba(238,241,248,.58)
--faint:rgba(238,241,248,.34)             --text-dim:rgba(238,241,248,.66)
--glass:rgba(255,255,255,.035)            --glass-strong:rgba(255,255,255,.06)
--fill-1:rgba(255,255,255,.045)           --fill-2:rgba(255,255,255,.075)
--line:rgba(255,255,255,.1)  --line-soft:rgba(255,255,255,.065)  --line-hi:rgba(255,255,255,.22)
--edge:rgba(255,255,255,.13)              --edge-soft:rgba(255,255,255,.06)
--raise:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.03))
--blur-card:10px  --blur-btn:12px  --sat:125%
--well:#0A0D13  --well-line:rgba(255,255,255,.08)  --well-muted:rgba(238,241,248,.62)
--signal:#FF6A33  --signal-solid:#DC4F1E  --ready:#5FEAD3  --amber:#FFD9A8
--prism:linear-gradient(90deg,#FF6A33,#5FEAD3 55%,#FFD9A8)
--sheen:rgba(255,255,255,.13)  --card-glow:rgba(255,255,255,.035)
--btn-grad:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,.025))
--btn-border:rgba(255,255,255,.13)  --btn-edge:rgba(255,255,255,.15)
--pri-grad:linear-gradient(180deg,rgba(255,140,90,.26),rgba(255,106,51,.07))
--pri-border:rgba(255,106,51,.38)
--pri-glow:0 10px 28px -12px rgba(255,106,51,.26)
--r-card:26px  --r-pill:999px
```

### Light (`html[data-theme="light"]`)
```
--bg:#F4F5F8  --text:#0D1016  --muted:rgba(13,16,22,.62)  --faint:rgba(13,16,22,.4)
--text-dim:rgba(13,16,22,.58)
--glass:rgba(255,255,255,.6)  --glass-strong:rgba(255,255,255,.78)
--fill-1:rgba(13,16,22,.045)  --fill-2:rgba(13,16,22,.075)
--line:rgba(13,16,22,.12)  --line-soft:rgba(13,16,22,.07)  --line-hi:rgba(13,16,22,.26)
--edge:rgba(255,255,255,.6)  --edge-soft:rgba(255,255,255,.38)
--raise:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.6))
--signal:#FF6A33  --signal-solid:#DC4F1E  --ready:#0E9F87  --amber:#C8862F
--prism:linear-gradient(90deg,#FF6A33,#15B79E 55%,#E8A94C)
--sheen:rgba(255,255,255,.32)  --card-glow:rgba(255,106,51,.05)
--btn-grad:linear-gradient(180deg,rgba(255,255,255,.92),rgba(255,255,255,.55))
--btn-border:rgba(13,16,22,.1)  --btn-edge:rgba(255,255,255,.7)
--pri-grad:linear-gradient(180deg,rgba(255,106,51,.2),rgba(255,106,51,.06))
--pri-border:rgba(255,106,51,.36)
(wells, radii, fonts unchanged)
```

### Atmosphere (once per page)
`<div class="atmos"></div>` — fixed, z −2: three faint radial prism washes over the bg color + an SVG fractal-noise grain at ~3% opacity (inverted in light mode). Never stronger.

---

## 2 · Component recipes

### Liquid button `.btn` (the signature)
Pill radius, `--btn-grad` fill, `backdrop-filter: blur(var(--blur-btn)) saturate(var(--sat))`, 1px `--btn-border`, single inset top edge `inset 0 1px 0 var(--btn-edge)`.
Behavior — all four are mandatory:
- **Sheen sweep** (`::before`): 115° highlight band using `--sheen`, translates −80%→80% across on hover, 0.8s `cubic-bezier(.22,1,.36,1)`.
- **Cursor specular** (`::after`): `radial-gradient(130px 70px at var(--mx) var(--my), var(--sheen), transparent 72%)`, fades in on hover; `--mx/--my` set by the global pointermove handler in fx.js.
- **Spring hover**: `translateY(-2px) scale(1.025)`, `transform .35s cubic-bezier(.34,1.56,.5,1)`.
- **Press squish**: `:active` `scale(.965)`, .1s.
Variants: `.btn-primary` adds `--pri-grad` layer, `--pri-border`, `--pri-glow`. `.btn-ghost` = near-flat. `.btn-sm` = compact. Arrow icon `<span class="arr">→</span>` nudges +3px on hover. Focus: `outline:2px solid var(--signal); offset 3px`.

### Glass panel `.glass`
`--glass` fill, `--line-soft` border, `--r-card` radius, blur `--blur-card`, one inset top edge. Modifiers: `.prism` = 1px prism hairline across the top (8%→92%, opacity .45). `.lift` = hover raises −4px + cursor-tracked `--card-glow` radial inside. `.card` = 1.8rem padding.

### Nav `.glassnav` (marketing) / `.topbar` (app)
Sticky frosted pill (marketing) or full-width bar (app). Contains: logo lockup, links (`.on` for active), ◐ theme toggle button (`.btn.mode`), actions. App topbar adds breadcrumb + autosave pulse (`.save`, teal dot).

### Chips `.chip`
Mono font, pill, `--fill-1`. `.chip.ready` = teal text/border/tint + glowing 6px dot. Used for statuses, counts, filters (add `.on` state).

### Forms (app)
`.field` = mono uppercase micro-label + input. Inputs: `--fill-1` bg, `--line-soft` border, 12px radius; focus = `--pri-border` + `0 0 0 3px rgba(142,158,255,.12)` halo.
`.pillset` = segmented control (book/buy/contact pattern). `.switch` = 46×27 iOS toggle, knob springs with `cubic-bezier(.34,1.56,.5,1)`; on-state teal tint.

### Data display
`.kpi-num` = display font, counts up on scroll (fx.js handles `$48.2k`, `2,847`, `19+`; skips non-numeric like `<200ms`).
`.ring` = SVG readiness ring, `stroke:url(#prismGrad)` (define the gradient once per page), draws from full circumference to its `stroke-dashoffset` on reveal — fx.js reads the element's own `stroke-dasharray`, so any size works.
`.payload` / `.trace` = dark wells (rule 0.5).
Charts: bars scale from baseline, share-fills sweep from left, funnel steps cascade — all staggered by fx.js when the parent card reveals.

### Floating badge (e.g. "Most popular")
`.flag`: absolute, top −15px, centered, z-index 3, `white-space:nowrap`, **opaque backing** `linear-gradient(teal-tint, teal-tint), var(--bg)`, soft drop shadow. Per-theme tint values exist — reuse them.

---

## 3 · Motion layer (fx.js — port verbatim)

1. **Global cursor specular**: one passive `pointermove` listener writes `--mx/--my` (%) onto the nearest `.btn` or `.glass.lift`.
2. **Reveal pattern**: `.glass/.bubble/.kpi` get `.rv` (opacity 0, +22px); IntersectionObserver adds `.inview` with per-element stagger; **then strips `.rv`/`.inview` after 1500ms** so native hover transforms are never overridden. Child bar/fill/funnel transitions are scoped to `.rv` so they survive the release. Preserve this release pattern exactly — it is the fix for the cascade conflict.
3. **Counters / rings**: as in §2.
4. **Hero stagger**: first `h1.display` is split into word spans (handles `<br>` and `.grad-text` children), each rises with 85ms cascade.
5. **Reduced motion**: bail out before adding the `fx` class.
6. `flip()` toggles `data-theme` on `<html>`.

Only ambient motion allowed: the logo's 4s breathing pulse. Everything else is user-triggered.

---

## 4 · Logo

Lockup = mark + lowercase wordmark "nexez" (Schibsted Grotesk 700, −0.04em). The mark is an N: two verticals in `currentColor` (the structure), the diagonal in the prism gradient (the parse). Theme-aware by construction. Asset: `nexez-logomark.svg`. Inline version (use everywhere; gradient stops use `var(--signal)/var(--ready)/var(--amber)`):

```html
<svg class="mark" viewBox="0 0 32 32" fill="none" aria-hidden="true">
  <defs><linearGradient id="lgrad" x1="7" y1="7" x2="25" y2="25" gradientUnits="userSpaceOnUse">
    <stop offset="0" stop-color="var(--signal)"/><stop offset=".55" stop-color="var(--ready)"/>
    <stop offset="1" stop-color="var(--amber)"/></linearGradient></defs>
  <path d="M7 25.5V6.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M25 25.5V6.5" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/>
  <path d="M7 6.5L25 25.5" stroke="url(#lgrad)" stroke-width="3.4" stroke-linecap="round"/>
</svg>
```
Clearspace ≥ one stroke width; mono fallback = all strokes `currentColor`; never recolor, skew, or add effects.

---

## 5 · Layout & responsive doctrine

- Container `.wrap`: max-width 1180px, 28px gutters (18px ≤840px).
- Type scale: hero `clamp(2.6rem,6vw,4.4rem)`; h2 `clamp(2rem,4vw,2.9rem)`; `.eyebrow` mono micro-label with prism tick; `.lede` ≤56ch.
- **Never let fields fight for one row.** Dense edit rows use the two-line pattern (editor offer card): identity (name + price, price `minmax(180px,1fr)`) on row 1, controls (pillset + switch) on row 2, drag handle spanning. Stack to one column ≤560px.
- App shell: `198px rail | minmax(0,1fr) canvas | 344px preview`, side panes sticky; collapse to one column ≤1100px; topbar wraps instead of crushing.
- Breakpoints in use: 1100 / 980 / 920 / 840 / 720 / 640 / 560 / 520 / 480 / 460.
- **Mobile nav**: ≤840px `fx.js` auto-builds a ☰ button + glass dropdown sheet (`.navsheet`, opaque-backed per rule 8) from the existing `.navlinks`, then marks the nav `.has-menu`. The link row hides **only** under `.has-menu`, so if JS never runs the links stay reachable (degrading to a scrollable strip) — never ship a breakpoint where navigation disappears, JS or not. ≤480px the Sign-in ghost folds out of the bar (◐ + primary CTA remain) but is cloned into the sheet (under a `.hair` divider) so it stays reachable. New pages get all of this for free.
- **Touch**: tap-highlight suppressed; press squish (`:active`) is the touch feedback; cursor specular degrades silently on touch devices. Dense bars (simulator input) wrap to stacked layout ≤520px with full-width buttons.

---

## 6 · Page inventory (reference renderings 1–7)

Marketing: **1 Homepage** (hero + floating agent-page mock + payload well), **2 Pricing** (3 tiers, featured scaled 1.035 + flag badge, glass FAQ accordions), **3 Analytics** (KPI row, layered bar chart, model share, queries, funnel), **4 Simulator** (glass chat: user bubble persimmon-tinted, agent bubble with parsing trace well), **5 Directory** (cards with readiness rings, filter chips, CTA band).
App: **6 Offer Editor** (topbar, rail, two-row offer cards, live preview + readiness checklist + Copilot), **7 Onboarding** (01–04 stepper pills, URL import bar, source-card grid with monogram tiles).
Copy voice: plain verbs, sentence case, buttons say exactly what they do ("Deploy your agent page", not "Submit"). Data is always mono.

---

## 7 · Acceptance checklist (run per page/PR)

- [ ] Zero hard-coded colors/shadows/radii (grep for `#` and `rgba(` outside the token sheet)
- [ ] Both themes verified; code wells dark in both; flag-style badges opaque-backed
- [ ] Buttons: sheen sweep + cursor specular + spring + squish all present; focus ring visible
- [ ] Reveals release after entrance (hover-lift works post-reveal); reduced-motion clean
- [ ] No element cramps below 1100px; dense rows use the two-line pattern
- [ ] Headlines tonal only; prism confined to hairlines/rings/logo/eyebrows
- [ ] Counters, rings, and chart entrances fire once, on scroll-in
