const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
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
  // resumeSession removed - now handled automatically in sendMessage

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

  // Event listeners
  onSessionsLoaded: (callback) => ipcRenderer.on('sessions-loaded', callback),
  onMessageStream: (callback) => ipcRenderer.on('message-stream', callback),
  onSessionUpdated: (callback) => ipcRenderer.on('session-updated', callback),
  onSessionDeleted: (callback) => ipcRenderer.on('session-deleted', callback),
  onSessionCreated: (callback) => ipcRenderer.on('session-created', callback),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});