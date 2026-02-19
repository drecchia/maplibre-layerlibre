# Workflows — LayersControl

Runtime workflows and lifecycle description based on the actual implementation.

---

## 1. Component Lifecycle

### Construction

All five services must be constructed first, then `LayersControl`:

```js
const eventEmitter        = new EventEmitter();
const stateService        = new StateService(eventEmitter, 'my-app');
const mapService          = new MapService(eventEmitter);
const uiService           = new UIService(stateService, mapService, eventEmitter);
const businessLogicService = new BusinessLogicService(stateService, eventEmitter);

const layersControl = new LayersControl(options, {
    stateService, uiService, mapService, businessLogicService, eventEmitter
});
```

`LayersControl` constructor validates services, merges option defaults, and calls `_setupPublicEventForwarding()`.

### `onAdd(map)` — MapLibre calls this when control is added

1. `mapService.setMap(map)` — registers map with the service
2. `uiService.setOptions(options)`, `uiService.setMap(map)`, `uiService.setContainer(container)` — wire up UI
3. Overlay states initialised from config via `stateService.initOverlay()`
4. Initial base set in state if no persisted base exists
5. `businessLogicService.initialize({ map, stateService, uiService, mapService, eventEmitter, options })`
6. `uiService.setBusinessLogicService(businessLogicService)` — gives UI the orchestrator reference
7. `uiService.render()` — builds the full control DOM
8. Map `moveend` listener attached (debounced viewport save)
9. `_restoreMapState()` — applies persisted base style and re-activates visible overlays

### Runtime

User interactions and programmatic API calls flow through `LayersControl` → `BusinessLogicService` → `UIManager` + `StateService`. Events are emitted on the shared `EventEmitter` and received by external subscribers.

### Teardown — `onRemove()` / `destroy()`

- `onRemove()`: detaches map event listeners, nulls map/container references, removes DOM element
- `destroy()`: full teardown — removes all overlays, tears down all services, removes control from map if still attached

---

## 2. Base Style Switch

**Trigger:** user clicks a base radio button, or `layersControl.setBaseLayer(id)` is called.

1. `BusinessLogicService.setBaseLayer(id)` validates the ID against `options.baseStyles`
2. `StateService.setBase(id)` — persists new base ID, emits `basechange`
3. `UIManager.applyBaseStyle(id)`:
   - Destroys the existing deck.gl `MapboxOverlay`
   - Calls `map.setStyle(newStyle)`
   - Listens for the `styledata` event
4. On `styledata`:
   - Recreates the deck.gl `MapboxOverlay` with `interleaved: true`
   - Re-activates all currently-visible overlays (50 ms delay)
   - Emits `styleload` with `{ baseId }`
5. `UIManager.updateBaseUI()` — updates radio button state immediately (snappier UX)

**Important:** Never manually re-activate overlays after calling `setBaseLayer`. The `styledata` callback handles it automatically.

---

## 3. Overlay Activation (`deckLayers`)

**Trigger:** user checks an overlay checkbox, or `layersControl.showOverlay(id)` is called.

1. `BusinessLogicService.showOverlay(id)` checks if already visible (noop if so)
2. `StateService.setOverlayVisibility(id, true)` — persists state
3. `UIManager.activateOverlay(id, isUserInteraction)`:
   - If `forcedBaseLayerId` differs from current base: apply viewport now, then call `BusinessLogicService.setBaseLayer()` and return early (base switch's `styledata` callback will re-activate the overlay)
   - Apply `viewport` config (fitBounds / center+zoom / bearing / pitch) if `isUserInteraction`
   - If `overlay.onChecked` exists: call `_executeOnChecked()` (emits `loading`, awaits callback, emits `success` or `error`)
   - Build deck.gl layer instances from `overlay.deckLayers`
   - Apply zoom filter check
   - Add layers to the deck overlay via `_updateDeckOverlay()`
   - Update UI state (checkbox, opacity slider)

---

## 4. Dynamic Overlay — `onChecked` Flow

For overlays with an `onChecked` async callback:

1. `UIManager._executeOnChecked(overlayId, overlay, isUserInteraction)` is called
2. Emits `loading` event
3. Builds a `context` object (see [ONECHECKED.md](./ONECHECKED.md)) and calls `overlay.onChecked(context)`
4. Inside the callback, the consumer typically:
   - Checks `context.getCache()` to skip if already loaded
   - Fetches data
   - Calls `context.setOverlayConfig({ deckLayers: [...] })` to inject layers into the overlay config
   - Calls `context.setCache({ loaded: true })` to mark as done
5. After `onChecked` resolves, `UIManager` reads the (now-updated) `overlay.deckLayers` and creates deck.gl layer instances
6. Emits `success` event

On error: emits `error` event, overlay is not shown. The UI displays a retry button.

---

## 5. Group Toggle

**Group ON (checking the parent checkbox):**

1. `BusinessLogicService.setGroupVisibility(id, true)`
2. Finds all overlays where `overlay.group === id`
3. Checks if any are individually marked `visible: true`
   - If none: sets all to `visible: true` (first-click → activate all)
   - If some: activates only those that were individually visible
4. Calls `uiManager.activateOverlay()` for each qualifying overlay
5. Emits `overlaygroupchange { id, visible: true }`

**Group OFF (unchecking the parent checkbox):**

1. Sets all child overlay individual state to `visible: false`
2. Calls `uiManager.deactivateOverlay()` for each
3. Updates group and overlay UI
4. Emits `overlaygroupchange { id, visible: false }`

---

## 6. State Persistence

State is saved to `localStorage` automatically:

- **Overlay/base changes**: saved immediately (synchronous state mutation, async debounced write)
- **Viewport**: saved 500 ms after the last `moveend` event (debounced in `LayersControl._setupMapEventListeners`)
- **Key**: the second argument to `new StateService(eventEmitter, key)`

State restored in `_restoreMapState()`:
1. Loads persisted `base` ID → triggers base style switch (which restores visible overlays via `styledata`)
2. If persisted base doesn't exist in current `baseStyles`: resets to `defaultBaseId`, updates UI
3. Viewport: applies 400 ms after base switch (or 100 ms if no switch)
4. Overlays: if no base switch was triggered, manually activates each visible overlay (200 ms delay)

---

## 7. Dynamic Add/Remove Overlay

### `layersControl.addOverlay(config)`

1. Adds/updates config in `options.overlays`
2. `BusinessLogicService.addOverlay(config)` — calls `stateService.initOverlay()` (respects `defaultVisible`)
3. If the new overlay's state is `visible: true`, activates it immediately
4. `uiService.updateOverlays()` — re-renders the overlays section of the UI

### `layersControl.removeOverlay(id)`

1. `BusinessLogicService.removeOverlay(id)` — deactivates deck.gl layers, clears loading/error state, removes from `StateService`
2. Removes from `options.overlays`
3. `uiService.updateOverlays()` — re-renders the overlays section

---

## 8. Zoom Filtering

When an overlay has `minZoomLevel` or `maxZoomLevel`:

- On activation: if current zoom is out of range, overlay is hidden and `zoomfilter { id, filtered: true }` is emitted
- On map zoom: `UIManager` checks all active overlays; shows/hides as they enter/leave range; emits `zoomfilter` accordingly

---

## 9. Event Flow Diagram

```
User interaction / API call
        │
        ▼
  LayersControl (public facade)
        │
        ▼
  BusinessLogicService (orchestrator)
        │
        ├──► StateService (state mutation + emit basechange/overlaychange/…)
        │
        └──► UIManager (DOM + deck.gl update + emit loading/success/error/zoomfilter/styleload)
                │
                └──► EventEmitter (shared bus — external subscribers receive all events)
```

All events flow through the single shared `EventEmitter` instance. External subscribers register via `layersControl.on(event, callback)`.
