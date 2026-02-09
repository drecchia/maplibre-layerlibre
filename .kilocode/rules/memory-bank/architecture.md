# LayersControl - Architecture

## System Architecture

LayersControl is built with a service-based architecture featuring dependency injection (DI) for testability and maintainability. The core design follows separation of concerns with clear boundaries between different functional areas.

## Source Code Structure

- `/src/js/`: Main application code
  - `layersControl.js`: Main facade class implementing MapLibre control interface
  - `helper.js`: Utility functions
  - `uiManager.js`: DOM manipulation and UI updates
  - `/di/`: Dependency injection container
    - `DIContainer.ts`: Simple DI container for service registration/resolution
    - `ServiceRegistry.ts`: Service registration and initialization
  - `/events/`: Event system
    - `EventBus.ts`: Central event hub
    - `EventEmitter.ts`: Lightweight event emitter
    - `EventTypes.ts`: Event type definitions
  - `/interfaces/`: TypeScript interfaces for services
    - `IBusinessLogicService.ts`
    - `IEventEmitter.ts`
    - `IMapService.ts`
    - `IStateService.ts`
    - `IUIService.ts`
  - `/services/`: Core business logic services
    - `BusinessLogicService.ts`: Orchestrates business operations
    - `MapService.ts`: MapLibre and deck.gl integration
    - `StateService.ts`: State management and persistence
    - `UIService.ts`: UI rendering and updates
  - `/utils/`: Utility functions
    - `domUtils.ts`: DOM manipulation helpers
    - `eventUtils.ts`: Event handling helpers
    - `objectUtils.ts`: Object/array utilities
    - `validationUtils.ts`: Input validation

## Key Technical Decisions

### 1. Service-Based Architecture
- Each feature is encapsulated in a dedicated service with a clear interface
- Services communicate via events for loose coupling
- DI container manages service lifecycles and dependencies

### 2. Dependency Injection
- Simple DIContainer implementation for service registration and resolution
- Singleton and factory registration options
- Services are resolved with automatic instantiation

### 3. Event System
- Two-layer event system: EventEmitter (lightweight) and EventBus (centralized)
- Events enable decoupled communication between services
- All state changes and user interactions are event-driven

### 4. State Management
- StateService manages all application state with localStorage persistence
- State changes trigger events that propagate to other services
- Supports base layer, overlays, groups, layer order, and viewport state

### 5. UI Architecture
- UIService handles all DOM manipulation and rendering
- Uses container element provided by MapLibre control interface
- Updates UI in response to state changes and user interactions

### 6. Map Integration
- MapService manages MapLibre and deck.gl interactions
- Handles layer creation, removal, and updates
- Manages deck.gl overlay instance and layer ordering

## Component Relationships

```
┌─────────────────┐
│ LayersControl   │ (Facade)
└────────┬────────┘
         │
         ├──────────────────┐
         │ EventEmitter     │ (Event system)
         ├──────────────────┤
         │ StateService     │ (State management)
         ├──────────────────┤
         │ BusinessLogic    │ (Orchestration)
         ├──────────────────┤
         │ UIService        │ (UI rendering)
         ├──────────────────┤
         │ MapService       │ (Map integration)
         └──────────────────┘
              │
              ▼
    ┌─────────────────┐
    │ MapLibre GL JS  │
    └────────┬────────┘
             │
    ┌─────────┴──────────┐
    │ deck.gl Overlay    │
    └────────────────────┘
```

## Critical Implementation Paths

### 1. Initialization Flow
1. LayersControl is instantiated with options and services
2. Services are validated and stored
3. onAdd(map) method initializes services with map reference
4. UI is rendered and initial state is applied

### 2. Event Flow
1. User interaction triggers UI event
2. UIService emits event via EventEmitter
3. BusinessLogicService handles event and updates StateService
4. State change triggers events to all listeners
5. UIService and MapService update their respective areas

### 3. Overlay Rendering
1. Overlay configuration is passed to BusinessLogicService
2. BusinessLogicService validates and activates overlay
3. MapService creates deck.gl layer instances
4. deck.gl renders layers on the map
5. UI updates with overlay status

### 4. State Persistence
1. StateService monitors state changes
2. Changes are debounced and saved to localStorage
3. On initialization, state is restored from localStorage
4. Validates state against current configuration before applying

## Design Patterns

1. **Facade Pattern**: LayersControl acts as a facade to simplify API
2. **Observer Pattern**: Event system enables loose coupling
3. **Dependency Injection**: DI container manages service dependencies
4. **Service Locator**: Services are registered and resolved from container
5. **State Management**: Centralized state with change propagation

## Testability

- Each service has a single responsibility with clear interfaces
- Dependencies are injected, enabling easy mocking
- Services can be tested in isolation
- Event-driven architecture reduces side effects
