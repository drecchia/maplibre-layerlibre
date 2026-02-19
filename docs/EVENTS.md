# Events — LayersControl

All events emitted by the library. Subscribe via `layersControl.on(event, callback)`.

---

## Summary

| Event | Emitted by | Trigger | Payload |
|-------|-----------|---------|---------|
| `basechange` | StateService | Base style changed | `{ id }` |
| `overlaychange` | BusinessLogicService | Overlay visibility or opacity changed | `{ id, visible, opacity }` |
| `overlaygroupchange` | BusinessLogicService | Group visibility changed | `{ id, visible }` |
| `change` | All services | Any state change | `{ type, ...fields }` |
| `loading` | UIManager | `onChecked` async call starts | `{ id }` |
| `success` | UIManager | `onChecked` completes or deck layers added | `{ id }` |
| `error` | UIManager | Overlay activation fails | `{ id, error }` |
| `styleload` | UIManager | Map style finished loading after base switch | `{ baseId }` |
| `viewportchange` | StateService | Viewport saved | `{ center, zoom, bearing, pitch }` |
| `zoomfilter` | UIManager | Overlay shown/hidden by zoom constraints | `{ id, filtered }` |
| `memorycleared` | StateService | `clearPersistedData()` called | `{}` |

---

## Event Details

### `basechange`

Emitted when the active base style changes (UI or programmatic).

```js
layersControl.on('basechange', ({ id }) => {
    console.log('Active base:', id);
});
```

**Payload:** `{ id: string }` — ID of the new active base style.

---

### `overlaychange`

Emitted when an overlay's visibility or opacity changes.

```js
layersControl.on('overlaychange', ({ id, visible, opacity }) => {
    console.log(id, visible ? 'shown' : 'hidden', 'opacity:', opacity);
});
```

**Payload:**
```js
{ id: string, visible: boolean, opacity: number }
```

Emitted by `showOverlay`, `hideOverlay`, `setOverlayOpacity`, and group operations when `fireCallback: true`.

---

### `overlaygroupchange`

Emitted when a group's visibility is toggled.

```js
layersControl.on('overlaygroupchange', ({ id, visible }) => {
    console.log('Group', id, visible ? 'on' : 'off');
});
```

**Payload:** `{ id: string, visible: boolean }` — group ID and new visibility.

---

### `change`

Generic state-change event. Emitted on every state mutation alongside the specific event.

```js
layersControl.on('change', ({ type, ...rest }) => {
    console.log('Change:', type, rest);
});
```

**Payload:** `{ type: string, ...additional fields }` where `type` is one of:
- `'basechange'` — includes `id`
- `'overlaychange'` — includes `id`, `visible`, `opacity`
- `'overlaygroupchange'` — includes `id`, `visible`
- `'viewportchange'` — includes `center`, `zoom`, `bearing`, `pitch`
- `'styleload'` — includes `baseId`
- `'memorycleared'`

---

### `loading`

Emitted when an `onChecked` callback starts executing (async data fetch in progress).

```js
layersControl.on('loading', ({ id }) => {
    showSpinner(id);
});
```

**Payload:** `{ id: string }` — overlay ID.

---

### `success`

Emitted when an `onChecked` callback completes successfully or when deck.gl layers are added.

```js
layersControl.on('success', ({ id }) => {
    hideSpinner(id);
});
```

**Payload:** `{ id: string }` — overlay ID.

---

### `error`

Emitted when overlay activation fails (exception in `onChecked`, or other activation error).

```js
layersControl.on('error', ({ id, error }) => {
    console.error('Overlay error:', id, error);
});
```

**Payload:** `{ id: string, error: string }` — overlay ID and error message string.

---

### `styleload`

Emitted after a base style change completes (map `styledata` event fires). At this point deck.gl overlays have been recreated and visible overlays restored.

```js
layersControl.on('styleload', ({ baseId }) => {
    console.log('Style loaded for base:', baseId);
});
```

**Payload:** `{ baseId: string }` — ID of the base style that just loaded.

---

### `viewportchange`

Emitted when the map viewport is saved to state (debounced 500 ms after `moveend`).

```js
layersControl.on('viewportchange', (viewport) => {
    console.log('Viewport saved:', viewport);
});
```

**Payload:** `{ center: { lng, lat }, zoom, bearing, pitch }`.

---

### `zoomfilter`

Emitted when an overlay is shown or hidden because the map zoom moved in or out of the overlay's `minZoomLevel`/`maxZoomLevel` range.

```js
layersControl.on('zoomfilter', ({ id, filtered }) => {
    console.log(id, filtered ? 'hidden by zoom' : 'back in range');
});
```

**Payload:** `{ id: string, filtered: boolean }`.

---

### `memorycleared`

Emitted after `layersControl.clearPersistedData()` clears the localStorage entry.

```js
layersControl.on('memorycleared', () => {
    console.log('State cleared from localStorage');
});
```

**Payload:** `{}` (empty object).

---

## Subscription Patterns

```js
// Subscribe
layersControl
    .on('basechange',        e => console.log('base →', e.id))
    .on('overlaychange',     e => console.log('overlay →', e.id, e.visible))
    .on('overlaygroupchange',e => console.log('group →', e.id, e.visible))
    .on('loading',           e => console.log('loading →', e.id))
    .on('success',           e => console.log('success →', e.id))
    .on('error',             e => console.error('error →', e.id, e.error))
    .on('styleload',         e => console.log('style →', e.baseId));

// Unsubscribe
const handler = (e) => console.log(e);
layersControl.on('overlaychange', handler);
layersControl.off('overlaychange', handler);
```

All `on()` calls return `this` (the `LayersControl` instance) for chaining.
