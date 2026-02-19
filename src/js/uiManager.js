/**
 * UIManager / UIService
 *
 * Handles:
 *   - DOM rendering of the layers control panel (toggle button + panel content)
 *   - deck.gl overlay lifecycle (MapboxOverlay, layer creation/removal)
 *   - UI state updates (loading spinners, error icons, zoom-filter indicators)
 *
 * This class is both the UIService (injected into LayersControl) and UIManager
 * (exposed as `context.overlayManager` in onChecked callbacks).
 *
 * Constructor: new UIService(stateService, mapService, eventEmitter)
 * Before render(), call:
 *   uiService.setOptions(options)
 *   uiService.setMap(map)
 *   uiService.setContainer(container)
 *   uiService.setBusinessLogicService(bls)
 */
class UIManager {
    constructor(stateService, mapService, eventEmitter) {
        if (!stateService) throw new Error('UIManager requires stateService');
        if (!eventEmitter)  throw new Error('UIManager requires eventEmitter');

        this.stateService        = stateService;
        this.mapService          = mapService || null;
        this.eventEmitter        = eventEmitter;
        this.businessLogicService = null; // injected via setBusinessLogicService()

        // Options (set via setOptions before render)
        this.options = {};

        // Core references
        this.map        = null;
        this.container  = null;
        this.deckOverlay = null;

        // UI elements
        this.toggle = null;
        this.panel  = null;
        this.isOpen = false;

        // deck.gl layer tracking
        this.deckLayers         = new Map(); // layerId → deck.Layer instance
        this.overlayToLayerIds  = new Map(); // overlayId → layerId[]

        // UI status tracking
        this.loadingStates       = new Map(); // overlayId → bool
        this.errorStates         = new Map(); // overlayId → errorMessage
        this.zoomFilteredOverlays = new Set(); // overlayId

        // Per-overlay cache (survives show/hide cycles)
        this.overlayCache = new Map(); // overlayId → any

        // Bound handlers
        this._handleToggleClick   = this._handleToggleClick.bind(this);
        this._handleDocumentClick = this._handleDocumentClick.bind(this);
        this._onZoomEnd           = this._onZoomEnd.bind(this);
    }

    // ── Injection setters ──────────────────────────────────────────────────

    setOptions(options) {
        this.options = options || {};
    }

    setBusinessLogicService(bls) {
        this.businessLogicService = bls;
    }

    setMap(map) {
        this.map = map;
        if (this.mapService) this.mapService.setMap(map);
        if (map) {
            this._initializeDeckOverlay();
            map.on('zoomend', this._onZoomEnd);
        }
    }

    setContainer(container) {
        this.container = container;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        // Toggle button
        this.toggle = document.createElement('button');
        this.toggle.className = 'layers-control__toggle';
        this.toggle.setAttribute('aria-label', 'Toggle layers');
        this.toggle.innerHTML = this.options.icon || '☰';
        this.toggle.addEventListener('click', this._handleToggleClick);

        // Panel
        this.panel = document.createElement('div');
        this.panel.className = 'layers-control__panel';
        this.panel.style.display = 'none';

        this.container.appendChild(this.toggle);
        this.container.appendChild(this.panel);

        this._renderPanelContent();
        this._setupEventDelegation();
    }

    destroy() {
        if (this.map) {
            this.map.off('zoomend', this._onZoomEnd);
        }
        if (this.options && this.options.autoClose) {
            document.removeEventListener('click', this._handleDocumentClick);
        }
        if (this.deckOverlay && this.map) {
            try { this.map.removeControl(this.deckOverlay); } catch (e) { /* ignore */ }
        }
        this.deckLayers.clear();
        this.overlayToLayerIds.clear();
        this.loadingStates.clear();
        this.errorStates.clear();
        this.zoomFilteredOverlays.clear();
        this.overlayCache.clear();
        this.map        = null;
        this.container  = null;
        this.deckOverlay = null;
        this.panel      = null;
        this.toggle     = null;
    }

    // ── Public UI update methods (called by BusinessLogicService) ──────────

    updateOverlays() {
        this._renderPanelContent();
    }

    updateBaseStyles() {
        this._renderPanelContent();
    }

    updateBaseUI() {
        const currentBase = this.stateService.getCurrentBase();
        if (!this.panel) return;
        this.panel.querySelectorAll('.layers-control__base-item').forEach(item => {
            const radio = item.querySelector('input[type="radio"]');
            if (!radio) return;
            const isActive = radio.value === currentBase;
            radio.checked = isActive;
            item.classList.toggle('layers-control__base-item--active', isActive);
        });
    }

    updateOverlayUI(overlayId) {
        this._updateOverlayUI(overlayId);
    }

    updateGroupUI(groupId) {
        this._updateGroupUI(groupId);
    }

    setLoadingState(overlayId, isLoading) {
        this._setLoadingState(overlayId, isLoading);
    }

    setErrorState(overlayId, error) {
        if (error) {
            this.errorStates.set(overlayId, error);
        } else {
            this.errorStates.delete(overlayId);
        }
        this._updateOverlayUI(overlayId);
    }

    // ── deck.gl public API (called by BusinessLogicService) ───────────────

    async activateOverlay(overlayId, isUserInteraction = false) {
        return this._activateOverlay(overlayId, isUserInteraction);
    }

    deactivateOverlay(overlayId) {
        this._deactivateOverlay(overlayId);
        this._updateOverlayUI(overlayId);
    }

    updateOverlayOpacity(overlayId, opacity) {
        this._updateOverlayOpacity(overlayId, opacity);
        // Sync slider UI
        if (this.panel) {
            const item = this.panel.querySelector(`[data-overlay-id="${overlayId}"]`);
            if (item) {
                const slider = item.querySelector('.layers-control__opacity-slider');
                const label  = item.querySelector('.layers-control__opacity-label');
                if (slider) slider.value = opacity;
                if (label)  label.textContent = `${Math.round(opacity * 100)}%`;
            }
        }
    }

    clearAll() {
        this.deckLayers.clear();
        this.overlayToLayerIds.clear();
        this._updateDeckOverlay();
        this.loadingStates.clear();
        this.errorStates.clear();
        this.zoomFilteredOverlays.clear();
        this.overlayCache.clear();
    }

    // Apply a base style change: remove deck overlay, set map style, recreate deck overlay
    applyBaseStyle(baseId) {
        this._applyBaseToMap(baseId);
    }

    // ── Panel rendering ────────────────────────────────────────────────────

    _renderPanelContent() {
        if (!this.panel) return;
        this.panel.innerHTML = '';

        if (this.options.baseStyles && this.options.baseStyles.length > 0) {
            this.panel.appendChild(this._createBaseSection());
        }
        if (this.options.overlays && this.options.overlays.length > 0) {
            this.panel.appendChild(this._createOverlaysSection());
        }
    }

    _createBaseSection() {
        const section = document.createElement('div');
        section.className = 'layers-control__base-section';

        const title = document.createElement('h3');
        title.className = 'layers-control__section-title';
        title.textContent = this.options.i18n && this.options.i18n.baseHeader
            ? this.options.i18n.baseHeader : 'Base Layers';

        const list = document.createElement('div');
        list.className = 'layers-control__base-list';

        const currentBase = this.stateService.getCurrentBase();

        (this.options.baseStyles || []).forEach(baseStyle => {
            const item = document.createElement('label');
            item.className = 'layers-control__base-item';
            if (baseStyle.id === currentBase) {
                item.classList.add('layers-control__base-item--active');
            }

            const radio = document.createElement('input');
            radio.type  = 'radio';
            radio.name  = 'base-layer';
            radio.value = baseStyle.id;
            radio.checked = baseStyle.id === currentBase;
            radio.addEventListener('change', () => {
                if (radio.checked) this._handleBaseChange(baseStyle.id);
            });

            const label = document.createElement('span');
            label.textContent = baseStyle.label || baseStyle.id;

            item.appendChild(radio);
            item.appendChild(label);
            list.appendChild(item);
        });

        section.appendChild(title);
        section.appendChild(list);
        return section;
    }

    _createOverlaysSection() {
        const section = document.createElement('div');
        section.className = 'layers-control__overlays-section';

        const title = document.createElement('h3');
        title.className = 'layers-control__section-title';
        title.textContent = this.options.i18n && this.options.i18n.overlaysHeader
            ? this.options.i18n.overlaysHeader : 'Overlays';

        const list = document.createElement('div');
        list.className = 'layers-control__overlays-list';

        // Separate grouped vs ungrouped overlays
        const groups = new Map();
        const ungrouped = [];

        (this.options.overlays || []).forEach(overlay => {
            if (overlay.group) {
                if (!groups.has(overlay.group)) groups.set(overlay.group, []);
                groups.get(overlay.group).push(overlay);
            } else {
                ungrouped.push(overlay);
            }
        });

        groups.forEach((overlays, groupId) => {
            list.appendChild(this._createGroupElement(groupId, overlays));
        });
        ungrouped.forEach(overlay => {
            list.appendChild(this._createOverlayElement(overlay));
        });

        section.appendChild(title);
        section.appendChild(list);
        return section;
    }

    _createGroupElement(groupId, overlays) {
        const group = document.createElement('div');
        group.className = 'layers-control__group';

        const header = document.createElement('div');
        header.className = 'layers-control__group-header';

        const toggle = document.createElement('label');
        toggle.className = 'layers-control__group-toggle';

        const checkbox = document.createElement('input');
        checkbox.type  = 'checkbox';
        checkbox.value = groupId;
        const groupState = this.stateService.getGroupStates()[groupId];
        checkbox.checked = groupState ? groupState.visible : false;
        checkbox.addEventListener('change', () => this._handleToggleGroup(groupId));

        // Find group label from options.groups config
        const groupConfig = (this.options.groups || []).find(g => g.id === groupId);
        const label = document.createElement('span');
        label.textContent = (groupConfig && groupConfig.label) ? groupConfig.label : groupId;

        toggle.appendChild(checkbox);
        toggle.appendChild(label);
        header.appendChild(toggle);

        const overlaysContainer = document.createElement('div');
        overlaysContainer.className = 'layers-control__group-overlays';
        overlays.forEach(overlay => {
            overlaysContainer.appendChild(this._createOverlayElement(overlay));
        });

        group.appendChild(header);
        group.appendChild(overlaysContainer);
        return group;
    }

    _createOverlayElement(overlay) {
        const item = document.createElement('div');
        item.className = 'layers-control__overlay-item';
        item.dataset.overlayId = overlay.id;

        const toggle = document.createElement('label');
        toggle.className = 'layers-control__overlay-toggle';

        const checkbox = document.createElement('input');
        checkbox.type  = 'checkbox';
        checkbox.value = overlay.id;
        const overlayState = this.stateService.getOverlayStates()[overlay.id];
        checkbox.checked = overlayState ? overlayState.visible : false;
        checkbox.addEventListener('change', () => this._handleToggleOverlay(overlay.id));

        const labelEl = document.createElement('span');
        labelEl.className = 'layers-control__label';
        labelEl.textContent = overlay.label || overlay.id;

        const loading = document.createElement('span');
        loading.className = 'layers-control__loading';
        loading.style.display = 'none';

        toggle.appendChild(checkbox);
        toggle.appendChild(labelEl);
        toggle.appendChild(loading);
        item.appendChild(toggle);

        if (this.options.showOpacity !== false && overlay.opacityControls) {
            const currentOpacity = overlayState ? overlayState.opacity : 1.0;
            item.appendChild(this._createOpacitySlider(overlay.id, currentOpacity));
        }

        return item;
    }

    _createOpacitySlider(overlayId, currentOpacity) {
        const sliderContainer = document.createElement('div');
        sliderContainer.className = 'layers-control__opacity-control';

        const slider = document.createElement('input');
        slider.type  = 'range';
        slider.className = 'layers-control__opacity-slider';
        slider.min   = '0';
        slider.max   = '1';
        slider.step  = '0.01';
        slider.value = currentOpacity;

        const label = document.createElement('span');
        label.className = 'layers-control__opacity-label';
        label.textContent = `${Math.round(currentOpacity * 100)}%`;

        slider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            label.textContent = `${Math.round(value * 100)}%`;
            this._handleOpacitySlider(overlayId, value, false);
        });

        sliderContainer.appendChild(slider);
        sliderContainer.appendChild(label);
        return sliderContainer;
    }

    // ── Panel toggle ───────────────────────────────────────────────────────

    _setupEventDelegation() {
        if (this.options.autoClose) {
            document.addEventListener('click', this._handleDocumentClick);
        }
    }

    _handleToggleClick(e) {
        e.stopPropagation();
        this.isOpen = !this.isOpen;
        if (this.panel) {
            this.panel.style.display = this.isOpen ? 'block' : 'none';
            this.panel.classList.toggle('layers-control__panel--open', this.isOpen);
        }
    }

    _handleDocumentClick(e) {
        if (this.container && !this.container.contains(e.target)) {
            this.isOpen = false;
            if (this.panel) {
                this.panel.style.display = 'none';
                this.panel.classList.remove('layers-control__panel--open');
            }
        }
    }

    // ── UI event dispatchers (call into BusinessLogicService) ──────────────

    _handleBaseChange(baseId) {
        if (this.businessLogicService) {
            this.businessLogicService.setBaseLayer(baseId);
        }
    }

    _handleToggleOverlay(overlayId) {
        if (!this.businessLogicService) return;
        const overlayState = this.stateService.getOverlayStates()[overlayId];
        const newVisible = !(overlayState && overlayState.visible);
        if (newVisible) {
            this.businessLogicService.showOverlay(overlayId, true);
        } else {
            this.businessLogicService.hideOverlay(overlayId, true);
        }
    }

    _handleToggleGroup(groupId) {
        if (!this.businessLogicService) return;
        const groupState = this.stateService.getGroupStates()[groupId];
        const newVisible = !(groupState && groupState.visible);
        this.businessLogicService.setGroupVisibility(groupId, newVisible);
    }

    _handleOpacitySlider(id, value, isGroup) {
        if (!this.businessLogicService) return;
        if (isGroup) {
            this.businessLogicService.setGroupOpacity(id, value);
        } else {
            this.businessLogicService.setOverlayOpacity(id, value);
        }
    }

    // ── Zoom filtering ─────────────────────────────────────────────────────

    _onZoomEnd() {
        this.updateAllZoomFiltering();
    }

    updateAllZoomFiltering() {
        if (!this.map) return;
        const overlayStates = this.stateService.getOverlayStates();
        Object.keys(overlayStates).forEach(overlayId => {
            const state = overlayStates[overlayId];
            if (!state || !state.visible) return;

            const overlay = (this.options.overlays || []).find(o => o.id === overlayId);
            if (!overlay) return;

            const shouldBeVisible = this._checkZoomConstraints(overlay);
            const isCurrentlyFiltered = this.zoomFilteredOverlays.has(overlayId);

            if (shouldBeVisible && isCurrentlyFiltered) {
                this.zoomFilteredOverlays.delete(overlayId);
                this._showOverlayLayers(overlay);
                this._updateOverlayUI(overlayId);
                this.eventEmitter.emit('zoomfilter', { id: overlayId, filtered: false });
            } else if (!shouldBeVisible && !isCurrentlyFiltered) {
                this.zoomFilteredOverlays.add(overlayId);
                this._hideOverlayLayers(overlay);
                this._updateOverlayUI(overlayId);
                this.eventEmitter.emit('zoomfilter', { id: overlayId, filtered: true });
            }
        });
    }

    _checkZoomConstraints(overlay) {
        if (!this.map) return true;
        const currentZoom = this.map.getZoom();
        const f = this._getFilterConfig(overlay);
        if (f.minZoom !== undefined && currentZoom < f.minZoom) return false;
        if (f.maxZoom !== undefined && currentZoom >= f.maxZoom) return false;
        return true;
    }

    _getFilterConfig(overlay) {
        const filter = overlay.filter || {};
        return {
            minZoom: filter.minZoom !== undefined ? filter.minZoom : overlay.minZoomLevel,
            maxZoom: filter.maxZoom !== undefined ? filter.maxZoom : overlay.maxZoomLevel
        };
    }

    _updateZoomFiltering(overlayId) {
        const overlay = (this.options.overlays || []).find(o => o.id === overlayId);
        if (!overlay) return true;
        const shouldBeVisible = this._checkZoomConstraints(overlay);
        if (shouldBeVisible) {
            this.zoomFilteredOverlays.delete(overlayId);
        } else {
            this.zoomFilteredOverlays.add(overlayId);
        }
        return shouldBeVisible;
    }

    // ── Viewport helpers ───────────────────────────────────────────────────

    _getViewportConfig(overlay) {
        const viewport = overlay.viewport || {};
        const hasViewport = overlay.viewport || overlay.fitBounds || overlay.forcedCenter ||
            overlay.panZoom !== undefined || overlay.forcedBearing !== undefined ||
            overlay.forcedPitch !== undefined;
        if (!hasViewport) return null;

        return {
            fitBounds: viewport.fitBounds || overlay.fitBounds,
            center:    viewport.center    || overlay.forcedCenter,
            zoom:      viewport.zoom      !== undefined ? viewport.zoom    : overlay.panZoom,
            bearing:   viewport.bearing   !== undefined ? viewport.bearing : overlay.forcedBearing,
            pitch:     viewport.pitch     !== undefined ? viewport.pitch   : overlay.forcedPitch
        };
    }

    _applyViewportConfig(viewportConfig) {
        if (!this.map || !viewportConfig) return;
        const changes = {};

        if (viewportConfig.fitBounds) {
            try {
                const center = BoundsHelper.calculateBoundsCenter(viewportConfig.fitBounds);
                const container = this.map.getContainer();
                const zoom = BoundsHelper.calculateBoundsZoom(viewportConfig.fitBounds, {
                    width: container.offsetWidth,
                    height: container.offsetHeight
                });
                changes.center = center;
                changes.zoom   = zoom;
            } catch (e) {
                console.warn('UIManager: fitBounds calculation failed:', e);
            }
        } else {
            if (viewportConfig.center !== undefined) changes.center = viewportConfig.center;
            if (viewportConfig.zoom   !== undefined) changes.zoom   = viewportConfig.zoom;
        }

        if (viewportConfig.bearing !== undefined) changes.bearing = viewportConfig.bearing;
        if (viewportConfig.pitch   !== undefined) changes.pitch   = viewportConfig.pitch;

        if (Object.keys(changes).length > 0) {
            changes.duration = 1000;
            this.map.flyTo(changes);
        }
    }

    // ── Base style application ─────────────────────────────────────────────

    _applyBaseToMap(baseId) {
        if (!this.map) return;
        const baseStyle = (this.options.baseStyles || []).find(b => b.id === baseId);
        if (!baseStyle || !baseStyle.style) return;

        // Remove existing deck overlay so it can be re-added after style load
        if (this.deckOverlay) {
            try { this.map.removeControl(this.deckOverlay); } catch (e) { /* ignore */ }
            this.deckOverlay = null;
        }
        this.deckLayers.clear();
        this.overlayToLayerIds.clear();

        this.map.setStyle(baseStyle.style);

        this.map.once('styledata', () => {
            setTimeout(() => {
                this._initializeDeckOverlay();
                // Restore visible overlays
                const overlayStates = this.stateService.getOverlayStates();
                Object.keys(overlayStates).forEach(overlayId => {
                    const state = overlayStates[overlayId];
                    if (state && state.visible) {
                        this._activateOverlay(overlayId, false);
                    }
                });
                this.eventEmitter.emit('styleload', { baseId });
                this.eventEmitter.emit('change', { type: 'styleload', baseId });
            }, 50);
        });
    }

    // ── deck.gl initialization ─────────────────────────────────────────────

    _initializeDeckOverlay() {
        if (!this.map || this.deckOverlay) return;
        if (typeof deck === 'undefined') {
            console.warn('UIManager: deck.gl not found on window.deck');
            return;
        }
        this.deckOverlay = new deck.MapboxOverlay({
            interleaved: true,
            pickingRadius: 10,
            controller: false,
            getTooltip: this._getTooltip.bind(this)
        });
        this.map.addControl(this.deckOverlay);
    }

    // ── Overlay activation / deactivation ─────────────────────────────────

    async _activateOverlay(overlayId, isUserInteraction = false) {
        if (!this.map) return;

        // Ensure deck overlay exists
        if (!this.deckOverlay) this._initializeDeckOverlay();
        if (!this.deckOverlay) return;

        let overlay = (this.options.overlays || []).find(o => o.id === overlayId);
        if (!overlay) return;

        this._setLoadingState(overlayId, true);

        try {
            // Forced base layer (user-triggered activation only)
            if (isUserInteraction && overlay.forcedBaseLayerId) {
                const currentBase = this.stateService.getCurrentBase();
                if (currentBase !== overlay.forcedBaseLayerId) {
                    // Apply viewport now (before base style change) so tilt/bearing take effect
                    // immediately. The styledata callback will re-activate deck layers.
                    const viewportConfig = this._getViewportConfig(overlay);
                    if (viewportConfig) this._applyViewportConfig(viewportConfig);

                    if (this.businessLogicService) {
                        this.businessLogicService.setBaseLayer(overlay.forcedBaseLayerId);
                    }
                    // setBaseLayer calls _applyBaseToMap which handles deck overlay recreation.
                    // We can return here; the style load callback will re-activate visible overlays.
                    this._setLoadingState(overlayId, false);
                    return;
                }
            }

            // Viewport change on user interaction
            if (isUserInteraction) {
                const viewportConfig = this._getViewportConfig(overlay);
                if (viewportConfig) this._applyViewportConfig(viewportConfig);
            }

            // Zoom constraints
            const shouldBeVisible = this._updateZoomFiltering(overlayId);
            if (!shouldBeVisible) {
                this._setLoadingState(overlayId, false);
                this._updateOverlayUI(overlayId);
                this.eventEmitter.emit('zoomfilter', { id: overlayId, filtered: true });
                return;
            }

            // onChecked callback (dynamic overlay)
            if (overlay.onChecked) {
                await this._executeOnChecked(overlayId, overlay, isUserInteraction);
                // Re-fetch overlay after callback (setOverlayConfig may have mutated it)
                overlay = (this.options.overlays || []).find(o => o.id === overlayId);
            }

            // Create deck.gl layers from deckLayers config
            if (overlay && overlay.deckLayers) {
                this._createAndStoreDeckLayers(overlayId, overlay);
            }

            this._setLoadingState(overlayId, false);
            this.errorStates.delete(overlayId);
            this._updateOverlayUI(overlayId);

        } catch (error) {
            console.error(`UIManager: error activating overlay "${overlayId}":`, error);
            this._setLoadingState(overlayId, false);
            this.errorStates.set(overlayId, error.message || String(error));
            this._updateOverlayUI(overlayId);
            this.eventEmitter.emit('error', { id: overlayId, error: error.message || String(error) });
        }
    }

    async _executeOnChecked(overlayId, overlay, isUserInteraction) {
        this.eventEmitter.emit('loading', { id: overlayId });

        const context = {
            map:             this.map,
            overlayManager:  this,
            stateManager:    this.stateService,    // backward-compat name
            stateService:    this.stateService,
            overlayId:       overlayId,
            overlay:         overlay,
            isUserInteraction: isUserInteraction,
            deckOverlay:     this.deckOverlay,

            getCurrentViewport: () => {
                const center = this.map.getCenter();
                return {
                    center: [center.lng, center.lat],
                    zoom:    this.map.getZoom(),
                    bearing: this.map.getBearing(),
                    pitch:   this.map.getPitch()
                };
            },

            getOverlayState:     (id) => this.stateService.getOverlayStates()[id],
            getAllOverlayStates:  ()   => this.stateService.getOverlayStates(),

            getOverlayConfig: () => {
                return (this.options.overlays || []).find(o => o.id === overlayId);
            },

            setOverlayConfig: (newConfig, opts = {}) => {
                const idx = (this.options.overlays || []).findIndex(o => o.id === overlayId);
                if (idx === -1) return;
                Object.assign(this.options.overlays[idx], newConfig);
                if (opts.applyViewport) {
                    const updated = this.options.overlays[idx];
                    const vc = this._getViewportConfig(updated);
                    if (vc) this._applyViewportConfig(vc);
                }
                // Update label in DOM if changed
                if (newConfig.label && this.panel) {
                    const labelEl = this.panel.querySelector(
                        `[data-overlay-id="${overlayId}"] .layers-control__label`
                    );
                    if (labelEl) labelEl.textContent = newConfig.label;
                }
            },

            getCache:   ()    => this.overlayCache.get(overlayId),
            setCache:   (val) => this.overlayCache.set(overlayId, val),
            clearCache: ()    => this.overlayCache.delete(overlayId)
        };

        try {
            await Promise.resolve(overlay.onChecked(context));
            this.eventEmitter.emit('success', { id: overlayId });
        } catch (error) {
            this.eventEmitter.emit('error', { id: overlayId, error: error.message || String(error) });
            throw error;
        }
    }

    _deactivateOverlay(overlayId) {
        const layerIds = this.overlayToLayerIds.get(overlayId);
        if (layerIds) {
            layerIds.forEach(layerId => this.deckLayers.delete(layerId));
            this.overlayToLayerIds.delete(overlayId);
        }
        this.zoomFilteredOverlays.delete(overlayId);
        this._setLoadingState(overlayId, false);
        this._updateDeckOverlay();
    }

    _createAndStoreDeckLayers(overlayId, overlay) {
        const existingLayerIds = this.overlayToLayerIds.get(overlayId) || [];
        existingLayerIds.forEach(id => this.deckLayers.delete(id));

        const overlayState = this.stateService.getOverlayStates()[overlayId];
        const opacity = overlayState ? overlayState.opacity : 1.0;
        const newLayerIds = [];

        overlay.deckLayers.forEach(layerConfig => {
            const layer = this._createDeckLayer(layerConfig, opacity);
            if (layer) {
                this.deckLayers.set(layerConfig.id, layer);
                newLayerIds.push(layerConfig.id);
            }
        });

        this.overlayToLayerIds.set(overlayId, newLayerIds);
        this._updateDeckOverlay();
    }

    _createDeckLayer(layerConfig, opacity) {
        if (typeof deck === 'undefined') return null;
        try {
            const LayerClass = deck[layerConfig.type];
            if (!LayerClass) {
                console.error(`UIManager: unknown deck.gl layer type "${layerConfig.type}"`);
                return null;
            }
            return new LayerClass({
                id: layerConfig.id,
                opacity: opacity !== undefined ? opacity : 1.0,
                ...layerConfig.props
            });
        } catch (e) {
            console.error(`UIManager: failed to create deck.gl layer "${layerConfig.id}":`, e);
            return null;
        }
    }

    _showOverlayLayers(overlay) {
        if (!overlay || !overlay.deckLayers) return;
        const overlayState = this.stateService.getOverlayStates()[overlay.id];
        const opacity = overlayState ? overlayState.opacity : 1.0;
        overlay.deckLayers.forEach(layerConfig => {
            const layer = this._createDeckLayer(layerConfig, opacity);
            if (layer) this.deckLayers.set(layerConfig.id, layer);
        });
        this._updateDeckOverlay();
    }

    _hideOverlayLayers(overlay) {
        if (!overlay || !overlay.deckLayers) return;
        overlay.deckLayers.forEach(layerConfig => this.deckLayers.delete(layerConfig.id));
        this._updateDeckOverlay();
    }

    _updateOverlayOpacity(overlayId, opacity) {
        const layerIds = this.overlayToLayerIds.get(overlayId);
        if (!layerIds) return;
        layerIds.forEach(layerId => {
            const layer = this.deckLayers.get(layerId);
            if (layer) {
                const updated = layer.clone({ opacity });
                this.deckLayers.set(layerId, updated);
            }
        });
        this._updateDeckOverlay();
    }

    _updateDeckOverlay() {
        if (!this.deckOverlay) return;
        this.deckOverlay.setProps({ layers: Array.from(this.deckLayers.values()) });
    }

    // ── UI status updates ──────────────────────────────────────────────────

    _setLoadingState(overlayId, isLoading) {
        this.loadingStates.set(overlayId, isLoading);
        this._updateOverlayUI(overlayId);
    }

    _updateOverlayUI(overlayId) {
        if (!this.panel) return;
        const item = this.panel.querySelector(`[data-overlay-id="${overlayId}"]`);
        if (!item) return;

        const overlayState = this.stateService.getOverlayStates()[overlayId];
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (checkbox) checkbox.checked = overlayState ? overlayState.visible : false;

        const isLoading      = this.loadingStates.get(overlayId);
        const isError        = this.errorStates.has(overlayId);
        const isZoomFiltered = this.zoomFilteredOverlays.has(overlayId);

        let status = 'ok';
        if (isLoading)      status = 'loading';
        else if (isError)   status = 'error';
        else if (isZoomFiltered) status = 'zoomfiltered';

        const loadingEl = item.querySelector('.layers-control__loading');
        if (loadingEl) {
            switch (status) {
                case 'loading':
                    loadingEl.textContent = '↻';
                    loadingEl.style.display = 'inline';
                    loadingEl.classList.add('loadingRotate');
                    loadingEl.title = 'Loading...';
                    break;
                case 'error':
                    loadingEl.textContent = '🚨';
                    loadingEl.style.display = 'inline';
                    loadingEl.classList.remove('loadingRotate');
                    loadingEl.title = this.errorStates.get(overlayId) || 'Error loading overlay';
                    break;
                case 'zoomfiltered':
                    loadingEl.textContent = '🔍';
                    loadingEl.style.display = 'inline';
                    loadingEl.classList.remove('loadingRotate');
                    loadingEl.title = 'Hidden due to zoom level';
                    break;
                default:
                    loadingEl.style.display = 'none';
                    loadingEl.classList.remove('loadingRotate');
                    loadingEl.title = '';
                    break;
            }
        }

        item.classList.toggle('layers-control__overlay-item--loading',    status === 'loading');
        item.classList.toggle('layers-control__overlay-item--error',      status === 'error');
        item.classList.toggle('layers-control__overlay-item--filtered',   status === 'zoomfiltered');
    }

    _updateGroupUI(groupId) {
        if (!this.panel) return;
        // Find the group checkbox by its value attribute
        const groupCheckbox = this.panel.querySelector(
            `.layers-control__group-toggle input[value="${groupId}"]`
        );
        if (!groupCheckbox) return;
        const groupState = this.stateService.getGroupStates()[groupId];
        groupCheckbox.checked = groupState ? groupState.visible : false;
    }

    // ── Tooltip system ─────────────────────────────────────────────────────

    _getTooltip(info) {
        if (!info || !info.object || !info.layer) return null;

        const layerId = info.layer.id;
        const pickedObject = info.object;

        const overlay = this._findOverlayByLayerId(layerId);
        if (!overlay) return null;

        if (overlay.getTooltip && typeof overlay.getTooltip === 'function') {
            try {
                const result = overlay.getTooltip(pickedObject, info);
                if (result) {
                    return {
                        html:  result.html || this._formatDefaultTooltip(result),
                        style: result.style || this._defaultTooltipStyle()
                    };
                }
            } catch (e) {
                console.error('UIManager: error in getTooltip:', e);
            }
            return null;
        }

        if (overlay.tooltip) {
            return {
                html:  this._formatTooltipFromConfig(overlay.tooltip, pickedObject),
                style: this._defaultTooltipStyle()
            };
        }

        return null;
    }

    _findOverlayByLayerId(layerId) {
        for (const overlay of (this.options.overlays || [])) {
            if (overlay.deckLayers) {
                for (const dl of overlay.deckLayers) {
                    if (dl.id === layerId) return overlay;
                }
            }
        }
        return null;
    }

    _formatTooltipFromConfig(config, object) {
        if (typeof config === 'string') {
            const val = this._getNestedValue(object, config);
            return `<div class="tooltip-content">${val !== '' ? val : 'No data'}</div>`;
        }
        if (typeof config === 'object' && config !== null) {
            let html = '<div class="tooltip-content">';
            if (config.title) {
                html += `<div class="tooltip-title">${this._getNestedValue(object, config.title)}</div>`;
            }
            if (config.fields && Array.isArray(config.fields)) {
                html += '<div class="tooltip-body"><div class="tooltip-fields">';
                config.fields.forEach(field => {
                    if (typeof field === 'string') {
                        html += `<div class="tooltip-field"><strong>${field}:</strong> ${this._getNestedValue(object, field)}</div>`;
                    } else if (field.label && field.property) {
                        html += `<div class="tooltip-field"><strong>${field.label}:</strong> ${this._getNestedValue(object, field.property)}</div>`;
                    }
                });
                html += '</div></div>';
            }
            html += '</div>';
            return html;
        }
        return `<div class="tooltip-content">No data</div>`;
    }

    _formatDefaultTooltip(data) {
        if (typeof data === 'string') return `<div class="tooltip-content">${data}</div>`;
        if (data && (data.title || data.content)) {
            let html = '<div class="tooltip-content">';
            if (data.title)   html += `<div class="tooltip-title">${data.title}</div>`;
            if (data.content) html += `<div class="tooltip-body">${data.content}</div>`;
            html += '</div>';
            return html;
        }
        return `<div class="tooltip-content">${JSON.stringify(data)}</div>`;
    }

    _getNestedValue(object, path) {
        if (!path || object === null || object === undefined) return '';
        const parts = path.split('.');
        let value = object;
        for (const part of parts) {
            if (value === null || value === undefined || typeof value !== 'object') return '';
            value = value[part];
        }
        return (value !== null && value !== undefined) ? String(value) : '';
    }

    _defaultTooltipStyle() {
        return {
            backgroundColor: 'rgba(0,0,0,0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontSize: '12px',
            fontFamily: 'Arial, sans-serif',
            maxWidth: '300px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            zIndex: 1000
        };
    }

    // ── Dynamic overlay config update (for setOverlayConfig in context) ──

    _updateOverlayLayers(overlayId) {
        const overlay = (this.options.overlays || []).find(o => o.id === overlayId);
        if (!overlay) return;
        if (overlay.deckLayers) {
            this._createAndStoreDeckLayers(overlayId, overlay);
        } else {
            // No deckLayers — clear any existing layers
            const layerIds = this.overlayToLayerIds.get(overlayId) || [];
            layerIds.forEach(id => this.deckLayers.delete(id));
            this.overlayToLayerIds.delete(overlayId);
            this._updateDeckOverlay();
        }
    }
}

// UIService is an alias so examples can do: new UIService(stateService, mapService, eventEmitter)
const UIService = UIManager;
