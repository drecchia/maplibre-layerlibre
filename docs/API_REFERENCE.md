# API Reference — LayersControl

Public API for the `@drecchia/maplibre-layer-control` library. All classes are global variables available from `dist/js/all.min.js`.

---

## Classes Overview

| Class | Role |
|-------|------|
| `EventEmitter` | Shared pub/sub event bus |
| `StateService` | State + localStorage persistence |
| `MapService` | Thin MapLibre map wrapper |
| `UIManager` / `UIService` | DOM rendering, deck.gl overlay lifecycle |
| `BusinessLogicService` | Orchestrator — state changes → UI updates |
| `LayersControl` | Public facade implementing MapLibre `IControl` |
| `BoundsHelper` | Static utility for bounding box calculations |

---

## EventEmitter

```js
const ee = new EventEmitter();
```

- `on(event, handler): this` — subscribe to an event
- `off(event, handler): this` — unsubscribe
- `emit(event, data): void` — emit (internal use; called by services)

---

## StateService

```js
const stateService = new StateService(eventEmitter, 'my-app-layers');
```

Second argument is the `localStorage` key (namespaces persistence per control instance).

**Named getters (preferred):**
- `getCurrentBase(): string|null`
- `getOverlayStates(): Object` — `{ [id]: { visible, opacity } }`
- `getGroupStates(): Object` — `{ [id]: { visible, opacity } }`
- `getViewport(): Object|null` — `{ center, zoom, bearing, pitch }`
- `getAll(): Object` — full state snapshot

**Setters (internal, called by BusinessLogicService):**
- `setBase(baseId)`
- `setOverlayVisibility(id, visible)`
- `setOverlayOpacity(id, opacity)`
- `setGroupVisibility(id, visible)`
- `setGroupOpacity(id, opacity)`
- `setViewport(viewport)`
- `initOverlay(id, config)` — initialises overlay state from defaults
- `removeOverlay(id)`
- `clearPersisted(): boolean` — clears localStorage entry

---

## MapService

```js
const mapService = new MapService(eventEmitter);
```

Thin wrapper. Used internally; consumers do not call it directly.

- `setMap(map)` / `setMap(null)` — called by LayersControl on add/remove
- `getMap(): maplibregl.Map|null`
- `destroy()`

---

## UIManager / UIService

`UIService` is an alias: `const UIService = UIManager` (at bottom of `uiManager.js`).

```js
const uiService = new UIService(stateService, mapService, eventEmitter);
```

Options and BLS references are injected after construction by `LayersControl.onAdd()`.
Consumers do not call UIManager methods directly; use `LayersControl` API instead.

---

## BusinessLogicService

```js
const businessLogicService = new BusinessLogicService(stateService, eventEmitter);
```

`initialize(deps)` is called by `LayersControl.onAdd()`. Consumers do not call it directly.

---

## LayersControl

The main public API. Implements the MapLibre `IControl` interface.

```js
const layersControl = new LayersControl(options, {
    stateService, uiService, mapService, businessLogicService, eventEmitter
});
map.addControl(layersControl, 'top-left');
```

### MapLibre IControl

- `onAdd(map): HTMLElement` — called by MapLibre; returns control container
- `onRemove(): void` — called by MapLibre; cleans up listeners

### Base Layer API

| Method | Returns | Description |
|--------|---------|-------------|
| `setBaseLayer(id)` | `boolean` | Switch active base style |
| `setBase(id)` | `boolean` | Alias for `setBaseLayer` |
| `addBaseStyle(style)` | `boolean` | Add or update a base style |
| `removeBaseStyle(id)` | `boolean` | Remove a base style |
| `getBaseLayers()` | `Array` | All base styles with `active` flag |

### Overlay API

| Method | Returns | Description |
|--------|---------|-------------|
| `addOverlay(config, fireCallback?)` | `boolean` | Add or update an overlay at runtime |
| `removeOverlay(id, fireCallback?)` | `boolean` | Remove an overlay |
| `removeAllOverlays()` | `boolean` | Remove all overlays |
| `showOverlay(id, fireCallback?)` | `boolean` | Make an overlay visible |
| `hideOverlay(id, fireCallback?)` | `boolean` | Hide an overlay |
| `setOverlayOpacity(id, value)` | `boolean` | Set opacity (0–1) |
| `getOverlays()` | `Array` | All overlays with current `visible` and `opacity` |

### Group API

| Method | Returns | Description |
|--------|---------|-------------|
| `showGroup(id)` | `boolean` | Show all overlays in group |
| `hideGroup(id)` | `boolean` | Hide all overlays in group |
| `setGroupOpacity(id, value)` | `boolean` | Set opacity for all overlays in group |
| `getGroups()` | `Array` | All groups with current `visible`, `opacity`, and member `overlays` |

### Viewport & Persistence API

| Method | Returns | Description |
|--------|---------|-------------|
| `saveCurrentViewport()` | `boolean` | Persist current map center/zoom/bearing/pitch |
| `applySavedViewport()` | `boolean` | Jump map to persisted viewport |
| `clearPersistedData()` | `boolean` | Delete localStorage entry |

### Events API

| Method | Returns | Description |
|--------|---------|-------------|
| `on(event, callback)` | `this` | Subscribe to an event (chainable) |
| `off(event, callback)` | `this` | Unsubscribe |

### Introspection

| Method | Returns | Description |
|--------|---------|-------------|
| `getCurrentState()` | `Object` | Full state snapshot from `StateService.getAll()` |
| `destroy()` | `boolean` | Fully tear down the control |

---

## BoundsHelper

Static utility class. Available as a global from the bundle.

### `BoundsHelper.calculateBounds(points, padding?)`

Calculate a bounding box from coordinate pairs.

```js
const bounds = BoundsHelper.calculateBounds(
    data.map(d => d.position),  // Array of [lng, lat]
    0.1                          // optional uniform padding (degrees)
);
// Returns [[minLng, minLat], [maxLng, maxLat]]
```

- `points`: `Array<[lng, lat]>` — coordinate pairs
- `padding`: `number` (uniform) or `{ top, bottom, left, right }` (per-side, in degrees)
- Returns: `[[minLng, minLat], [maxLng, maxLat]]`

### `BoundsHelper.calculateBoundsCenter(bounds)`

Returns the center `[lng, lat]` of a bounding box.

### `BoundsHelper.calculateBoundsZoom(bounds, container, padding?)`

Calculate an appropriate MapLibre zoom level to fit bounds.

- `bounds`: `[[minLng, minLat], [maxLng, maxLat]]`
- `container`: `{ width, height }` in pixels
- `padding`: extra zoom reduction (default `0.5`)
- Returns: `number` (clamped 1–20)

### `BoundsHelper.calculatePanCenter(overlay)`

Extract a center point from an overlay's first deck.gl layer data point.

- Returns `[lng, lat]` or `null`

---

## Overlay Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier |
| `label` | string | yes | Display name in UI |
| `deckLayers` | Array | no* | Static deck.gl layer definitions |
| `onChecked` | async function | no* | Dynamic overlay callback (see [ONECHECKED.md](./ONECHECKED.md)) |
| `group` | string | no | Group ID for grouping in UI |
| `defaultVisible` | boolean | no | Initial visibility (default `false`) |
| `defaultOpacity` | number | no | Initial opacity 0–1 (default `1.0`) |
| `opacityControls` | boolean | no | Show opacity slider in UI |
| `viewport` | object | no | Viewport to apply on activation — `{ fitBounds, center, zoom, bearing, pitch }` |
| `forcedBaseLayerId` | string | no | Switch to this base style before activating |
| `forcedBearing` | number | no | Apply this bearing after activation |
| `forcedPitch` | number | no | Apply this pitch after activation |
| `minZoomLevel` | number | no | Hide overlay below this zoom |
| `maxZoomLevel` | number | no | Hide overlay above this zoom |
| `tooltip` | string \| object | no | Tooltip field name or field map |
| `getTooltip` | function | no | Custom tooltip renderer `(object) => string` |

*One of `deckLayers` or `onChecked` is required for the overlay to render anything.

### `viewport` object fields

| Field | Description |
|-------|-------------|
| `fitBounds` | `[[minLng, minLat], [maxLng, maxLat]]` — fit map to these bounds (takes priority over center/zoom) |
| `center` | `[lng, lat]` — pan to this center |
| `zoom` | zoom level to apply (used with `center`; ignored when `fitBounds` is set) |
| `bearing` | map bearing in degrees |
| `pitch` | map pitch in degrees |

---

## State Schema

State persisted to localStorage:

```json
{
  "base": "osm",
  "overlays": {
    "overlay-id": { "visible": true, "opacity": 0.8 }
  },
  "groups": {
    "group-id": { "visible": true, "opacity": 1.0 }
  },
  "viewport": {
    "center": { "lng": -95, "lat": 40 },
    "zoom": 5,
    "bearing": 0,
    "pitch": 0
  }
}
```

---

## See Also

- [QUICKSTART.md](./QUICKSTART.md) — Getting started
- [CONFIGURATION.md](./CONFIGURATION.md) — Full options reference
- [EVENTS.md](./EVENTS.md) — Event payloads
- [ONECHECKED.md](./ONECHECKED.md) — Dynamic overlay callbacks
- [CSS.md](./CSS.md) — UI customization
