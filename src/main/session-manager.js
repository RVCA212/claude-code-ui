const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');

class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.sessionStoragePath = path.join(os.homedir(), '.claude-code-chat', 'sessions.json');
    this.recoveryStatePath = path.join(os.homedir(), '.claude-code-chat', 'recovery.json');
  }

  // Load sessions from storage
  async loadSessions() {
    try {
      const dir = path.dirname(this.sessionStoragePath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.sessionStoragePath, 'utf8');
      const sessionData = JSON.parse(data);

      this.sessions.clear();
      sessionData.forEach(session => {
        // Ensure sessions have all required fields
        const normalizedSession = {
          id: session.id,
          title: session.title || 'Untitled Conversation',
          messages: session.messages || [],
          createdAt: session.createdAt || new Date().toISOString(),
          updatedAt: session.updatedAt || new Date().toISOString(),
          claudeSessionId: session.claudeSessionId || null,
          lastActivity: session.lastActivity || session.updatedAt || new Date().toISOString(),
          status: session.status || 'active', // active, historical, archived
          lastUserMessage: session.lastUserMessage || null,
          lastAssistantMessage: session.lastAssistantMessage || null,
          cwd: session.cwd || null, // Working directory where the conversation took place
          workspaceId: session.workspaceId || null, // ID of the workspace this session belongs to
          workspaceName: session.workspaceName || null // Name of the workspace for quick reference
        };
        this.sessions.set(session.id, normalizedSession);
      });

      console.log(`Loaded ${this.sessions.size} sessions from storage`);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty sessions
      console.log('No existing sessions found, starting fresh');
    }
  }

  // Atomic session save with backup
  async saveSessions() {
    try {
      const dir = path.dirname(this.sessionStoragePath);
      await fs.mkdir(dir, { recursive: true });

      const sessionData = Array.from(this.sessions.values());
      const tempPath = this.sessionStoragePath + '.tmp';
      const backupPath = this.sessionStoragePath + '.backup';

      // Write to temporary file first
      await fs.writeFile(tempPath, JSON.stringify(sessionData, null, 2));

      // Create backup of existing file if it exists
      try {
        await fs.access(this.sessionStoragePath);
        await fs.copyFile(this.sessionStoragePath, backupPath);
      } catch (err) {
        // Original file doesn't exist, that's fine
      }

      // Atomically move temp file to final location
      await fs.rename(tempPath, this.sessionStoragePath);

      console.log(`Saved ${sessionData.length} sessions to storage`);
    } catch (error) {
      console.error('Failed to save sessions:', error);
      throw error; // Re-throw to allow callers to handle
    }
  }

  // Save individual session immediately
  async saveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Update last activity timestamp
    session.lastActivity = new Date().toISOString();
    session.updatedAt = new Date().toISOString();

    // Save all sessions (could be optimized to save just this session in the future)
    await this.saveSessions();

    return session;
  }

  // Add message to session and save immediately
  async addMessageToSession(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Ensure message has required fields
    const normalizedMessage = {
      id: message.id || uuidv4(),
      type: message.type || 'user',
      content: message.content || '',
      timestamp: message.timestamp || new Date().toISOString(),
      ...message // Allow additional fields
    };

    session.messages.push(normalizedMessage);
    await this.saveSession(sessionId);

    return normalizedMessage;
  }

  // Update message in session and save immediately
  async updateMessageInSession(sessionId, messageId, updates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const messageIndex = session.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) {
      throw new Error('Message not found');
    }

    // Update message
    session.messages[messageIndex] = {
      ...session.messages[messageIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.saveSession(sessionId);

    return session.messages[messageIndex];
  }

  // Create new session
  async createSession(title) {
    const sessionId = uuidv4();
    const now = new Date().toISOString();
    const session = {
      id: sessionId,
      title: title || 'New Conversation',
      messages: [],
      createdAt: now,
      updatedAt: now,
      lastActivity: now,
      claudeSessionId: null, // Will be set when first message is sent
      status: 'active',
      lastUserMessage: null,
      lastAssistantMessage: null,
      cwd: null // Will be set when first message is sent
    };

    this.sessions.set(sessionId, session);
    await this.saveSession(sessionId);

    return session;
  }

  // Delete session
  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    this.sessions.delete(sessionId);
    await this.saveSessions();

    return true;
  }

  // Update session title
  async updateSessionTitle(sessionId, newTitle) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.title = newTitle;
      await this.saveSession(sessionId);
      return session;
    }
    throw new Error('Session not found');
  }

  // Set the working directory for a session (called when first message is sent)
  async setSessionCwd(sessionId, cwd) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Only set cwd if it hasn't been set before (first message only)
    if (!session.cwd) {
      session.cwd = cwd;
      await this.saveSession(sessionId);
      console.log(`Set working directory for session ${sessionId}: ${cwd}`);
    }

    return session;
  }

  // Get the working directory for a session
  getSessionCwd(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.cwd : null;
  }

  // Validate that a session's working directory still exists
  async validateSessionCwd(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.cwd) {
      return { valid: false, reason: 'No working directory set' };
    }

    try {
      const stats = await fs.stat(session.cwd);
      if (!stats.isDirectory()) {
        return { valid: false, reason: 'Path is not a directory' };
      }
      return { valid: true, path: session.cwd };
    } catch (error) {
      return { valid: false, reason: `Directory does not exist: ${error.message}` };
    }
  }

  // Get session context
  getSessionContext(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return {
      ...session,
      statusInfo: this.getSessionStatusInfo(session),
      conversationPreview: {
        lastUserMessage: session.lastUserMessage,
        lastAssistantMessage: session.lastAssistantMessage ?
          session.lastAssistantMessage.substring(0, 200) + (session.lastAssistantMessage.length > 200 ? '...' : '') :
          null
      },
      cwdInfo: {
        path: session.cwd,
        hasWorkingDirectory: !!session.cwd
      }
    };
  }

  // Get all sessions
  getSessions() {
    const sessionList = Array.from(this.sessions.values());
    // Add status information to each session
    return sessionList.map(session => ({
      ...session,
      statusInfo: this.getSessionStatusInfo(session)
    }));
  }

  // Get session by ID
  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  // Helper function to determine if a session can be resumed
  canResumeSession(session) {
    return session.claudeSessionId &&
           (session.status === 'active' || session.status === 'historical') &&
           session.messages && session.messages.length > 0;
  }

  // Helper function to get session status info
  getSessionStatusInfo(session) {
    return {
      canResume: this.canResumeSession(session),
      status: session.status || 'active',
      lastUserMessage: session.lastUserMessage,
      lastAssistantMessage: session.lastAssistantMessage,
      messageCount: session.messages ? session.messages.length : 0,
      lastActivity: session.lastActivity || session.updatedAt,
      hasWorkingDirectory: !!session.cwd,
      workingDirectory: session.cwd
    };
  }

  // Recovery state management
  async saveRecoveryState(sessionId, state) {
    try {
      const dir = path.dirname(this.recoveryStatePath);
      await fs.mkdir(dir, { recursive: true });

      let recoveryData = {};
      try {
        const existing = await fs.readFile(this.recoveryStatePath, 'utf8');
        recoveryData = JSON.parse(existing);
      } catch (err) {
        // File doesn't exist, start fresh
      }

      recoveryData[sessionId] = {
        ...state,
        timestamp: new Date().toISOString()
      };

      await fs.writeFile(this.recoveryStatePath, JSON.stringify(recoveryData, null, 2));
      console.log('Recovery state saved for session:', sessionId);
    } catch (error) {
      console.error('Failed to save recovery state:', error);
    }
  }

  async clearRecoveryState(sessionId) {
    try {
      const data = await fs.readFile(this.recoveryStatePath, 'utf8');
      const recoveryData = JSON.parse(data);

      delete recoveryData[sessionId];

      await fs.writeFile(this.recoveryStatePath, JSON.stringify(recoveryData, null, 2));
      console.log('Recovery state cleared for session:', sessionId);
    } catch (error) {
      // File doesn't exist or other error, which is fine
      console.log('No recovery state to clear for session:', sessionId);
    }
  }

  async recoverInterruptedSessions() {
    try {
      const data = await fs.readFile(this.recoveryStatePath, 'utf8');
      const recoveryData = JSON.parse(data);

      const now = new Date();
      const recoveredSessions = [];

      for (const [sessionId, state] of Object.entries(recoveryData)) {
        const stateTime = new Date(state.timestamp);
        const timeDiff = now - stateTime;

        // Only recover sessions from the last 30 minutes
        if (timeDiff < 30 * 60 * 1000) {
          const session = this.sessions.get(sessionId);
          if (session && state.lastUserMessage) {
            console.log('Found interrupted session to recover:', sessionId);

            // Check if the last user message exists in the session
            const lastMessage = session.messages[session.messages.length - 1];
            if (lastMessage && lastMessage.type === 'user' && lastMessage.content === state.lastUserMessage) {
              console.log('Session appears to be interrupted during Claude response');

              // Add recovery indicator to session
              session.needsRecovery = true;
              session.recoveryInfo = {
                lastUserMessage: state.lastUserMessage,
                interruptedAt: state.timestamp
              };

              recoveredSessions.push(sessionId);
            }
          }
        }
      }

      if (recoveredSessions.length > 0) {
        console.log(`Recovered ${recoveredSessions.length} interrupted sessions:`, recoveredSessions);
        await this.saveSessions();
      }

      // Clear old recovery data
      const cleanedData = {};
      for (const [sessionId, state] of Object.entries(recoveryData)) {
        const stateTime = new Date(state.timestamp);
        const timeDiff = now - stateTime;

        // Keep recovery data for the last hour
        if (timeDiff < 60 * 60 * 1000) {
          cleanedData[sessionId] = state;
        }
      }

      await fs.writeFile(this.recoveryStatePath, JSON.stringify(cleanedData, null, 2));

    } catch (error) {
      console.log('No recovery data found or failed to read recovery state');
    }
  }

  // ============================================================================
  // Workspace Integration Methods
  // ============================================================================

  // Associate a session with a workspace
  async setSessionWorkspace(sessionId, workspaceId, workspaceName) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      session.workspaceId = workspaceId;
      session.workspaceName = workspaceName;
      session.updatedAt = new Date().toISOString();

      await this.saveSession(sessionId);
      console.log(`Associated session ${sessionId} with workspace ${workspaceName}`);

      return {
        success: true,
        session: session
      };
    } catch (error) {
      console.error('Failed to set session workspace:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Clear workspace association from a session
  async clearSessionWorkspace(sessionId) {
    try {
      const session = this.sessions.get(sessionId);
      if (!session) {
        throw new Error('Session not found');
      }

      session.workspaceId = null;
      session.workspaceName = null;
      session.updatedAt = new Date().toISOString();

      await this.saveSession(sessionId);
      console.log(`Cleared workspace association from session ${sessionId}`);

      return {
        success: true,
        session: session
      };
    } catch (error) {
      console.error('Failed to clear session workspace:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all sessions for a specific workspace
  getSessionsByWorkspace(workspaceId) {
    try {
      const workspaceSessions = Array.from(this.sessions.values())
        .filter(session => session.workspaceId === workspaceId)
        .sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

      return {
        success: true,
        sessions: workspaceSessions
      };
    } catch (error) {
      console.error('Failed to get sessions by workspace:', error);
      return {
        success: false,
        error: error.message,
        sessions: []
      };
    }
  }

  // Get sessions grouped by workspace
  getSessionsGroupedByWorkspace() {
    try {
      const groupedSessions = {
        workspaces: {},
        noWorkspace: []
      };

      Array.from(this.sessions.values()).forEach(session => {
        if (session.workspaceId && session.workspaceName) {
          if (!groupedSessions.workspaces[session.workspaceId]) {
            groupedSessions.workspaces[session.workspaceId] = {
              id: session.workspaceId,
              name: session.workspaceName,
              sessions: []
            };
          }
          groupedSessions.workspaces[session.workspaceId].sessions.push(session);
        } else {
          groupedSessions.noWorkspace.push(session);
        }
      });

      // Sort sessions within each group by last activity
      Object.values(groupedSessions.workspaces).forEach(workspace => {
        workspace.sessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));
      });
      groupedSessions.noWorkspace.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

      return {
        success: true,
        grouped: groupedSessions
      };
    } catch (error) {
      console.error('Failed to group sessions by workspace:', error);
      return {
        success: false,
        error: error.message,
        grouped: { workspaces: {}, noWorkspace: [] }
      };
    }
  }

  // Update all sessions associated with a workspace when workspace is renamed
  async updateWorkspaceName(workspaceId, newWorkspaceName) {
    try {
      let updatedCount = 0;

      for (const session of this.sessions.values()) {
        if (session.workspaceId === workspaceId) {
          session.workspaceName = newWorkspaceName;
          session.updatedAt = new Date().toISOString();
          updatedCount++;
        }
      }

      if (updatedCount > 0) {
        await this.saveSessions();
        console.log(`Updated workspace name for ${updatedCount} sessions`);
      }

      return {
        success: true,
        updatedCount: updatedCount
      };
    } catch (error) {
      console.error('Failed to update workspace name in sessions:', error);
      return {
        success: false,
        error: error.message,
        updatedCount: 0
      };
    }
  }

  // Remove workspace association from all sessions when workspace is deleted
  async removeWorkspaceFromSessions(workspaceId) {
    try {
      let clearedCount = 0;

      for (const session of this.sessions.values()) {
        if (session.workspaceId === workspaceId) {
          session.workspaceId = null;
          session.workspaceName = null;
          session.updatedAt = new Date().toISOString();
          clearedCount++;
        }
      }

      if (clearedCount > 0) {
        await this.saveSessions();
        console.log(`Cleared workspace association from ${clearedCount} sessions`);
      }

      return {
        success: true,
        clearedCount: clearedCount
      };
    } catch (error) {
      console.error('Failed to remove workspace from sessions:', error);
      return {
        success: false,
        error: error.message,
        clearedCount: 0
      };
    }
  }

  // Clear all sessions
  async clearAllSessions() {
    try {
      const sessionCount = this.sessions.size;

      // Clear all sessions from memory
      this.sessions.clear();

      // Save empty sessions to storage
      await this.saveSessions();

      console.log(`Cleared all ${sessionCount} sessions`);

      return {
        success: true,
        clearedCount: sessionCount
      };
    } catch (error) {
      console.error('Failed to clear all sessions:', error);
      return {
        success: false,
        error: error.message,
        clearedCount: 0
      };
    }
  }
}

module.exports = SessionManager;