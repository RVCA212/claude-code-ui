const PreloadBridge = require('./src/main/preload-bridge');

// Create and initialize the secure API bridge
const bridge = new PreloadBridge();

// Expose the API to the renderer process
bridge.exposeAPI();

// Validate API in development mode
if (process.argv.includes('--dev')) {
  bridge.validateAPI();
}

console.log('Preload script initialized with secure API bridge');