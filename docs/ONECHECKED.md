# onChecked — Dynamic Overlay Contract

`onChecked` is the mechanism for loading overlay data lazily — only when the user first activates the overlay. This replaces the old `renderOnClick` API.

---

## Purpose

- Defer heavy data fetching until the overlay is requested
- Avoid loading data for overlays the user never views
- Supports async operations (HTTP requests, data transforms, etc.)
- Results are cached; the callback is not called again on subsequent activations unless the cache is cleared

---

## Signature

```js
{
    id: 'my-overlay',
    label: 'My Overlay',
    onChecked: async (context) => {
        // Fetch data, then inject deckLayers into the overlay config
    }
}
```

`onChecked` must be an **async function** (or return a Promise). It receives a `context` object and its return value is ignored — use `context.setOverlayConfig()` to inject layers.

---

## Context Object

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `map` | `maplibregl.Map` | The active MapLibre map instance |
| `overlay` | object | The overlay configuration object |
| `overlayId` | string | The overlay's `id` |
| `isUserInteraction` | boolean | `true` if triggered by a user checkbox click |
| `deckOverlay` | `deck.MapboxOverlay` | The shared deck.gl overlay instance |
| `stateService` | StateService | The state service (read-only recommended) |
| `getCurrentViewport()` | `() => { center, zoom, bearing, pitch }` | Current map viewport |
| `getOverlayState(id)` | `(id) => { visible, opacity }` | State for any overlay |
| `getAllOverlayStates()` | `() => Object` | All overlay states |
| `getOverlayConfig()` | `() => object` | Current config for this overlay |
| `setOverlayConfig(newConfig, opts?)` | method | Merge new fields into overlay config |
| `getCache()` | `() => any` | Retrieve cached value for this overlay |
| `setCache(value)` | `(value) => void` | Store a value in the overlay cache |
| `clearCache()` | `() => void` | Clear the overlay cache entry |

---

## Injecting Layers — `context.setOverlayConfig()`

The primary use of `onChecked` is to fetch data and inject `deckLayers` into the overlay:

```js
onChecked: async (context) => {
    context.setOverlayConfig({
        deckLayers: [
            {
                id: 'my-layer',         // stable string id (required)
                type: 'ScatterplotLayer',
                props: {
                    data: fetchedData,
                    getPosition: d => d.position,
                    getRadius: 5000,
                    getFillColor: [255, 100, 0],
                    pickable: true
                }
            }
        ]
    });
}
```

`setOverlayConfig` merges the provided object into the overlay's config entry in `options.overlays`. Any field can be updated this way (e.g. `label`, `tooltip`, `viewport`).

**Optional `opts` argument:**

```js
context.setOverlayConfig({ deckLayers: [...] }, { applyViewport: true });
```

`applyViewport: true` triggers an immediate viewport change based on the updated overlay's `viewport` config.

---

## Caching

Use the cache to skip re-fetching on repeated activations:

```js
onChecked: async (context) => {
    // Return early if already loaded
    if (context.getCache()) return;

    const data = await fetch('/api/data').then(r => r.json());

    context.setOverlayConfig({
        deckLayers: [{
            id: 'data-layer',
            type: 'ScatterplotLayer',
            props: { data, getPosition: d => d.position, getRadius: 5000, getFillColor: [0, 180, 255], pickable: true }
        }]
    });

    context.setCache({ loaded: true });
}
```

The cache persists for the lifetime of the page. To clear it programmatically:

```js
// Via context inside a future onChecked call:
context.clearCache();

// There is no direct public API to clear the cache from outside onChecked.
// Work around by removing and re-adding the overlay:
layersControl.removeOverlay('my-overlay');
layersControl.addOverlay({ id: 'my-overlay', ... });
```

---

## Events

| Event | When |
|-------|------|
| `loading` | `onChecked` starts executing |
| `success` | `onChecked` resolves without error |
| `error` | `onChecked` throws or rejects |

```js
layersControl
    .on('loading', ({ id }) => showSpinner(id))
    .on('success', ({ id }) => hideSpinner(id))
    .on('error',   ({ id, error }) => showError(id, error));
```

---

## Error Handling

If `onChecked` throws or rejects:
- The overlay is not shown
- The `error` event is emitted with `{ id, error: errorMessage }`
- The UI shows an error state with a **Retry** button
- Clicking Retry clears the error state and calls `onChecked` again (cache is not automatically cleared on retry)

Throw descriptive errors for useful UI feedback:

```js
onChecked: async (context) => {
    const res = await fetch('/api/data');
    if (!res.ok) throw new Error(`Failed to load data: ${res.status} ${res.statusText}`);
    const data = await res.json();
    context.setOverlayConfig({ deckLayers: [{ id: 'layer', type: 'ScatterplotLayer', props: { data, ... } }] });
    context.setCache(true);
}
```

---

## Full Example

```js
const overlays = [
    {
        id: 'earthquake-data',
        label: 'Earthquakes (M5+)',
        onChecked: async (context) => {
            if (context.getCache()) return;

            const vp = context.getCurrentViewport();
            const res = await fetch(
                `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson`
            );
            if (!res.ok) throw new Error('Failed to fetch earthquake data');

            const geojson = await res.json();
            const features = geojson.features;

            context.setOverlayConfig({
                deckLayers: [
                    {
                        id: 'quake-points',
                        type: 'ScatterplotLayer',
                        props: {
                            data: features,
                            getPosition: f => f.geometry.coordinates,
                            getRadius: f => Math.pow(10, f.properties.mag) * 100,
                            getFillColor: [255, 60, 0, 180],
                            getLineColor: [255, 255, 255],
                            lineWidthMinPixels: 1,
                            pickable: true
                        }
                    }
                ],
                tooltip: 'title'  // f.properties.title
            });

            context.setCache({ count: features.length });
        },
        defaultVisible: false,
        opacityControls: true
    }
];
```

---

## Comparison with `deckLayers` (static overlays)

| | `deckLayers` | `onChecked` |
|-|--------------|-------------|
| Data source | Inline, defined at config time | Loaded at activation time |
| Loading state | None | `loading` → `success` / `error` |
| Cache | N/A | Built-in per-overlay cache |
| Re-fetch control | N/A | Manual via `setCache` / `clearCache` |
| Use case | Known, static data | Remote APIs, large datasets, user-triggered loads |

Both can be combined: define `deckLayers` as the initial/fallback and use `onChecked` to replace it with fresh data.

---

## See Also

- [CONFIGURATION.md](./CONFIGURATION.md) — full overlay options
- [WORKFLOWS.md](./WORKFLOWS.md) — activation flow details
- [EVENTS.md](./EVENTS.md) — loading/success/error events
