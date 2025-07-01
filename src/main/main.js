/*
 * Claude Code Chat - An Electron-based desktop application for Claude Code.
 * Copyright (C) 2024 Sean Sullivan
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * As a special exception, the copyright holders of this program give you
 * permission to link this program with files containing the following licenses:
 *
 * - MIT License
 * - Apache License, Version 2.0
 * - BSD 2-Clause "Simplified" License
 * - BSD 3-Clause "New" or "Revised" License
 * - ISC License
 *
 * and distribute linked combinations including the two. You must obey the
 * GNU General Public License in all respects for all of the code used other
 * than the parts mentioned above. If you modify this file, you may extend
 * this exception to your version of the file, but you are not obligated to
 * do so. If you do not wish to do so, delete this exception statement from
 * your version.
 */
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, globalShortcut } = require('electron');
const path = require('path');
require('fix-path')();

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
let isWindowLocked = false;

function createTray() {
  // Create tray icon - try different approaches for macOS compatibility
  let trayIcon;

  // First try to load a custom icon if it exists
  const iconPath = path.join(__dirname, '../../assets/tray-icon-small.png');
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
    const buildContextMenu = async () => {
      try {
        const openFilesResult = await fileOperations.getOpenApplicationWindows();
        let workspaceItems = [];
        let excelItems = [];
        let photoshopItems = [];
        let taskItems = [];

        // Get running tasks from Claude Process Manager
        const runningSessionIds = claudeProcessManager.getRunningSessionIds();
        if (runningSessionIds && runningSessionIds.length > 0) {
          taskItems = runningSessionIds.map(sessionId => {
            const session = sessionManager.getSession(sessionId);
            if (!session) return null;
            return {
              label: `🧠 ${session.title.length > 35 ? session.title.slice(0, 32) + '…' : session.title}`,
              click: () => {
                try {
                  if (mainWindow) {
                    showWindow();
                  }
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tray-select-session', session.id);
                  }
                } catch (e) {
                  console.error('Failed to handle task menu click:', e);
                }
              }
            };
          }).filter(Boolean);
        }

        if (openFilesResult.success && Array.isArray(openFilesResult.files)) {
          // Filter for workspaces (VS Code/Cursor projects)
          const workspaces = openFilesResult.files.filter(f => f.isWorkspace || f.isDirectory);
          const addedPaths = new Set();
          workspaceItems = workspaces.slice(0, 10).map(ws => {
            const workspacePath = ws.workspaceDirectory || ws.path || ws.directory;
            const displayName = ws.workspaceName || ws.name || path.basename(workspacePath);
            if (!workspacePath || addedPaths.has(workspacePath)) return null;
            addedPaths.add(workspacePath);
            return {
              label: displayName.length > 40 ? displayName.slice(0, 37) + '…' : displayName,
              click: () => {
                try {
                  if (mainWindow) {
                    showWindow();
                  }
                  // Send IPC to renderer to open the workspace
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tray-open-workspace', workspacePath);
                  }
                } catch (e) {
                  console.error('Failed to handle workspace menu click:', e);
                }
              }
            };
          }).filter(Boolean);

          // Filter for Excel files (both open and recent)
          const excelFiles = openFilesResult.files.filter(f =>
            f.app === 'Excel' || f.appDisplayName === 'Excel'
          );

          // Filter for Photoshop files (both open and recent)
          const photoshopFiles = openFilesResult.files.filter(f =>
            f.app === 'Photoshop' || f.appDisplayName === 'Photoshop'
          );

          const addedExcelPaths = new Set();
          excelItems = excelFiles.slice(0, 8).map(file => {
            if (!file.path || addedExcelPaths.has(file.path)) return null;
            addedExcelPaths.add(file.path);

            const displayName = file.name || path.basename(file.path);
            const statusIcon = file.isOpen ? '🟢' : '🕒'; // Green dot for open, clock for recent

            // Add size and date info for recent files
            let extraInfo = '';
            if (!file.isOpen && file.lastModified) {
              const date = new Date(file.lastModified);
              const timeAgo = getTimeAgo(date);
              extraInfo = ` (${timeAgo})`;
            }

            const label = `${statusIcon} ${displayName.length > 30 ? displayName.slice(0, 27) + '…' : displayName}${extraInfo}`;

            return {
              label: label,
              click: () => {
                try {
                  // Show the main window first (like workspace items do)
                  if (mainWindow) {
                    showWindow();
                  }
                  // Send IPC to open Excel file and navigate to its directory
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tray-open-excel-file', file.path);
                  }
                } catch (e) {
                  console.error('Failed to handle Excel file menu click:', e);
                }
              }
            };
          }).filter(Boolean);

          // Create Photoshop menu items
          const addedPhotoshopPaths = new Set();
          photoshopItems = photoshopFiles.slice(0, 8).map(file => {
            if (!file.path || addedPhotoshopPaths.has(file.path)) return null;
            addedPhotoshopPaths.add(file.path);

            const displayName = file.name || path.basename(file.path);
            const statusIcon = file.isOpen ? '🟢' : '🕒'; // Green dot for open, clock for recent

            // Add size and date info for recent files
            let extraInfo = '';
            if (!file.isOpen && file.lastModified) {
              const date = new Date(file.lastModified);
              const timeAgo = getTimeAgo(date);
              extraInfo = ` (${timeAgo})`;
            }

            const label = `${statusIcon} ${displayName.length > 30 ? displayName.slice(0, 27) + '…' : displayName}${extraInfo}`;

            return {
              label: label,
              click: () => {
                try {
                  // Show the main window first (like other items do)
                  if (mainWindow) {
                    showWindow();
                  }
                  // Send IPC to open Photoshop file and navigate to its directory
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('tray-open-photoshop-file', file.path);
                  }
                } catch (e) {
                  console.error('Failed to handle Photoshop file menu click:', e);
                }
              }
            };
          }).filter(Boolean);
        }

        const baseTemplate = [
          {
            label: 'Show Cloud Code',
            click: () => {
              showWindow();
            }
          },
          {
            label: 'Hide Cloud Code',
            click: () => {
              hideWindow();
            }
          },
          { type: 'separator' }
        ];

        // Add workspace items directly to the main menu
        if (workspaceItems.length > 0) {
          baseTemplate.push(...workspaceItems);
          baseTemplate.push({ type: 'separator' });
        }

        // Add running tasks section
        if (taskItems.length > 0) {
          baseTemplate.push({
            label: '🚀 Running Tasks',
            enabled: false // Header item
          });
          baseTemplate.push(...taskItems);
          baseTemplate.push({ type: 'separator' });
        }

        // Add Excel files section
        if (excelItems.length > 0) {
          baseTemplate.push({
            label: '📊 Excel Files',
            enabled: false // Header item
          });
          baseTemplate.push(...excelItems);
          baseTemplate.push({ type: 'separator' });
        }

        // Add Photoshop files section
        if (photoshopItems.length > 0) {
          baseTemplate.push({
            label: '🎨 Photoshop Images',
            enabled: false // Header item
          });
          baseTemplate.push(...photoshopItems);
          baseTemplate.push({ type: 'separator' });
        }

        baseTemplate.push(
          {
            label: 'About',
            click: () => {
              showAboutDialog();
            }
          },
          { type: 'separator' },
          {
            label: 'Quit',
            click: () => {
              isQuitting = true;
              app.quit();
            }
          }
        );

        const menu = Menu.buildFromTemplate(baseTemplate);
        tray.setContextMenu(menu);
      } catch (err) {
        console.error('Failed to build tray context menu:', err);
      }
    };

    // Initial build
    buildContextMenu();

    // Rebuild menu each time the tray icon is right-clicked (before menu shows)
    tray.on('right-click', async () => {
      await buildContextMenu();
      tray.popUpContextMenu();
    });

    // Also refresh menu every 60 seconds to keep workspace list up to date
    setInterval(buildContextMenu, 60000);

    tray.setToolTip('Cloud Code - Click to show/hide window');

    // Add some debugging info
    console.log('Tray properties:');
    console.log('  - Title:', tray.getTitle ? tray.getTitle() : 'N/A');
    console.log('  - ToolTip:', 'Cloud Code - Click to show/hide window');
    console.log('  - Destroyed:', tray.isDestroyed());

    // Handle tray click (double-click on macOS)
    tray.on('click', () => {
      console.log('Tray clicked');
      // Trigger window detection refresh
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('tray-interaction');
      }
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
      // Trigger window detection refresh
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('tray-interaction');
      }
      toggleWindow();
    });

    tray.on('right-click', () => {
      console.log('Tray right-clicked');
      // Trigger window detection refresh for context menu
      if (mainWindow && mainWindow.webContents) {
        mainWindow.webContents.send('tray-interaction');
      }
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

    // Trigger window detection refresh when window is shown
    if (mainWindow.webContents) {
      mainWindow.webContents.send('tray-interaction');
    }

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

function getTimeAgo(date) {
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) {
    return `${diffMins}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}

function showAboutDialog() {
  const { dialog } = require('electron');
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'About Cloud Code',
    message: 'Cloud Code',
    detail: 'An Electron app for chatting with Claude Code SDK\n\nVersion: 1.0.0',
    buttons: ['OK']
  });
}

async function registerGlobalShortcut() {
  try {
    // Get the configured shortcut from settings
    const currentShortcut = await modelConfig.getGlobalShortcut();
    const shortcut = currentShortcut || 'CommandOrControl+Shift+C';

    // Unregister any existing shortcuts first
    globalShortcut.unregisterAll();

    const isRegistered = globalShortcut.register(shortcut, () => {
      console.log('Global shortcut triggered:', shortcut);
      toggleWindow();
    });

    if (isRegistered) {
      console.log(`✅ Global shortcut ${shortcut} registered successfully`);
    } else {
      console.error(`❌ Failed to register global shortcut ${shortcut}`);
      console.log('The shortcut may already be in use by another application');
    }

    return { success: isRegistered, shortcut };
  } catch (error) {
    console.error('Error registering global shortcut:', error);
    return { success: false, error: error.message };
  }
}

async function createWindow() {
  // Set dock icon for macOS
  if (process.platform === 'darwin') {
    const iconPath = path.join(__dirname, '../../assets/icon-large.png');
    const image = nativeImage.createFromPath(iconPath);
    if (!image.isEmpty()) {
      app.dock.setIcon(image);
    }
  }

  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 650,
    height: 450,
    minWidth: 450,
    minHeight: 150,
    icon: path.join(__dirname, '../../assets/icon-large.png'),
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

  // Handle window blur to hide window when not locked
  mainWindow.on('blur', () => {
    // Keep window visible when it loses focus.
    // Still ignore blur events from dev-tools.
    if (mainWindow.webContents.isDevToolsFocused()) {
      return;
    }

    // Previous behaviour hid the window when unlocked; we now leave it visible so
    // other apps can simply appear in front. Locked mode remains unaffected.
    // (If in future we need an auto-hide preference, handle it here.)
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
            title: 'Cloud Code',
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
    checkpointManager = new CheckpointManager(app); // Pass app object for pathing
    modelConfig = new ModelConfig();
    fileOperations = new FileOperations(modelConfig);

    // Claude process manager needs access to other managers (mainWindow will be set later)
    claudeProcessManager = new ClaudeProcessManager(
      sessionManager,
      checkpointManager,
      fileOperations,
      null, // mainWindow will be set after createWindow()
      modelConfig
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

  // Register IPC handlers before creating the window to prevent race conditions
  // where the renderer process calls them on startup before they are registered.
  ipcMain.handle('set-window-lock', (event, locked) => {
    isWindowLocked = locked;
    if (mainWindow) {
      if (locked) {
        // Use a higher Always-On-Top level so the window stays above  all others
        const level = process.platform === 'win32' ? 'screen-saver' : 'floating';
        mainWindow.setAlwaysOnTop(true, level);
        // Ensure the window follows the user across Spaces / virtual desktops
        mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } else {
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setVisibleOnAllWorkspaces(false);
      }
    }
  });

  // Global shortcut IPC handlers
  ipcMain.handle('get-global-shortcut', async () => {
    try {
      return await modelConfig.getGlobalShortcut();
    } catch (error) {
      console.error('Failed to get global shortcut:', error);
      return 'CommandOrControl+Shift+C'; // Default fallback
    }
  });

  ipcMain.handle('set-global-shortcut', async (event, shortcut) => {
    try {
      // Save the shortcut setting
      await modelConfig.setGlobalShortcut(shortcut);

      // Re-register the shortcut
      const result = await registerGlobalShortcut();

      return result;
    } catch (error) {
      console.error('Failed to set global shortcut:', error);
      return { success: false, error: error.message };
    }
  });

  await createWindow();
  createTray();

  // Register configurable global keyboard shortcut
  await registerGlobalShortcut();
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
      // Unregister all global shortcuts
      globalShortcut.unregisterAll();
      console.log('Global shortcuts unregistered');

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