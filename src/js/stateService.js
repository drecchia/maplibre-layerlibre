/**
 * StateService - Manages all mutable state with optional localStorage persistence.
 *
 * State schema:
 *   base:       string | null        — active base style ID
 *   overlays:   { [id]: { visible, opacity } }
 *   groups:     { [id]: { visible, opacity } }
 *   layerOrder: string[]
 *   viewport:   { center, zoom, bearing, pitch }
 */
class StateService {
    constructor(eventEmitter, persistenceKey) {
        this.eventEmitter = eventEmitter;
        this.persistenceKey = persistenceKey || null;
        this._debounceTimer = null;

        this._state = {
            base: null,
            overlays: {},
            groups: {},
            layerOrder: [],
            viewport: { center: null, zoom: null, bearing: 0, pitch: 0 }
        };

        this._loadPersisted();
    }

    // ── Compatibility getter (matches old stateManager.get(key) interface) ──
    get(key) {
        return this._state[key];
    }

    // ── Named getters ──────────────────────────────────────────────────────
    getCurrentBase() { return this._state.base; }
    getOverlayStates() { return this._state.overlays; }
    getGroupStates()   { return this._state.groups; }
    getViewport()      { return this._state.viewport || {}; }
    getAll()           { return JSON.parse(JSON.stringify(this._state)); }

    // ── Overlay state initialisation (called once per overlay on startup) ──
    initOverlay(id, config) {
        if (!this._state.overlays[id]) {
            const visible = config.defaultVisible === true;
            this._state.overlays[id] = {
                visible,
                opacity: (config.defaultOpacity !== undefined) ? config.defaultOpacity : 1.0
            };
            // If the overlay belongs to a group and is visible, ensure the group
            // state is initialized so the group checkbox renders correctly.
            if (visible && config.group && !this._state.groups[config.group]) {
                this._state.groups[config.group] = { visible: true, opacity: 1.0 };
            }
        }
    }

    // ── Setters ────────────────────────────────────────────────────────────
    setBase(baseId) {
        const prev = this._state.base;
        this._state.base = baseId;
        this._schedulePersist();
        if (prev !== baseId) {
            this.eventEmitter.emit('basechange', { id: baseId });
            this.eventEmitter.emit('change', { type: 'basechange', id: baseId });
        }
    }

    setOverlayVisibility(id, visible) {
        if (!this._state.overlays[id]) {
            this._state.overlays[id] = { visible: false, opacity: 1.0 };
        }
        this._state.overlays[id].visible = visible;
        this._schedulePersist();
    }

    setOverlayOpacity(id, opacity) {
        if (!this._state.overlays[id]) {
            this._state.overlays[id] = { visible: false, opacity: 1.0 };
        }
        this._state.overlays[id].opacity = Math.max(0, Math.min(1, parseFloat(opacity) || 0));
        this._schedulePersist();
    }

    setGroupVisibility(id, visible) {
        if (!this._state.groups[id]) {
            this._state.groups[id] = { visible: false, opacity: 1.0 };
        }
        this._state.groups[id].visible = visible;
        this._schedulePersist();
    }

    setGroupOpacity(id, opacity) {
        if (!this._state.groups[id]) {
            this._state.groups[id] = { visible: false, opacity: 1.0 };
        }
        this._state.groups[id].opacity = Math.max(0, Math.min(1, parseFloat(opacity) || 0));
        this._schedulePersist();
    }

    setViewport(viewport) {
        this._state.viewport = { ...(this._state.viewport || {}), ...viewport };
        this._schedulePersist();
        this.eventEmitter.emit('viewportchange', { ...this._state.viewport });
        this.eventEmitter.emit('change', { type: 'viewportchange', ...this._state.viewport });
    }

    reorderLayers(order) {
        this._state.layerOrder = [...order];
        this._schedulePersist();
    }

    removeOverlay(id) {
        delete this._state.overlays[id];
        const idx = this._state.layerOrder.indexOf(id);
        if (idx > -1) this._state.layerOrder.splice(idx, 1);
        this._schedulePersist();
    }

    // ── Persistence ────────────────────────────────────────────────────────
    clearPersisted() {
        if (!this.persistenceKey) return false;
        try {
            localStorage.removeItem(this.persistenceKey);
            this.eventEmitter.emit('memorycleared', {});
            this.eventEmitter.emit('change', { type: 'memorycleared' });
            return true;
        } catch (e) {
            console.error('StateService: failed to clear persisted state:', e);
            return false;
        }
    }

    destroy() {
        if (this._debounceTimer) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
    }

    // ── Private ────────────────────────────────────────────────────────────
    _schedulePersist() {
        if (!this.persistenceKey) return;
        clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => this._persist(), 300);
    }

    _persist() {
        if (!this.persistenceKey) return;
        try {
            localStorage.setItem(this.persistenceKey, JSON.stringify(this._state));
        } catch (e) {
            console.warn('StateService: failed to persist state:', e);
        }
    }

    _loadPersisted() {
        if (!this.persistenceKey) return;
        try {
            const raw = localStorage.getItem(this.persistenceKey);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (saved.base !== undefined)       this._state.base = saved.base;
            if (saved.overlays)                 this._state.overlays = { ...saved.overlays };
            if (saved.groups)                   this._state.groups   = { ...saved.groups };
            if (Array.isArray(saved.layerOrder)) this._state.layerOrder = saved.layerOrder;
            if (saved.viewport)                 this._state.viewport = { ...this._state.viewport, ...saved.viewport };
        } catch (e) {
            console.warn('StateService: failed to load persisted state:', e);
        }
    }
}
