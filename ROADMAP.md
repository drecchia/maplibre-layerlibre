# Roadmap

Planned improvements and known issues for `@drecchia/maplibre-layer-control`.

Items are grouped by release target. Items without a version are unscheduled.

---

## v1.x — Near-term

### Features

#### Overlay `persistent` flag
Add a boolean field `persistent: false` to the overlay config to opt out of localStorage state persistence for that specific overlay. When `false`, the overlay's checked/opacity state is never saved or restored across page loads.

```js
{
    id: 'ephemeral-layer',
    label: 'Temporary Layer',
    persistent: false,   // never remembered
    deckLayers: [...]
}
```

#### `onChecked` + zoom filter interaction
When an overlay with `onChecked` is activated but the current zoom level is outside `minZoomLevel`/`maxZoomLevel`, the callback should still execute (to cache the data) but the layers should remain hidden until zoom enters range. Currently the zoom check can prevent the callback from running at all.

Additionally, `onChecked` should be callable with an optional bounding-box argument so consumers can re-fetch viewport-dependent data when the map moves significantly.

#### `onSelect` / `onDeselect` callbacks on Overlay
Two optional lifecycle callbacks:

```js
{
    id: 'my-overlay',
    onSelect:   async (context) => { /* called when overlay is checked on */ },
    onDeselect: async (context) => { /* called when overlay is checked off */ }
}
```

`onSelect` is equivalent to the current `onChecked` (rename/alias). `onDeselect` enables cleanup (e.g. clearing markers, stopping timers).

#### Move `getTooltip` to deckLayers level
Currently `getTooltip` is defined at the overlay level and applies to all deck.gl layers in the overlay. Move support to the individual `deckLayers` item so different layers in the same overlay can have different tooltip renderers:

```js
deckLayers: [
    {
        id: 'layer-a',
        type: 'ScatterplotLayer',
        getTooltip: (object) => object.name,   // per-layer tooltip
        props: { ... }
    }
]
```

#### Overlay render priority (z-order)
Add a `priority` (or `zOrder`) numeric field on overlays to control render order in the deck.gl stack. Higher values render on top. Currently layer order depends on activation order.

```js
{ id: 'base-overlay', priority: 0, ... }
{ id: 'top-overlay',  priority: 10, ... }
```

---

### Bug Fixes

#### Rapid toggling corrupts layer order
Toggling the same overlay on/off multiple times in quick succession can leave deck.gl layers in an incorrect order. The `_updateDeckOverlay` call is not guarded against concurrent activation/deactivation races.

#### Stale persisted overlay IDs silently re-activated
When an overlay ID that was previously persisted as `visible: true` no longer exists in the current `overlays` config, `_restoreMapState` silently attempts to activate it. The activation itself is a no-op (the overlay isn't found), but no cleanup of the stale state entry is performed. The stale key remains in localStorage and continues to be attempted on every load.

Fix: during `_restoreMapState`, validate each persisted overlay ID against the current config and delete stale entries from state.

---

## v2.0 — Breaking changes / larger scope

### API Renames

#### Rename `overlay` → `LayerGroup`
Rename the overlay concept to `LayerGroup` throughout the API for clearer semantics (`overlays` array → `layerGroups`, `addOverlay` → `addLayerGroup`, events `overlaychange` → `layergroupchange`, etc.). This is a breaking change requiring a major version bump and a migration guide.

### Features

#### deck.gl layer diffing in `setOverlayConfig`
Currently `context.setOverlayConfig({ deckLayers })` inside `onChecked` removes all existing deck.gl layers for the overlay and re-adds the new ones. For large datasets this causes a visible flash.

Instead, diff the new `deckLayers` array against the existing ones by `id`, and let deck.gl handle the update in-place (deck.gl already handles prop diffing internally when the same layer `id` is reused). Only add/remove layers that actually changed.

#### Re-evaluate `defaultBaseId`
The `defaultBaseId` option is used only when no persisted base exists. Consider whether this should be derived automatically from the first entry in `baseStyles` (which is already the fallback) and whether exposing it as a separate option adds unnecessary complexity.

---

## Completed (archived)

- **`overlay.group` field** — overlays are assigned to groups via `overlay.group = 'group-id'`. Groups are defined in the top-level `groups` array with `{ id, label }`. ✅
- **Empty groups after `removeOverlay`** — `updateOverlays()` triggers a full panel re-render; groups with no remaining overlays are not rendered. ✅
- **`_restoreMapState` fallback for unknown base** — when persisted base ID no longer exists in `baseStyles`, control falls back to `defaultBaseId` and updates the UI. ✅
- **`renderOnClick` → `onChecked`** — dynamic overlay callback renamed and contract updated (context-based side effects via `setOverlayConfig` instead of return value). ✅
