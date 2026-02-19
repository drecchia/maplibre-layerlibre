/**
 * LayersControl — MapLibre IControl facade.
 *
 * Implements the MapLibre IControl interface and delegates all work to the
 * injected services.  All five services are required.
 *
 * Usage:
 *   const eventEmitter        = new EventEmitter();
 *   const stateService        = new StateService(eventEmitter, 'myApp-layers');
 *   const mapService          = new MapService(eventEmitter);
 *   const uiService           = new UIService(stateService, mapService, eventEmitter);
 *   const businessLogicService = new BusinessLogicService(stateService, eventEmitter);
 *
 *   const layersControl = new LayersControl(options, {
 *     stateService, uiService, mapService, businessLogicService, eventEmitter
 *   });
 *   map.addControl(layersControl, 'top-left');
 */
class LayersControl {
    constructor(options = {}, services = {}) {
        // ── Validate services ──────────────────────────────────────────────
        if (!services.stateService)         throw new Error('LayersControl requires stateService');
        if (!services.uiService)            throw new Error('LayersControl requires uiService');
        if (!services.mapService)           throw new Error('LayersControl requires mapService');
        if (!services.businessLogicService) throw new Error('LayersControl requires businessLogicService');
        if (!services.eventEmitter)         throw new Error('LayersControl requires eventEmitter');

        // ── Validate options ───────────────────────────────────────────────
        if (!options.baseStyles || !Array.isArray(options.baseStyles)) {
            throw new Error('LayersControl requires a baseStyles array');
        }
        if (!options.overlays || !Array.isArray(options.overlays)) {
            throw new Error('LayersControl requires an overlays array');
        }

        // ── Merge defaults ─────────────────────────────────────────────────
        this.options = {
            showOpacity: true,
            autoClose:   false,
            icon:        '☰',
            i18n: {
                baseHeader:     'Base Layers',
                overlaysHeader: 'Overlays'
            },
            ...options,
            // Ensure i18n is fully merged
            i18n: {
                baseHeader:     'Base Layers',
                overlaysHeader: 'Overlays',
                ...(options.i18n || {})
            }
        };

        // ── Store services ─────────────────────────────────────────────────
        this.stateService         = services.stateService;
        this.uiService            = services.uiService;
        this.mapService           = services.mapService;
        this.businessLogicService = services.businessLogicService;
        this.eventEmitter         = services.eventEmitter;

        // ── MapLibre state ─────────────────────────────────────────────────
        this.map       = null;
        this.container = null;

        // ── Viewport auto-save debounce ────────────────────────────────────
        this._viewportSaveTimeout = null;
        this._mapEventHandlers    = new Map();

        this._setupPublicEventForwarding();
    }

    // ══ MapLibre IControl interface ════════════════════════════════════════

    onAdd(map) {
        this.map = map;

        // Create the control container
        this.container = document.createElement('div');
        this.container.className =
            'maplibregl-ctrl maplibregl-ctrl-group layers-control-container';

        // ── Wire up services ───────────────────────────────────────────────
        this.mapService.setMap(map);

        // Pass options to UIService before render
        this.uiService.setOptions(this.options);
        this.uiService.setMap(map);
        this.uiService.setContainer(this.container);

        // Initialise overlay state from config (sets defaults for first load)
        this.options.overlays.forEach(overlay => {
            this.stateService.initOverlay(overlay.id, overlay);
        });

        // Set initial base if nothing persisted
        if (!this.stateService.getCurrentBase()) {
            const initialBase =
                this.options.defaultBaseId ||
                (this.options.baseStyles.length > 0 ? this.options.baseStyles[0].id : null);
            if (initialBase) this.stateService.setBase(initialBase);
        }

        // Initialise business logic (give it map + service refs + options)
        this.businessLogicService.initialize({
            map,
            stateService:  this.stateService,
            uiService:     this.uiService,
            mapService:    this.mapService,
            eventEmitter:  this.eventEmitter,
            options:       this.options
        });

        // Give UIService a reference to BLS (for checkbox event handling)
        this.uiService.setBusinessLogicService(this.businessLogicService);

        // Initial render
        this.uiService.render();

        // Viewport auto-save listener
        this._setupMapEventListeners();

        // Restore persisted state
        this._restoreMapState();

        return this.container;
    }

    onRemove() {
        this._cleanupMapEventListeners();
        this.mapService.setMap(null);
        this.uiService.setMap(null);
        this.uiService.setContainer(null);
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
        this.map       = null;
        this.container = null;
    }

    destroy() {
        this.removeAllOverlays();
        this._cleanupMapEventListeners();

        if (this.map && this.container) {
            try { this.map.removeControl(this); } catch (e) { /* ignore */ }
        }

        this.businessLogicService.destroy();
        this.uiService.destroy();
        this.mapService.destroy();
        this.stateService.destroy();

        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }

        this.map                   = null;
        this.container             = null;
        this.stateService          = null;
        this.uiService             = null;
        this.mapService            = null;
        this.businessLogicService  = null;
        this.eventEmitter          = null;
        this.options               = null;
        this._mapEventHandlers.clear();

        if (this._viewportSaveTimeout) {
            clearTimeout(this._viewportSaveTimeout);
            this._viewportSaveTimeout = null;
        }

        return true;
    }

    // ══ Base layer API ═════════════════════════════════════════════════════

    setBaseLayer(id) {
        const exists = this.options.baseStyles.find(b => b.id === id);
        if (!exists) {
            console.warn(`LayersControl.setBaseLayer: base style "${id}" not found`);
            return false;
        }
        this.businessLogicService.setBaseLayer(id);
        return true;
    }

    /** Alias */
    setBase(id) { return this.setBaseLayer(id); }

    addBaseStyle(style) {
        if (!style || !style.id) throw new Error('Base style must have an id');
        const idx = this.options.baseStyles.findIndex(b => b.id === style.id);
        if (idx > -1) {
            this.options.baseStyles[idx] = { ...this.options.baseStyles[idx], ...style };
        } else {
            this.options.baseStyles.push(style);
        }
        this.businessLogicService.updateBaseStyles(this.options.baseStyles);
        return true;
    }

    removeBaseStyle(id) {
        if (!id) return false;
        const idx = this.options.baseStyles.findIndex(b => b.id === id);
        if (idx === -1) {
            console.warn(`LayersControl.removeBaseStyle: "${id}" not found`);
            return false;
        }
        const wasActive = this.stateService.getCurrentBase() === id;
        this.options.baseStyles.splice(idx, 1);

        if (wasActive && this.options.baseStyles.length > 0) {
            const fallback =
                this.options.baseStyles.find(b => b.id === this.options.defaultBaseId) ||
                this.options.baseStyles[0];
            this.businessLogicService.setBaseLayer(fallback.id);
        }

        this.businessLogicService.updateBaseStyles(this.options.baseStyles);
        return true;
    }

    getBaseLayers() {
        const currentBase = this.stateService.getCurrentBase();
        return this.options.baseStyles.map(b => ({ ...b, active: b.id === currentBase }));
    }

    // ══ Overlay API ════════════════════════════════════════════════════════

    addOverlay(overlayConfig, fireCallback = false) {
        if (!overlayConfig || !overlayConfig.id) {
            throw new Error('Overlay config must have an id');
        }
        const idx = this.options.overlays.findIndex(o => o.id === overlayConfig.id);
        if (idx > -1) {
            this.options.overlays[idx] = { ...this.options.overlays[idx], ...overlayConfig };
        } else {
            this.options.overlays.push(overlayConfig);
        }
        this.businessLogicService.addOverlay(overlayConfig, fireCallback);
        this.uiService.updateOverlays();
        return true;
    }

    removeOverlay(id, fireCallback = false) {
        const idx = this.options.overlays.findIndex(o => o.id === id);
        if (idx === -1) {
            console.warn(`LayersControl.removeOverlay: "${id}" not found`);
            return false;
        }
        this.businessLogicService.removeOverlay(id, fireCallback);
        this.options.overlays.splice(idx, 1);
        this.uiService.updateOverlays();
        return true;
    }

    removeAllOverlays() {
        this.businessLogicService.removeAllOverlays();
        this.options.overlays = [];
        this.uiService.updateOverlays();
        return true;
    }

    showOverlay(id, fireCallback = false) {
        const overlay = this.options.overlays.find(o => o.id === id);
        if (!overlay) {
            console.warn(`LayersControl.showOverlay: "${id}" not found`);
            return false;
        }
        this.businessLogicService.showOverlay(id, fireCallback);
        return true;
    }

    hideOverlay(id, fireCallback = false) {
        const overlay = this.options.overlays.find(o => o.id === id);
        if (!overlay) {
            console.warn(`LayersControl.hideOverlay: "${id}" not found`);
            return false;
        }
        this.businessLogicService.hideOverlay(id, fireCallback);
        return true;
    }

    setOverlayOpacity(id, value) {
        const overlay = this.options.overlays.find(o => o.id === id);
        if (!overlay) {
            console.warn(`LayersControl.setOverlayOpacity: "${id}" not found`);
            return false;
        }
        this.businessLogicService.setOverlayOpacity(id, value);
        return true;
    }

    getOverlays() {
        const overlayStates = this.stateService.getOverlayStates();
        return this.options.overlays.map(o => ({
            ...o,
            visible: overlayStates[o.id] ? overlayStates[o.id].visible : false,
            opacity: overlayStates[o.id] ? overlayStates[o.id].opacity : 1.0
        }));
    }

    // ══ Group API ══════════════════════════════════════════════════════════

    showGroup(id) {
        if (!this.options.overlays.some(o => o.group === id)) {
            console.warn(`LayersControl.showGroup: group "${id}" not found`);
            return false;
        }
        this.businessLogicService.setGroupVisibility(id, true);
        return true;
    }

    hideGroup(id) {
        if (!this.options.overlays.some(o => o.group === id)) {
            console.warn(`LayersControl.hideGroup: group "${id}" not found`);
            return false;
        }
        this.businessLogicService.setGroupVisibility(id, false);
        return true;
    }

    setGroupOpacity(id, value) {
        if (!this.options.overlays.some(o => o.group === id)) {
            console.warn(`LayersControl.setGroupOpacity: group "${id}" not found`);
            return false;
        }
        this.businessLogicService.setGroupOpacity(id, value);
        return true;
    }

    getGroups() {
        const groupStates = this.stateService.getGroupStates();
        const groups = new Map();

        this.options.overlays.forEach(overlay => {
            if (overlay.group && !groups.has(overlay.group)) {
                const cfg = (this.options.groups || []).find(g => g.id === overlay.group);
                groups.set(overlay.group, {
                    id:      overlay.group,
                    label:   cfg ? cfg.label : overlay.group,
                    visible: groupStates[overlay.group] ? groupStates[overlay.group].visible : false,
                    opacity: groupStates[overlay.group] ? groupStates[overlay.group].opacity : 1.0,
                    overlays: []
                });
            }
        });

        this.options.overlays.forEach(overlay => {
            if (overlay.group && groups.has(overlay.group)) {
                groups.get(overlay.group).overlays.push(overlay.id);
            }
        });

        return Array.from(groups.values());
    }

    // ══ Viewport API ═══════════════════════════════════════════════════════

    saveCurrentViewport() {
        if (!this.map) return false;
        const center = this.map.getCenter();
        this.stateService.setViewport({
            center:  { lng: center.lng, lat: center.lat },
            zoom:    this.map.getZoom(),
            bearing: this.map.getBearing(),
            pitch:   this.map.getPitch()
        });
        return true;
    }

    applySavedViewport() {
        if (!this.map) return false;
        const vp = this.stateService.getViewport();
        if (!vp || !vp.center) return false;
        this.map.jumpTo({
            center:  vp.center,
            zoom:    vp.zoom    || 0,
            bearing: vp.bearing || 0,
            pitch:   vp.pitch   || 0
        });
        return true;
    }

    // ══ Persistence API ════════════════════════════════════════════════════

    clearPersistedData() {
        return this.stateService.clearPersisted();
    }

    // ══ Events API ════════════════════════════════════════════════════════

    on(event, callback) {
        this.eventEmitter.on(event, callback);
        return this;
    }

    off(event, callback) {
        this.eventEmitter.off(event, callback);
        return this;
    }

    // ══ State inspection ═══════════════════════════════════════════════════

    getCurrentState() {
        return this.stateService.getAll();
    }

    // ══ Private helpers ════════════════════════════════════════════════════

    _setupPublicEventForwarding() {
        // The eventEmitter is already shared by all services, so events emitted
        // by services are automatically available to external subscribers via
        // layersControl.on(event, cb). No additional forwarding needed.
    }

    _setupMapEventListeners() {
        if (!this.map) return;

        const handleMoveEnd = () => {
            clearTimeout(this._viewportSaveTimeout);
            this._viewportSaveTimeout = setTimeout(() => {
                this.saveCurrentViewport();
            }, 500);
        };

        this._mapEventHandlers.set('moveend', handleMoveEnd);
        this.map.on('moveend', handleMoveEnd);
    }

    _cleanupMapEventListeners() {
        if (!this.map) return;
        this._mapEventHandlers.forEach((handler, event) => {
            this.map.off(event, handler);
        });
        this._mapEventHandlers.clear();
        if (this._viewportSaveTimeout) {
            clearTimeout(this._viewportSaveTimeout);
            this._viewportSaveTimeout = null;
        }
    }

    _restoreMapState() {
        if (!this.map) return;

        // Apply saved (or default) base layer.
        // applyBaseStyle() calls map.setStyle() and in its 'styledata' callback
        // automatically re-activates all visible overlays, so we must NOT also
        // activate them manually when a base style change is triggered.
        const savedBase = this.stateService.getCurrentBase();
        let baseStyleTriggered = false;

        if (savedBase) {
            const exists = this.options.baseStyles.find(b => b.id === savedBase);
            if (exists) {
                this.businessLogicService.setBaseLayer(savedBase);
                baseStyleTriggered = true;
            } else {
                // Persisted base no longer exists in current config; reset to default
                const fallback =
                    this.options.baseStyles.find(b => b.id === this.options.defaultBaseId) ||
                    this.options.baseStyles[0];
                if (fallback) {
                    this.stateService.setBase(fallback.id);
                    this.uiService.updateBaseUI();
                }
            }
        }

        // Restore viewport (slightly longer delay when waiting for style load)
        const vp = this.stateService.getViewport();
        if (vp && vp.center) {
            setTimeout(() => this.applySavedViewport(), baseStyleTriggered ? 400 : 100);
        }

        // Only manually activate overlays when no base style reload was triggered.
        // Otherwise the styledata callback in applyBaseStyle handles restoration.
        if (!baseStyleTriggered) {
            const overlayStates = this.stateService.getOverlayStates();
            Object.entries(overlayStates).forEach(([overlayId, state]) => {
                if (state && state.visible) {
                    setTimeout(() => {
                        this.businessLogicService.activateOverlay(overlayId, false);
                    }, 200);
                }
            });
        }
    }
}
