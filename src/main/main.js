const { app, BrowserWindow } = require('electron');
const path = require('path');

// Import our modular components
const SessionManager = require('./session-manager');
const CheckpointManager = require('./checkpoint-manager');
const FileOperations = require('./file-operations');
const ModelConfig = require('./model-config');
const ClaudeProcessManager = require('./claude-process-manager');
const IPCHandlers = require('./ipc-handlers');

// Enable live reload for development
const isDev = process.argv.includes('--dev');

// Global references
let mainWindow;
let sessionManager;
let checkpointManager;
let fileOperations;
let modelConfig;
let claudeProcessManager;
let ipcHandlers;

async function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, '../../preload.js'),
      sandbox: false // Needed for file operations
    },
    titleBarStyle: 'hiddenInset',
    show: false // Don't show until ready
  });

  // Load the app
  try {
    await mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));
    console.log('HTML file loaded successfully');
  } catch (error) {
    console.error('Failed to load HTML file:', error);
    mainWindow.show(); // Show anyway for debugging
    return;
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Add error handling for renderer process
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
    mainWindow.show(); // Show anyway for debugging
  });

  // Debug: Show window after a timeout if ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Window not visible after timeout, forcing show');
      mainWindow.show();
      if (isDev) {
        mainWindow.webContents.openDevTools();
      }
    }
  }, 3000);

  // Handle window closed
  mainWindow.on('closed', async () => {
    mainWindow = null;
    // Clean up
    if (claudeProcessManager) {
      await claudeProcessManager.cleanup();
    }
    if (checkpointManager) {
      checkpointManager.close();
    }
  });
}

async function initializeApp() {
  try {
    // Initialize all managers
    sessionManager = new SessionManager();
    checkpointManager = new CheckpointManager();
    fileOperations = new FileOperations();
    modelConfig = new ModelConfig();
    
    // Claude process manager needs access to other managers and the main window
    claudeProcessManager = new ClaudeProcessManager(
      sessionManager, 
      checkpointManager, 
      fileOperations, 
      mainWindow
    );
    
    // IPC handlers coordinate between all managers
    ipcHandlers = new IPCHandlers(
      sessionManager,
      checkpointManager,
      fileOperations,
      modelConfig,
      claudeProcessManager,
      mainWindow
    );

    // Initialize everything
    await modelConfig.loadModelConfig();
    await sessionManager.loadSessions();
    await sessionManager.recoverInterruptedSessions();

    // Try to initialize checkpoint system, but don't fail if it doesn't work
    try {
      await checkpointManager.initialize();
    } catch (error) {
      console.warn('Checkpoint system failed to initialize, running without checkpointing:', error.message);
    }

    // Register all IPC handlers
    ipcHandlers.registerHandlers();

    // Send initial data to renderer
    if (mainWindow) {
      ipcHandlers.sendSessionsLoaded(sessionManager.getSessions());
    }

    console.log('App initialization completed successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    throw error;
  }
}

// App event handlers
app.whenReady().then(async () => {
  await createWindow();
  await initializeApp();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
    await initializeApp();
  }
});

// Handle app closing
app.on('before-quit', async () => {
  console.log('App closing, saving sessions and cleaning up...');

  try {
    if (claudeProcessManager) {
      await claudeProcessManager.cleanup();
    }
    
    if (sessionManager) {
      await sessionManager.saveSessions();
    }
    
    if (checkpointManager) {
      checkpointManager.close();
    }
    
    console.log('Cleanup completed');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
});