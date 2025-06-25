const { ipcMain } = require('electron');
const McpServerManager = require('./mcp-server-manager');
const path = require('path');
const { exec } = require('child_process');

class IPCHandlers {
  constructor(sessionManager, checkpointManager, fileOperations, modelConfig, claudeProcessManager, mainWindow) {
    this.sessionManager = sessionManager;
    this.checkpointManager = checkpointManager;
    this.fileOperations = fileOperations;
    this.modelConfig = modelConfig;
    this.claudeProcessManager = claudeProcessManager;
    this.mainWindow = mainWindow;
  }

  // Register all IPC handlers
  registerHandlers() {
    // Setup and configuration handlers
    this.registerSetupHandlers();

    // Model management handlers
    this.registerModelHandlers();

    // MCP server management handlers
    this.registerMcpHandlers();

    // Session management handlers
    this.registerSessionHandlers();

    // Messaging handlers
    this.registerMessagingHandlers();

    // Checkpoint handlers
    this.registerCheckpointHandlers();

    // File system handlers
    this.registerFileSystemHandlers();

    // Workspace management handlers
    this.registerWorkspaceHandlers();

    // Excel file handlers
    this.registerExcelHandlers();

    // Photoshop file handlers
    this.registerPhotoshopHandlers();

    // Window handlers
    this.registerWindowHandlers();
  }

  registerSetupHandlers() {
    ipcMain.handle('check-setup', async () => {
      const cliAvailable = await this.claudeProcessManager.checkClaudeCliAvailable();
      const apiKeySet = this.claudeProcessManager.checkApiKey();

      return {
        cliAvailable,
        apiKeySet,
        canUseClaudeCode: cliAvailable && apiKeySet
      };
    });

    ipcMain.handle('set-api-key', async (event, apiKey) => {
      this.claudeProcessManager.setApiKey(apiKey);
      return await this.claudeProcessManager.verifyApiKey(apiKey);
    });

    ipcMain.handle('install-claude-cli', async () => {
      return new Promise((resolve) => {
        const command = 'npm install -g @anthropic-ai/claude-code';
        const platform = process.platform;

        let execCommand;
        if (platform === 'darwin') {
          // Open new Terminal window and run command
          execCommand = `osascript -e 'tell application "Terminal" to do script "${command}"' -e 'tell application "Terminal" to activate'`;
        } else if (platform === 'win32') {
          // Open new cmd window and run command
          execCommand = `start cmd.exe /K "${command}"`;
        } else { // Assuming linux
          // This is tricky as it depends on the installed terminal. x-terminal-emulator is a good generic bet on Debian-based systems.
          execCommand = `x-terminal-emulator -e "bash -c '${command}; exec bash'"`;
        }

        exec(execCommand, (error) => {
          if (error) {
            console.error(`exec error: ${error}`);
            // This error is for launching the terminal, not the command inside.
            resolve({ success: false, error: `Failed to open terminal: ${error.message}` });
            return;
          }
          // The command to open terminal was successful.
          // The actual npm install will run in the new terminal window.
          resolve({ success: true });
        });
      });
    });
  }

  registerModelHandlers() {
    ipcMain.handle('get-current-model', async () => {
      return this.modelConfig.getCurrentModel();
    });

    ipcMain.handle('set-current-model', async (event, model) => {
      return await this.modelConfig.setCurrentModel(model);
    });

    // Task template handlers
    ipcMain.handle('get-task-template', async () => {
      return this.modelConfig.getTaskTemplate();
    });

    ipcMain.handle('set-task-template', async (event, template) => {
      return await this.modelConfig.setTaskTemplate(template);
    });

    // System prompt handlers
    ipcMain.handle('get-system-prompt-config', async () => {
      return this.modelConfig.getSystemPromptConfig();
    });

    ipcMain.handle('set-system-prompt-config', async (event, config) => {
      return await this.modelConfig.setSystemPromptConfig(config);
    });

    // Window detection handlers
    ipcMain.handle('get-window-detection-settings', async () => {
      return this.modelConfig.getWindowDetectionSettings();
    });

    ipcMain.handle('set-window-detection-settings', async (event, settings) => {
      return await this.modelConfig.setWindowDetectionSettings(settings);
    });
  }

  registerMcpHandlers() {
    // Retrieve configured MCP servers
    ipcMain.handle('get-mcp-servers', async () => {
      return McpServerManager.getServers();
    });

    // Save or update a server configuration
    ipcMain.handle('save-mcp-server', async (event, serverConfig) => {
      try {
        const saved = McpServerManager.saveServer(serverConfig);
        McpServerManager.syncCli();
        return { success: true, server: saved };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Delete a server
    ipcMain.handle('delete-mcp-server', async (event, serverId) => {
      const success = McpServerManager.deleteServer(serverId);
      McpServerManager.syncCli();
      return { success };
    });

    // Enable/disable server
    ipcMain.handle('toggle-mcp-server', async (event, serverId, enabled) => {
      try {
        const server = McpServerManager.toggleServer(serverId, enabled);
        McpServerManager.syncCli();
        return { success: true, server };
      } catch (err) {
        return { success: false, error: err.message };
      }
    });

    // Test connectivity to server – basic fetch to URL (HEAD request)
    ipcMain.handle('test-mcp-server', async (event, serverConfig) => {
      const https = require('https');
      return new Promise((resolve) => {
        try {
          const req = https.request(serverConfig.url, { method: 'HEAD', timeout: 5000 }, (res) => {
            resolve({ success: true, statusCode: res.statusCode });
          });
          req.on('error', () => resolve({ success: false }));
          req.on('timeout', () => {
            req.destroy();
            resolve({ success: false, timeout: true });
          });
          req.end();
        } catch (err) {
          resolve({ success: false, error: err.message });
        }
      });
    });
  }

  registerSessionHandlers() {
    ipcMain.handle('get-sessions', async () => {
      return this.sessionManager.getSessions();
    });

    ipcMain.handle('create-session', async (event, title) => {
      const session = await this.sessionManager.createSession(title);

      // Notify frontend of new session
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-created', session);
      }

      return session;
    });

    ipcMain.handle('delete-session', async (event, sessionId) => {
      // Clean up any running Claude process for this session
      await this.claudeProcessManager.stopMessage(sessionId);

      const result = await this.sessionManager.deleteSession(sessionId);

      // Notify frontend
      if (this.mainWindow) {
        this.mainWindow.webContents.send('session-deleted', sessionId);
      }

      return result;
    });

    ipcMain.handle('update-session-title', async (event, sessionId, newTitle) => {
      return await this.sessionManager.updateSessionTitle(sessionId, newTitle);
    });

    ipcMain.handle('get-session-context', async (event, sessionId) => {
      return this.sessionManager.getSessionContext(sessionId);
    });

    // Session working directory management
    ipcMain.handle('set-session-cwd', async (event, sessionId, cwd) => {
      return await this.sessionManager.setSessionCwd(sessionId, cwd);
    });

    ipcMain.handle('get-session-cwd', async (event, sessionId) => {
      return this.sessionManager.getSessionCwd(sessionId);
    });

    ipcMain.handle('validate-session-cwd', async (event, sessionId) => {
      return await this.sessionManager.validateSessionCwd(sessionId);
    });

    ipcMain.handle('restore-session-cwd', async (event, sessionId) => {
      try {
        const sessionCwd = this.sessionManager.getSessionCwd(sessionId);
        if (!sessionCwd) {
          return { success: false, error: 'No working directory set for this session' };
        }

        // Validate the directory still exists
        const validation = await this.sessionManager.validateSessionCwd(sessionId);
        if (!validation.valid) {
          return { success: false, error: validation.reason };
        }

        // Update file operations working directory
        this.fileOperations.setCurrentWorkingDirectory(sessionCwd);

        // Get the directory contents to return to frontend
        const result = await this.fileOperations.getCurrentDirectory();

        console.log(`Restored working directory for session ${sessionId}: ${sessionCwd}`);

        return {
          success: true,
          path: sessionCwd,
          contents: result.contents || [],
          canGoBack: result.canGoBack || false,
          canGoForward: result.canGoForward || false
        };
      } catch (error) {
        console.error('Failed to restore session working directory:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('validate-send-directory', async (event, sessionId) => {
      try {
        const sessionCwd = this.sessionManager.getSessionCwd(sessionId);
        const currentCwd = this.fileOperations.getCurrentWorkingDirectory();

        if (!sessionCwd) {
          // No saved directory, allow send (new conversation)
          return {
            success: true,
            canSend: true,
            sessionCwd: null,
            currentCwd
          };
        }

        // Check if directories match
        const isMatch = sessionCwd === currentCwd;

        if (isMatch) {
          // Directories match, allow send
          return {
            success: true,
            canSend: true,
            sessionCwd,
            currentCwd
          };
        }

        // Directories don't match, check if original directory still exists
        const validation = await this.sessionManager.validateSessionCwd(sessionId);

        return {
          success: true,
          canSend: false,
          sessionCwd,
          currentCwd,
          originalDirectoryValid: validation.valid,
          mismatchReason: validation.valid ? 'directory_changed' : 'original_directory_missing'
        };
      } catch (error) {
        console.error('Failed to validate send directory:', error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle('clear-all-sessions', async () => {
      try {
        // Stop all running Claude processes
        await this.claudeProcessManager.stopAllMessages();

        // Clear all sessions
        const result = await this.sessionManager.clearAllSessions();

        // Notify frontend that all sessions were cleared
        if (result.success && this.mainWindow) {
          this.mainWindow.webContents.send('all-sessions-cleared', result.clearedCount);
        }

        return result;
      } catch (error) {
        console.error('Failed to clear all sessions:', error);
        return {
          success: false,
          error: error.message,
          clearedCount: 0
        };
      }
    });
  }

  registerMessagingHandlers() {
    ipcMain.handle('send-message', async (event, sessionId, message) => {
      return await this.claudeProcessManager.sendMessage(sessionId, message);
    });

    ipcMain.handle('stop-message', async (event, sessionId) => {
      return await this.claudeProcessManager.stopMessage(sessionId);
    });
  }

  registerCheckpointHandlers() {
    ipcMain.handle('revert-to-message', async (event, sessionId, messageId) => {
      try {
        console.log('Reverting session', sessionId, 'to message', messageId);
        const revertedFiles = await this.checkpointManager.revertToCheckpoint(sessionId, messageId);

        // Mark messages after the revert point as invalidated so the UI can dim them
        const session = this.sessionManager.getSession(sessionId);
        if (session && Array.isArray(session.messages)) {
          const messageIndex = session.messages.findIndex(m => m.id === messageId);
          if (messageIndex >= 0) {
            for (let i = messageIndex + 1; i < session.messages.length; i++) {
              session.messages[i].invalidated = true;
            }
            // Mark the session as having an active revert
            session.currentRevertMessageId = messageId;
            await this.sessionManager.saveSession(sessionId);
          }
        }

        return {
          success: true,
          revertedFiles,
          message: `Successfully reverted ${revertedFiles.length} files`
        };
      } catch (error) {
        console.error('Failed to revert to message:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });

    ipcMain.handle('unrevert-from-message', async (event, sessionId, messageId) => {
      try {
        console.log('Unreverting session', sessionId, 'from message', messageId);
        const restoredFiles = await this.checkpointManager.unrevertFromCheckpoint(sessionId, messageId);

        // Remove invalidated flags from messages after the revert point
        const session = this.sessionManager.getSession(sessionId);
        if (session && Array.isArray(session.messages)) {
          const messageIndex = session.messages.findIndex(m => m.id === messageId);
          if (messageIndex >= 0) {
            for (let i = messageIndex + 1; i < session.messages.length; i++) {
              delete session.messages[i].invalidated;
            }
            // Clear the current revert state
            delete session.currentRevertMessageId;
            await this.sessionManager.saveSession(sessionId);
          }
        }

        return {
          success: true,
          restoredFiles,
          message: `Successfully restored ${restoredFiles.length} files`
        };
      } catch (error) {
        console.error('Failed to unrevert from message:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });

    ipcMain.handle('get-message-checkpoints', async (event, sessionId, messageId) => {
      try {
        return await this.checkpointManager.getMessageCheckpoints(sessionId, messageId);
      } catch (error) {
        console.error('Failed to get checkpoints:', error);
        return [];
      }
    });

    ipcMain.handle('has-file-changes', async (event, sessionId, messageId) => {
      try {
        return await this.checkpointManager.hasFileChanges(sessionId, messageId);
      } catch (error) {
        console.error('Failed to check file changes:', error);
        return false;
      }
    });
  }

  registerFileSystemHandlers() {
    // Get directory contents
    ipcMain.handle('get-directory-contents', async (event, dirPath) => {
      return await this.fileOperations.getDirectoryContentsHandler(dirPath);
    });

    // Navigate to directory
    ipcMain.handle('navigate-to-directory', async (event, dirPath) => {
      return await this.fileOperations.navigateToDirectory(dirPath);
    });

    // Get current working directory
    ipcMain.handle('get-current-directory', async () => {
      return await this.fileOperations.getCurrentDirectory();
    });

    // Get user's home directory
    ipcMain.handle('get-home-directory', async () => {
      return this.fileOperations.getHomeDirectory();
    });

    // Get common directories
    ipcMain.handle('get-common-directories', async () => {
      return await this.fileOperations.getCommonDirectories();
    });

    // Navigate back in history
    ipcMain.handle('navigate-back', async () => {
      return await this.fileOperations.navigateBack();
    });

    // Navigate forward in history
    ipcMain.handle('navigate-forward', async () => {
      return await this.fileOperations.navigateForward();
    });

    // Navigate up one directory level
    ipcMain.handle('navigate-up', async () => {
      return await this.fileOperations.navigateUp();
    });

    // Set working directory from file path (navigates to parent directory)
    ipcMain.handle('set-working-directory-from-file', async (event, filePath) => {
      return await this.fileOperations.setWorkingDirectoryFromFile(filePath);
    });

    // File editor operations
    ipcMain.handle('read-file', async (event, filePath) => {
      return await this.fileOperations.readFile(filePath);
    });

    ipcMain.handle('write-file', async (event, filePath, content) => {
      return await this.fileOperations.writeFile(filePath, content);
    });

    ipcMain.handle('watch-file', async (event, filePath) => {
      const callback = (data) => {
        // Send file change notification to renderer
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('file-changed', data);
        }
      };
      return this.fileOperations.watchFile(filePath, callback);
    });

    ipcMain.handle('unwatch-file', async (event, filePath) => {
      return await this.fileOperations.unwatchFile(filePath);
    });

    // Search files by prefix recursively
    ipcMain.handle('search-files-by-prefix', async (event, query, maxResults = 50) => {
      return await this.fileOperations.searchFilesByPrefix(query, maxResults);
    });

    // Get directory contents without changing current working directory (for folder expansion)
    ipcMain.handle('get-directory-contents-only', async (event, dirPath) => {
      return await this.fileOperations.getDirectoryContentsOnly(dirPath);
    });

    // Window detection operations
    ipcMain.handle('get-open-application-windows', async () => {
      return await this.fileOperations.getOpenApplicationWindows();
    });

    ipcMain.handle('request-window-detection-permissions', async () => {
      return await this.fileOperations.requestWindowDetectionPermissions();
    });

    ipcMain.handle('clear-window-detection-cache', async () => {
      return this.fileOperations.clearWindowDetectionCache();
    });

    // Window detection debugging
    ipcMain.handle('set-window-detection-debug', async (event, enabled) => {
      return this.fileOperations.setWindowDetectionDebugMode(enabled);
    });

    ipcMain.handle('get-window-detection-diagnostics', async () => {
      return await this.fileOperations.getWindowDetectionDiagnostics();
    });

    ipcMain.handle('test-applescript', async () => {
      return await this.fileOperations.testAppleScript();
    });
  }

  // Session event notifications
  notifySessionUpdated(session) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('session-updated', session);
    }
  }

  // Send sessions loaded event
  sendSessionsLoaded(sessions) {
    if (this.mainWindow) {
      this.mainWindow.webContents.send('sessions-loaded', sessions);
    }
  }

  registerWorkspaceHandlers() {
    // Create a new workspace
    ipcMain.handle('create-workspace', async (event, name, folders) => {
      return await this.fileOperations.createWorkspace(name, folders);
    });

    // Get all workspaces
    ipcMain.handle('get-workspaces', async () => {
      return await this.fileOperations.getWorkspaces();
    });

    // Delete a workspace
    ipcMain.handle('delete-workspace', async (event, workspaceId) => {
      return await this.fileOperations.deleteWorkspace(workspaceId);
    });

    // Set active workspace
    ipcMain.handle('set-active-workspace', async (event, workspaceId) => {
      return await this.fileOperations.setActiveWorkspace(workspaceId);
    });

    // Get active workspace
    ipcMain.handle('get-active-workspace', async () => {
      return this.fileOperations.getActiveWorkspace();
    });

    // Clear active workspace
    ipcMain.handle('clear-active-workspace', async () => {
      return await this.fileOperations.clearActiveWorkspace();
    });

    // Get current workspace context
    ipcMain.handle('get-workspace-context', async () => {
      return this.fileOperations.getCurrentWorkspaceContext();
    });

    // Get workspace folders for navigation
    ipcMain.handle('get-workspace-folders', async () => {
      return this.fileOperations.getWorkspaceFolders();
    });
  }

  registerExcelHandlers() {
    const { shell } = require('electron');

    // Handle opening Excel files from tray menu
    ipcMain.handle('handle-tray-open-excel-file', async (event, filePath) => {
      try {
        console.log('Handling tray open Excel file:', filePath);

        const navResult = await this.fileOperations.setWorkingDirectoryFromFile(filePath);

        if (!navResult.success) {
          console.warn('Failed to navigate to Excel file directory:', navResult.error);
          return { success: false, error: navResult.error };
        }

        console.log('Navigated to directory:', navResult.path);

        // Return path info to renderer to update UI
        return {
          success: true,
          newCwd: navResult.path,
          filePath: filePath,
          relativePath: path.relative(navResult.path, filePath)
        };
      } catch (error) {
        console.error('Error handling tray open Excel file:', error);
        return { success: false, error: error.message };
      }
    });

    // Handle opening Excel files and loading into Claude Code Chat
    ipcMain.handle('open-excel-in-chat', async (event, filePath) => {
      try {
        console.log('Opening Excel file in Claude Code Chat:', filePath);

        // First, open the file in Excel
        await shell.openPath(filePath);

        // Then, add the file path to the current chat context
        // This could be used to automatically mention the file in the chat
        return {
          success: true,
          filePath: filePath,
          message: `Excel file opened: ${filePath}`
        };
      } catch (error) {
        console.error('Error opening Excel file in chat:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });

    // Get Excel files for the tray menu (helper for renderer)
    ipcMain.handle('get-excel-files', async () => {
      try {
        const result = await this.fileOperations.getOpenApplicationWindows();
        if (result.success) {
          const excelFiles = result.files.filter(f =>
            f.app === 'Excel' || f.appDisplayName === 'Excel'
          );
          return {
            success: true,
            files: excelFiles
          };
        }
        return result;
      } catch (error) {
        console.error('Error getting Excel files:', error);
        return {
          success: false,
          error: error.message,
          files: []
        };
      }
    });
  }

  registerPhotoshopHandlers() {
    const { shell } = require('electron');

    // Handle opening Photoshop files from tray menu
    ipcMain.handle('handle-tray-open-photoshop-file', async (event, filePath) => {
      try {
        console.log('Handling tray open Photoshop file:', filePath);

        const navResult = await this.fileOperations.setWorkingDirectoryFromFile(filePath);

        if (!navResult.success) {
          console.warn('Failed to navigate to Photoshop file directory:', navResult.error);
          return { success: false, error: navResult.error };
        }

        console.log('Navigated to directory:', navResult.path);

        // Return path info to renderer to update UI
        return {
          success: true,
          newCwd: navResult.path,
          filePath: filePath,
          relativePath: path.relative(navResult.path, filePath)
        };
      } catch (error) {
        console.error('Error handling tray open Photoshop file:', error);
        return { success: false, error: error.message };
      }
    });

    // Handle opening Photoshop files and loading into Claude Code Chat
    ipcMain.handle('open-photoshop-in-chat', async (event, filePath) => {
      try {
        console.log('Opening Photoshop file in Claude Code Chat:', filePath);

        // First, open the file in Photoshop
        await shell.openPath(filePath);

        // Then, add the file path to the current chat context
        // This could be used to automatically mention the file in the chat
        return {
          success: true,
          filePath: filePath,
          message: `Photoshop file opened: ${filePath}`
        };
      } catch (error) {
        console.error('Error opening Photoshop file in chat:', error);
        return {
          success: false,
          error: error.message
        };
      }
    });

    // Get Photoshop files for the tray menu (helper for renderer)
    ipcMain.handle('get-photoshop-files', async () => {
      try {
        const result = await this.fileOperations.getOpenApplicationWindows();
        if (result.success) {
          const photoshopFiles = result.files.filter(f =>
            f.app === 'Photoshop' || f.appDisplayName === 'Photoshop'
          );
          return {
            success: true,
            files: photoshopFiles
          };
        }
        return result;
      } catch (error) {
        console.error('Error getting Photoshop files:', error);
        return {
          success: false,
          error: error.message,
          files: []
        };
      }
    });
  }

  registerWindowHandlers() {
    ipcMain.handle('resize-window', (event, { width, height }) => {
      if (this.mainWindow) {
        const [currentWidth, currentHeight] = this.mainWindow.getSize();
        const newWidth = width || currentWidth;
        const newHeight = height || currentHeight;
        this.mainWindow.setSize(newWidth, newHeight, true);
      }
    });
  }
}

module.exports = IPCHandlers;