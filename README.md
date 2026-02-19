# maplibre-layerlibre

A compact layer-switcher control for [MapLibre GL JS](https://maplibre.org/) with [deck.gl](https://deck.gl/) overlay support.

![UI interaction](docs/img01.gif)
![Dynamic loader](docs/img02.gif)

---

## Features

- **Base map switching** — radio-button selector, `setStyle` strategy
- **deck.gl overlays** — static `deckLayers` or lazy-loaded via `onChecked` callback
- **Overlay groups** — group-level visibility toggle and opacity control
- **Per-overlay opacity sliders** and status indicators (loading / error / zoom-filtered)
- **Viewport targeting** — `fitBounds`, `center+zoom`, `bearing`, `pitch` applied on activation
- **Forced base layer** — overlay can require a specific base style before activating
- **State persistence** — base, overlays, opacity, viewport saved to `localStorage`
- **Zoom filtering** — overlays hidden automatically outside `minZoomLevel`/`maxZoomLevel`
- **Event-driven API** — all state changes emit typed events
- **Dark theme + responsive** — CSS media queries included

---

## Installation

Load MapLibre GL JS, deck.gl, and the LayersControl bundle from CDN, then build with `npm run build` to produce `dist/js/all.min.js` and `dist/css/all.css`.

```html
<link href="https://unpkg.com/maplibre-gl@4.1.1/dist/maplibre-gl.css" rel="stylesheet">
<link href="dist/css/all.css" rel="stylesheet">

<script src="https://unpkg.com/maplibre-gl@4.1.1/dist/maplibre-gl.js"></script>
<script src="https://cdn.jsdelivr.net/npm/deck.gl@9.1.14/dist.min.js"></script>
<script src="dist/js/all.min.js"></script>
```

Build the bundle:

```bash
npm install
npm run build   # → dist/js/all.min.js + dist/css/all.css
```

---

## Quick Start

All classes (`EventEmitter`, `StateService`, `MapService`, `UIService`, `BusinessLogicService`, `LayersControl`, `BoundsHelper`) are globals exposed by the bundle.

```html
<div id="map"></div>
<script>
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
    id: 'cities',
    label: 'Major Cities',
    deckLayers: [
      {
        id: 'cities-layer',
        type: 'ScatterplotLayer',
        props: {
          data: [
            { position: [-74.0, 40.7], name: 'New York' },
            { position: [-87.6, 41.9], name: 'Chicago' },
            { position: [-118.2, 34.0], name: 'Los Angeles' }
          ],
          getPosition: d => d.position,
          getRadius: 20000,
          getFillColor: [255, 100, 0],
          pickable: true
        }
      }
    ],
    tooltip: 'name',
    defaultVisible: true,
    opacityControls: true
  }
];

// ── Instantiate services ───────────────────────────────────────────────────
const eventEmitter         = new EventEmitter();
const stateService         = new StateService(eventEmitter, 'my-app-layers'); // localStorage key
const mapService           = new MapService(eventEmitter);
const uiService            = new UIService(stateService, mapService, eventEmitter);
const businessLogicService = new BusinessLogicService(stateService, eventEmitter);

const layersControl = new LayersControl(
  { baseStyles, overlays, defaultBaseId: 'osm' },
  { stateService, uiService, mapService, businessLogicService, eventEmitter }
);

// ── Create map and add control ─────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: baseStyles[0].style,
  center: [-95, 40],
  zoom: 3
});

map.addControl(layersControl, 'top-left');

// ── Subscribe to events ────────────────────────────────────────────────────
layersControl
  .on('basechange',    e => console.log('base →', e.id))
  .on('overlaychange', e => console.log('overlay →', e.id, e.visible))
  .on('error',         e => console.error('error →', e.id, e.error));
</script>
```

---

## Dynamic Overlays (`onChecked`)

Use `onChecked` to load data lazily — only when the user first activates the overlay:

```js
{
  id: 'live-data',
  label: 'Live Data',
  onChecked: async (context) => {
    if (context.getCache()) return;           // skip if already loaded

    const data = await fetch('/api/data').then(r => r.json());

    context.setOverlayConfig({
      deckLayers: [{
        id: 'live-layer',
        type: 'ScatterplotLayer',
        props: { data, getPosition: d => d.position, getRadius: 5000, getFillColor: [0, 180, 255], pickable: true }
      }]
    });

    context.setCache({ loaded: true });       // prevent re-fetch
  },
  tooltip: 'name',
  defaultVisible: false
}
```

The `loading`, `success`, and `error` events fire automatically. An in-UI retry button appears on failure.

---

## Viewport Targeting

Fit the map to specific bounds when an overlay is activated:

```js
{
  id: 'usa-cities',
  label: 'USA Cities',
  viewport: {
    fitBounds: BoundsHelper.calculateBounds(usaData.map(d => d.position))
  },
  deckLayers: [...]
}
```

Or pan to a specific location:

```js
viewport: { center: [-74.0, 40.7], zoom: 10, bearing: 45, pitch: 30 }
```

---

## Overlay Groups

```js
const groups  = [{ id: 'transport', label: 'Transport' }];
const overlays = [
  { id: 'roads',   label: 'Roads',   group: 'transport', deckLayers: [...] },
  { id: 'transit', label: 'Transit', group: 'transport', deckLayers: [...] }
];
```

The group header shows an all-at-once visibility toggle and (optionally) a shared opacity slider.

---

## Runtime API

```js
// Base layers
layersControl.setBaseLayer('satellite');
layersControl.addBaseStyle({ id: 'terrain', label: 'Terrain', style: '...', strategy: 'setStyle' });

// Overlays
layersControl.addOverlay({ id: 'new', label: 'New Layer', deckLayers: [...] });
layersControl.showOverlay('my-overlay');
layersControl.hideOverlay('my-overlay');
layersControl.setOverlayOpacity('my-overlay', 0.5);
layersControl.removeOverlay('my-overlay');

// Groups
layersControl.showGroup('transport');
layersControl.setGroupOpacity('transport', 0.7);

// Persistence
layersControl.clearPersistedData();

// State
const state = layersControl.getCurrentState();
```

---

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseStyles` | `Array` | required | Base map styles |
| `overlays` | `Array` | required | Overlay definitions |
| `groups` | `Array` | `[]` | Group metadata |
| `defaultBaseId` | `string` | `null` | Initial active base style |
| `showOpacity` | `boolean` | `true` | Show opacity sliders |
| `autoClose` | `boolean` | `false` | Close panel after base selection |
| `icon` | `string` | `'☰'` | Toggle button icon |
| `i18n` | `object` | see docs | UI string overrides `{ baseHeader, overlaysHeader }` |

**Persistence** is configured via `new StateService(eventEmitter, 'your-key')` — the second argument is the `localStorage` key.

**Control position** is set via `map.addControl(layersControl, 'top-left')` (standard MapLibre API).

---

## Events

| Event | Payload | When |
|-------|---------|------|
| `basechange` | `{ id }` | Active base style changed |
| `overlaychange` | `{ id, visible, opacity }` | Overlay visibility or opacity changed |
| `overlaygroupchange` | `{ id, visible }` | Group visibility changed |
| `loading` | `{ id }` | `onChecked` callback started |
| `success` | `{ id }` | `onChecked` completed |
| `error` | `{ id, error }` | Activation failed |
| `styleload` | `{ baseId }` | Base style finished loading |
| `zoomfilter` | `{ id, filtered }` | Overlay shown/hidden by zoom |
| `viewportchange` | `{ center, zoom, ... }` | Viewport saved |
| `memorycleared` | `{}` | localStorage cleared |

---

## Documentation

| Doc | Contents |
|-----|----------|
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | Setup guide and minimal examples |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Full options reference |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | All public methods and return values |
| [docs/ONECHECKED.md](docs/ONECHECKED.md) | `onChecked` dynamic overlay contract |
| [docs/EVENTS.md](docs/EVENTS.md) | Event payloads and subscription patterns |
| [docs/CSS.md](docs/CSS.md) | BEM class reference and customization |
| [docs/WORKFLOWS.md](docs/WORKFLOWS.md) | Runtime flows and lifecycle |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Internal service design |

---

## Browser Support

Any modern browser supporting ES2020+. No bundler required — the library is a concatenated, minified global script.

---

## License

[CC-BY-NC-4.0](https://creativecommons.org/licenses/by-nc/4.0/) — non-commercial use only.
