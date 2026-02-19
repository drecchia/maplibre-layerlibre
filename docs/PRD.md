# Product Requirements Document — `maplibre-layer-control`

**Package:** `@drecchia/maplibre-layer-control`
**Version:** 2.x
**Author:** Danilo T. Recchia
**License:** CC-BY-NC-4.0

---

## 1. Overview

`maplibre-layer-control` is a vanilla JavaScript layer-management control for [MapLibre GL JS](https://maplibre.org/). It renders as a collapsible panel attached to the map (via the standard MapLibre control interface) and provides:

- **Base map switching** — radio-button selector among configured base styles.
- **Overlay management** — checkbox toggles for deck.gl overlays, with optional opacity sliders.
- **Overlay grouping** — overlays can be logically grouped; groups have their own toggle.
- **State persistence** — base layer, overlay visibility, opacity, and viewport are auto-saved to `localStorage` and restored on page reload.
- **Dynamic/async overlays** — overlays can defer data loading until the user activates them (`onChecked` callback).
- **Forced viewport and base layer** — an overlay can force the map to switch base style, fly to a location, change pitch/bearing, or fit to bounds when activated.
- **Zoom-range filtering** — overlays are automatically hidden/shown as the map zoom crosses configured thresholds.
- **Rich tooltip system** — deck.gl pick events produce tooltips configured as a property name, an object schema, or a custom function.
- **Event-driven API** — all state transitions emit named events that consumers can subscribe to.

---

## 2. Technology Stack & Dependencies

| Dependency | Version | Role |
|---|---|---|
| MapLibre GL JS | ^4.1.1 | Map renderer; `LayersControl` implements the `IControl` interface |
| deck.gl | ^9.1.14 | Overlay renderer; all overlays are deck.gl layers via `MapboxOverlay` |
| Vanilla JS | ES2020+ | No framework; modules via ES `import`/`export` |
| Gulp | build only | Bundles `dist/js/all.min.js` and `dist/css/all.css` |

---

## 3. Architecture

The control is built as a **service-oriented facade**. `LayersControl` is the public-facing class; it orchestrates four injected services.

```
LayersControl (facade + MapLibre IControl)
  ├── StateService     — owns all mutable state; persists to localStorage
  ├── UIService        — builds & updates DOM; delegates to deck.gl
  ├── MapService       — wraps map instance interaction
  ├── BusinessLogicService — orchestrates the above; enforces business rules
  └── EventEmitter     — pub/sub for all public events
```

`UIManager` (in `src/js/uiManager.js`) is a supporting class that handles deck.gl overlay lifecycle and DOM updates; it is consumed by `UIService`.

`BoundsHelper` (in `src/js/helper.js`) is a static utility for computing bounding boxes and zoom levels from coordinate arrays.

### Instantiation pattern

```js
const eventEmitter         = new EventEmitter();
const stateService         = new StateService(eventEmitter, 'myApp-layers');
const mapService           = new MapService(eventEmitter);
const uiService            = new UIService(stateService, mapService, eventEmitter);
const businessLogicService = new BusinessLogicService(stateService, eventEmitter);

const layersControl = new LayersControl(options, {
  stateService,
  uiService,
  mapService,
  businessLogicService,
  eventEmitter
});

map.addControl(layersControl, 'top-left');
```

> All five services **must** be supplied; the constructor throws if any is missing.

---

## 4. Configuration Reference

`new LayersControl(options, services)`

### 4.1 Top-level `options`

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `baseStyles` | `BaseStyle[]` | **yes** | — | List of selectable base maps |
| `overlays` | `Overlay[]` | **yes** | — | List of overlay definitions (may be empty `[]`) |
| `defaultBaseId` | `string` | no | first item in `baseStyles` | ID of the base style active on first load |
| `groups` | `Group[]` | no | `[]` | Explicit group metadata (label overrides) |
| `showOpacity` | `boolean` | no | `true` | Show opacity slider for overlays that declare `opacityControls: true` |
| `autoClose` | `boolean` | no | `false` | Close the panel when the user clicks outside it |
| `icon` | `string` | no | `'☰'` | Toggle button icon content |
| `i18n` | `object` | no | see below | Labels for panel section headers |
| `i18n.baseHeader` | `string` | no | `'Base Layers'` | Title for the base maps section |
| `i18n.overlaysHeader` | `string` | no | `'Overlays'` | Title for the overlays section |

---

### 4.2 `BaseStyle` object

```ts
{
  id:       string,           // unique identifier
  label:    string,           // display name shown in the control
  style:    string | object,  // MapLibre style URL or inline style object
  strategy: 'setStyle'        // only 'setStyle' is currently supported
}
```

**Example:**
```js
{ id: 'osm', label: 'OpenStreetMap', style: 'https://demotiles.maplibre.org/style.json', strategy: 'setStyle' }
```

---

### 4.3 `Overlay` object

```ts
{
  // Required
  id:               string,

  // Display
  label?:           string,           // shown in the control; falls back to id
  group?:           string,           // group ID this overlay belongs to

  // Layer data (choose one approach)
  deckLayers?:      DeckLayerDef[],   // static deck.gl layer definitions
  onChecked?:       AsyncCallback,    // called when user checks the overlay (see §4.4)

  // Opacity
  opacityControls?: boolean,          // show opacity slider (requires showOpacity: true globally)
  defaultOpacity?:  number,           // initial opacity 0..1, default 1.0

  // Initial visibility
  defaultVisible?:  boolean,          // default false

  // Viewport behaviour (applied on user activation)
  viewport?: {
    center?:     [number, number],    // [lng, lat] to fly to
    zoom?:       number,
    bearing?:    number,              // degrees
    pitch?:      number,              // degrees
    fitBounds?:  [[number,number],[number,number]]  // [[minLng,minLat],[maxLng,maxLat]]
  },
  forcedBaseLayerId?: string,         // switch to this base style when overlay is enabled

  // Legacy viewport properties (still supported for backward compat)
  forcedCenter?:    [number, number],
  panZoom?:         number,
  forcedBearing?:   number,
  forcedPitch?:     number,
  fitBounds?:       [[number,number],[number,number]],

  // Zoom constraints
  filter?: {
    minZoom?: number,   // hide when map.getZoom() < minZoom
    maxZoom?: number    // hide when map.getZoom() >= maxZoom
  },
  // Legacy zoom constraint properties
  minZoomLevel?: number,
  maxZoomLevel?: number,

  // Tooltip (see §4.5)
  tooltip?:      string | TooltipObject,
  getTooltip?:   (object, info) => TooltipResult | null
}
```

---

### 4.4 `DeckLayerDef` object

```ts
{
  id:    string,           // unique deck.gl layer ID
  type:  string,           // deck.gl class name e.g. 'ScatterplotLayer', 'LineLayer'
  props: object            // deck.gl layer props (data, accessors, colors, etc.)
}
```

All deck.gl layer types available on the global `deck.*` namespace are supported. The `opacity` prop is managed by the control; do not set it inside `props`.

---

### 4.5 `onChecked` async callback

Declared as an async function on the overlay config. Called every time the user **enables** the overlay. Receives a `context` object:

```ts
context = {
  map:                maplibregl.Map,
  overlayManager:     UIManager,
  stateManager:       StateService,
  overlayId:          string,
  overlay:            Overlay,             // current overlay config
  isUserInteraction:  boolean,
  deckOverlay:        deck.MapboxOverlay,

  // Viewport
  getCurrentViewport(): { center, zoom, bearing, pitch },

  // State queries
  getOverlayState(id): OverlayState,
  getAllOverlayStates(): Record<string, OverlayState>,

  // Dynamic config update
  getOverlayConfig():  Overlay,
  setOverlayConfig(newConfig, options?): void,
  //   options.changedProperties?: string[]  — selective update ('deckLayers', 'label')
  //   options.applyViewport?: boolean       — apply viewport changes immediately

  // Per-overlay cache (survives across show/hide cycles)
  getCache():  any,
  setCache(value): void,
  clearCache(): void
}
```

**Typical pattern — load data once, cache result:**
```js
onChecked: async (context) => {
  if (context.getCache()) return;             // already loaded

  const data = await fetch('/api/points').then(r => r.json());

  context.setOverlayConfig({
    deckLayers: [{
      id: 'points',
      type: 'ScatterplotLayer',
      props: { data, getPosition: d => d.position, getRadius: 5000, pickable: true }
    }]
  });

  context.setCache({ loaded: true });
}
```

The control manages loading/error state automatically:
- While the promise is pending → spinner `↻` shown next to overlay label.
- On resolve → spinner hidden.
- On reject (thrown error) → error icon `🚨` shown; error message stored.

---

### 4.6 Tooltip configuration

Three mutually exclusive modes, checked in this priority order:

| Mode | Property | Value type | Behaviour |
|---|---|---|---|
| Function | `getTooltip` | `(object, info) => { html, style }` | Full control over HTML and CSS |
| Object schema | `tooltip` | `{ title: string, fields: [{label, property}] }` | Renders a structured card |
| String shorthand | `tooltip` | `string` (property name) | Shows `object[tooltip]` |

**Function tooltip example:**
```js
getTooltip: (object, info) => ({
  html: `<b>${object.name}</b><br>Pop: ${object.population}`,
  style: { backgroundColor: '#222', color: '#fff', padding: '8px' }
})
```

**Object tooltip example:**
```js
tooltip: {
  title: 'name',
  fields: [
    { label: 'Type', property: 'type' },
    { label: 'Population', property: 'population' }
  ]
}
```

**String tooltip example:**
```js
tooltip: 'name'    // displays object.name on hover
```

Property paths support dot notation: `'address.city'`.

---

### 4.7 `Group` object

```ts
{
  id:    string,   // matches overlay.group value
  label: string    // display name shown in the group header (falls back to id)
}
```

Groups are **implicit** when overlays share the same `group` string. The `groups` array is only needed to provide custom labels.

---

## 5. Public API

All methods return `boolean` (`true` = success, `false` = not found or failed) unless noted.

### 5.1 Lifecycle

| Method | Signature | Description |
|---|---|---|
| `onAdd` | `(map) → HTMLElement` | MapLibre IControl hook; called automatically by `map.addControl()` |
| `onRemove` | `() → void` | MapLibre IControl hook; tears down DOM and listeners |
| `destroy` | `() → true` | Full teardown: removes overlays, unregisters map events, calls `onRemove`, nulls all references |

---

### 5.2 Base layer

| Method | Signature | Description |
|---|---|---|
| `setBaseLayer(id)` | `(string) → boolean` | Switch active base map |
| `setBase(id)` | alias for `setBaseLayer` | |
| `addBaseStyle(style)` | `(BaseStyle) → boolean` | Add or update a base style; triggers re-render |
| `removeBaseStyle(id)` | `(string) → boolean` | Remove a base style; if active, auto-switches to `defaultBaseId` or first remaining |
| `getBaseLayers()` | `() → BaseStyle[]` | Returns all base styles with `active` flag |

---

### 5.3 Overlays

| Method | Signature | Description |
|---|---|---|
| `addOverlay(config, fireCallback?)` | `(Overlay, boolean) → boolean` | Add or update an overlay; re-renders the panel |
| `removeOverlay(id, fireCallback?)` | `(string, boolean) → boolean` | Remove an overlay; cleans up deck.gl layers |
| `removeAllOverlays()` | `() → boolean` | Remove every overlay |
| `showOverlay(id, fireCallback?)` | `(string, boolean) → boolean` | Make overlay visible |
| `hideOverlay(id, fireCallback?)` | `(string, boolean) → boolean` | Hide overlay |
| `setOverlayOpacity(id, value)` | `(string, number 0-1) → boolean` | Set opacity; updates deck.gl layers |
| `getOverlays()` | `() → Overlay[]` | Returns all overlays with current `visible` and `opacity` |

> `fireCallback`: when `true`, emits the `overlaychange` event; defaults to `false` for programmatic calls.

---

### 5.4 Groups

| Method | Signature | Description |
|---|---|---|
| `showGroup(id)` | `(string) → boolean` | Show all overlays in group |
| `hideGroup(id)` | `(string) → boolean` | Hide all overlays in group |
| `setGroupOpacity(id, value)` | `(string, number) → boolean` | Set opacity for all overlays in group |
| `getGroups()` | `() → GroupState[]` | Returns group metadata with `visible`, `opacity`, and `overlays` list |

---

### 5.5 Viewport

| Method | Signature | Description |
|---|---|---|
| `saveCurrentViewport()` | `() → boolean` | Snapshot current map center/zoom/bearing/pitch to state |
| `applySavedViewport()` | `() → boolean` | Jump map to last saved viewport |

The viewport is also **auto-saved** on every `moveend` event (debounced 500 ms).

---

### 5.6 Persistence

| Method | Signature | Description |
|---|---|---|
| `clearPersistedData()` | `() → boolean` | Clears all state in localStorage; call `location.reload()` after to reset UI |

---

### 5.7 State inspection

| Method | Signature | Description |
|---|---|---|
| `getCurrentState()` | `() → object` | Returns the full internal state snapshot |

---

### 5.8 Events

```js
layersControl.on(eventName, callback)   // subscribe
layersControl.off(eventName, callback)  // unsubscribe
```

Both return `this` for chaining.

---

## 6. Event System

### 6.1 Event catalogue

| Event | Payload | When emitted |
|---|---|---|
| `basechange` | `{ id: string }` | Active base layer changes |
| `overlaychange` | `{ id: string, visible: boolean, opacity: number }` | Overlay visibility or opacity changes |
| `overlaygroupchange` | `{ id: string, visible: boolean }` | Group toggle changes |
| `change` | `{ type, ...payload }` | Any of the above changes |
| `loading` | `{ id: string }` | Overlay starts loading (async `onChecked`) |
| `success` | `{ id: string }` | Overlay loaded successfully |
| `error` | `{ id: string, error: string }` | Overlay load failed |
| `styleload` | `{ baseId: string }` | Map style finished loading after base switch |
| `sourceloaded` | `{ sourceId: string }` | A map source finished loading |
| `viewportchange` | `{ center, zoom, bearing, pitch }` | Viewport state was saved |
| `zoomfilter` | `{ id: string, filtered: boolean }` | Overlay hidden/shown due to zoom constraints |
| `memorycleared` | `{}` | `clearPersistedData()` was called |

### 6.2 Usage example

```js
layersControl
  .on('basechange',   ({ id }) => console.log('New base:', id))
  .on('overlaychange', ({ id, visible }) => console.log(id, visible ? 'on' : 'off'))
  .on('error',         ({ id, error }) => alert(`Failed to load ${id}: ${error}`));
```

---

## 7. Overlay Lifecycle

### 7.1 Static overlay (pre-configured `deckLayers`)

```
User checks overlay
    │
    ├─ forcedBaseLayerId? → switch base style
    ├─ viewport config?   → map.flyTo(...)
    ├─ zoom within filter range? → if not: mark as zoom-filtered, show 🔍
    └─ create deck.gl layers, push to MapboxOverlay
```

### 7.2 Dynamic overlay (`onChecked` callback)

```
User checks overlay
    │
    ├─ call onChecked(context)
    ├─ set loading state → show ↻
    │
    ├─ [on success]
    │     context.setOverlayConfig({ deckLayers: [...] })
    │     clear loading state, create deck.gl layers
    │
    └─ [on error]
          set error state → show 🚨, store message
```

`onChecked` is called on **every enable**. Use `context.getCache()` / `context.setCache()` to avoid re-fetching.

### 7.3 Deactivation

Removing the overlay or unchecking it clears deck.gl layers from the `MapboxOverlay`. Cache survives.

---

## 8. Zoom Filtering

Overlays with `filter.minZoom` or `filter.maxZoom` defined are automatically toggled as the map zoom level changes:

- `currentZoom < filter.minZoom` → overlay layers hidden, icon 🔍 shown in UI.
- `currentZoom >= filter.maxZoom` → overlay layers hidden, icon 🔍 shown.
- Within range → layers shown normally.

The overlay checkbox remains **checked** while zoom-filtered (the user's intent is preserved; the map is simply out of range).

---

## 9. State Persistence

State is persisted to `localStorage` under the key provided as the second argument to `StateService(eventEmitter, key)`. The persisted state schema:

```json
{
  "base": "osm",
  "overlays": {
    "my-overlay": { "visible": true, "opacity": 0.8 }
  },
  "groups": {
    "my-group": { "visible": true, "opacity": 1.0 }
  },
  "layerOrder": ["overlay-a", "overlay-b"],
  "viewport": {
    "center": { "lng": -46.8, "lat": -22.1 },
    "zoom": 9,
    "bearing": 0,
    "pitch": 0
  }
}
```

On `onAdd`, the control:
1. Restores the saved base style via `map.setStyle()`.
2. Restores the viewport via `map.jumpTo()` (with 100 ms delay).
3. Re-activates all previously visible overlays (with 200 ms delay).

---

## 10. BoundsHelper Utility

`BoundsHelper` is a globally available static utility class (bundled in `all.min.js`).

### `BoundsHelper.calculateBounds(points, padding?)`

```
points:   [lng, lat][]   — array of coordinate pairs
padding:  number         — uniform padding in degrees (default 0)
          | { top, bottom, left, right }  — per-side padding

returns:  [[minLng, minLat], [maxLng, maxLat]]
```

### `BoundsHelper.calculateBoundsCenter(bounds)`

```
bounds:   [[minLng, minLat], [maxLng, maxLat]]
returns:  [centerLng, centerLat]
```

### `BoundsHelper.calculateBoundsZoom(bounds, container, padding?)`

```
bounds:    [[minLng, minLat], [maxLng, maxLat]]
container: { width: number, height: number }   — map container size in pixels
padding:   number   — additional padding factor (default 0.5)
returns:   number   — zoom level clamped to [1, 20]
```

**Usage in overlay config:**
```js
viewport: {
  fitBounds: BoundsHelper.calculateBounds(points.map(p => p.position), 0.1)
}
```

---

## 11. CSS & Theming

All styles are in `dist/css/all.css`. Override in your application CSS.

### Key class names

| Class | Element |
|---|---|
| `.layers-control-container` | Root wrapper (`maplibregl-ctrl`) |
| `.layers-control__panel` | Collapsible panel |
| `.layers-control__panel--open` | Panel open state modifier |
| `.layers-control__section-title` | Section header (`h3`) |
| `.layers-control__base-section` | Base maps section |
| `.layers-control__base-list` | Base maps list |
| `.layers-control__base-item` | Individual base map label |
| `.layers-control__base-item--active` | Active base map item |
| `.layers-control__overlays-section` | Overlays section |
| `.layers-control__overlays-list` | Overlays list |
| `.layers-control__group` | Group container |
| `.layers-control__group-header` | Group header row |
| `.layers-control__group-toggle` | Group checkbox+label |
| `.layers-control__group-overlays` | Group children container |
| `.layers-control__overlay-item` | Individual overlay row |
| `.layers-control__overlay-item--loading` | Overlay in loading state |
| `.layers-control__overlay-item--error` | Overlay in error state |
| `.layers-control__overlay-item--filtered` | Overlay hidden by zoom filter |
| `.layers-control__overlay-toggle` | Overlay checkbox+label |
| `.layers-control__label` | Overlay text label |
| `.layers-control__loading` | Status icon (`↻` / `🚨` / `🔍`) |
| `.loadingRotate` | Spin animation on loading icon |
| `.layers-control__opacity-control` | Opacity slider container |
| `.layers-control__opacity-slider` | `<input type="range">` |
| `.layers-control__opacity-label` | Opacity percentage label |

### Tooltip classes

| Class | Element |
|---|---|
| `.tooltip-content` | Tooltip root div |
| `.tooltip-title` | Title row |
| `.tooltip-body` | Body container |
| `.tooltip-fields` | Fields list |
| `.tooltip-field` | Individual field row |

---

## 12. Example Gallery

| File | Demonstrates |
|---|---|
| `examples/minimal-base.html` | Minimal setup: base map switching only, no overlays |
| `examples/overlay-static.html` | Static overlay with pre-configured `deckLayers` |
| `examples/overlay-opacity.html` | Opacity slider with `opacityControls: true`, `defaultOpacity` |
| `examples/overlay-zoom.html` | Zoom constraints with `filter.minZoom` / `filter.maxZoom` |
| `examples/overlay-tooltip-string.html` | String tooltip (`tooltip: 'name'`) |
| `examples/overlay-tooltip-object.html` | Object tooltip (`tooltip: { title, fields }`) |
| `examples/overlay-tooltip-function.html` | Function tooltip (`getTooltip`) with custom HTML and CSS |
| `examples/overlay-render-on-click.html` | Async `onChecked` with `setOverlayConfig` and `setCache` |
| `examples/overlay-forced-base.html` | `forcedBaseLayerId` + `viewport.bearing/pitch` on enable |
| `examples/forced-fit-bounds.html` | `viewport.fitBounds` using `BoundsHelper.calculateBounds` |
| `examples/group-overlays.html` | Overlays grouped with shared `group` string |
| `examples/group-overlays.html` | Group-level toggle and opacity |
| `examples/events.html` | Full event log: all emitted events |
| `examples/persistence.html` | State save/restore across page reloads |
| `examples/dynamic-overlays.html` | `addOverlay` / `removeOverlay` at runtime |
| `examples/dynamic-control.html` | `map.addControl` / `destroy` at runtime |
| `examples/dynamic-base-style.html` | `addBaseStyle` / `removeBaseStyle` at runtime |
| `examples/advanced.html` | All features combined: groups, forced base, async loading, error states |

---

## 13. Known Limitations & Constraints

1. **Only deck.gl overlays are supported.** Native MapLibre `source`/`layer` overlays are not managed by this control.
2. **Single active base layer at a time.** Base styles are mutually exclusive (radio buttons).
3. **`strategy: 'setStyle'` only.** The `toggleBackground` strategy referenced in the README is not implemented in the current codebase.
4. **deck.gl must be loaded globally** as `window.deck` before the control is initialised.
5. **MapLibre GL JS must be loaded globally** as `window.maplibregl`.
6. **No TypeScript types shipped** for the main control. The `dist/js/*.d.ts` files cover service internals only.
7. **`onChecked` is invoked on every enable.** Cache management (`getCache`/`setCache`) is the developer's responsibility.
8. **Viewport auto-save** is debounced at 500 ms on `moveend`. Rapid navigation may miss intermediate viewports.

---

## 14. Build

```bash
npm install        # install dev dependencies (gulp, etc.)
npm run build      # → dist/js/all.min.js + dist/css/all.css
```

Source entry point for JS: `src/js/helper.js`, `src/js/uiManager.js`, `src/js/layersControl.js` (concatenated via `gulp/js.js`).
Source for CSS: `src/css/uiManager.css`.
