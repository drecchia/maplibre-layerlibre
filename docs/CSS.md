# CSS — LayersControl

CSS class reference and customization guide. Source: `src/css/uiManager.css`. Output: `dist/css/all.css`.

BEM naming convention: `.layers-control__element--modifier`.

---

## Root Container

```css
.layers-control-container
```

Applied by MapLibre to the control wrapper (`maplibregl-ctrl maplibregl-ctrl-group`).
Sets `background: white`, `border-radius`, `box-shadow`, `position: relative`.

---

## Toggle Button

```css
.layers-control__toggle
.layers-control__toggle:hover
.layers-control__toggle:focus
```

The button that opens/closes the panel. 29×29 px, displays the `icon` option string.

---

## Panel

```css
.layers-control__panel
.layers-control__panel--open
```

The floating panel. Hidden by default (`opacity: 0; visibility: hidden`), revealed when `--open` is added.

**Size:** `min-width: 250px`, `max-width: 300px`, `max-height: min(70dvh, 400px)`, `overflow-y: auto`.

**Positioning** (relative to map control corner):

```css
/* Panel appears below toggle for top-positioned controls */
.maplibregl-ctrl-top-left .layers-control__panel,
.maplibregl-ctrl-top-right .layers-control__panel { top: 100%; margin-top: 4px; }

/* Panel appears above toggle for bottom-positioned controls */
.maplibregl-ctrl-bottom-left .layers-control__panel,
.maplibregl-ctrl-bottom-right .layers-control__panel { bottom: 100%; margin-bottom: 4px; }

/* Horizontal alignment */
.maplibregl-ctrl-top-right .layers-control__panel,
.maplibregl-ctrl-bottom-right .layers-control__panel { right: 0; }

.maplibregl-ctrl-top-left .layers-control__panel,
.maplibregl-ctrl-bottom-left .layers-control__panel { left: 0; }
```

---

## Sections

```css
.layers-control__base-section
.layers-control__overlays-section
.layers-control__section-title
.layers-control__base-list
.layers-control__overlays-list
```

Section title: uppercase, 12px, `#9d9d9d`, `background: #f8f9fa`.

---

## Base Layer Items

```css
.layers-control__base-item          /* each base layer row */
.layers-control__base-item--active  /* currently selected base (blue highlight) */
```

Each row has a radio `<input>` and a label.

---

## Overlay Items

```css
.layers-control__overlay-item           /* each overlay row container */
.layers-control__overlay-item--loading  /* while onChecked is running */
.layers-control__overlay-toggle         /* flex label wrapping checkbox + text */
.layers-control__label                  /* overlay name text */
```

---

## Groups

```css
.layers-control__group            /* group container */
.layers-control__group-header     /* header row (checkbox + label + opacity) */
.layers-control__group-toggle     /* flex label for checkbox + group name */
.layers-control__group-overlays   /* indented child overlay list */
```

---

## Opacity Controls

```css
.layers-control__opacity-control  /* container (shown when opacityControls: true) */
.layers-control__opacity-slider   /* <input type="range"> */
.layers-control__opacity-label    /* percentage text */
```

Slider: `min=0`, `max=1`, `step=0.01`. Custom thumb styling via `::-webkit-slider-thumb` / `::-moz-range-thumb`.

---

## Loading State

```css
.layers-control__loading    /* spinner element (animated rotation) */
```

Applied to a status element inside the overlay item while `onChecked` is executing.

---

## Error State

```css
.layers-control__error          /* error box container */
.layers-control__error-message  /* error text in red */
.layers-control__retry-button   /* retry button (red background) */
```

---

## Zoom Filter State

Overlays filtered by zoom get a visual indicator via JavaScript-applied classes on the toggle element. The overlay item itself is hidden when zoom-filtered.

---

## Responsive

```css
@media (max-width: 480px) {
    .layers-control__panel { min-width: 180px; max-width: 250px; max-height: 60dvh; }
}
```

---

## Dark Theme

Auto-detected via `prefers-color-scheme: dark`. Key overrides:

```css
@media (prefers-color-scheme: dark) {
    .layers-control-container, .layers-control__panel { background: #2d3748; color: #e2e8f0; }
    .layers-control__section-title { background: #4a5568; color: #a0aec0; }
    .layers-control__base-item--active { background-color: rgba(0,124,186,0.3); color: #63b3ed; }
}
```

---

## Accessibility

- Focus rings via `outline: 2px solid #007cba` on all interactive elements
- `prefers-contrast: high`: adds 2px border on panel and active items
- `prefers-reduced-motion: reduce`: disables transitions and spinner animation

---

## Customization

Override classes after loading `dist/css/all.css`:

```css
/* Wider panel */
.layers-control__panel {
    min-width: 300px;
    max-width: 380px;
}

/* Custom accent color */
.layers-control__base-item--active {
    background-color: rgba(0, 150, 100, 0.1);
    color: #009664;
}

.layers-control__base-item input[type="radio"],
.layers-control__overlay-toggle input[type="checkbox"],
.layers-control__group-toggle input[type="checkbox"] {
    accent-color: #009664;
}

/* Taller panel */
.layers-control__panel {
    max-height: 80dvh;
}

/* Custom section title */
.layers-control__section-title {
    font-size: 11px;
    letter-spacing: 1px;
    background: #e8f4f8;
    color: #006699;
}
```

---

## Class Quick Reference

| Class | Element |
|-------|---------|
| `.layers-control-container` | Root wrapper div |
| `.layers-control__toggle` | Open/close button |
| `.layers-control__panel` | Floating panel |
| `.layers-control__panel--open` | Panel visible state |
| `.layers-control__section-title` | "Base Layers" / "Overlays" header |
| `.layers-control__base-section` | Base layer section |
| `.layers-control__overlays-section` | Overlays section |
| `.layers-control__base-item` | Base layer row |
| `.layers-control__base-item--active` | Active base layer |
| `.layers-control__overlay-item` | Overlay row |
| `.layers-control__overlay-item--loading` | Overlay loading state |
| `.layers-control__overlay-toggle` | Overlay checkbox+label |
| `.layers-control__label` | Overlay name text |
| `.layers-control__group` | Group container |
| `.layers-control__group-header` | Group header row |
| `.layers-control__group-toggle` | Group checkbox+label |
| `.layers-control__group-overlays` | Group child overlays |
| `.layers-control__opacity-control` | Opacity slider container |
| `.layers-control__opacity-slider` | Opacity `<input type="range">` |
| `.layers-control__opacity-label` | Opacity percentage text |
| `.layers-control__loading` | Loading spinner |
| `.layers-control__error` | Error box |
| `.layers-control__error-message` | Error text |
| `.layers-control__retry-button` | Retry button |
