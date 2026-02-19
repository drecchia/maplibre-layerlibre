/**
 * BoundsHelper - Static utility class for calculating bounding boxes
 */
class BoundsHelper {
    /**
     * Calculate bounding box from an array of coordinate pairs
     * @param {Array<[number, number]>} points - Array of [lng, lat] coordinate pairs
     * @param {number|Object} padding - Padding around bounds. Can be:
     *   - number: uniform padding for all sides
     *   - object: {top, bottom, left, right} for different padding per side
     * @returns {Array<[number, number]>} Bounding box as [[minLng, minLat], [maxLng, maxLat]]
     */
    static calculateBounds(points, padding = 0) {
        if (!points || !Array.isArray(points) || points.length === 0) {
            throw new Error('Points array is required and must not be empty');
        }

        let minLng = Infinity;
        let minLat = Infinity;
        let maxLng = -Infinity;
        let maxLat = -Infinity;

        // Calculate min/max from all points
        for (const [lng, lat] of points) {
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        }

        // Apply padding
        let paddingTop, paddingBottom, paddingLeft, paddingRight;
        
        if (typeof padding === 'number') {
            // Uniform padding
            paddingTop = paddingBottom = paddingLeft = paddingRight = padding;
        } else if (typeof padding === 'object' && padding !== null) {
            // Object padding
            paddingTop = padding.top || 0;
            paddingBottom = padding.bottom || 0;
            paddingLeft = padding.left || 0;
            paddingRight = padding.right || 0;
        } else {
            // Invalid padding, use no padding
            paddingTop = paddingBottom = paddingLeft = paddingRight = 0;
        }

        return [
            [minLng - paddingLeft, minLat - paddingBottom],
            [maxLng + paddingRight, maxLat + paddingTop]
        ];
    }

    /**
     * Calculate the center point of a bounding box
     * @param {Array<[number, number]>} bounds - Bounding box as [[minLng, minLat], [maxLng, maxLat]]
     * @returns {[number, number]} Center point as [lng, lat]
     */
    static calculateBoundsCenter(bounds) {
        if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) {
            throw new Error('Bounds must be an array with two coordinate pairs');
        }
        
        const minLng = bounds[0][0];
        const minLat = bounds[0][1];
        const maxLng = bounds[1][0];
        const maxLat = bounds[1][1];
        
        return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
    }

    /**
     * Calculate appropriate zoom level to fit bounds in a container
     * @param {Array<[number, number]>} bounds - Bounding box as [[minLng, minLat], [maxLng, maxLat]]
     * @param {Object} container - Container with width and height properties
     * @param {number} container.width - Container width in pixels
     * @param {number} container.height - Container height in pixels
     * @param {number} padding - Additional padding factor (default: 0.5)
     * @returns {number} Calculated zoom level (clamped between 1 and 20)
     */
    static calculateBoundsZoom(bounds, container, padding = 0.5) {
        if (!bounds || !Array.isArray(bounds) || bounds.length !== 2) {
            throw new Error('Bounds must be an array with two coordinate pairs');
        }
        
        if (!container || typeof container.width !== 'number' || typeof container.height !== 'number') {
            throw new Error('Container must have numeric width and height properties');
        }
        
        // Calculate bounds dimensions
        const minLng = bounds[0][0];
        const minLat = bounds[0][1];
        const maxLng = bounds[1][0];
        const maxLat = bounds[1][1];
        
        const lngDiff = maxLng - minLng;
        const latDiff = maxLat - minLat;
        
        // Calculate zoom level to fit bounds.
        // MapLibre calibrates zoom so the world is 512px wide at zoom 0 (one 512px tile).
        // At zoom N: world_width = 512 * 2^N px, so fitting lngDiff in container.width gives:
        //   container.width = 512 * 2^N * (lngDiff / 360)  →  N = log2(360 * width / (512 * lngDiff))
        const lngZoom = Math.log2(360 * container.width / (512 * lngDiff));
        const latZoom = Math.log2(180 * container.height / (512 * latDiff));
        
        // Use the smaller zoom to ensure both dimensions fit, with padding
        const calculatedZoom = Math.min(lngZoom, latZoom) - padding;
        
        // Clamp to reasonable bounds
        return Math.max(1, Math.min(20, calculatedZoom));
    }

    /**
     * Calculate center point from deck layer data (for panning functionality)
     * @param {Object} overlay - Overlay configuration object
     * @returns {[number, number]|null} Center point as [lng, lat] or null if not found
     */
    static calculatePanCenter(overlay) {
        try {
            if (overlay.deckLayers && overlay.deckLayers.length > 0) {
                const firstLayer = overlay.deckLayers[0];
                if (firstLayer.props && firstLayer.props.data && firstLayer.props.data.length > 0) {
                    const firstPoint = firstLayer.props.data[0];
                    if (firstPoint.position) {
                        return firstPoint.position; // [lng, lat]
                    }
                }
            }
        } catch (error) {
            console.error(`Failed to calculate pan center for overlay ${overlay.id}:`, error);
        }
        return null;
    }
}
