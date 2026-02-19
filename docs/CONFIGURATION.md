# Configuration — LayersControl

Full options reference for `new LayersControl(options, services)`.

---

## Constructor Signature

```js
const layersControl = new LayersControl(options, services);
```

Both arguments are required. See [QUICKSTART.md](./QUICKSTART.md) for the full instantiation pattern.

---

## `options` — Top-level Fields

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseStyles` | `Array<BaseStyle>` | — (required) | Available base map styles |
| `overlays` | `Array<Overlay>` | — (required) | Overlay definitions |
| `groups` | `Array<Group>` | `[]` | Group metadata for UI section headers |
| `defaultBaseId` | string | `null` | ID of the base style active on first load |
| `showOpacity` | boolean | `true` | Show per-overlay opacity sliders |
| `autoClose` | boolean | `false` | Close the panel after selecting a base layer |
| `icon` | string | `'☰'` | Icon shown on the toggle button |
| `i18n` | object | see below | UI string overrides |

### `i18n` object

```js
i18n: {
    baseHeader:     'Base Layers',  // Section title for base styles
    overlaysHeader: 'Overlays'      // Section title for overlays
}
```

Provide only the keys you want to override; defaults are merged in.

---

## Persistence

Persistence is configured via the `StateService` constructor, **not** via a `LayersControl` option:

```js
const stateService = new StateService(eventEmitter, 'my-app-layers');
//                                                   ^^^^^^^^^^^^^^^^
//                                                   localStorage key
```

State is automatically saved to `localStorage` under this key (debounced 300 ms). Omit the second argument to disable persistence:

```js
const stateService = new StateService(eventEmitter); // no persistence
```

---

## Control Position

Pass the position as the second argument to `map.addControl()`:

```js
map.addControl(layersControl, 'top-left');   // top-left, top-right, bottom-left, bottom-right
```

This is standard MapLibre IControl API — position is not an option on `LayersControl` itself.

---

## `services` Object

All five services are required:

```js
{
    stateService,
    uiService,
    mapService,
    businessLogicService,
    eventEmitter
}
```

See [QUICKSTART.md](./QUICKSTART.md) for construction order.

---

## `BaseStyle` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier |
| `label` | string | yes | Display name in UI |
| `style` | string \| object | yes | MapLibre style URL or style object |
| `strategy` | string | yes | Must be `'setStyle'` |

```js
{
    id: 'osm',
    label: 'OpenStreetMap',
    style: 'https://demotiles.maplibre.org/style.json',
    strategy: 'setStyle'
}
```

Inline style objects are also supported:

```js
{
    id: 'satellite',
    label: 'Satellite',
    style: {
        version: 8,
        sources: { satellite: { type: 'raster', tiles: ['https://.../{z}/{y}/{x}'], tileSize: 256 } },
        layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite' }]
    },
    strategy: 'setStyle'
}
```

---

## `Overlay` Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique identifier |
| `label` | string | yes | Display name in UI |
| `deckLayers` | Array | no* | Static deck.gl layer definitions |
| `onChecked` | async function | no* | Dynamic overlay callback |
| `group` | string | no | Group ID — assigns overlay to a group |
| `defaultVisible` | boolean | no | Initial visibility (default `false`) |
| `defaultOpacity` | number | no | Initial opacity 0–1 (default `1.0`) |
| `opacityControls` | boolean | no | Show opacity slider in UI |
| `viewport` | object | no | Viewport applied when overlay is activated |
| `forcedBaseLayerId` | string | no | Switch to this base style on activation |
| `forcedBearing` | number | no | Apply bearing (degrees) on activation |
| `forcedPitch` | number | no | Apply pitch (degrees) on activation |
| `minZoomLevel` | number | no | Hide when map zoom is below this value |
| `maxZoomLevel` | number | no | Hide when map zoom is above this value |
| `tooltip` | string \| object | no | Tooltip field name or `{ title, fields }` map |
| `getTooltip` | function | no | Custom tooltip renderer `(pickedObject) => string` |

*At least one of `deckLayers` or `onChecked` is needed to render anything.

### `viewport` sub-object

```js
viewport: {
    fitBounds: [[minLng, minLat], [maxLng, maxLat]],  // fit map to bounds (takes priority)
    center: [lng, lat],   // pan center (used when fitBounds is absent)
    zoom: 10,             // zoom level (used with center)
    bearing: 45,          // degrees
    pitch: 30             // degrees
}
```

`fitBounds` takes precedence: when it is present, `center` and `zoom` are ignored.
Use `BoundsHelper.calculateBounds(points)` to compute bounds from data.

### `deckLayers` item structure

Each item in `deckLayers` describes a deck.gl layer:

```js
{
    id: 'my-layer',          // stable string id (required)
    type: 'ScatterplotLayer', // deck.gl layer class name
    props: {
        data: [...],
        getPosition: d => d.position,
        getRadius: 5000,
        getFillColor: [255, 100, 0],
        pickable: true
    }
}
```

Supported layer types include any deck.gl layer available in the loaded bundle (e.g. `ScatterplotLayer`, `IconLayer`, `PathLayer`, `GeoJsonLayer`, `HeatmapLayer`).

### `onChecked` callback

For dynamic (lazily-loaded) overlays. Called the first time the overlay is activated, unless a cache entry exists.
See [ONECHECKED.md](./ONECHECKED.md) for the full contract.

```js
{
    id: 'live-data',
    label: 'Live Data',
    onChecked: async (context) => {
        if (context.getCache()) return; // already loaded
        const data = await fetch('/api/data').then(r => r.json());
        context.setOverlayConfig({
            deckLayers: [{ id: 'live-layer', type: 'ScatterplotLayer', props: { data, ... } }]
        });
        context.setCache({ loaded: true });
    }
}
```

---

## `Group` Fields

Groups provide UI section headers and all-at-once visibility/opacity controls.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | yes | Unique group identifier |
| `label` | string | yes | Display name for the group header |

Assign overlays to a group via `overlay.group`:

```js
const options = {
    groups: [{ id: 'transport', label: 'Transport' }],
    overlays: [
        { id: 'roads', label: 'Roads', group: 'transport', deckLayers: [...] },
        { id: 'transit', label: 'Transit', group: 'transport', deckLayers: [...] }
    ]
};
```

**Group toggle behaviour:**
- Checking the group checkbox with all children unchecked → activates all children
- Checking with some children previously visible → restores only those individually-visible children
- Unchecking → hides all children and updates their individual state

---

## Tooltip Configuration

### String tooltip

Field name to read from the picked deck.gl object:

```js
tooltip: 'name'  // renders d.name on hover
```

### Object tooltip

```js
tooltip: {
    title: 'name',       // field for the popup title
    fields: {
        'Population': 'pop',
        'Area (km²)': 'area'
    }
}
```

### Custom function

```js
getTooltip: (object) => `<b>${object.name}</b><br>Value: ${object.value}`
```

---

## Persisted State Schema

```json
{
  "base": "osm",
  "overlays": {
    "my-overlay": { "visible": true, "opacity": 0.8 }
  },
  "groups": {
    "transport": { "visible": true, "opacity": 1.0 }
  },
  "viewport": {
    "center": { "lng": -95.0, "lat": 40.0 },
    "zoom": 5,
    "bearing": 0,
    "pitch": 0
  }
}
```

On reload, each overlay/group ID is validated against the current config.
Unknown IDs are silently skipped. If the persisted `base` ID no longer exists in `baseStyles`, the control falls back to `defaultBaseId` (or the first style).

---

## Full Example

```js
const baseStyles = [
    {
        id: 'osm',
        label: 'OpenStreetMap',
        style: 'https://demotiles.maplibre.org/style.json',
        strategy: 'setStyle'
    }
];

const overlays = [
    {
        id: 'points',
        label: 'My Points',
        deckLayers: [{
            id: 'points-layer',
            type: 'ScatterplotLayer',
            props: {
                data: [{ position: [-74.0, 40.7], name: 'New York' }],
                getPosition: d => d.position,
                getRadius: 10000,
                getFillColor: [255, 100, 0],
                pickable: true
            }
        }],
        defaultVisible: true,
        opacityControls: true,
        tooltip: 'name',
        viewport: {
            fitBounds: [[-75, 40], [-73, 41]]
        }
    }
];

const eventEmitter        = new EventEmitter();
const stateService        = new StateService(eventEmitter, 'my-app-layers');
const mapService          = new MapService(eventEmitter);
const uiService           = new UIService(stateService, mapService, eventEmitter);
const businessLogicService = new BusinessLogicService(stateService, eventEmitter);

const layersControl = new LayersControl(
    { baseStyles, overlays, defaultBaseId: 'osm', showOpacity: true },
    { stateService, uiService, mapService, businessLogicService, eventEmitter }
);

const map = new maplibregl.Map({ container: 'map', style: baseStyles[0].style, center: [-74, 40.7], zoom: 8 });
map.addControl(layersControl, 'top-left');
```

---

## See Also

- [QUICKSTART.md](./QUICKSTART.md) — Getting started
- [API_REFERENCE.md](./API_REFERENCE.md) — Full method reference
- [EVENTS.md](./EVENTS.md) — Event payloads
- [ONECHECKED.md](./ONECHECKED.md) — Dynamic overlay callbacks
