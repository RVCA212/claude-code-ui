const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Setup and configuration
  checkSetup: () => ipcRenderer.invoke('check-setup'),
  setApiKey: (apiKey) => ipcRenderer.invoke('set-api-key', apiKey),
  
  // Session management
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  createSession: (title) => ipcRenderer.invoke('create-session', title),
  deleteSession: (sessionId) => ipcRenderer.invoke('delete-session', sessionId),
  updateSessionTitle: (sessionId, newTitle) => ipcRenderer.invoke('update-session-title', sessionId, newTitle),
  getSessionContext: (sessionId) => ipcRenderer.invoke('get-session-context', sessionId),
  resumeSession: (sessionId) => ipcRenderer.invoke('resume-session', sessionId),
  
  // Messaging
  sendMessage: (sessionId, message) => ipcRenderer.invoke('send-message', sessionId, message),
  stopMessage: (sessionId) => ipcRenderer.invoke('stop-message', sessionId),
  
  // File system operations
  getCurrentDirectory: () => ipcRenderer.invoke('get-current-directory'),
  readDirectory: (dirPath) => ipcRenderer.invoke('read-directory', dirPath),
  changeDirectory: (newPath) => ipcRenderer.invoke('change-directory', newPath),
  getParentDirectory: (currentPath) => ipcRenderer.invoke('get-parent-directory', currentPath),
  resolvePath: (inputPath) => ipcRenderer.invoke('resolve-path', inputPath),
  
  // Event listeners
  onSessionsLoaded: (callback) => ipcRenderer.on('sessions-loaded', callback),
  onMessageStream: (callback) => ipcRenderer.on('message-stream', callback),
  onSessionUpdated: (callback) => ipcRenderer.on('session-updated', callback),
  onSessionDeleted: (callback) => ipcRenderer.on('session-deleted', callback),
  onSessionCreated: (callback) => ipcRenderer.on('session-created', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});