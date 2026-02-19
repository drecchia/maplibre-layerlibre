# CLAUDE.md — maplibre-layerlibre

## Project overview

`@drecchia/maplibre-layerlibre` is a vanilla-JS layer-switcher control for
[MapLibre GL JS](https://maplibre.org/) that renders overlays via
[deck.gl](https://deck.gl/) (`MapboxOverlay`).  It implements the MapLibre
`IControl` interface and exposes a clean public API for controlling base
layers, overlays, groups, persistence, and events.

License: CC-BY-NC-4.0

---

## Tech stack

| Concern | Library | Version |
|---------|---------|---------|
| Map renderer | maplibre-gl | ^4.1.1 |
| Overlay renderer | deck.gl | ^9.1.14 |
| Language | Vanilla JS (ES2020+, plain globals — **no ES modules, no TypeScript**) | — |
| Build | Gulp 4 | ^4.0.2 |
| CSS processing | gulp-clean-css, gulp-autoprefixer, postcss-nested | — |

---

## Build

```bash
npm run build          # runs `gulp default` → writes dist/js/all.min.js + dist/css/all.css
```

The build is Gulp-only; there is no webpack/vite/rollup.  All source files are
concatenated then minified with `gulp-uglify`.

---

## Source file order (critical)

The Gulp build (`gulp/js.js`) must concatenate files in **this exact order**
because every class is a plain global — later files depend on globals defined
by earlier ones:

```
src/js/helper.js              ← BoundsHelper static utility
src/js/eventEmitter.js        ← EventEmitter class
src/js/stateService.js        ← StateService class  (replaces deleted stateManager.js)
src/js/mapService.js          ← MapService class
src/js/uiManager.js           ← UIManager class  +  `const UIService = UIManager` alias
src/js/businessLogicService.js ← BusinessLogicService class
src/js/layersControl.js       ← LayersControl facade (public API)
```

**Do not add TypeScript files to the build.**  The `.ts` files under
`src/js/services/`, `src/js/events/`, `src/js/interfaces/`, `src/js/di/`,
and `src/js/utils/` are **dead stubs** from an abandoned migration attempt.
They are never compiled, never imported, and contain no real logic.

---

## Architecture — five-service pattern

`LayersControl` is a thin facade that delegates to five injected services.
Every consumer must instantiate all five and pass them in:

```js
const eventEmitter        = new EventEmitter();
const stateService        = new StateService(eventEmitter, 'myApp-layers');
const mapService          = new MapService(eventEmitter);
const uiService           = new UIService(stateService, mapService, eventEmitter);
const businessLogicService = new BusinessLogicService(stateService, eventEmitter);

const layersControl = new LayersControl(options, {
    stateService, uiService, mapService, businessLogicService, eventEmitter
});
map.addControl(layersControl, 'top-left');
```

`UIService` is just an alias for `UIManager` (`const UIService = UIManager`
at the bottom of `uiManager.js`).  They are the same class.

---

## Service responsibilities

| Service | Responsibility |
|---------|---------------|
| `EventEmitter` | Pub/sub event bus shared by all services |
| `StateService` | Reads/writes state; persists to `localStorage` (debounced 300 ms) |
| `MapService` | Thin wrapper around the MapLibre `Map` instance |
| `UIManager` / `UIService` | DOM rendering, deck.gl overlay lifecycle, tooltip system |
| `BusinessLogicService` | Orchestrates state changes → UI updates; exposes the overlay/base/group logic |

`BusinessLogicService.initialize(deps)` is called from `LayersControl.onAdd()`
after the map is available.  It receives `{ map, stateService, uiService, mapService, eventEmitter, options }`.

---

## StateService notes

- State schema: `{ base, overlays: {id:{visible,opacity}}, groups: {id:{visible,opacity}}, layerOrder:[], viewport:{center,zoom,bearing,pitch} }`
- `StateService.get(key)` exists for backward compatibility (delegates to named getters).
  Prefer the named getters: `getCurrentBase()`, `getOverlayStates()`, `getGroupStates()`, `getViewport()`, `getAll()`.
- Second constructor argument is the `localStorage` key (namespaced per-instance).

---

## UIManager notes

- `render()` builds the full control DOM and attaches event listeners.
- `updateOverlays()` / `updateBaseUI()` do partial DOM updates (no full re-render).
- `_activateOverlay(id, isUserInteraction)` handles the full overlay-on sequence:
  forced base style change → `onChecked` async callback → deck.gl layer creation → zoom filter.
- `_executeOnChecked(id, overlay, isUserInteraction)` wraps the user-supplied
  `overlay.onChecked` async function.  The context object passed to `onChecked`
  exposes: `map`, `overlay`, `cache` (get/set/clear), `setOverlayConfig(newConfig, opts)`,
  `getOverlayState(id)`, `isOverlayVisible(id)`, `isGroupVisible(id)`.
- `_applyBaseToMap(baseId)` calls `map.setStyle()`.  In the `styledata` callback
  it recreates the deck.gl overlay and re-activates all currently-visible overlays
  (50 ms delay).  **Never manually re-activate overlays after calling `setBaseLayer`
  — the `styledata` callback handles it.**

---

## LayersControl `_restoreMapState` — avoid double activation

`_restoreMapState()` tracks a `baseStyleTriggered` flag.  When a base style
change is triggered (which fires `styledata` → restores all overlays), it does
**not** also manually loop to activate overlays.  Only activate overlays manually
when no base style change occurred.

---

## Public API (preserved — do not break)

### Base layers
`setBaseLayer(id)`, `setBase(id)` (alias), `addBaseStyle(style)`,
`removeBaseStyle(id)`, `getBaseLayers()`

### Overlays
`addOverlay(config, fireCallback?)`, `removeOverlay(id, fireCallback?)`,
`removeAllOverlays()`, `showOverlay(id, fireCallback?)`,
`hideOverlay(id, fireCallback?)`, `setOverlayOpacity(id, value)`, `getOverlays()`

### Groups
`showGroup(id)`, `hideGroup(id)`, `setGroupOpacity(id, value)`, `getGroups()`

### Viewport / Persistence
`saveCurrentViewport()`, `applySavedViewport()`, `clearPersistedData()`

### Events
`on(event, cb)`, `off(event, cb)`

### Introspection
`getCurrentState()`, `destroy()`

---

## Events emitted

`basechange`, `overlaychange`, `overlaygroupchange`, `change`, `loading`,
`success`, `error`, `styleload`, `sourceloaded`, `viewportchange`,
`zoomfilter`, `memorycleared`

---

## CSS

Source: `src/css/` — uses PostCSS nested syntax.
Output: `dist/css/all.css`.
BEM naming: `.layers-control__element--modifier`.

---

## Examples

All examples live in `examples/` and load the built bundle from
`../dist/js/all.min.js`.  They use **plain `<script>` tags** (not
`type="module"`).  All classes (`EventEmitter`, `StateService`, `MapService`,
`UIService`, `BusinessLogicService`, `LayersControl`) are globals from the
bundle.

`examples/new-architecture-usage.html` is an additional demo of the full
five-service instantiation pattern.

To test locally: run `npm run build`, then open any example HTML directly in
a browser (or via a simple local HTTP server).

---

## Dead / ignore

The following directories contain TypeScript stubs that are **not part of the
build** and should be ignored:

- `src/js/services/*.ts`
- `src/js/events/*.ts`
- `src/js/interfaces/*.ts`
- `src/js/di/*.ts`
- `src/js/utils/*.ts`

Do not attempt to compile or integrate them — the canonical implementations
are the plain-JS files listed in the build order above.
