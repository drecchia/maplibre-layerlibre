/**
 * Stability regression checks (issue #1 — "map freezes when this lib is active").
 *
 * Covers the three failure modes that accumulate deck.gl layers / renderers:
 *   1. deactivate landing mid-`onChecked` leaves a ghost layer rendering forever
 *   2. rapid base switching stacks 'style.load' handlers → N× overlay activation
 *   3. setMap(null) leaving the deck.gl overlay + zoomend listener on the old map
 *
 * Run: node test/stability.test.js
 * No framework on purpose — the lib is plain globals, so the sources are just
 * concatenated into a vm context, same as the gulp build does.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ── Stubs ──────────────────────────────────────────────────────────────────

// Mimics MapLibre's Evented: off() removes once-listeners by original reference.
function makeMap() {
    const on = {};
    const once = {};
    return {
        setStyleCalls: [],
        controls: [],
        count(ev) { return (on[ev] || []).length + (once[ev] || []).length; },
        on(ev, fn) { (on[ev] = on[ev] || []).push(fn); },
        once(ev, fn) { (once[ev] = once[ev] || []).push(fn); },
        off(ev, fn) {
            on[ev] = (on[ev] || []).filter(h => h !== fn);
            once[ev] = (once[ev] || []).filter(h => h !== fn);
        },
        fire(ev, data) {
            (on[ev] || []).slice().forEach(h => h(data));
            const pending = once[ev] || [];
            once[ev] = [];
            pending.forEach(h => h(data));
        },
        setStyle(s) { this.setStyleCalls.push(s); },
        addControl(c) { this.controls.push(c); },
        removeControl(c) {
            const i = this.controls.indexOf(c);
            if (i > -1) this.controls.splice(i, 1);
        },
        getZoom() { return 10; },
        getCenter() { return { lng: 0, lat: 0 }; },
        getBearing() { return 0; },
        getPitch() { return 0; },
        getContainer() { return { offsetWidth: 800, offsetHeight: 600 }; },
        flyTo() {},
        jumpTo() {}
    };
}

const deck = {
    MapboxOverlay: class { constructor(p) { this.props = p || {}; } setProps(p) { Object.assign(this.props, p); } },
    ScatterplotLayer: class {
        constructor(p) { Object.assign(this, p); }
        clone(o) { return new deck.ScatterplotLayer({ ...this, ...o }); }
    }
};

// ── Load the library the same way the gulp build concatenates it ───────────

const ORDER = [
    'helper.js', 'eventEmitter.js', 'stateService.js',
    'mapService.js', 'uiManager.js', 'businessLogicService.js', 'layersControl.js'
];
const src = ORDER
    .map(f => fs.readFileSync(path.join(__dirname, '..', 'src', 'js', f), 'utf8'))
    .join('\n');

const sandbox = { console, deck, setTimeout, clearTimeout };
vm.createContext(sandbox);
const { UIManager, EventEmitter, StateService, MapService } =
    vm.runInContext(src + '\n;({UIManager, EventEmitter, StateService, MapService})', sandbox);

// ── Fixture ────────────────────────────────────────────────────────────────

function makeUI(overlays) {
    const ee = new EventEmitter();
    const st = new StateService(ee, null);          // null key → no localStorage
    const ui = new UIManager(st, new MapService(ee), ee);
    ui.setOptions({
        baseStyles: [{ id: 'a', style: {} }, { id: 'b', style: {} }],
        overlays
    });
    const map = makeMap();
    ui.setMap(map);                                  // never render() — no DOM needed
    overlays.forEach(o => {
        st.initOverlay(o.id, o);
        st.setOverlayVisibility(o.id, true);
    });
    return { ui, st, map };
}

const LAYER = { id: 'ov-layer', type: 'ScatterplotLayer', props: {} };

// ── Tests ──────────────────────────────────────────────────────────────────

async function ghostLayerOnDeactivateDuringOnChecked() {
    let release;
    const { ui } = makeUI([{
        id: 'ov',
        onChecked: () => new Promise(r => { release = r; }),
        deckLayers: [LAYER]
    }]);

    const activating = ui._activateOverlay('ov', true);
    ui._deactivateOverlay('ov');   // user unchecks while onChecked is still in flight
    release();
    await activating;

    assert.strictEqual(ui.deckLayers.size, 0,
        'deactivate during onChecked must not leave a layer rendering on the map');
}

function rapidBaseSwitchActivatesOverlayOnce() {
    let onCheckedCalls = 0;
    const { ui, map } = makeUI([{
        id: 'ov',
        onChecked: () => { onCheckedCalls++; },
        deckLayers: [LAYER]
    }]);

    ui._applyBaseToMap('a');
    ui._applyBaseToMap('b');       // second switch before the first style finished
    map.fire('style.load');

    assert.strictEqual(onCheckedCalls, 1,
        'a stale style.load handler must not re-activate overlays a second time');
}

function redundantBaseChangeIsANoOp() {
    const { ui, map } = makeUI([]);
    ui._applyBaseToMap('a');
    ui._applyBaseToMap('a');

    assert.strictEqual(map.setStyleCalls.length, 1,
        're-applying the active base must not reload the style');
}

function setMapNullDetachesFromOldMap() {
    const { ui, map } = makeUI([]);
    assert.strictEqual(map.controls.length, 1, 'deck overlay should be on the map');

    ui.setMap(null);

    assert.strictEqual(map.controls.length, 0,
        'deck.gl overlay must be removed from the old map');
    assert.strictEqual(map.count('zoomend'), 0,
        'zoomend listener must be removed from the old map');
}

// ── Runner ─────────────────────────────────────────────────────────────────

(async () => {
    const tests = [
        ghostLayerOnDeactivateDuringOnChecked,
        rapidBaseSwitchActivatesOverlayOnce,
        redundantBaseChangeIsANoOp,
        setMapNullDetachesFromOldMap
    ];
    for (const t of tests) {
        await t();
        console.log(`ok   ${t.name}`);
    }
    console.log(`\n${tests.length} passing`);
})().catch(e => {
    console.error(`\nFAIL ${e.message}`);
    process.exit(1);
});
