/**
 * MapService - Thin wrapper around the MapLibre map instance.
 * Used by LayersControl for direct viewport operations.
 */
class MapService {
    constructor(eventEmitter) {
        this.eventEmitter = eventEmitter;
        this.map = null;
    }

    setMap(map) {
        this.map = map;
    }

    getMap() {
        return this.map;
    }

    getCurrentViewport() {
        if (!this.map) return null;
        const center = this.map.getCenter();
        return {
            center: { lng: center.lng, lat: center.lat },
            zoom: this.map.getZoom(),
            bearing: this.map.getBearing(),
            pitch: this.map.getPitch()
        };
    }

    destroy() {
        this.map = null;
    }
}
