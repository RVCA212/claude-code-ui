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

      // Session management
      getSessions: () => ipcRenderer.invoke('get-sessions'),
      createSession: (title) => ipcRenderer.invoke('create-session', title),
      deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),
      updateSessionTitle: (sessionId, newTitle) => ipcRenderer.invoke('update-session-title', sessionId, newTitle),
      getSessionContext: (sessionId) => ipcRenderer.invoke('get-session-context', sessionId),

      // Messaging
      sendMessage: (sessionId, message) => ipcRenderer.invoke('send-message', sessionId, message),
      stopMessage: (sessionId) => ipcRenderer.invoke('stop-message', sessionId),

      // Checkpointing
      revertToMessage: (sessionId, messageId) => ipcRenderer.invoke('revert-to-message', sessionId, messageId),
      unrevertFromMessage: (sessionId, messageId) => ipcRenderer.invoke('unrevert-from-message', sessionId, messageId),
      getMessageCheckpoints: (sessionId, messageId) => ipcRenderer.invoke('get-message-checkpoints', sessionId, messageId),
      hasFileChanges: (sessionId, messageId) => ipcRenderer.invoke('has-file-changes', sessionId, messageId),

      // File system & working directory operations
      getDirectoryContents: (dirPath) => ipcRenderer.invoke('get-directory-contents', dirPath),
      navigateToDirectory: (dirPath) => ipcRenderer.invoke('navigate-to-directory', dirPath),
      getCurrentDirectory: () => ipcRenderer.invoke('get-current-directory'),
      getHomeDirectory: () => ipcRenderer.invoke('get-home-directory'),
      getCommonDirectories: () => ipcRenderer.invoke('get-common-directories'),
      navigateBack: () => ipcRenderer.invoke('navigate-back'),
      navigateForward: () => ipcRenderer.invoke('navigate-forward'),
      navigateUp: () => ipcRenderer.invoke('navigate-up'),

      // MCP server management
      getMcpServers: () => ipcRenderer.invoke('get-mcp-servers'),
      saveMcpServer: (server) => ipcRenderer.invoke('save-mcp-server', server),
      deleteMcpServer: (serverId) => ipcRenderer.invoke('delete-mcp-server', serverId),
      toggleMcpServer: (serverId, enabled) => ipcRenderer.invoke('toggle-mcp-server', serverId, enabled),
      testMcpServer: (server) => ipcRenderer.invoke('test-mcp-server', server),

      // Event listeners
      onSessionsLoaded: (callback) => ipcRenderer.on('sessions-loaded', callback),
      onMessageStream: (callback) => ipcRenderer.on('message-stream', callback),
      onSessionUpdated: (callback) => ipcRenderer.on('session-updated', callback),
      onSessionDeleted: (callback) => ipcRenderer.on('session-deleted', callback),
      onSessionCreated: (callback) => ipcRenderer.on('session-created', callback),

      // Remove listeners
      removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
    };
  }

  // Expose the API to the renderer process
  exposeAPI() {
    contextBridge.exposeInMainWorld('electronAPI', this.exposedAPI);
  }

  // Validate API methods (development helper)
  validateAPI() {
    const requiredMethods = [
      'checkSetup', 'setApiKey', 'getCurrentModel', 'setCurrentModel',
      'getSessions', 'createSession', 'deleteSession', 'updateSessionTitle', 'getSessionContext',
      'sendMessage', 'stopMessage',
      'revertToMessage', 'unrevertFromMessage', 'getMessageCheckpoints', 'hasFileChanges',
      'getDirectoryContents', 'navigateToDirectory', 'getCurrentDirectory', 'getHomeDirectory',
      'getCommonDirectories', 'navigateBack', 'navigateForward', 'navigateUp',
      'getMcpServers', 'saveMcpServer', 'deleteMcpServer', 'toggleMcpServer', 'testMcpServer',
      'onSessionsLoaded', 'onMessageStream', 'onSessionUpdated', 'onSessionDeleted', 'onSessionCreated',
      'removeAllListeners'
    ];

    const exposedMethods = Object.keys(this.exposedAPI);
    const missingMethods = requiredMethods.filter(method => !exposedMethods.includes(method));
    const extraMethods = exposedMethods.filter(method => !requiredMethods.includes(method));

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