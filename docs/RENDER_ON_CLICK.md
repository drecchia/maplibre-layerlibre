# renderOnClick — Deprecated

> **This API has been renamed.** Use `onChecked` instead of `renderOnClick`.
>
> See [ONECHECKED.md](./ONECHECKED.md) for the current documentation.

---

## Migration

### Old API (`renderOnClick`)

```js
// ❌ Old — not supported
{
    id: 'my-overlay',
    renderOnClick: async (context) => {
        const data = await fetch('/api/data').then(r => r.json());
        return {
            deckLayers: [{ id: 'layer', type: 'ScatterplotLayer', props: { data, ... } }]
        };
    }
}
```

The old API used a **return value** to pass deck layers back to the system.
The old `context` object had `overlayManager`, `stateStore`, `overlayId`, etc.

### New API (`onChecked`)

```js
// ✅ Current
{
    id: 'my-overlay',
    onChecked: async (context) => {
        if (context.getCache()) return;  // skip if already loaded
        const data = await fetch('/api/data').then(r => r.json());
        context.setOverlayConfig({       // inject layers via context method
            deckLayers: [{ id: 'layer', type: 'ScatterplotLayer', props: { data, ... } }]
        });
        context.setCache({ loaded: true });
    }
}
```

Key differences:

| | `renderOnClick` (old) | `onChecked` (current) |
|-|-----------------------|-----------------------|
| Layers returned via | `return { deckLayers }` | `context.setOverlayConfig({ deckLayers })` |
| Cache control | Automatic (internal) | Manual via `context.getCache()` / `context.setCache()` / `context.clearCache()` |
| Context properties | `overlayManager`, `stateStore` | `stateService`, `getOverlayState()`, `getAllOverlayStates()`, `getOverlayConfig()` |
| Multiple calls | Cached automatically | Caller guards with `if (context.getCache()) return` |

---

See [ONECHECKED.md](./ONECHECKED.md) for the full current API reference.
