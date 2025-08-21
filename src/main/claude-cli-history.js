const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class ClaudeCliHistory {
  constructor() {
    this.claudeDir = path.join(os.homedir(), '.claude');
    this.projectsDir = path.join(this.claudeDir, 'projects');
    this.sessionsCache = new Map();
    this.lastCacheUpdate = 0;
    this.cacheValidityMs = 30000; // 30 seconds
  }

  /**
   * Get all Claude CLI sessions from ~/.claude/projects/
   */
  async getAllSessions() {
    try {
      // Check if we have valid cached data
      const now = Date.now();
      if (this.sessionsCache.size > 0 && (now - this.lastCacheUpdate) < this.cacheValidityMs) {
        return Array.from(this.sessionsCache.values());
      }

      // Clear cache and rebuild
      this.sessionsCache.clear();

      // Check if projects directory exists
      try {
        await fs.access(this.projectsDir);
      } catch (error) {
        console.log('Claude CLI projects directory not found:', this.projectsDir);
        return [];
      }

      const projectDirs = await fs.readdir(this.projectsDir);
      const allSessions = [];

      for (const encodedPath of projectDirs) {
        try {
          const sessions = await this.getSessionsFromProject(encodedPath);
          allSessions.push(...sessions);
        } catch (error) {
          console.warn(`Failed to read sessions from ${encodedPath}:`, error.message);
        }
      }

      // Sort by last activity (newest first)
      allSessions.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

      // Cache the results
      allSessions.forEach(session => {
        this.sessionsCache.set(session.id, session);
      });
      this.lastCacheUpdate = now;

      return allSessions;
    } catch (error) {
      console.error('Error getting Claude CLI sessions:', error);
      return [];
    }
  }

  /**
   * Get sessions from a specific project directory
   */
  async getSessionsFromProject(encodedProjectPath) {
    const projectDir = path.join(this.projectsDir, encodedProjectPath);
    const decodedPath = this.decodeProjectPath(encodedProjectPath);

    try {
      const files = await fs.readdir(projectDir);
      const jsonlFiles = files.filter(file => file.endsWith('.jsonl'));

      const sessions = [];

      for (const file of jsonlFiles) {
        try {
          const sessionId = path.basename(file, '.jsonl');
          const session = await this.parseSessionFile(path.join(projectDir, file), sessionId, decodedPath);
          if (session) {
            sessions.push(session);
          }
        } catch (error) {
          console.warn(`Failed to parse session file ${file}:`, error.message);
        }
      }

      return sessions;
    } catch (error) {
      console.warn(`Failed to read project directory ${encodedProjectPath}:`, error.message);
      return [];
    }
  }

  /**
   * Parse a single .jsonl session file
   */
  async parseSessionFile(filePath, sessionId, projectPath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      if (lines.length === 0) {
        return null;
      }

      const messages = [];
      let firstMessage = null;
      let lastMessage = null;
      let modelUsed = 'unknown';
      let gitBranch = null;
      let version = null;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          if (!firstMessage) {
            firstMessage = entry;
            gitBranch = entry.gitBranch;
            version = entry.version;
          }

          lastMessage = entry;

          // Extract model info from assistant messages
          if (entry.type === 'assistant' && entry.message && entry.message.model) {
            modelUsed = entry.message.model;
          }

          messages.push(entry);
        } catch (parseError) {
          console.warn(`Failed to parse line in ${filePath}:`, parseError.message);
        }
      }

      if (!firstMessage) {
        return null;
      }

      // Get the first user message content for preview
      const firstUserMessage = messages.find(m => m.type === 'user');
      const preview = firstUserMessage?.message?.content || 'No user message found';

      return {
        id: sessionId,
        projectPath: projectPath,
        sessionId: sessionId,
        messageCount: messages.length,
        firstActivity: firstMessage.timestamp,
        lastActivity: lastMessage.timestamp,
        modelUsed: modelUsed,
        gitBranch: gitBranch,
        version: version,
        preview: preview.length > 100 ? preview.substring(0, 100) + '...' : preview,
        filePath: filePath
      };
    } catch (error) {
      console.warn(`Failed to parse session file ${filePath}:`, error.message);
      return null;
    }
  }

  /**
   * Get detailed conversation for a specific session
   */
  async getSessionDetails(sessionId) {
    try {
      // First try to find in cache
      const cachedSession = this.sessionsCache.get(sessionId);
      if (!cachedSession) {
        // If not in cache, refresh sessions and try again
        await this.getAllSessions();
        const refreshedSession = this.sessionsCache.get(sessionId);
        if (!refreshedSession) {
          throw new Error(`Session ${sessionId} not found`);
        }
      }

      const session = this.sessionsCache.get(sessionId);
      const content = await fs.readFile(session.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      const conversation = [];
      const toolCallMap = new Map(); // Track tool calls to pair with their results

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          let messageContent = '';
          let role = entry.type;
          let toolCalls = [];
          let isToolResultMessage = false;

          if (entry.message) {
            if (typeof entry.message.content === 'string') {
              messageContent = entry.message.content;
            } else if (Array.isArray(entry.message.content)) {
              // Handle Claude's content array format with proper type handling
              const contentParts = [];

              for (const item of entry.message.content) {
                switch (item.type) {
                  case 'text':
                    contentParts.push(item.text);
                    break;
                  case 'thinking':
                    contentParts.push(`**Internal Reasoning:**\n${item.thinking}`);
                    break;
                  case 'tool_use':
                    // Store tool call info for expandable display
                    toolCalls.push({
                      id: item.id,
                      name: item.name,
                      input: item.input
                    });
                    // Don't include tool call in main content - will be shown separately
                    break;
                  case 'tool_result':
                    // Skip tool result messages - they'll be handled differently
                    if (role === 'user') {
                      isToolResultMessage = true;
                      // Store the tool result to pair with its call
                      if (item.tool_use_id) {
                        toolCallMap.set(item.tool_use_id, item.content);
                      }
                    } else {
                      contentParts.push(`**Tool Result:**\n${item.content}`);
                    }
                    break;
                  default:
                    contentParts.push(`[${item.type || 'Unknown'} content]`);
                }
              }

              messageContent = contentParts.filter(content => content.trim() !== '').join('\n\n');
            } else if (entry.message.content && entry.message.content.text) {
              messageContent = entry.message.content.text;
            } else if (entry.message.role && entry.message.content) {
              role = entry.message.role;
              messageContent = entry.message.content;
            }
          }

          // Skip tool result messages (they'll be shown as expandable content)
          if (isToolResultMessage) {
            continue;
          }

          // For tool calls, pair them with their results
          if (toolCalls.length > 0) {
            toolCalls = toolCalls.map(toolCall => ({
              ...toolCall,
              result: toolCallMap.get(toolCall.id) || null
            }));
          }

          conversation.push({
            id: entry.uuid,
            role: role,
            content: messageContent,
            timestamp: entry.timestamp,
            model: entry.message?.model || null,
            usage: entry.message?.usage || null,
            toolCalls: toolCalls,
            hasToolCalls: toolCalls.length > 0
          });
        } catch (parseError) {
          console.warn(`Failed to parse conversation entry:`, parseError.message);
        }
      }

      return {
        ...session,
        conversation: conversation
      };
    } catch (error) {
      console.error(`Error getting session details for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Decode project path (convert '-' back to '/')
   */
  decodeProjectPath(encodedPath) {
    // Replace '-' with '/' but be careful about the first part
    // Example: "-Users-seansullivan-ccundo" -> "/Users/seansullivan/ccundo"
    if (encodedPath.startsWith('-')) {
      return '/' + encodedPath.substring(1).replace(/-/g, '/');
    }
    return encodedPath.replace(/-/g, '/');
  }

  /**
   * Search sessions by content or project path
   */
  async searchSessions(query) {
    const allSessions = await this.getAllSessions();
    const lowerQuery = query.toLowerCase();

    return allSessions.filter(session => {
      return session.projectPath.toLowerCase().includes(lowerQuery) ||
             session.preview.toLowerCase().includes(lowerQuery) ||
             session.sessionId.toLowerCase().includes(lowerQuery);
    });
  }

  /**
   * Clear cache to force refresh
   */
  clearCache() {
    this.sessionsCache.clear();
    this.lastCacheUpdate = 0;
  }
}

module.exports = ClaudeCliHistory;