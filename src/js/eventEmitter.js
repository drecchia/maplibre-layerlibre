/**
 * EventEmitter - Simple pub/sub event system
 */
class EventEmitter {
    constructor() {
        this._events = new Map();
    }

    on(event, handler) {
        if (typeof handler !== 'function') throw new TypeError('Handler must be a function');
        if (!this._events.has(event)) this._events.set(event, new Set());
        this._events.get(event).add(handler);
        return this;
    }

    off(event, handler) {
        const listeners = this._events.get(event);
        if (listeners) {
            listeners.delete(handler);
            if (listeners.size === 0) this._events.delete(event);
        }
        return this;
    }

    emit(event, data) {
        const listeners = this._events.get(event);
        if (!listeners) return;
        for (const handler of Array.from(listeners)) {
            try {
                handler(data);
            } catch (e) {
                console.error(`EventEmitter: error in "${event}" handler:`, e);
            }
        }
    }

    once(event, handler) {
        const wrapper = (data) => { this.off(event, wrapper); handler(data); };
        return this.on(event, wrapper);
    }

    removeAllListeners(event) {
        if (event) { this._events.delete(event); } else { this._events.clear(); }
        return this;
    }
}
