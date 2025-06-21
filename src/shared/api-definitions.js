// Shared API definitions for type safety and consistency
// This file defines the structure of the electronAPI exposed to the renderer

const API_DEFINITIONS = {
  // Setup and configuration
  setup: {
    checkSetup: () => {},
    setApiKey: (apiKey) => {}
  },

  // Model management
  model: {
    getCurrentModel: () => {},
    setCurrentModel: (model) => {}
  },

  // Session management
  sessions: {
    getSessions: () => {},
    createSession: (title) => {},
    deleteSession: (sessionId) => {},
    updateSessionTitle: (sessionId, newTitle) => {},
    getSessionContext: (sessionId) => {}
  },

  // Messaging
  messaging: {
    sendMessage: (sessionId, message) => {},
    stopMessage: (sessionId) => {}
  },

  // Checkpointing
  checkpoints: {
    revertToMessage: (sessionId, messageId) => {},
    unrevertFromMessage: (sessionId, messageId) => {},
    getMessageCheckpoints: (sessionId, messageId) => {},
    hasFileChanges: (sessionId, messageId) => {}
  },

  // File system & working directory operations
  fileSystem: {
    getDirectoryContents: (dirPath) => {},
    navigateToDirectory: (dirPath) => {},
    getCurrentDirectory: () => {},
    getHomeDirectory: () => {},
    getCommonDirectories: () => {},
    navigateBack: () => {},
    navigateForward: () => {},
    navigateUp: () => {}
  },

  // Event listeners
  events: {
    onSessionsLoaded: (callback) => {},
    onMessageStream: (callback) => {},
    onSessionUpdated: (callback) => {},
    onSessionDeleted: (callback) => {},
    onSessionCreated: (callback) => {},
    removeAllListeners: (channel) => {}
  }
};

module.exports = API_DEFINITIONS;