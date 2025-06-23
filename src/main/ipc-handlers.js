const { ipcMain } = require('electron');
const McpServerManager = require('./mcp-server-manager');

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
  }

  registerModelHandlers() {
    ipcMain.handle('get-current-model', async () => {
      return this.modelConfig.getCurrentModel();
    });

    ipcMain.handle('set-current-model', async (event, model) => {
      return await this.modelConfig.setCurrentModel(model);
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
}

module.exports = IPCHandlers;