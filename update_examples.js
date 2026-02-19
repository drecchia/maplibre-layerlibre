#!/usr/bin/env node

/**
 * Script to update all remaining examples to use the new service architecture
 * This script applies the same pattern used for advanced.html and minimal-base.html
 */

const fs = require('fs');
const path = require('path');

const examplesDir = './examples';
const remainingExamples = [
  'dynamic-base-style.html',
  'dynamic-control.html',
  'dynamic-overlays.html',
  'events.html',
  'forced-fit-bounds.html',
  'group-overlays.html',
  'overlay-forced-base.html',
  'overlay-opacity.html',
  'overlay-render-on-click.html',
  'overlay-static.html',
  'overlay-tooltip-function.html',
  'overlay-tooltip-object.html',
  'overlay-tooltip-string.html',
  'overlay-zoom.html',
  'persistence.html'
];

const serviceImports = `  <!-- Service Architecture Scripts -->
  <script type="module">
    // Import services for new architecture
    import { StateService } from '../src/js/services/StateService.js';
    import { UIService } from '../src/js/services/UIService.js';
    import { MapService } from '../src/js/services/MapService.js';
    import { BusinessLogicService } from '../src/js/services/BusinessLogicService.js';
    import { EventEmitter } from '../src/js/events/EventEmitter.js';
    import { LayersControl } from '../src/js/layersControl.js';

    // Make services available globally for the example
    window.StateService = StateService;
    window.UIService = UIService;
    window.MapService = MapService;
    window.BusinessLogicService = BusinessLogicService;
    window.EventEmitter = EventEmitter;
    window.LayersControl = LayersControl;
  </script>`;

const serviceInitialization = `    // Wait for services to be loaded
    const initExample = () => {
      if (!window.LayersControl || !window.StateService) {
        setTimeout(initExample, 100);
        return;
      }

      // Initialize services for new architecture
      const eventEmitter = new EventEmitter();
      const stateService = new StateService(eventEmitter, 'layersControlState');
      const mapService = new MapService(eventEmitter);
      const uiService = new UIService(stateService, mapService, eventEmitter);
      const businessLogicService = new BusinessLogicService(stateService, eventEmitter);`;

const layersControlCreation = `      // Create LayersControl with services
      const layersControl = new LayersControl({
        baseStyles: baseStyles,
        overlays: overlays,
        defaultBaseId: 'osm'
      }, {
        stateService,
        uiService,
        mapService,
        businessLogicService,
        eventEmitter
      });`;

const scriptClosure = `
    // Initialize the example
    initExample();`;

function updateExampleFile(filename) {
  const filePath = path.join(examplesDir, filename);

  try {
    let content = fs.readFileSync(filePath, 'utf8');

    // Add service imports after LayersControl JS script
    content = content.replace(
      /<!-- LayersControl JS -->\s*<script src="\.\.\/dist\/js\/all\.min\.js"><\/script>/,
      `<!-- LayersControl JS -->\n  <script src="../dist/js/all.min.js"></script>${serviceImports}`
    );

    // Update script tag to module type
    content = content.replace(
      /<script>/,
      `<script type="module">`
    );

    // Add service initialization wrapper
    const mapCreationPattern = /(const map = new maplibregl\.Map\({[\s\S]*?}\);)/;
    const match = content.match(mapCreationPattern);

    if (match) {
      const mapCreation = match[1];
      const layersControlPattern = /(const layersControl = new LayersControl\({[\s\S]*?}\);)/;
      const layersMatch = content.match(layersControlPattern);

      if (layersMatch) {
        const layersControlCreationOld = layersMatch[1];

        content = content.replace(
          mapCreation,
          serviceInitialization + '\n\n' + mapCreation
        );

        content = content.replace(
          layersControlCreationOld,
          layersControlCreation
        );

        // Add script closure
        content = content.replace(
          /(map\.addControl\(layersControl, '[^']+'\);)/,
          '$1' + scriptClosure
        );
      }
    }

    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated ${filename}`);

  } catch (error) {
    console.error(`❌ Error updating ${filename}:`, error.message);
  }
}

console.log('🚀 Starting batch update of remaining examples...\n');

remainingExamples.forEach(filename => {
  if (fs.existsSync(path.join(examplesDir, filename))) {
    updateExampleFile(filename);
  } else {
    console.log(`⚠️  File not found: ${filename}`);
  }
});

console.log('\n✨ Batch update completed!');
console.log('📝 Note: You may need to manually adjust some examples for specific configurations.');