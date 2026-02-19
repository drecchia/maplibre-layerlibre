const { src, dest, watch, series } = require('gulp');

const concat = require('gulp-concat');
const uglify = require('gulp-uglify');

/** Run all scripts. */
exports.all = (cb) => {
    return series(AllInOne)(cb);
};

const dist = {
    'files': [
        // Utilities
        'src/js/helper.js',
        // Core services (dependency order)
        'src/js/eventEmitter.js',
        'src/js/stateService.js',
        'src/js/mapService.js',
        // UI (deck.gl + DOM rendering)
        'src/js/uiManager.js',
        // Business logic (depends on all of the above)
        'src/js/businessLogicService.js',
        // Public facade
        'src/js/layersControl.js',
    ],
    'outputFolder': 'dist/js',
};

// Concatenate and minify JS files
const AllInOne = (cb) => {
    return src(dist.files)
        .pipe(concat('all.js'))
        .pipe(uglify())
        .on('error', function(err) {
            console.error('Uglify error:', err.message);
            this.emit('end');
        })
        .pipe(concat('all.min.js'))
        .pipe(dest(dist.outputFolder));
};

/** Watch for changes and recompile. */
exports.watch = (cb) => {
    return watch(dist.files)
        .on('change', path => {
            console.log(`Change detected: "${path}"`);
            series(AllInOne)(() => {
                console.log('JS compiled and concatenated.');
            });
        });
};
