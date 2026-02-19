# Architecture — `@drecchia/maplibre-layerlibre`

---

## 1. Overview

`LayersControl` is a thin **facade** that implements the MapLibre `IControl` interface and delegates all logic to five injected services. Every consumer must instantiate all five services and pass them in.

```
LayersControl (MapLibre IControl facade — public API)
  ├── EventEmitter         — shared pub/sub event bus
  ├── StateService         — mutable state + localStorage persistence
  ├── MapService           — thin wrapper around the MapLibre Map instance
  ├── UIManager/UIService  — DOM rendering + deck.gl overlay lifecycle
  └── BusinessLogicService — orchestrates state ↔ UI transitions
```

`UIService` is an alias for `UIManager` (`const UIService = UIManager` at the bottom of `uiManager.js`). They are the same class.

`BoundsHelper` is a standalone static utility class for bounding-box calculations. It has no dependencies and needs no instantiation.

---

## 2. Service responsibilities

| Service | File | Responsibility |
|---------|------|---------------|
| `EventEmitter` | `src/js/eventEmitter.js` | Pub/sub event bus shared by all services |
| `StateService` | `src/js/stateService.js` | Reads/writes all mutable state; persists to `localStorage` (debounced 300 ms) |
| `MapService` | `src/js/mapService.js` | Holds reference to the MapLibre `Map`; provides thin helpers used by other services |
| `UIManager` / `UIService` | `src/js/uiManager.js` | Builds and updates the control DOM; manages the single `deck.MapboxOverlay` instance; handles zoom filtering, tooltips, loading/error UI states |
| `BusinessLogicService` | `src/js/businessLogicService.js` | Orchestrates all user-facing logic: base layer switching, overlay show/hide/opacity, group visibility; enforces business rules (e.g. forced base layer, double-activation guard) |

---

## 3. Build order (critical)

All classes are plain globals — later files depend on globals defined by earlier files. The Gulp build concatenates in this exact order:

1. `src/js/helper.js` — `BoundsHelper` static utility
2. `src/js/eventEmitter.js` — `EventEmitter`
3. `src/js/stateService.js` — `StateService`
4. `src/js/mapService.js` — `MapService`
5. `src/js/uiManager.js` — `UIManager` + `const UIService = UIManager`
6. `src/js/businessLogicService.js` — `BusinessLogicService`
7. `src/js/layersControl.js` — `LayersControl`

The `.ts` files under `src/js/services/`, `src/js/events/`, `src/js/interfaces/`, `src/js/di/`, and `src/js/utils/` are **dead stubs** from an abandoned migration. They are never compiled or used.

---

## 4. Lifecycle

### Construction
```js
const layersControl = new LayersControl(options, {
  stateService, uiService, mapService, businessLogicService, eventEmitter
});
```
`LayersControl` validates that all five services are present (throws otherwise) and stores references. No map interaction happens yet.

### `onAdd(map)` — called by `map.addControl()`
1. `mapService.setMap(map)` — map reference propagated.
2. `stateService.initOverlay()` — default visibility/opacity initialised for each overlay.
3. State base is set to `defaultBaseId` (or first base style) if nothing persisted.
4. `uiService.setMap/setContainer/setOptions/setBusinessLogicService()` — services wired.
5. `businessLogicService.initialize(deps)` — receives all deps.
6. `uiService.render()` — control DOM built and inserted into `container`.
7. Map event listeners set up (viewport auto-save on `moveend`, debounced 500 ms).
8. `_restoreMapState()` — restores persisted base style (via `setStyle`), viewport, and visible overlays.

### Runtime
- UI checkbox changes → `UIManager._handleToggleOverlay/Group/Base` → `BusinessLogicService.show/hideOverlay` or `setGroupVisibility` → `StateService` updated → `UIManager.activateOverlay/deactivateOverlay` called → deck.gl layers created/removed → events emitted.
- Opacity sliders → `BusinessLogicService.setOverlayOpacity` → `StateService` updated → `UIManager.updateOverlayOpacity` clones deck layer with new opacity.
- Base radio change → `BusinessLogicService.setBaseLayer` → `StateService.setBase` → `UIManager.applyBaseStyle` → `map.setStyle()` → `styledata` event → deck overlay recreated → visible overlays restored.

### Teardown
`layersControl.destroy()` removes overlays, unregisters map events, calls `onRemove()`, and nulls all references.

---

## 5. deck.gl integration

`UIManager` owns the single `deck.MapboxOverlay` instance (`this.deckOverlay`). Key points:

- Created in `_initializeDeckOverlay()` with `interleaved: true`.
- Layer instances are stored in `this.deckLayers` (Map: layerId → deck.Layer).
- Overlay-to-layer mapping in `this.overlayToLayerIds` (Map: overlayId → layerId[]).
- On `map.setStyle()`, the overlay is removed, `deckLayers` cleared, overlay re-created in the `styledata` callback, and visible overlays re-activated.
- Opacity changes clone layer instances: `layer.clone({ opacity })`.

---

## 6. State schema

`StateService` stores:

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

Persisted to `localStorage` under the key passed as the second constructor argument to `StateService`. Debounced 300 ms.

---

## 7. `onChecked` async callback

Overlays can defer data loading to user activation via the `onChecked` async function. `UIManager._executeOnChecked()` calls it and passes a `context` object with:

- `map`, `overlayManager`, `stateManager`/`stateService`, `overlayId`, `overlay`, `isUserInteraction`, `deckOverlay`
- `getCurrentViewport()`, `getOverlayState(id)`, `getAllOverlayStates()`
- `getOverlayConfig()`, `setOverlayConfig(newConfig, opts)` — mutates overlay config in-place; use to inject `deckLayers` after fetch
- `getCache()`, `setCache(val)`, `clearCache()` — per-overlay cache that survives show/hide cycles

While the promise is pending, a spinner `↻` is shown. On resolve, layers are created. On reject, `🚨` is shown and an `error` event is emitted.

---

## 8. Group behaviour

Groups are **implicit**: overlays that share the same `group` string are automatically grouped. The `groups` array in options only provides custom labels.

- Checking a group ON: if no child overlay is individually visible, all children are set to `visible: true` and activated. Otherwise, only previously-visible children are restored.
- Unchecking a group: all children are set to `visible: false` and deactivated.
