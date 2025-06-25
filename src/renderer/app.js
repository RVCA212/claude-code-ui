// Main Renderer Application Entry Point
// This file orchestrates all the modular components

// Import utility classes (these are loaded via script tags in HTML)
// DOMUtils, MessageUtils are loaded from separate files

// Global app instance
let app;

// Initialize the application when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initializeApp();
});

async function initializeApp() {
  try {
    console.log('Initializing Claude Code Chat...');

    // Create the main app component which coordinates everything
    app = new AppComponent();

    // Make app globally available for debugging
    window.app = app;

    // Set up global error handling
    setupGlobalErrorHandling();

    console.log('Claude Code Chat initialized successfully');

  } catch (error) {
    console.error('Failed to initialize application:', error);
    showInitializationError(error);
  }
}

function setupGlobalErrorHandling() {
  // Handle uncaught errors
  window.addEventListener('error', (e) => {
    console.error('Uncaught error:', e.error);
    app?.showNotification('An unexpected error occurred', 'error');
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (e) => {
    console.error('Unhandled promise rejection:', e.reason);
    app?.showNotification('An operation failed unexpectedly', 'error');
    e.preventDefault(); // Prevent console spam
  });
}

function showInitializationError(error) {
  document.body.innerHTML = `
    <div style="
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      padding: 20px;
      text-align: center;
      background: var(--color-background);
      color: var(--color-text);
    ">
      <h1>Failed to Initialize Claude Code Chat</h1>
      <p>An error occurred while starting the application:</p>
      <pre style="
        background: var(--color-secondary);
        padding: 16px;
        border-radius: 8px;
        margin: 16px 0;
        max-width: 600px;
        word-wrap: break-word;
      ">${error.message}</pre>
      <button onclick="window.location.reload()" style="
        padding: 12px 24px;
        background: var(--color-primary);
        color: var(--color-btn-primary-text);
        border: none;
        border-radius: 8px;
        cursor: pointer;
        font-size: 16px;
      ">Reload Application</button>
    </div>
  `;
}

// Global utility functions for backward compatibility
// These can be called from HTML onclick attributes and other legacy code

function createNewSession() {
  app?.getComponent('sessionManager')?.createNewSession();
}

function selectSession(sessionId) {
  app?.getComponent('sessionManager')?.selectSession(sessionId);
}

function deleteSession(sessionId) {
  app?.getComponent('sessionManager')?.deleteSession(sessionId);
}

function sendMessage() {
  app?.getComponent('messageComponent')?.sendMessage();
}

function stopMessage() {
  app?.getComponent('messageComponent')?.stopMessage();
}

function openSettings() {
  app?.getComponent('settings')?.openSettings();
}

function revertToMessage(sessionId, messageId) {
  app?.getComponent('messageComponent')?.revertToMessage(sessionId, messageId);
}

function unrevertFromMessage(sessionId, messageId) {
  app?.getComponent('messageComponent')?.unrevertFromMessage(sessionId, messageId);
}

// File browser functions
function navigateToDirectory(path) {
  app?.getComponent('fileBrowser')?.navigateToDirectory(path);
}

function navigateBack() {
  app?.getComponent('fileBrowser')?.navigateBack();
}

function navigateForward() {
  app?.getComponent('fileBrowser')?.navigateForward();
}

function navigateUp() {
  app?.getComponent('fileBrowser')?.navigateUp();
}

function navigateHome() {
  app?.getComponent('fileBrowser')?.navigateHome();
}

function refreshDirectory() {
  app?.getComponent('fileBrowser')?.refreshDirectory();
}

// Debug functions (available in console)
function debugApp() {
  if (app) {
    app.logDebugInfo();
    return app.getDebugInfo();
  } else {
    console.log('App not initialized');
    return null;
  }
}

function getAppComponent(name) {
  return app?.getComponent(name);
}

// Window Detection Debug Function
async function debugWindowDetection() {
  console.log('\n🔍 Starting Window Detection Debug Session...\n');
  
  if (!app) {
    console.error('❌ App not initialized');
    return null;
  }
  
  const fileBrowser = app.getComponent('fileBrowser');
  if (!fileBrowser) {
    console.error('❌ File browser component not found');
    return null;
  }
  
  try {
    const debugResult = await fileBrowser.debugWindowDetection();
    
    console.log('\n📊 Debug Summary:');
    console.log('==================');
    
    if (debugResult.diagnostics?.success) {
      const diag = debugResult.diagnostics.diagnostics;
      console.log(`✅ Total processes found: ${diag.processes.total}`);
      console.log(`✅ Relevant processes: ${diag.processes.relevant.length}`);
      console.log(`✅ Matching app processes: ${diag.processes.matching.length}`);
      console.log(`✅ AppleScript available: ${diag.applescript.available}`);
      console.log(`✅ Accessibility permissions: ${diag.accessibility.hasPermissions}`);
      
      console.log('\n📋 Relevant Processes:');
      diag.processes.relevant.forEach(p => {
        console.log(`  - ${p.name} (PID: ${p.pid})`);
        console.log(`    Command: ${p.command}`);
      });
      
      console.log('\n🎯 Matching App Processes:');
      diag.processes.matching.forEach(match => {
        console.log(`  ${match.appName}:`);
        match.processes.forEach(p => {
          console.log(`    - ${p.name} (PID: ${p.pid})`);
        });
      });
    } else {
      console.error('❌ Failed to get diagnostics:', debugResult.diagnostics?.error);
    }
    
    if (debugResult.appleScriptTest?.success) {
      console.log(`\n✅ AppleScript test successful - found ${debugResult.appleScriptTest.test?.processCount || 0} processes`);
    } else {
      console.error('❌ AppleScript test failed:', debugResult.appleScriptTest?.error);
    }
    
    console.log(`\n📁 Currently detected open files: ${debugResult.currentOpenFiles?.length || 0}`);
    if (debugResult.currentOpenFiles?.length > 0) {
      debugResult.currentOpenFiles.forEach(file => {
        console.log(`  - ${file.name} (${file.app})`);
        console.log(`    Path: ${file.path}`);
        console.log(`    Exists: ${file.exists}`);
      });
    }
    
    console.log('\n🔧 Debug session complete! Check console logs above for detailed information.');
    console.log('💡 Tip: If Cursor files aren\'t detected, check:');
    console.log('   1. Cursor is running with open files');
    console.log('   2. Accessibility permissions are granted');
    console.log('   3. AppleScript is working correctly');
    
    return debugResult;
    
  } catch (error) {
    console.error('❌ Debug session failed:', error);
    return { error: error.message };
  }
}

// Quick test functions for individual components
async function testAppleScript() {
  const fileBrowser = app?.getComponent('fileBrowser');
  return await fileBrowser?.testAppleScript();
}

async function getWindowDiagnostics() {
  const fileBrowser = app?.getComponent('fileBrowser');
  return await fileBrowser?.getWindowDetectionDiagnostics();
}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initializeApp,
    debugApp,
    getAppComponent,
    debugWindowDetection,
    testAppleScript,
    getWindowDiagnostics
  };
}