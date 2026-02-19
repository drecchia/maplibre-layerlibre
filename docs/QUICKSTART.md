# Quickstart — `@drecchia/maplibre-layerlibre`

Minimal, copy-paste example to get `LayersControl` running with MapLibre GL JS and deck.gl.

---

## 1. Include scripts

```html
<!-- MapLibre GL JS -->
<link href="https://unpkg.com/maplibre-gl@4.1.1/dist/maplibre-gl.css" rel="stylesheet">
<script src="https://unpkg.com/maplibre-gl@4.1.1/dist/maplibre-gl.js"></script>

<!-- deck.gl (must be present as window.deck) -->
<script src="https://cdn.jsdelivr.net/npm/deck.gl@9.1.14/dist.min.js"></script>

<!-- LayersControl bundle (exposes globals: EventEmitter, StateService, MapService,
     UIService, BusinessLogicService, LayersControl, BoundsHelper) -->
<script src="dist/js/all.min.js"></script>
<link rel="stylesheet" href="dist/css/all.css">
```

---

## 2. Minimal initialisation

All five services must be instantiated and passed to `LayersControl`. There is no shorthand constructor.

```js
// ── 1. Services ───────────────────────────────────────────────────────────
const eventEmitter         = new EventEmitter();
const stateService         = new StateService(eventEmitter, 'my-app-layers'); // second arg = localStorage key
const mapService           = new MapService(eventEmitter);
const uiService            = new UIService(stateService, mapService, eventEmitter);
const businessLogicService = new BusinessLogicService(stateService, eventEmitter);

// ── 2. Options ────────────────────────────────────────────────────────────
const options = {
  baseStyles: [
    {
      id: 'osm',
      label: 'OpenStreetMap',
      style: 'https://demotiles.maplibre.org/style.json',
      strategy: 'setStyle'
    }
  ],
  overlays: [
    {
      id: 'my-points',
      label: 'My Points',
      deckLayers: [
        {
          id: 'my-points-layer',
          type: 'ScatterplotLayer',
          props: {
            data: [{ position: [0, 0], name: 'Origin' }],
            getPosition: d => d.position,
            getRadius: 10000,
            getFillColor: [255, 0, 0],
            pickable: true
          }
        }
      ],
      tooltip: 'name',
      defaultVisible: false,
      opacityControls: true
    }
  ],
  defaultBaseId: 'osm'
};

// ── 3. Control ────────────────────────────────────────────────────────────
const layersControl = new LayersControl(options, {
  stateService,
  uiService,
  mapService,
  businessLogicService,
  eventEmitter
});

// ── 4. Map ────────────────────────────────────────────────────────────────
const map = new maplibregl.Map({
  container: 'map',
  style: options.baseStyles[0].style,
  center: [0, 0],
  zoom: 2
});

map.addControl(layersControl, 'top-left');
```

---

## 3. State persistence

Pass a unique string as the second argument to `StateService`. State (base layer, overlay visibility/opacity, viewport) is automatically saved to `localStorage` under that key and restored on the next page load.

```js
const stateService = new StateService(eventEmitter, 'my-app-layers');
```

Use different keys for different pages or control instances to avoid collisions between examples.

To clear persisted state programmatically:
```js
layersControl.clearPersistedData();
```

---

## 4. Events

```js
layersControl
  .on('basechange',    ({ id }) => console.log('Base changed to', id))
  .on('overlaychange', ({ id, visible, opacity }) => console.log(id, visible))
  .on('error',         ({ id, error }) => console.error(id, error));
```

See [EVENTS.md](./EVENTS.md) for the full catalogue.

---

## 5. Notes

- `deck.gl` must be loaded as `window.deck` before the control is initialised.
- All overlays are deck.gl overlays (`deckLayers` or `onChecked`). Native MapLibre source/layer overlays are not supported.
- For dynamic async overlays, see [RENDER_ON_CLICK.md](./RENDER_ON_CLICK.md) (`onChecked`).
- For all configuration options, see [CONFIGURATION.md](./CONFIGURATION.md).
- For API details, see [API_REFERENCE.md](./API_REFERENCE.md).
