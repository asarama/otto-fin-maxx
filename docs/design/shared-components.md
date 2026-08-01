# Design Doc — Shared Components & Design System

**Date:** 2026-08-01
**Status:** Draft — visual language revised against the approved mockup
**Sources:** [`docs/superpowers/specs/2026-08-01-finance-app-design.md`](../superpowers/specs/2026-08-01-finance-app-design.md), [`docs/superpowers/plans/2026-08-01-finance-app.md`](../superpowers/plans/2026-08-01-finance-app.md), [`styles/styles.css`](../../styles/styles.css), dashboard mockup
**Applies to:** every page doc in this directory

---

## 1. Purpose

The implementation plan writes each page as a standalone `+page.svelte` with raw `<table>`, `<form>`, and unstyled `<input>` markup. That produces seven pages that drift apart visually and repeat the same fetch/format/error logic seven times.

This doc defines the layer underneath all of them:

- the **design language** (aesthetic direction, tokens, typography, motion) as established by the mockup,
- the **component catalog** in `src/lib/components/`,
- the **client utilities** (`apiFetch`, money conversion, month math, category tones),
- the **cross-page conventions** (mutation → revalidate, error surfacing, empty states, a11y).

Every page doc references components by the names defined here and does not redefine their behavior.

---

## 2. Aesthetic direction — from the mockup

The mockup settles the visual language. Five rules, all read directly off it:

| Rule | Expression |
|---|---|
| **Cream on cream, no lines** | Cards are `--surface-primary` slips floating on the `--surface-page` peach. **No borders. No shadows.** Separation comes from the value step between the two creams and from generous gaps. |
| **Everything is round** | Cards ~20 px, nested wells ~16 px, tags and buttons fully pilled, the logo a 14 px rounded square. Nothing in the interface has a sharp corner. |
| **One hot accent** | `--accent` and nothing else: the logo, the active nav icon, the CTA, the budget bars. It appears maybe four times per screen and every appearance is load-bearing. |
| **Type carries the hierarchy** | One sans, three weights. Figures are large and heavy (`$4,281.60` dominates its card); labels above them are small and muted. There is no rule, badge, or box doing work that weight and size could do. |
| **Colour means one thing** | Green = money in / on track. Brown-red = money out / over. Pink = the thing to press. The soft tag colours are identity, not status. |

**Signature:** the two saturated blocks — the pink CTA and the deep green goal card — against an otherwise entirely cream screen. That contrast is the whole design. Adding a third saturated block would break it, which is why the meter fills reuse the pink rather than introducing new hues.

**What this replaced:** an earlier draft of this doc proposed a blue-ink "ledger paper" direction (ruled background, hairline card borders, serif display face, monospace figures). The mockup supersedes all of it. Blue is gone from the palette entirely, the background is flat, cards have no borders, and figures are set in the UI sans, not mono.

---

## 3. Tokens

### 3.1 Two tiers, two files

```
styles/styles.css      ← the COLOUR system: primitives + roles
styles/tokens.css      ← the non-colour scales: space, radius, type, motion
src/app.css            ← @imports both, then base/reset/element styles
src/routes/+layout.svelte  ← imports '../app.css'
```

`styles.css` is structured in two tiers:

**Tier 1 — primitives.** The raw hues from the mockup, named by colour and lightness: `--cream-50…300`, `--brown-500…900`, `--pink-200…900`, `--orange-*`, `--yellow-*`, `--green-100…900`, `--rust-700`. They carry no meaning and **no component ever references one directly.**

**Tier 2 — roles.** What a colour is *for*: `--surface-primary`, `--text-secondary`, `--accent`, `--negative`. Components reference only these.

The split is what makes the system reskinnable. Change a primitive and the whole app moves with it; change a role and you have changed what a colour *means* without touching any component. It also kills the naming problem the first draft had — `--tag-dining-bg` locked a hue to a use case that does not generalize (there is no "dining" concept in this app's data model; categories are user-created strings).

### 3.2 The role vocabulary

| Group | Roles | Notes |
|---|---|---|
| **Surface** | `--surface-page`, `--surface-primary`, `--surface-secondary`, `--surface-hover`, `--surface-track`, `--surface-accent`, `--surface-feature`, `--surface-overlay` | `primary` = cards (the dominant content surface); `secondary` = wells inset *inside* a card, which in this palette is the same cream as the page |
| **Text** | `--text-primary`, `--text-secondary`, `--text-tertiary`, `--text-accent`, `--text-positive`, `--text-negative` | `tertiary` is decoration-only (§3.3) |
| **On-fill** | `--on-accent`, `--on-feature`, `--on-feature-muted`, `--on-positive`, `--on-negative`, `--on-notice` | Every filled surface names its own legible foreground, so a component never has to guess |
| **Accent** | `--accent`, `--accent-strong`, `--accent-pressed`, `--accent-subtle`, `--accent-ring` | `accent` for fills and graphics; `accent-strong` wherever the colour has to carry small text |
| **Feedback** | `--positive`, `--negative`, `--notice` + a `-surface` for each | Three feedback roles from three hues already in the palette |
| **Border** | `--border-subtle`, `--border-default` | Alpha tints of the ink brown. Used sparingly — the mockup has almost no lines |
| **Categorical** | `--category-1…4-{surface,text}`, `--category-count` | Identity, not status (§3.4) |

Two roles are derived rather than taken from the mockup, both for contrast reasons: `--accent-strong` (`#C41E4E`) and `--accent-pressed` (`#A3153C`). Both are the accent hue darkened until it carries small text; see §3.3.

### 3.3 Contrast audit (WCAG 2.1)

Measured against the surfaces each role is actually used on.

**Passing**

| Foreground | On | Ratio | Use |
|---|---|---|---|
| `--text-primary` | `--surface-page` | 11.4:1 | body |
| `--text-primary` | `--surface-primary` | 12.6:1 | body |
| `--text-secondary` | `--surface-page` | 5.3:1 | labels, captions, table headers |
| `--text-positive` | `--surface-primary` | 5.8:1 | credits, "On track" |
| `--text-negative` | `--surface-primary` | 9.5:1 | debits, over budget |
| `--accent-strong` | `--surface-page` | 4.9:1 | links, small buttons, focus rings |
| `--on-accent` (white) | `--accent-strong` | 5.8:1 | small primary buttons |
| every `--category-N-text` | its `--category-N-surface` | ≥ 9:1 | pills |
| `--on-positive` | `--positive-surface` | 9.6:1 | success banners, income pills |
| `--on-notice` | `--notice-surface` | 8.4:1 | attention banners, unreviewed badge |

**Constrained**

| Foreground | On | Ratio | Constraint |
|---|---|---|---|
| `--on-accent` (white) | `--surface-accent` | **3.4:1** | Large text only (≥ 18.66 px bold / 24 px regular). The mockup's "Send money" CTA qualifies. Small pink-filled buttons are not allowed — they fill with `--accent-strong` instead. |
| `--accent` | `--surface-page` | **2.9:1** | Below the 3:1 non-text floor against the *page*. Pink graphics (meter fills, active nav bed) must sit on `--surface-primary`, where it is 3.2:1. Focus rings use `--accent-strong`. |
| `--text-tertiary` | `--surface-page` | **3.4:1** | Fails for text. Decoration only — dividers, inactive rail icons at ≥ 24 px. Anything readable uses `--text-secondary`. |

**Failing — needs a call**

| Foreground | On `--surface-feature` | Ratio | Verdict |
|---|---|---|---|
| `--on-feature` (`--cream-200`) | | **2.9:1** | Fails even the 3:1 large-text floor |
| `--on-feature-muted` (`--green-100`) | | **2.7:1** | Fails |
| white, for comparison | | 3.4:1 | Large text only |

No light foreground clears 4.5:1 on `--green-500` — the green is not dark enough. Two ways out:

- **Recommended:** deepen the primitive to `--green-500: #497415`. `--on-feature` then reaches **4.7:1** and a white label **5.5:1**. Visually near-identical at card scale, and because it is a tier-1 change nothing else in the system moves.
- **Accept as drawn:** keep `#639922`, rely on the value already being ≥ 24 px bold, and accept the small "Savings goal" label at 2.7:1.

`styles.css` ships as drawn with this recorded in a comment at the foot of the file.

### 3.4 The categorical scale

Budget categories are user-created strings, so their colours cannot be authored — they are assigned:

```ts
// $lib/ui/tone.ts
export function categoryIndex(name: string): 1 | 2 | 3 {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return ((h % 3) + 1) as 1 | 2 | 3;
}
```

`<CategoryTag>` reads `--category-{n}-surface` / `--category-{n}-text`.

The rotation covers **1–3 only**. Index 4 is the green, held out of the rotation and reserved for income and positive amounts — exactly as the mockup uses it on the Paycheck row — so green never means "some category" and always means money in. `--category-count: 3` encodes that so the loop and the palette cannot drift apart.

### 3.5 Non-colour scales — `styles/tokens.css`

```css
:root {
  /* Radius — the mockup has no sharp corners */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;    /* wells, inputs */
  --radius-xl: 20px;    /* cards */
  --radius-2xl: 28px;   /* the app frame */
  --radius-pill: 999px;

  /* Space — 4px base, generous */
  --space-1: 0.25rem; --space-2: 0.5rem;  --space-3: 0.75rem; --space-4: 1rem;
  --space-5: 1.5rem;  --space-6: 2rem;    --space-7: 3rem;    --space-8: 4rem;

  /* Type */
  --font-ui:   'Figtree', -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, monospace;  /* machine strings only */

  --text-xs: 0.75rem;   --text-sm: 0.875rem;  --text-md: 1rem;
  --text-lg: 1.25rem;   --text-xl: 1.5rem;
  --text-2xl: 2rem;     --text-3xl: 2.75rem;

  /* Motion */
  --motion-fast: 120ms cubic-bezier(.2,.6,.3,1);
  --motion-mid:  220ms cubic-bezier(.2,.6,.3,1);
}
```

**No shadow scale.** The mockup has none. The only elevated surfaces are the modal and the toast stack; both declare a shadow locally. If a third case appears it is probably a mistake.

### 3.6 Typography

One family, three weights. The mockup uses a single geometric-humanist sans throughout, including for money — no serif, no monospace anywhere in it.

| Role | Spec |
|---|---|
| Display figures | **Figtree 800**, `--text-2xl`/`--text-3xl`, `letter-spacing: -0.02em`. The `$4,281.60` treatment. |
| Headings | Figtree 700, `--text-lg`/`--text-xl`, `-0.01em` |
| Body / UI | Figtree 400; 600 for labels, buttons, table headers |
| Small labels | Figtree 600, `--text-xs`, `--text-secondary`. Sentence case, not uppercased — the mockup's "Total balance" / "Savings" labels. |
| Machine strings | **IBM Plex Mono** 400 |

**Money is Figtree with `font-variant-numeric: tabular-nums`**, not mono. Figtree ships tabular figures, so columns still align.

`--font-mono` survives for exactly two kinds of content, neither of which appears in the mockup because the mockup is a dashboard:

- raw bank strings (`AMZN MKTP US*2H4KL9`) on Transactions, Review and Vendors,
- regex patterns on Rules.

Those get compared character by character and need `l`/`1`/`I` disambiguation. Everything else is Figtree.

Figtree is OFL and self-hosted under `static/fonts/` as one variable woff2 (~90 KB), so there is no network dependency at runtime.

### 3.7 Base layer (`src/app.css`, abbreviated)

```css
@import '../styles/styles.css';
@import '../styles/tokens.css';

body {
  background: var(--surface-page);          /* flat — no pattern, no gradient */
  color: var(--text-primary);
  font: 400 var(--text-md)/1.5 var(--font-ui);
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}

:where(a) { color: var(--text-accent); text-underline-offset: 2px; }

:where(:focus-visible) {
  outline: 2px solid var(--accent-strong);  /* not --accent: 2.9:1 on the page */
  outline-offset: 2px;
  border-radius: var(--radius-sm);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 1ms !important; transition-duration: 1ms !important; }
}
```

The page never scrolls horizontally: wide tables scroll inside their own `overflow-x: auto` container (`<DataTable>` handles this).

## 4. Component catalog

All under `src/lib/components/`. Svelte 5 runes throughout: `$props()`, `$state`, `$derived`. Components are presentational — **no component imports `$lib/server/*` or calls `fetch` directly** except `ImportDropZone` (documented below) and `apiFetch` consumers in page files.

### 4.1 Shell & layout

#### `AppShell.svelte` — used by `src/routes/+layout.svelte`

The mockup's frame: a **left icon rail** and a content column, both inside a `--radius-2xl` peach frame with `--space-5` of breathing room.

```
┌─────────────────────────────────────────────────────────┐
│ ┌────┐  Good morning                       ┌──────────┐ │
│ │ ▪  │  Here's where things stand today    │ Aug 2026 │ │
│ │    │                                     └──────────┘ │
│ │ ▫  │  ┌───────────────────┐ ┌──────────────────────┐  │
│ │ ▫  │  │                   │ │                      │  │
│ │ ▫  │  └───────────────────┘ └──────────────────────┘  │
│ └────┘                                                  │
└─────────────────────────────────────────────────────────┘
```

- Grid: `grid-template-columns: 72px minmax(0, 1fr)`, gap `--space-5`.
- Rail: `--surface-primary`, `--radius-xl`, full content height, `position: sticky; top: var(--space-5)`.
- Content column: `max-width: 1200px`, transparent (the page peach shows through — cards provide the light surfaces).
- Below 900 px the rail becomes a horizontal strip above the content, same icons, same active treatment.

Props: `{ children, unreviewedCount }`.

#### `NavRail.svelte`

Replaces the earlier top tab bar. Contents, top to bottom:

1. **Logo** — a 40 px `--accent` rounded square (`--radius-md`). Links to `/`.
2. **Seven icon links** — Dashboard, Transactions, Review, Budgets, Accounts, Vendors, Rules. 40 px hit targets, 22 px stroked icons, `--space-3` apart.

| State | Icon | Bed |
|---|---|---|
| Inactive | `--text-tertiary` stroke | none |
| Hover | `--text-secondary` | `--surface-hover`, `--radius-md` |
| Active | `--accent` | `--accent-subtle`, `--radius-md`, plus `aria-current="page"` |

3. **Review badge** — when `unreviewedCount > 0`, a `--accent` dot on the Review icon with the count in `--on-accent` at ≥ 11 px 700; also exposed as visually-hidden text so it is announced, not just seen.

Icons alone are ambiguous, so every rail item has a `title` **and** a tooltip on hover/focus showing the label, plus an `aria-label`. Active state is derived from `page.url.pathname` (`$app/state`), matching `/` exactly and others by prefix.

#### `PageHeader.svelte`

`{ title, subtitle?, actions? }`. Matches the mockup's greeting block: title Figtree 700 `--text-2xl` `--text-primary`, subtitle `--text-md` `--text-secondary` directly beneath, actions right-aligned. **No rule beneath it** — spacing (`--space-6`) does the separating.

The mockup's date chip (`Aug 2026`) is the `actions` slot on the Dashboard: a `--surface-primary` pill, `--radius-lg`, `--text-sm` 600.

#### `Section.svelte`

`{ title?, description?, children, actions? }`. `h2` Figtree 700 `--text-lg`, `--space-4` beneath, sections `--space-7` apart. Used on the form-heavy pages.

#### `Card.svelte`

`{ tone?: 'default' | 'well' | 'goal' | 'positive' | 'danger', padded?, children }`

```css
background: var(--surface-primary);
border-radius: var(--radius-xl);
padding: var(--space-5);
/* no border, no shadow */
```

- `well` — `--surface-secondary` (the page peach) at `--radius-lg`, for slips *inside* a card. This is the mockup's "Paycheck / +$2,400.00" row.
- `goal` — `--surface-feature` with `--on-feature-muted` / `--on-feature` text. The savings-goal treatment; see the §3.2 contrast note.
- `positive` / `danger` — cream body with a 3 px left edge in `--text-positive` / `--text-negative`. Used for banners, not for data cards.

### 4.2 Data display

#### `DataTable.svelte`

Props: `{ columns, rows, rowKey, sort?, onSort?, empty?, selectable?, selected?, onToggle?, children }`
where `columns: { key, label, align?: 'start'|'end', width?, sortable?, mono? }[]`.

The mockup's transaction table has **no row rules and no header rule** — separation is whitespace. Matching it:

- Wrapper: `overflow-x: auto`, transparent (sits inside a `<Card>` or directly on the page).
- `thead`: no fill, no border. Labels `--text-sm` 600 `--text-secondary`, sentence case.
- Rows: 48 px min-height (roomier than a conventional table — the mockup is airy), no borders. Hover `--surface-hover` at `--radius-md`, so the hover state reads as a soft pill rather than a highlighted band.
- Selected rows: `--accent-subtle` bed, same radius.
- `align: 'end'` columns get `tabular-nums`; `mono: true` additionally gets `--font-mono` (raw strings, regex — never money).
- Sortable headers render a `<button>` with `aria-sort` and a ▲/▼ glyph.
- On mount, rows fade + rise 4 px with a 22 ms stagger capped at 12 rows; disabled under `prefers-reduced-motion`.
- Empty: `<EmptyState>` in a full-width cell.

Row separators are available as an opt-in (`dividers` prop) for the dense Rules ladder, where position matters and whitespace alone is ambiguous.

#### `MoneyText.svelte`

`{ cents, tone?: 'auto' | 'neutral' | 'spend' | 'positive' | 'negative', signed?, size? }`

- Formats via `centsToDollars` from `$lib/money.ts` — never re-implemented.
- `auto` — negative → `--text-negative`, positive → `--text-positive` with a leading `+` (the mockup's `+$2,400.00`), zero → `--text-secondary`.
- `spend` — the value is already a positive "amount spent" figure; render `--text-primary`, unsigned.
- Always `--font-ui` with `tabular-nums`, `white-space: nowrap`. `size="xl"` gives the mockup's display treatment: Figtree 800, `--text-3xl`, `-0.02em`.

#### `BudgetMeter.svelte`

`{ spentCents, limitCents, showLabel? }`

The mockup's budget bars: a pink fill on a pale peach track, with the state carried by a **text label**, not by the bar's colour.

- Track: 8 px, `--radius-pill`, `--surface-track`.
- Fill: `--accent`, `--radius-pill`, width `min(pct, 1) * 100%`.
- Label (when `showLabel`): `--text-positive` "On track" under 80 %; `--text-primary` "$X left" from 80–100 %; `--text-negative` "Over by $X" above 100 %.
- Over 100 %: the fill switches to `--text-negative` and overhangs the track's right cap by 6 px with a hairline gap — the bar visibly breaks out. This is the only place the pink is replaced, and it only happens when something is wrong.
- `limitCents === 0`: dashed hairline track, label "no limit set" in `--text-secondary`. Never divide by zero.
- `role="meter"` with `aria-valuenow/min/max` and `aria-label="{category}: {spent} of {limit}"`.

**Two states, not three.** An earlier draft had a distinct amber "warning" tier. The approved palette has no amber, and inventing one would add a fourth saturated hue to a design whose whole idea is that there is one. The 80–100 % band is therefore signalled by the *label text* ("$48 left") rather than by colour — which is better practice regardless, since colour was never allowed to be the only cue.

#### `StatTile.svelte`

`{ label, value, sub?, tone? }` — the mockup's "Total balance" / "Savings" / "Credit card" treatment. Label `--text-sm` `--text-secondary` on top, value beneath in Figtree 800 `--text-2xl` (money goes through `<MoneyText size="xl">`), optional `sub` caption in `--text-sm` (the mockup's green "3.2% this month"). Lives inside a `<Card>`.

#### `CategoryTag.svelte`

`{ name, budgetName?, size? }` — the mockup's soft pills: `--radius-pill`, `--text-sm` 600, `padding: var(--space-1) var(--space-3)`.

Colours come from `categoryIndex()` (§3.4), which hashes the name into the 1–3 rotation and reads `--category-{n}-surface` / `--category-{n}-text`. Index 4 (green) is held out of the rotation for income, so green always means money in. An unassigned category renders as an em-dash in `--text-secondary`, not a tag.

#### `StatusBadge.svelte`

`{ status: 'auto' | 'manual' | 'unreviewed' }` — `--text-xs` 600 pill, no border (the mockup has no outlined elements):

| Status | Text | Bed |
|---|---|---|
| `auto` | `--text-secondary` | transparent |
| `manual` | `--accent-strong` | `--accent-subtle` |
| `unreviewed` | `--on-notice` | `--notice-surface` |

`unreviewed` uses the notice role rather than a status colour: the app's two status colours already mean money in and money out, and "not yet reviewed" is attention, not a verdict.

#### `EmptyState.svelte`

`{ title, body?, action? }`. Centered, `--space-7` padding, title Figtree 700 `--text-lg`, body `--text-secondary`, optional primary action.

#### `KeyValueList.svelte`

`{ items: { label, value }[] }`. The mockup's stat-block treatment applied to import results: value on top in Figtree 800, label beneath in `--text-sm` `--text-secondary`.

### 4.3 Forms

The mockup contains no form controls, so these extend its language rather than copying it: same radii, same cream surfaces, borders only where a control needs a visible edge.

#### `Field.svelte`
`{ label, hint?, error?, required?, id, children }` — `<label for>`, the control, then hint (`--text-secondary` `--text-xs`) or error (`--text-negative`, `role="alert"`, wired via `aria-describedby` + `aria-invalid`).

#### `TextInput` / `SelectInput` / `MonthInput` / `Textarea`

```css
background: var(--surface-primary);
border: 1px solid var(--border-default);
border-radius: var(--radius-lg);
padding: var(--space-3) var(--space-4);
font: 400 var(--text-md) var(--font-ui);
color: var(--text-primary);
transition: border-color var(--motion-fast), box-shadow var(--motion-fast);
```
Hover `--text-secondary` border; focus `border-color: var(--accent-strong)` + `box-shadow: 0 0 0 3px var(--accent-ring)`; invalid `--text-negative`; disabled `--surface-secondary` + `--text-secondary`.

Inputs sitting *inside* a card use `--surface-secondary` so they read as inset, matching the mockup's nested-slip logic.

#### `AmountInput.svelte`
`{ valueCents: number | null, onChange }` — dollars in the UI, **cents in the model**.
`type="number" step="0.01" inputmode="decimal"`, right-aligned, `tabular-nums`, `$` adornment in `--text-secondary`. Converts through `dollarsToCents` / `centsToDollarString` (§5.2) — never inline `Math.round(x * 100)`. Empty string → `null` ("no amount criterion"), not `0`.

#### `VendorMultiSelect.svelte`
`{ vendors, selectedIds, onChange }` — a checkbox list in a `--surface-secondary` scroll well (max-height 180 px) with a filter input above, plus removable chips for the current selection. Not `<select multiple>`, which is unusable with a mouse and shows no selected-state summary.

#### `Button.svelte`
`{ variant: 'primary' | 'secondary' | 'ghost' | 'danger', size?: 'sm' | 'md' | 'lg', busy?, disabled?, type?, onclick, children }`

| Variant | Fill | Label | Notes |
|---|---|---|---|
| `primary` `lg` | `--accent` | `#FFFFFF` 700 at `--text-lg` | The mockup's "Send money". **Only legal at `lg`** — white on pink is 3.4:1, which clears AA for large text only. |
| `primary` `md`/`sm` | `--accent-strong` | `#FFFFFF` 600 | 5.8:1. Same hue family, dark enough for normal text. |
| `secondary` | `--surface-primary` (or `--surface-secondary` on a card) | `--text-primary` | No border; hover `--surface-hover` |
| `ghost` | transparent | `--text-secondary` → `--text-primary` | hover `--surface-hover` |
| `danger` | transparent | `--text-negative` | hover `rgba(113,43,19,.08)` |

All `--radius-pill`, `translateY(1px)` on `:active`. `busy` swaps the label for a spinner, sets `aria-busy` and `disabled` — **every mutation button sets `busy` while its request is in flight**, so double-submits are impossible.

That `primary lg` / `primary md` split is the one place the palette forces a compromise, and it is deliberate: the hero CTA keeps the mockup's hot pink, and every smaller button drops to the darker `--accent-strong` so its label stays readable.

#### `IconButton.svelte`
`{ label, icon, onclick }` — 32 px round ghost button for row actions (↑ ↓ ✎ ✕). `aria-label` required; icon `aria-hidden`.

#### `Checkbox.svelte`
`{ checked, indeterminate?, onChange, label }` — 18 px, `--radius-sm`, `--border-default` border, `--accent` fill when checked (a filled graphic on a card: 3.2:1 ✓).

### 4.4 Overlays & feedback

#### `Modal.svelte`
`{ open, title, onClose, children, footer? }` — `<dialog>` with `showModal()`, so focus trap, `Esc`, and inertness are native. Backdrop `rgba(58,42,21,.35)`; panel `--surface-primary`, `--radius-xl`, max-width 560 px, `box-shadow: 0 24px 60px -24px rgba(58,42,21,.5)` (one of the two places a shadow exists). 160 ms fade + 6 px rise.

#### `ConfirmDialog.svelte`
`{ open, title, body, confirmLabel, tone, onConfirm, onCancel }`. Wraps `Modal`. Required before delete-rule and merge-vendors.

#### `Toast.svelte` + `ToastHost.svelte`
Bottom-right stack, max 3, auto-dismiss 4 s (errors persist). `success` → `--positive-surface` / `--on-positive`; `error` → cream with a `--text-negative` left edge. Host lives in `+layout.svelte`. `aria-live="polite"` for success, `assertive` for errors.

#### `InlineBanner.svelte`
`{ tone: 'info' | 'warning' | 'danger' | 'success', title, children? }` — in-flow message block. `info` uses `--surface-secondary`; `warning` uses `--category-2-surface` at 50 % with `--category-2-text`; `danger` cream + `--text-negative` edge; `success` `--positive-surface`.

#### `Spinner.svelte` / `SkeletonRows.svelte`
`SkeletonRows` (shimmering `--surface-secondary` bars at row height) is preferred for table loads; `Spinner` only inside busy buttons.

### 4.5 Domain widgets

#### `MonthPicker.svelte`
`{ month, onChange }` — the mockup's `Aug 2026` chip, made interactive: `‹` `[Aug 2026]` `›` in a `--surface-primary` pill, plus a "This month" ghost button when off the current month. Clicking the label opens a native `<input type="month">`. Emits `'YYYY-MM'`. Month arithmetic uses `addMonths` from `$lib/month.ts` (§5.3).

#### `FilterBar.svelte`
`{ children, onApply, onClear, activeCount }` — a `--surface-primary` `--radius-xl` strip holding filter controls in a wrapping flex row, an Apply button, and "Clear all (N)" when filters are active. Submits on `Enter`.

#### `ImportDropZone.svelte`
`{ accountId, onResult }` — the only component that owns a network call, because the drop/upload/progress interaction is inseparable from the request.
Dashed `--border-default` border on a `--surface-secondary` bed, `--radius-lg`. Drag-over: border `--accent-strong`, bed `--accent-subtle`. Accepts one `.csv` via drop or a keyboard-reachable "Choose file" button (`role="button"`, `tabindex="0"`, `Enter`/`Space` opens the picker). Posts `multipart/form-data` to `/api/accounts/[id]/import`, shows a determinate bar, hands `ImportResult` to `onResult`.

#### `RulePreviewPanel.svelte`
`{ spec }` — shows whether a draft or saved rule matches a hand-typed transaction and how many currently-unreviewed transactions it would claim. Backed by `POST /api/rules/preview` (Rules doc §6.5).

---

## 5. Client utilities

### 5.1 `$lib/client/api.ts` — `apiFetch`

Every page in the plan writes `await fetch(...)` and ignores the response, so a 400 (`Invalid regex`, `Invalid bank`) silently does nothing. One wrapper fixes that everywhere:

```ts
export async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.body instanceof FormData
      ? init?.headers
      : { 'content-type': 'application/json', ...init?.headers }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}
```

Standard page-level mutation shape:

```ts
async function save() {
  busy = true;
  try {
    await apiFetch('/api/rules', { method: 'POST', body: JSON.stringify(payload) });
    toasts.success('Rule created');
    await invalidateAll();
  } catch (e) {
    toasts.error(e instanceof ApiError ? e.message : 'Something went wrong');
  } finally {
    busy = false;
  }
}
```

`ApiError` carries `status` so callers can special-case 404/409. SvelteKit's `error(400, 'msg')` serializes to `{ message }`, which is what this reads.

### 5.2 `$lib/money.ts` — additions

Task 2 defines `parseAmountToCents` (CSV-oriented) and `centsToDollars` (display). The UI needs two more, tested alongside:

- `dollarsToCents(input: string): number | null` — `''` → `null`; otherwise round-half-away-from-zero to an integer; throws on non-numeric.
- `centsToDollarString(cents: number): string` — plain `"1234.56"`, no `$` or separators, for round-tripping into `<input type="number">`. The plan does `centsToDollars(x).replace(/[$,]/g, '')`, which round-trips through a locale-formatted string.

### 5.3 `$lib/month.ts`

`currentMonth()`, `addMonths(month, delta)`, `monthLabel(month)` (→ `"Aug 2026"`, the mockup's format), `monthOf(postedDate)`. The plan defines `currentMonth()` twice; it lives here once. Pure, unit-tested, no `Date` parsing of `'YYYY-MM'` strings.

### 5.4 `$lib/client/toasts.svelte.ts`

Rune-backed store: `{ items, success(msg), error(msg), dismiss(id) }` using `$state` in a `.svelte.ts` module.

### 5.5 `$lib/ui/tone.ts`

`categoryIndex` (§3.4) plus `budgetHealth(spent, limit): 'ok' | 'near' | 'over' | 'none'`, so the meter, its label and the dashboard alert list agree on thresholds.

---

## 6. Data model interactions (shared)

### 6.1 Access rules

Unchanged from the spec and reasserted here because it constrains every component: **only `+page.server.ts` and `+server.ts` touch DuckDB**, through `getDb()` and the repos in `src/lib/server/repos/`. No component imports `$lib/server/*`. Components receive plain serializable objects.

Serialization note: DuckDB returns `BIGINT` as `BigInt`, which cannot cross the SvelteKit load boundary. Every repo already coerces with `Number(...)`; loads that write ad-hoc SQL (Dashboard, Budgets, Transactions) must do the same on every `*_cents` and count column. An uncoerced `BigInt` throws `DataCloneError` at devalue time, not at query time.

### 6.2 Layout load — `src/routes/+layout.server.ts` (new)

```ts
export const load: LayoutServerLoad = async () => {
  const conn = await getDb();
  return { unreviewedCount: await countUnreviewed(conn) };
};
```

Feeds the rail's review badge on every page. Any mutation that changes review state (import, assign, batch, rule create/update/delete) calls `invalidateAll()`, which re-runs this load — so the badge is never stale. Not in the implementation plan; added by this design.

### 6.3 Tables touched, by page

| Page | Reads | Writes |
|---|---|---|
| Dashboard | `budget_category_months`, `budget_categories`, `budgets`, `owners`, `account_transactions` | `budget_category_months` (auto-create for current month) |
| Transactions | `account_transactions`, `accounts`, `vendors`, `budget_category_months`, `budget_categories` | `account_transactions` (assignment), `budget_category_months` |
| Review | `account_transactions`, `accounts`, `vendors`, `budget_categories` | `account_transactions`, `budget_category_months`, `rules`, `rule_vendors` |
| Budgets | `owners`, `budgets`, `budget_categories`, `budget_category_months`, `account_transactions` | `budgets`, `budget_categories`, `budget_category_months` |
| Accounts | `accounts` | `accounts`, `account_transactions`, `vendors` (resolution only), `budget_category_months` |
| Vendors | `vendors`, `vendor_aliases` | `vendors`, `vendor_aliases`, `account_transactions`, `rule_vendors` |
| Rules | `rules`, `rule_vendors`, `budget_categories`, `vendors` | `rules`, `rule_vendors`, `account_transactions`, `budget_category_months` |

### 6.4 Invariants every page must respect

1. **Cents everywhere.** No float money crosses the wire. `AmountInput` is the only place dollars exist.
2. **Assignment targets a month snapshot.** Never assign to a `budget_category_id`; always `ensureBudgetCategoryMonth(categoryId, monthOf(tx.posted_date))` first. The month comes from the *transaction*, never from the page's currently-viewed month.
3. **Rule runs only touch `unreviewed`.** UI copy must never imply that saving a rule will re-file already-categorized transactions.
4. **Snapshots are history.** Editing a limit changes the category default and the *current* month's snapshot only.
5. **Spend is `SUM(-amount_cents)`.** Credits assigned to a category reduce spend. `<MoneyText tone="spend">` renders that positive figure without a sign.

---

## 7. Cross-page conventions

| Concern | Convention |
|---|---|
| **Mutations** | Always `apiFetch` → `toasts` → `invalidateAll()`. No optimistic UI in v1; the DB is local and round-trips are sub-millisecond. |
| **Filters / month** | Live in the URL query string, applied with `goto(url, { keepFocus: true, noScroll: true, replaceState: true })` — **not** `window.location.href` as the plan does. Full reloads lose focus and scroll position and break the back button. |
| **Errors** | Field-level → `<Field error>`. Request-level → toast. Data-level (parse errors, no categories yet) → `<InlineBanner>`. |
| **Loading** | `navigating` from `$app/state` drives a 2 px `--accent` progress line across the top of the content column; tables use `SkeletonRows` on first paint only. |
| **Empty** | Every list has `<EmptyState>` with an action that leads somewhere useful. |
| **Destructive** | `ConfirmDialog` for delete-rule and merge-vendors. Rename, disable and re-assign are reversible and go straight through. |
| **Keyboard** | Every action reachable by Tab; `Enter` submits the focused form; `Esc` closes modals and cancels inline edits; row selection is a real `<Checkbox>`. |
| **Headings** | Exactly one `h1` per page (`PageHeader`); sections use `h2`; nothing skips a level. |
| **Colour is never alone** | Every status colour is paired with text ("On track", "Over by $12", "+", "−"). This is forced by the palette anyway: it has two status hues and three tag hues, none of which can carry meaning unassisted. |
| **Responsive** | Rail collapses to a top strip below 900 px; tables scroll inside their container; stat grids collapse 4 → 2 → 1. Desktop-first — this runs on one machine — but it must not break. |

---

## 8. Deviations from the implementation plan

Recorded here so the plan can be amended rather than silently contradicted.

1. **`src/routes/+layout.server.ts` is new** — needed for the review badge (§6.2).
2. **`styles/styles.css` is restructured into primitives + roles**; `styles/tokens.css` (non-colour scales) and `src/app.css` are new.
3. **`$lib/components/`, `$lib/client/`, `$lib/ui/`, `$lib/month.ts` are new** — the plan has no component layer.
4. **Navigation is a left icon rail**, not the plan's inline `<nav><ul>` of text links.
5. **`goto()` replaces `window.location.href`** on Transactions and Budgets (Tasks 16, 17).
6. **`$lib/money.ts` gains `dollarsToCents` and `centsToDollarString`** (Task 2 amendment).
7. **`POST /api/rules/preview` is new** (Rules doc) — the plan's `/api/rules/[id]/test` requires an already-saved rule.
8. **`listTransactions` gains `sort`, `dir`, `limit`, `offset`** (Task 9 amendment) — the spec calls the list "sortable"; the plan's repo has no sort parameter.
9. **`<select multiple>` is replaced by `VendorMultiSelect`** on the Rules page.
10. **Figtree is self-hosted** under `static/fonts/` with `@font-face` in `app.css`.

---

## 9. Open questions

1. **The feature-card green fails AA** (§3.3). Recommendation: deepen the primitive `--green-500` to `#497415`. Needs a yes/no — it is the one place the approved palette and the accessibility floor disagree.
2. **Icon set for the rail.** The mockup shows placeholder squares. Seven icons are needed (dashboard, transactions, review, budgets, accounts, vendors, rules); Lucide's stroked set matches the geometry and is MIT-licensed. Icons alone are ambiguous, so tooltips + `aria-label` are mandatory regardless of which set wins.
3. **Font.** Figtree is the closest OFL match to the mockup's face. If the mockup was drawn with SF Pro and that look is required exactly, the fallback stack (`-apple-system`) reproduces it on macOS and degrades elsewhere.
4. **Dark mode.** Out of scope. This is a light-paper palette with no dark counterpart; adding one means a second full palette, not an inversion.
