const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
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
let tray;
let sessionManager;
let checkpointManager;
let fileOperations;
let modelConfig;
let claudeProcessManager;
let ipcHandlers;

// Track if we're quitting to avoid hiding to tray
let isQuitting = false;

function createTray() {
  // Create tray icon - try different approaches for macOS compatibility
  let trayIcon;

  // First try to load a custom icon if it exists
  const iconPath = path.join(__dirname, '../../assets/tray-icon.png');
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    if (!trayIcon.isEmpty()) {
      console.log('Using custom tray icon from:', iconPath);
    } else {
      throw new Error('Custom icon is empty');
    }
  } catch (error) {
    console.log('Custom tray icon not found, creating fallback icon');

        // Create a programmatic icon - most reliable approach for macOS
    console.log('Creating programmatic tray icon');
    const size = 16;
    const buffer = Buffer.alloc(size * size * 4); // RGBA

    // Draw a simple "C" shape for Claude
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const index = (y * size + x) * 4;
        let shouldFill = false;

        // Draw a "C" shape in the center
        const centerX = size / 2;
        const centerY = size / 2;
        const outerRadius = 5;
        const innerRadius = 3;

        const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

        // Outer circle minus inner circle, with gap on the right side
        if (distance <= outerRadius && distance >= innerRadius) {
          // Only fill if not on the right side (create the "C" opening)
          if (x < centerX + 2) {
            shouldFill = true;
          }
        }

        if (shouldFill) {
          buffer[index] = 0;     // R - black
          buffer[index + 1] = 0; // G - black
          buffer[index + 2] = 0; // B - black
          buffer[index + 3] = 255; // A - opaque
        } else {
          buffer[index] = 0;     // R
          buffer[index + 1] = 0; // G
          buffer[index + 2] = 0; // B
          buffer[index + 3] = 0; // A - transparent
        }
      }
    }

    trayIcon = nativeImage.createFromBuffer(buffer, { width: size, height: size });
    console.log('Created programmatic "C" tray icon');
  }

  // Ensure we have a valid icon
  if (trayIcon.isEmpty()) {
    console.error('Failed to create any valid tray icon, tray may not be visible');
    // Try one more time with a very simple approach
    trayIcon = nativeImage.createEmpty();
    const size = { width: 16, height: 16 };
    trayIcon = nativeImage.createFromBuffer(Buffer.alloc(16 * 16 * 4, 128), size); // Gray square
  }

  // For macOS, template images work best - they automatically adapt to light/dark theme
  if (process.platform === 'darwin') {
    trayIcon.setTemplateImage(true);
    console.log('Set tray icon as template image for macOS theme adaptation');
  }

  try {
    tray = new Tray(trayIcon);
    console.log('Tray object created successfully');

    // Verify tray is not destroyed
    if (tray.isDestroyed()) {
      console.error('Tray was destroyed immediately after creation');
      return;
    }

    // Create context menu
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Show Claude Code Chat',
        click: () => {
          console.log('Tray menu: Show clicked');
          showWindow();
        }
      },
      {
        label: 'Hide Claude Code Chat',
        click: () => {
          console.log('Tray menu: Hide clicked');
          hideWindow();
        }
      },
      { type: 'separator' },
      {
        label: 'About',
        click: () => {
          console.log('Tray menu: About clicked');
          showAboutDialog();
        }
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          console.log('Tray menu: Quit clicked');
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip('Claude Code Chat - Click to show/hide window');

    // Add some debugging info
    console.log('Tray properties:');
    console.log('  - Title:', tray.getTitle ? tray.getTitle() : 'N/A');
    console.log('  - ToolTip:', 'Claude Code Chat - Click to show/hide window');
    console.log('  - Destroyed:', tray.isDestroyed());

    // Handle tray click (double-click on macOS)
    tray.on('click', () => {
      console.log('Tray clicked');
      if (process.platform === 'darwin') {
        // On macOS, single click shows context menu by default
        // Double click will show/hide window
        return;
      }
      // On other platforms, single click toggles window
      toggleWindow();
    });

    tray.on('double-click', () => {
      console.log('Tray double-clicked');
      toggleWindow();
    });

    tray.on('right-click', () => {
      console.log('Tray right-clicked');
    });

    console.log('✅ System tray created successfully and should be visible in menu bar');

    // On macOS, provide additional guidance
    if (process.platform === 'darwin') {
      console.log('📍 macOS: Look for the tray icon in the top-right menu bar');
      console.log('📍 If not visible, try clicking the chevron (>>) icon to show hidden items');
      console.log('📍 You can also drag it out to make it always visible');
    }

  } catch (error) {
    console.error('Failed to create system tray:', error);
    console.error('The app will continue without tray functionality');
  }
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();

    // On macOS, also show in dock when window is shown
    if (process.platform === 'darwin') {
      app.dock.show();
    }
  }
}

function hideWindow() {
  if (mainWindow) {
    mainWindow.hide();

    // On macOS, hide from dock when window is hidden
    if (process.platform === 'darwin') {
      app.dock.hide();
    }
  }
}

function toggleWindow() {
  if (mainWindow) {
    if (mainWindow.isVisible()) {
      hideWindow();
    } else {
      showWindow();
    }
  }
}

function showAboutDialog() {
  const { dialog } = require('electron');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Claude Code Chat',
    message: 'Claude Code Chat',
    detail: 'An Electron app for chatting with Claude Code SDK\n\nVersion: 1.0.0',
    buttons: ['OK']
  });
}

async function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 245,
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

  // Update window references in managers
  if (claudeProcessManager) {
    claudeProcessManager.mainWindow = mainWindow;
  }
  if (ipcHandlers) {
    ipcHandlers.mainWindow = mainWindow;
  }

  // Send initial data to renderer (after window is created)
  if (ipcHandlers && sessionManager) {
    ipcHandlers.sendSessionsLoaded(sessionManager.getSessions());
  }

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

  // Handle window close button - hide to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hideWindow();

      // Show notification on first time hiding to tray
      if (process.platform === 'darwin') {
        const { Notification } = require('electron');
        if (Notification.isSupported()) {
          new Notification({
            title: 'Claude Code Chat',
            body: 'App was moved to system tray. Click the tray icon to show it again.',
            silent: true
          }).show();
        }
      }
    }
  });

  // Handle window closed (when actually closing)
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

    // Claude process manager needs access to other managers (mainWindow will be set later)
    claudeProcessManager = new ClaudeProcessManager(
      sessionManager,
      checkpointManager,
      fileOperations,
      null // mainWindow will be set after createWindow()
    );

    // IPC handlers coordinate between all managers (mainWindow will be set later)
    ipcHandlers = new IPCHandlers(
      sessionManager,
      checkpointManager,
      fileOperations,
      modelConfig,
      claudeProcessManager,
      null // mainWindow will be set after createWindow()
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

    console.log('App initialization completed successfully');
  } catch (error) {
    console.error('Failed to initialize app:', error);
    throw error;
  }
}

// App event handlers
app.whenReady().then(async () => {
  await initializeApp();
  await createWindow();
  createTray();
});

app.on('window-all-closed', () => {
  // On macOS, keep app running in tray even when all windows are closed
  if (process.platform !== 'darwin') {
    // On other platforms, quit unless tray is active
    if (!tray) {
      app.quit();
    }
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await initializeApp();
    await createWindow();
  } else if (mainWindow) {
    // Show window if it exists but is hidden
    showWindow();
  }
});

// Handle app closing
app.on('before-quit', async (event) => {
  if (!isQuitting) {
    // Prevent immediate quit to allow cleanup
    event.preventDefault();
    isQuitting = true;

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

      // Destroy tray to clean up system resources
      if (tray && !tray.isDestroyed()) {
        tray.destroy();
      }

      // Now actually quit
      app.quit();
    } catch (error) {
      console.error('Error during cleanup:', error);
      // Force quit even if cleanup fails
      app.quit();
    }
  }
});