# LayersControl - MapLibre Layer Manager

A compact, modern, and extensible layer control for MapLibre GL JS, designed for production apps with:
- Fast, testable code with clear separation of concerns
- Flexible UX: grouping, per-overlay and group opacity, pan-on-add
- Dynamic data loading via `renderOnClick` (async overlays)
- Deck.gl integration for high-performance overlays
- State persistence (base, overlays, opacity, order, viewport)
- Event-driven API for analytics, telemetry, or custom UI

## Core Requirements
- Support for base map switching with `setStyle` or `toggleBackground` strategies
- Overlay grouping and group-level opacity controls
- Per-overlay opacity sliders and status indicators
- `panOnAdd`: fly to overlay location on enable
- `renderOnClick`: async remote overlay loader with caching and retry
- State persistence to localStorage
- Event system for all state changes and overlay lifecycle
- Compatibility with MapLibre GL JS and deck.gl
