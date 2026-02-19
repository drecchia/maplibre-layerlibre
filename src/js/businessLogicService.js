/**
 * BusinessLogicService
 *
 * Orchestrates all state changes and delegates to UIManager/StateService.
 * Constructor: new BusinessLogicService(stateService, eventEmitter)
 * Must call initialize() inside LayersControl.onAdd() before use.
 */
class BusinessLogicService {
    constructor(stateService, eventEmitter) {
        if (!stateService) throw new Error('BusinessLogicService requires stateService');
        if (!eventEmitter)  throw new Error('BusinessLogicService requires eventEmitter');

        this.stateService = stateService;
        this.eventEmitter = eventEmitter;

        // Set by initialize()
        this.map        = null;
        this.uiManager  = null;   // the UIManager/UIService instance
        this.mapService = null;
        this.options    = null;   // LayersControl options (baseStyles, overlays, …)
    }

    /**
     * Called from LayersControl.onAdd() once the map is available.
     * @param {object} deps  { map, stateService, uiService, mapService, eventEmitter, options }
     */
    initialize(deps) {
        this.map        = deps.map;
        this.uiManager  = deps.uiService;   // UIManager is injected as "uiService"
        this.mapService = deps.mapService;
        if (deps.options) this.options = deps.options;
        // stateService & eventEmitter are already set in constructor
    }

    // ── Base layer ─────────────────────────────────────────────────────────

    setBaseLayer(baseId) {
        const baseStyle = (this.options.baseStyles || []).find(b => b.id === baseId);
        if (!baseStyle) {
            console.warn(`BusinessLogicService: base style "${baseId}" not found`);
            return false;
        }
        this.stateService.setBase(baseId);
        if (this.uiManager) {
            this.uiManager.applyBaseStyle(baseId);
            // applyBaseStyle calls map.setStyle() and in the 'styledata' callback restores
            // visible overlays and updates base UI automatically.
            // We update base radio buttons immediately for snappier UX:
            this.uiManager.updateBaseUI();
        }
        return true;
    }

    updateBaseStyles(styles) {
        if (this.options) this.options.baseStyles = styles;
        if (this.uiManager) this.uiManager.updateBaseStyles();
    }

    // ── Overlays ───────────────────────────────────────────────────────────

    async showOverlay(id, fireCallback = false) {
        const overlayStates = this.stateService.getOverlayStates();
        if (overlayStates[id] && overlayStates[id].visible) return true; // already visible

        this.stateService.setOverlayVisibility(id, true);
        if (this.uiManager) {
            await this.uiManager.activateOverlay(id, fireCallback /* isUserInteraction */);
        }

        if (fireCallback) {
            const state = this.stateService.getOverlayStates()[id];
            const opacity = state ? state.opacity : 1.0;
            this.eventEmitter.emit('overlaychange', { id, visible: true, opacity });
            this.eventEmitter.emit('change', { type: 'overlaychange', id, visible: true, opacity });
        }
        return true;
    }

    hideOverlay(id, fireCallback = false) {
        const overlayStates = this.stateService.getOverlayStates();
        if (!overlayStates[id] || !overlayStates[id].visible) return true; // already hidden

        this.stateService.setOverlayVisibility(id, false);
        if (this.uiManager) {
            this.uiManager.deactivateOverlay(id);
        }

        if (fireCallback) {
            const state = this.stateService.getOverlayStates()[id];
            const opacity = state ? state.opacity : 1.0;
            this.eventEmitter.emit('overlaychange', { id, visible: false, opacity });
            this.eventEmitter.emit('change', { type: 'overlaychange', id, visible: false, opacity });
        }
        return true;
    }

    async activateOverlay(id, isUserInteraction = false) {
        if (this.uiManager) {
            await this.uiManager.activateOverlay(id, isUserInteraction);
        }
    }

    setOverlayOpacity(id, value) {
        const clamped = Math.max(0, Math.min(1, parseFloat(value) || 0));
        this.stateService.setOverlayOpacity(id, clamped);

        const state = this.stateService.getOverlayStates()[id];
        if (this.uiManager && state && state.visible) {
            this.uiManager.updateOverlayOpacity(id, clamped);
        }

        this.eventEmitter.emit('overlaychange', {
            id,
            visible: state ? state.visible : false,
            opacity: clamped
        });
        this.eventEmitter.emit('change', {
            type: 'overlaychange',
            id,
            visible: state ? state.visible : false,
            opacity: clamped
        });
        return true;
    }

    addOverlay(config, fireCallback = false) {
        this.stateService.initOverlay(config.id, config);
        const state = this.stateService.getOverlayStates()[config.id];
        if (this.uiManager && state && state.visible) {
            this.uiManager.activateOverlay(config.id, false);
        }
        if (fireCallback) {
            this.eventEmitter.emit('overlaychange', {
                id: config.id,
                visible: state ? state.visible : false,
                opacity: state ? state.opacity : 1.0
            });
        }
        return true;
    }

    removeOverlay(id, fireCallback = false) {
        if (this.uiManager) {
            this.uiManager.deactivateOverlay(id);
            this.uiManager.setLoadingState(id, false);
            this.uiManager.setErrorState(id, null);
        }
        this.stateService.removeOverlay(id);
        if (fireCallback) {
            this.eventEmitter.emit('overlaychange', { id, visible: false, opacity: 1.0 });
        }
        return true;
    }

    removeAllOverlays() {
        if (this.options && this.options.overlays) {
            this.options.overlays.forEach(overlay => {
                if (this.uiManager) this.uiManager.deactivateOverlay(overlay.id);
                this.stateService.removeOverlay(overlay.id);
            });
        }
        if (this.uiManager) this.uiManager.clearAll();
        return true;
    }

    // ── Groups ─────────────────────────────────────────────────────────────

    setGroupVisibility(id, visible) {
        this.stateService.setGroupVisibility(id, visible);

        const overlaysInGroup = (this.options && this.options.overlays || [])
            .filter(o => o.group === id);

        if (visible) {
            // If no overlay in the group is individually visible yet (e.g. first click),
            // activate all of them. Otherwise restore only the individually-visible ones.
            const anyIndividuallyVisible = overlaysInGroup.some(o => {
                const state = this.stateService.getOverlayStates()[o.id];
                return state && state.visible;
            });

            overlaysInGroup.forEach(overlay => {
                if (!anyIndividuallyVisible) {
                    this.stateService.setOverlayVisibility(overlay.id, true);
                }
                const state = this.stateService.getOverlayStates()[overlay.id];
                if (this.uiManager && state && state.visible) {
                    this.uiManager.activateOverlay(overlay.id, false);
                }
                if (this.uiManager) this.uiManager.updateOverlayUI(overlay.id);
            });
        } else {
            // Deactivate all overlays in group and update their individual state
            overlaysInGroup.forEach(overlay => {
                this.stateService.setOverlayVisibility(overlay.id, false);
                if (this.uiManager) {
                    this.uiManager.deactivateOverlay(overlay.id);
                }
            });
        }

        if (this.uiManager) this.uiManager.updateGroupUI(id);

        this.eventEmitter.emit('overlaygroupchange', { id, visible });
        this.eventEmitter.emit('change', { type: 'overlaygroupchange', id, visible });
        return true;
    }

    setGroupOpacity(id, value) {
        const clamped = Math.max(0, Math.min(1, parseFloat(value) || 0));
        this.stateService.setGroupOpacity(id, clamped);

        const overlaysInGroup = (this.options && this.options.overlays || [])
            .filter(o => o.group === id);

        overlaysInGroup.forEach(overlay => {
            this.stateService.setOverlayOpacity(overlay.id, clamped);
            const state = this.stateService.getOverlayStates()[overlay.id];
            if (this.uiManager && state && state.visible) {
                this.uiManager.updateOverlayOpacity(overlay.id, clamped);
            }
        });
        return true;
    }

    // ── Teardown ───────────────────────────────────────────────────────────

    destroy() {
        this.map        = null;
        this.uiManager  = null;
        this.mapService = null;
        this.options    = null;
    }
}
