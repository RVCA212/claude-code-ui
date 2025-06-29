const { contextBridge, ipcRenderer } = require('electron');

// Secure API bridge that exposes only necessary functionality to the renderer
class PreloadBridge {
  constructor() {
    this.exposedAPI = {
      // Setup and configuration
      checkSetup: () => ipcRenderer.invoke('check-setup'),
      setApiKey: (apiKey) => ipcRenderer.invoke('set-api-key', apiKey),

      // Model management
      getCurrentModel: () => ipcRenderer.invoke('get-current-model'),
      setCurrentModel: (model) => ipcRenderer.invoke('set-current-model', model),

      // Task template management
      getTaskTemplate: () => ipcRenderer.invoke('get-task-template'),
      setTaskTemplate: (template) => ipcRenderer.invoke('set-task-template', template),

      // System Prompt management
      getSystemPromptConfig: () => ipcRenderer.invoke('get-system-prompt-config'),
      setSystemPromptConfig: (config) => ipcRenderer.invoke('set-system-prompt-config', config),

      // Window detection settings
      getWindowDetectionSettings: () => ipcRenderer.invoke('get-window-detection-settings'),
      setWindowDetectionSettings: (settings) => ipcRenderer.invoke('set-window-detection-settings', settings),

      // Global shortcut management
      getGlobalShortcut: () => ipcRenderer.invoke('get-global-shortcut'),
      setGlobalShortcut: (shortcut) => ipcRenderer.invoke('set-global-shortcut', shortcut),

      // Session management
      getSessions: () => ipcRenderer.invoke('get-sessions'),
      createSession: (title) => ipcRenderer.invoke('create-session', title),
      deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),
      clearAllSessions: () => ipcRenderer.invoke('clear-all-sessions'),
      updateSessionTitle: (sessionId, newTitle) => ipcRenderer.invoke('update-session-title', sessionId, newTitle),
      getSessionContext: (sessionId) => ipcRenderer.invoke('get-session-context', sessionId),

      // Session working directory management
      setSessionCwd: (sessionId, cwd) => ipcRenderer.invoke('set-session-cwd', sessionId, cwd),
      getSessionCwd: (sessionId) => ipcRenderer.invoke('get-session-cwd', sessionId),
      validateSessionCwd: (sessionId) => ipcRenderer.invoke('validate-session-cwd', sessionId),
      restoreSessionCwd: (sessionId) => ipcRenderer.invoke('restore-session-cwd', sessionId),
      validateSendDirectory: (sessionId) => ipcRenderer.invoke('validate-send-directory', sessionId),

      // Messaging
      sendMessage: (sessionId, message) => ipcRenderer.invoke('send-message', sessionId, message),
      stopMessage: (sessionId) => ipcRenderer.invoke('stop-message', sessionId),
      getRunningTasks: () => ipcRenderer.invoke('get-running-tasks'),

      // Checkpointing
      revertToMessage: (sessionId, messageId) => ipcRenderer.invoke('revert-to-message', sessionId, messageId),
      unrevertFromMessage: (sessionId, messageId) => ipcRenderer.invoke('unrevert-from-message', sessionId, messageId),
      getMessageCheckpoints: (sessionId, messageId) => ipcRenderer.invoke('get-message-checkpoints', sessionId, messageId),
      hasFileChanges: (sessionId, messageId) => ipcRenderer.invoke('has-file-changes', sessionId, messageId),
      getAllCheckpointsForSession: (sessionId) => ipcRenderer.invoke('get-all-checkpoints-for-session', sessionId),
      getSessionStatistics: (sessionId) => ipcRenderer.invoke('get-session-statistics', sessionId),
      validateCheckpointSession: (sessionId) => ipcRenderer.invoke('validate-checkpoint-session', sessionId),

      // File system & working directory operations
      getDirectoryContents: (dirPath) => ipcRenderer.invoke('get-directory-contents', dirPath),
      navigateToDirectory: (dirPath) => ipcRenderer.invoke('navigate-to-directory', dirPath),
      getCurrentDirectory: () => ipcRenderer.invoke('get-current-directory'),
      getHomeDirectory: () => ipcRenderer.invoke('get-home-directory'),
      getCommonDirectories: () => ipcRenderer.invoke('get-common-directories'),
      navigateBack: () => ipcRenderer.invoke('navigate-back'),
      navigateForward: () => ipcRenderer.invoke('navigate-forward'),
      navigateUp: () => ipcRenderer.invoke('navigate-up'),
      setWorkingDirectoryFromFile: (filePath) => ipcRenderer.invoke('set-working-directory-from-file', filePath),

      // File editor operations
      readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
      writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),
      watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
      unwatchFile: (filePath) => ipcRenderer.invoke('unwatch-file', filePath),

      // Directory watching operations
      watchDirectory: (dirPath) => ipcRenderer.invoke('watch-directory', dirPath),
      unwatchDirectory: (dirPath) => ipcRenderer.invoke('unwatch-directory', dirPath),

      // File search operations
      searchFilesByPrefix: (query, maxResults) => ipcRenderer.invoke('search-files-by-prefix', query, maxResults),
      getDirectoryContentsOnly: (dirPath) => ipcRenderer.invoke('get-directory-contents-only', dirPath),

      // Workspace management operations
      createWorkspace: (name, folders) => ipcRenderer.invoke('create-workspace', name, folders),
      getWorkspaces: () => ipcRenderer.invoke('get-workspaces'),
      deleteWorkspace: (workspaceId) => ipcRenderer.invoke('delete-workspace', workspaceId),
      setActiveWorkspace: (workspaceId) => ipcRenderer.invoke('set-active-workspace', workspaceId),
      getActiveWorkspace: () => ipcRenderer.invoke('get-active-workspace'),
      clearActiveWorkspace: () => ipcRenderer.invoke('clear-active-workspace'),
      getWorkspaceContext: () => ipcRenderer.invoke('get-workspace-context'),
      getWorkspaceFolders: () => ipcRenderer.invoke('get-workspace-folders'),

      // Window detection operations
      getOpenApplicationWindows: () => ipcRenderer.invoke('get-open-application-windows'),
      requestWindowDetectionPermissions: () => ipcRenderer.invoke('request-window-detection-permissions'),
      enableWindowDetectionWithPermissions: () => ipcRenderer.invoke('enable-window-detection-with-permissions'),
      getWindowDetectionPermissionStatus: () => ipcRenderer.invoke('get-window-detection-permission-status'),
      clearWindowDetectionCache: () => ipcRenderer.invoke('clear-window-detection-cache'),

      // Window detection debugging
      setWindowDetectionDebug: (enabled) => ipcRenderer.invoke('set-window-detection-debug', enabled),
      getWindowDetectionDiagnostics: () => ipcRenderer.invoke('get-window-detection-diagnostics'),
      testAppleScript: () => ipcRenderer.invoke('test-applescript'),

      // MCP server management
      getMcpServers: () => ipcRenderer.invoke('get-mcp-servers'),
      saveMcpServer: (server) => ipcRenderer.invoke('save-mcp-server', server),
      deleteMcpServer: (serverId) => ipcRenderer.invoke('delete-mcp-server', serverId),
      toggleMcpServer: (serverId, enabled) => ipcRenderer.invoke('toggle-mcp-server', serverId, enabled),
      testMcpServer: (server) => ipcRenderer.invoke('test-mcp-server', server),

      // Window lock
      setWindowLock: (locked) => ipcRenderer.invoke('set-window-lock', locked),

      // Event listeners
      onSessionsLoaded: (callback) => ipcRenderer.on('sessions-loaded', callback),
      onMessageStream: (callback) => ipcRenderer.on('message-stream', callback),
      onUserMessageSaved: (callback) => ipcRenderer.on('user-message-saved', callback),
      onSessionUpdated: (callback) => ipcRenderer.on('session-updated', callback),
      onSessionDeleted: (callback) => ipcRenderer.on('session-deleted', callback),
      onSessionCreated: (callback) => ipcRenderer.on('session-created', callback),
      onAllSessionsCleared: (callback) => ipcRenderer.on('all-sessions-cleared', callback),
      onFileChanged: (callback) => ipcRenderer.on('file-changed', callback),
      onDirectoryChanged: (callback) => ipcRenderer.on('directory-changed', callback),

      // Tray events
      onTrayOpenWorkspace: (callback) => ipcRenderer.on('tray-open-workspace', callback),
      onTrayOpenExcelFile: (callback) => ipcRenderer.on('tray-open-excel-file', callback),
      onTrayOpenPhotoshopFile: (callback) => ipcRenderer.on('tray-open-photoshop-file', callback),
      onTrayInteraction: (callback) => ipcRenderer.on('tray-interaction', callback),
      onTraySelectSession: (callback) => ipcRenderer.on('tray-select-session', callback),

      // Excel helpers
      handleTrayOpenExcelFile: (filePath) => ipcRenderer.invoke('handle-tray-open-excel-file', filePath),

      // Photoshop helpers
      handleTrayOpenPhotoshopFile: (filePath) => ipcRenderer.invoke('handle-tray-open-photoshop-file', filePath),

      // Window resizing
      resizeWindow: ({ width, height }) => ipcRenderer.invoke('resize-window', { width, height }),

      // Remove listeners
      removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

      // New CLI installer
      installClaudeCli: () => ipcRenderer.invoke('install-claude-cli')
    };
  }

  // Expose the API to the renderer process
  exposeAPI() {
    contextBridge.exposeInMainWorld('electronAPI', this.exposedAPI);
  }

  // Validate API methods (development helper)
  validateAPI() {
    const requiredMethods = [
      'checkSetup', 'setApiKey', 'getCurrentModel', 'setCurrentModel', 'getTaskTemplate', 'setTaskTemplate',
      'getSystemPromptConfig', 'setSystemPromptConfig',
      'getSessions', 'createSession', 'deleteSession', 'clearAllSessions', 'updateSessionTitle', 'getSessionContext',
      'setSessionCwd', 'getSessionCwd', 'validateSessionCwd', 'restoreSessionCwd', 'validateSendDirectory',
      'sendMessage', 'stopMessage',
      'revertToMessage', 'unrevertFromMessage', 'getMessageCheckpoints', 'hasFileChanges', 'getAllCheckpointsForSession',
      'getDirectoryContents', 'navigateToDirectory', 'getCurrentDirectory', 'getHomeDirectory',
      'getCommonDirectories', 'navigateBack', 'navigateForward', 'navigateUp',
      'setWorkingDirectoryFromFile', 'readFile', 'writeFile', 'watchFile', 'unwatchFile',
      'searchFilesByPrefix', 'getDirectoryContentsOnly',
      'createWorkspace', 'getWorkspaces', 'deleteWorkspace', 'setActiveWorkspace', 'getActiveWorkspace', 'clearActiveWorkspace', 'getWorkspaceContext', 'getWorkspaceFolders',
      'getOpenApplicationWindows', 'requestWindowDetectionPermissions', 'enableWindowDetectionWithPermissions', 'getWindowDetectionPermissionStatus', 'clearWindowDetectionCache',
      'setWindowDetectionDebug', 'getWindowDetectionDiagnostics', 'testAppleScript',
      'getMcpServers', 'saveMcpServer', 'deleteMcpServer', 'toggleMcpServer', 'testMcpServer',
      'onSessionsLoaded', 'onMessageStream', 'onUserMessageSaved', 'onSessionUpdated', 'onSessionDeleted', 'onSessionCreated', 'onAllSessionsCleared',
      'onFileChanged', 'onTrayOpenWorkspace', 'onTrayOpenExcelFile', 'onTrayOpenPhotoshopFile', 'onTrayInteraction',
      'handleTrayOpenExcelFile', 'handleTrayOpenPhotoshopFile', 'removeAllListeners', 'resizeWindow'
    ];

    const updatedRequiredMethods = [...requiredMethods, 'onTraySelectSession', 'setWindowLock', 'watchDirectory', 'unwatchDirectory', 'onDirectoryChanged', 'getSessionStatistics', 'validateCheckpointSession', 'onUserMessageSaved'];

    const exposedMethods = Object.keys(this.exposedAPI);
    const missingMethods = updatedRequiredMethods.filter(method => !exposedMethods.includes(method));
    const extraMethods = exposedMethods.filter(method => !updatedRequiredMethods.includes(method));

    if (missingMethods.length > 0) {
      console.warn('Missing API methods:', missingMethods);
    }

    if (extraMethods.length > 0) {
      console.warn('Extra API methods (may be intentional):', extraMethods);
    }

    console.log(`API validation: ${exposedMethods.length} methods exposed`);
  }
}

module.exports = PreloadBridge;