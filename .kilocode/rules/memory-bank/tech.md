# LayersControl - Technical Overview

## Technologies Used

### Core Libraries
- **MapLibre GL JS**: Mapping library for displaying interactive maps
- **deck.gl**: WebGL-based visualization library for overlay layers
- **Vanilla JavaScript**: No framework dependency for lightweight implementation
- **TypeScript**: Type definitions for services and interfaces
- **HTML5/CSS3**: UI structure and styling

### Build System
- **Gulp**: Task automation for JavaScript concatenation, minification, and CSS processing
- **PostCSS**: CSS transformation with autoprefixer and nested styles support
- **UglifyJS**: JavaScript minification
- **Clean-CSS**: CSS minification

### Development Tools
- **ESLint**: JavaScript linting
- **Git**: Version control
- **npm**: Package management

## Development Setup

### Installation
```bash
npm install
```

### Build
```bash
npm run build
```

This runs the Gulp default task which:
1. Concatenates and minifies JavaScript files
2. Processes and minifies CSS files
3. Outputs build artifacts to `dist/` directory

### Project Structure
```
/workspaces/maplibre-layerlibre/
├── src/                 # Source code
│   ├── js/             # JavaScript/TypeScript files
│   └── css/            # CSS styles
├── dist/               # Build output (generated)
├── examples/           # Example HTML files
├── docs/               # Documentation
├── package.json        # Project dependencies and scripts
├── gulpfile.js         # Gulp build configuration
└── README.md          # Project documentation
```

## Technical Constraints

### Browser Support
- Modern browsers with WebGL support
- ES6+ features with no transpilation (used directly in browser)

### Overlay Types
- Only `deckLayers` and `renderOnClick` overlays are supported
- MapLibre `source`/`layers` overlays are NOT supported

### Performance Considerations
- Deck.gl layer instances are created once and reused
- Opacity updates use `.clone()` to optimize rendering
- Zoom filtering prevents rendering overlays outside visible range

## Dependencies

### npm Dependencies (Dev)
- gulp: ^4.0.2
- gulp-autoprefixer: ^8.0.0
- gulp-clean-css: ^4.3.0
- gulp-concat: ^2.6.1
- gulp-postcss: ^10.0.0
- gulp-uglify: ^3.0.2
- postcss-nested: ^7.0.2

### External Libraries (Browser)
- MapLibre GL JS: Loaded from CDN
- deck.gl: Loaded from CDN

## Tool Usage Patterns

### Gulp Tasks
- **Default Task**: Runs full build (JS + CSS)
- **CSS Task**: Processes and minifies CSS
- **JS Task**: Concatenates and minifies JavaScript

### Version Control
- Master branch for production releases
- Feature branches for development
- Semantic versioning (MAJOR.MINOR.PATCH)

### Documentation
- API documentation in `docs/API_REFERENCE.md`
- Configuration options in `docs/CONFIGURATION.md`
- Events reference in `docs/EVENTS.md`
- CSS customization in `docs/CSS.md`

## Code Quality

- ESLint configuration in `.eslintrc.js`
- No unused variables or functions
- Consistent indentation and code style
- JSDoc comments for public API methods
