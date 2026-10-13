# MyTradingBox Style Guide

The app follows the design of the login page (`src/app/components/login/`). Its palette, surfaces and controls are shared as CSS custom properties (tokens) and Sass mixins, so every screen gets the same look in dark and light mode.

| File                      | What it holds                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/styles/_tokens.scss` | All CSS custom properties (emitted once by `src/styles.scss`)                                   |
| `src/styles/_mtb.scss`    | Mixins and the `alpha()` function; emits no CSS on its own                                      |
| `src/styles.scss`         | Global shared classes (`.page-header`, `.glass`, `.item-row`, ...), body background, scrollbars |

## Rules

1. **Never hard-code colors in components.** Use a token (`var(--mtb-*)`) or a mixin. Translucent brand colors go through `mtb.alpha()`. Literal colors are only acceptable for one-off details that have no token (for example the login debug panel) and must look right in both themes.
2. **Keep class names and DOM structure.** Unit tests and e2e tests query classes such as `.page-title`, `.label`, `.icon`, `.footer-btn-web`, `.debug-toggle`, `.loading-overlay`, `.ord-expansion-header`. A restyle changes styles only.
3. **Chart screens are excluded.** `/chart` and `/mcb-chart` (`src/app/components/chart/**`, `src/app/components/market-cipher-b-chart/**`) keep their own look. Do not edit their styles for the restyle, and do not add global rules that reach into them. Chart pages are detected by `.trading-view-container`; on those pages the legacy variables, the old body background, Roboto, and the old `.mtb-spinner` / `.mtb-overlay` look are restored (see the end of `_tokens.scss` and `styles.scss`).
4. **Both themes.** Dark is the default (`:root`); `body.light-theme` switches the token values. If a component only uses tokens it needs no light-theme block. Use `--mtb-accent-text` (not `--mtb-yellow`) for yellow text, because it turns into a darker yellow on light backgrounds.
5. **Fonts.** Inter (400/500/600/700) is the app font (`--mtb-font`, also exposed as `--font-family`). Chart pages keep Roboto.
6. **Background decoration** (candles, ridges) is login-only. Other screens use the plain background with a soft orange glow at the top: the `body` already has it; a screen root that paints its own background uses `@include mtb.glow-bg;` or the class `.mtb-glow-bg`.

## Using the library

`src/styles` is on the Sass include path (`stylePreprocessorOptions.includePaths` in `angular.json`), so a component stylesheet starts with:

```scss
@use "mtb";

.my-card {
  @include mtb.panel;
  padding: 16px;
}
.my-card h2 {
  @include mtb.page-title(24px);
}
```

## Tokens

### Brand (same in both themes)

| Token                 | Value                                                                      | Use                                  |
| --------------------- | -------------------------------------------------------------------------- | ------------------------------------ |
| `--mtb-orange`        | `#ff7a1a` (`--mtb-orange-rgb: 255, 122, 26`)                               | Main accent, focus borders, icons    |
| `--mtb-yellow`        | `#ffc61a` (`--mtb-yellow-rgb: 255, 198, 26`)                               | Gradient end, bright accents on dark |
| `--mtb-red-orange`    | `#ff5a1f` (`--mtb-red-orange-rgb: 255, 90, 31`)                            | Gradient start, secondary links      |
| `--mtb-gold`          | `#ffd43a`                                                                  | Last gradient stop                   |
| `--mtb-gradient`      | `linear-gradient(90deg, red-orange 0%, orange 30%, yellow 80%, gold 100%)` | Primary button background            |
| `--mtb-gradient-text` | `linear-gradient(90deg, orange, yellow)`                                   | Gradient text (`mtb.gradient-text`)  |
| `--mtb-focus`         | `rgba(orange, 0.55)`                                                       | Focus ring                           |
| `--mtb-orange-soft`   | `rgba(orange, 0.14)`                                                       | Soft hover tint                      |

### Theme tokens

| Token                | Dark                        | Light                       | Use                                   |
| -------------------- | --------------------------- | --------------------------- | ------------------------------------- |
| `--mtb-bg`           | `#050505`                   | `#f4f6f8`                   | Page background                       |
| `--mtb-panel`        | `#0d0d0f`                   | `#ffffff`                   | Solid panel color (`--mtb-panel-rgb`) |
| `--mtb-panel-bg`     | `rgba(13, 13, 15, 0.85)`    | `#ffffff`                   | Cards, inputs, secondary buttons      |
| `--mtb-panel-hover`  | `rgba(24, 24, 27, 0.9)`     | `#f8fafc`                   | Hovered panel / secondary button      |
| `--mtb-border`       | `rgba(255, 255, 255, 0.22)` | `#cbd5e1`                   | Thin borders                          |
| `--mtb-border-soft`  | `rgba(255, 255, 255, 0.12)` | `#e2e8f0`                   | Faint borders, spinner track          |
| `--mtb-divider`      | `rgba(255, 255, 255, 0.25)` | `#cbd5e1`                   | Divider lines                         |
| `--mtb-hover`        | `rgba(255, 255, 255, 0.06)` | `rgba(255, 122, 26, 0.08)`  | Row hover                             |
| `--mtb-text`         | `#ffffff`                   | `#1f2937`                   | Main text, titles (`--mtb-text-rgb`)  |
| `--mtb-text-soft`    | `#d4d4d8`                   | `#334155`                   | Secondary text                        |
| `--mtb-input-text`   | `#f4f4f5`                   | `#1f2937`                   | Text typed in inputs                  |
| `--mtb-muted`        | `#a3a3a8`                   | `#64748b`                   | Subtitles, labels, captions           |
| `--mtb-subtle`       | `#8a8a90`                   | `#8a8a90`                   | Input icons, placeholders             |
| `--mtb-accent-text`  | `#ffc61a`                   | `#a16207`                   | Accent words / yellow text            |
| `--mtb-on-accent`    | `#111111`                   | `#111111`                   | Text on the gradient                  |
| `--mtb-glow`         | `rgba(255, 122, 26, 0.16)`  | `rgba(255, 122, 26, 0.16)`  | Top glow                              |
| `--mtb-overlay`      | `rgba(0, 0, 0, 0.45)`       | `rgba(255, 255, 255, 0.72)` | Loading overlays                      |
| `--mtb-scroll-track` | `#111113`                   | `#e5e7eb`                   | Scrollbar track                       |
| `--mtb-success`      | `#4ade80`                   | `#15803d`                   | Profit, success                       |
| `--mtb-success-bg`   | `rgba(74, 222, 128, 0.14)`  | `rgba(21, 128, 61, 0.1)`    | Success badge background              |
| `--mtb-danger`       | `#ff6b6b`                   | `#dc2626`                   | Loss, errors                          |
| `--mtb-danger-bg`    | `rgba(255, 107, 107, 0.14)` | `rgba(220, 38, 38, 0.08)`   | Danger badge background               |
| `--mtb-warning`      | `#ffc61a`                   | `#a16207`                   | Warnings                              |

### Shape and font

| Token                | Value                                                                    |
| -------------------- | ------------------------------------------------------------------------ |
| `--mtb-radius`       | `12px` (inputs, secondary buttons, rows)                                 |
| `--mtb-radius-btn`   | `10px` (primary button, small buttons)                                   |
| `--mtb-radius-lg`    | `18px` (cards, `.glass`)                                                 |
| `--mtb-radius-pill`  | `999px` (chips, pills)                                                   |
| `--mtb-input-height` | `60px`                                                                   |
| `--mtb-btn-height`   | `52px`                                                                   |
| `--mtb-font`         | `'Inter', system-ui, ...` (Roboto on chart pages); alias `--font-family` |

### Legacy names

Older component styles use these names; they now point at the tokens (on chart pages they keep their old values):

| Legacy                                        | Now                               |
| --------------------------------------------- | --------------------------------- |
| `--app-bg`                                    | `--mtb-bg`                        |
| `--app-text`                                  | `--mtb-text`                      |
| `--muted-text`                                | `--mtb-muted`                     |
| `--glass-bg` / `--glass-border`               | `--mtb-panel-bg` / `--mtb-border` |
| `--row-hover-bg`                              | `--mtb-hover`                     |
| `--header-btn-bg` / `--header-btn-border`     | `--mtb-panel-bg` / `--mtb-border` |
| `--header-btn-hover`                          | `--mtb-orange-soft`               |
| `--accent`                                    | `--mtb-accent-text`               |
| `--scroll-track`                              | `--mtb-scroll-track`              |
| `--scroll-thumb-start` / `--scroll-thumb-end` | `--mtb-orange` / `--mtb-yellow`   |
| `--app-bg-overlay-top` / `-bottom`            | `--mtb-glow` / `transparent`      |

New code uses the `--mtb-*` names.

## Mixins (`@use 'mtb';`)

### `mtb.alpha($name, $opacity)` (function)

Translucent brand color. `$name` is one of `orange`, `yellow`, `red-orange`, `panel`, `bg`, `text`.

```scss
border-color: mtb.alpha(orange, 0.7); // rgba(var(--mtb-orange-rgb), 0.7)
```

### `mtb.panel($radius: var(--mtb-radius))`

Bordered dark card (light: white card with a grey border).

```scss
.card {
  @include mtb.panel(var(--mtb-radius-lg));
  padding: 16px;
}
```

### Input box: `mtb.input-box`, `mtb.input-icon($size: 24px)`, `mtb.input-stack`, `mtb.input-label`, `mtb.input-field`

The login input: a 60px bordered box with an icon, a small uppercase label and a borderless input; the border turns orange on focus.

```html
<div class="field">
  <svg class="field-icon">...</svg>
  <div class="field-stack">
    <label for="email">Email address</label>
    <input id="email" />
  </div>
</div>
```

```scss
.field {
  @include mtb.input-box;
}
.field-icon {
  @include mtb.input-icon;
}
.field-stack {
  @include mtb.input-stack;
}
.field-stack label {
  @include mtb.input-label;
}
.field-stack input {
  @include mtb.input-field;
}
```

`mtb.input-field` also suits a `<select>` or `<textarea>` inside the box.

### `mtb.primary-btn($height: var(--mtb-btn-height))`

Orange to yellow gradient, dark bold text, radius 10px, lift on hover, dimmed when disabled.

```scss
.save-btn {
  @include mtb.primary-btn;
  width: 100%;
}
```

### `mtb.secondary-btn($height: var(--mtb-btn-height))`

Dark panel button with a thin border; the border turns orange on hover.

```scss
.cancel-btn {
  @include mtb.secondary-btn(44px);
}
```

### Text: `mtb.page-title($size: 28px)`, `mtb.muted-text($size: null)`, `mtb.accent-text`, `mtb.gradient-text`, `mtb.caption`, `mtb.font`

```scss
.screen-title {
  @include mtb.page-title(26px);
}
.screen-title .accent {
  @include mtb.accent-text;
}
.screen-subtitle {
  @include mtb.muted-text(15px);
}
.section-label {
  @include mtb.caption;
} // 10px uppercase muted
```

### Dividers: `mtb.divider-line`, `mtb.divider-label`

```scss
.or-divider {
  @include mtb.divider-label;
} // line | OR | line
.or-divider .line {
  flex: 1;
  @include mtb.divider-line;
}
hr.sep {
  border: 0;
  @include mtb.divider-line;
}
```

### `mtb.glow-bg($base: var(--mtb-bg))`

Plain background with the soft orange glow at the top. Pass `null` for the glow layer only (over something else).

```scss
.screen-root {
  @include mtb.glow-bg;
  min-height: 100%;
}
```

The same look is available as the global class `.mtb-glow-bg`.

### `mtb.focus-ring`

Orange keyboard focus outline. A global rule already adds it to `:focus-visible` outside chart pages (specificity 0,1,0: a component's own scoped `outline` rule wins, a global element rule does not; inputs also show it when focused by click).

## Global shared classes (`src/styles.scss`)

These classes already have the new look; screens only need to use them.

| Class                                                   | Look                                                   |
| ------------------------------------------------------- | ------------------------------------------------------ |
| `.page-header`, `.page-header-inner`, `.page-title`     | Header row; title in bold text color                   |
| `.page-header .header-btn`                              | 36px panel button, yellow icon, orange border on hover |
| `.glass`                                                | Panel card, radius 18px                                |
| `.gradient-gold`                                        | Soft orange glow along the top edge of a `.glass` card |
| `.item-row`, `.item-left`, `.item-right`                | Clickable row, radius 12px, hover tint                 |
| `.settings-section`, `.items`, `.section-title`         | Section stack; uppercase muted section title           |
| `.form-card`                                            | Padded column inside a card                            |
| `.btn`                                                  | Small bordered panel button                            |
| `.chip`, `.chip-list`                                   | Orange-tinted pill                                     |
| `.settings-card`, `.settings-title`, `.form-row select` | Panel card, title, bordered select                     |
| `.mtb-spinner`, `.mtb-overlay`, `.mtb-loading-row`      | Orange/yellow spinner, themed overlay                  |
| `.mtb-glow-bg`                                          | Background with top glow                               |

Not restyled globally yet: `.icon`, `.footer-btn`, `.app-footer` (footer navigation) and the `.ord-*` / `.bal-*` blocks (orders and balance screens).
