# LayersControl - Product Overview

## Why This Project Exists

MapLibre GL JS provides a powerful mapping library, but its built-in layer control has limitations for complex production applications. Developers often need to build custom layer controls to handle:

- Complex overlay groupings with nested structures
- Per-overlay opacity controls
- Dynamic data loading
- State persistence across sessions
- Integration with third-party libraries like deck.gl

LayersControl was created to address these limitations and provide a production-ready layer management solution with a modern, extensible architecture.

## Problems It Solves

1. **Limited Built-in Control**: MapLibre's default layer control lacks support for grouping, per-layer opacity, and dynamic loading
2. **Custom Control Complexity**: Building custom layer controls requires significant development effort and maintenance
3. **State Management**: Persisting layer state (visibility, opacity, order) across sessions is not natively supported
4. **Performance**: Handling large numbers of overlays efficiently requires optimized rendering and event handling
5. **Integration**: Working with deck.gl and other visualization libraries requires custom integration code

## How It Should Work

LayersControl should provide:
- A simple, declarative API for configuring base maps and overlays
- Automatic UI generation based on configuration
- Efficient event handling and state management
- Seamless integration with MapLibre and deck.gl
- Extensible architecture for customizations and plugins

## User Experience Goals

1. **Intuitive Interface**: Users should easily understand how to switch base maps and toggle overlays
2. **Visual Feedback**: Provide clear indicators for loading, error, and zoom-filtered states
3. **Responsive Design**: Work seamlessly across different screen sizes and devices
4. **Smooth Interactions**: Layer toggles, opacity sliders, and pan-to-overlay should feel smooth
5. **Accessibility**: Be usable with keyboard navigation and screen readers
