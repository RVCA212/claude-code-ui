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

  /**
   * Extract file changes from a specific message in a session
   */
  async extractFileChangesFromMessage(sessionId, messageId) {
    try {
      // Get session details first
      const session = this.sessionsCache.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Read the session file
      const content = await fs.readFile(session.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      // Find the specific message
      let targetMessage = null;
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.uuid === messageId) {
            targetMessage = entry;
            break;
          }
        } catch (parseError) {
          continue;
        }
      }

      if (!targetMessage) {
        throw new Error(`Message ${messageId} not found`);
      }

      return this.extractFileChangesFromMessageData(targetMessage);
    } catch (error) {
      console.error(`Error extracting file changes for message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Extract file changes from a parsed message object
   */
  extractFileChangesFromMessageData(messageEntry) {
    const fileChanges = [];

    if (!messageEntry.message || !Array.isArray(messageEntry.message.content)) {
      return { changes: [], formattedText: 'No file changes found in this message.' };
    }

    // Look for tool_use entries in the message content
    for (const item of messageEntry.message.content) {
      if (item.type === 'tool_use') {
        const toolName = item.name;
        const toolInput = item.input;

        if (this.isFileModifyingTool(toolName)) {
          const change = this.parseToolCallForChanges(toolName, toolInput);
          if (change) {
            fileChanges.push(change);
          }
        }
      }
    }

    // Format changes into a comprehensive text
    const formattedText = this.formatChangesForClipboard(fileChanges);

    return {
      changes: fileChanges,
      formattedText: formattedText
    };
  }

  /**
   * Check if a tool name represents a file-modifying operation
   */
  isFileModifyingTool(toolName) {
    const fileModifyingTools = ['Edit', 'Write', 'MultiEdit'];
    return fileModifyingTools.includes(toolName);
  }

  /**
   * Parse a tool call to extract file change information
   */
  parseToolCallForChanges(toolName, toolInput) {
    try {
      switch (toolName) {
        case 'Edit':
          return {
            type: 'Edit',
            filePath: toolInput.file_path,
            oldString: toolInput.old_string,
            newString: toolInput.new_string,
            replaceAll: toolInput.replace_all || false
          };

        case 'Write':
          return {
            type: 'Write',
            filePath: toolInput.file_path,
            content: toolInput.content,
            contentPreview: toolInput.content ? toolInput.content.substring(0, 200) + (toolInput.content.length > 200 ? '...' : '') : ''
          };

        case 'MultiEdit':
          return {
            type: 'MultiEdit',
            filePath: toolInput.file_path,
            edits: toolInput.edits || [],
            editCount: (toolInput.edits || []).length
          };

        default:
          return null;
      }
    } catch (error) {
      console.warn(`Failed to parse tool call for ${toolName}:`, error);
      return null;
    }
  }

  /**
   * Format file changes into a clipboard-ready text summary
   */
  formatChangesForClipboard(changes) {
    if (changes.length === 0) {
      return 'No file changes found in this message.';
    }

    const timestamp = new Date().toLocaleString();
    let output = `File Changes Summary (${timestamp})\n`;
    output += '='.repeat(50) + '\n\n';

    changes.forEach((change, index) => {
      output += `${index + 1}. ${change.type}: ${change.filePath}\n`;
      output += '-'.repeat(40) + '\n';

      switch (change.type) {
        case 'Edit':
          output += `Operation: ${change.replaceAll ? 'Replace All' : 'Single Replace'}\n`;
          output += `Old Text:\n${change.oldString}\n\n`;
          output += `New Text:\n${change.newString}\n`;
          break;

        case 'Write':
          output += `Operation: Write File\n`;
          output += `Content Preview:\n${change.contentPreview}\n`;
          if (change.content && change.content.length > 200) {
            output += `(Full content: ${change.content.length} characters)\n`;
          }
          break;

        case 'MultiEdit':
          output += `Operation: Multiple Edits\n`;
          output += `Number of edits: ${change.editCount}\n`;
          change.edits.forEach((edit, editIndex) => {
            output += `  Edit ${editIndex + 1}:\n`;
            output += `    Old: ${edit.old_string.substring(0, 50)}${edit.old_string.length > 50 ? '...' : ''}\n`;
            output += `    New: ${edit.new_string.substring(0, 50)}${edit.new_string.length > 50 ? '...' : ''}\n`;
          });
          break;
      }

      output += '\n';
    });

    output += `Total files modified: ${new Set(changes.map(c => c.filePath)).size}\n`;
    output += `Total operations: ${changes.length}\n`;

    return output;
  }

  /**
   * Extract conversation context from a specific user message in a session
   * Returns all messages before, the target message, and Claude's responses until the next user message
   */
  async extractConversationContext(sessionId, messageId) {
    try {
      // Get session details first
      const session = this.sessionsCache.get(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }

      // Read the session file and parse all entries
      const content = await fs.readFile(session.filePath, 'utf-8');
      const lines = content.trim().split('\n').filter(line => line.trim());

      const allMessages = [];
      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          allMessages.push(entry);
        } catch (parseError) {
          console.warn(`Failed to parse conversation entry:`, parseError.message);
          continue;
        }
      }

      // Find the target message index
      let targetIndex = -1;
      for (let i = 0; i < allMessages.length; i++) {
        if (allMessages[i].uuid === messageId) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex === -1) {
        throw new Error(`Message ${messageId} not found`);
      }

      const targetMessage = allMessages[targetIndex];

      // Ensure the target message is a user message
      if (targetMessage.type !== 'user') {
        throw new Error(`Message ${messageId} is not a user message`);
      }

                      // Collect context: all messages before + target message + ALL messages after target
      // But filter out exploration tool calls (Read, Grep, glob, etc.) and their results
      const contextMessages = [];
      const explorationToolCallIds = new Set();

      // Define exploration tools to filter out
      const explorationTools = ['Read', 'Grep', 'grep', 'glob_file_search', 'codebase_search', 'file_search'];

      // First pass: collect all exploration tool call IDs from all messages
      for (const message of allMessages) {
        if (this.isExplorationOnlyToolMessage(message) && message.message?.content) {
          const toolUseItems = message.message.content.filter(item =>
            item.type === 'tool_use' && explorationTools.includes(item.name)
          );
          toolUseItems.forEach(item => explorationToolCallIds.add(item.id));
        }
      }

      // Add all messages before the target (excluding exploration tool calls and results)
      for (let i = 0; i < targetIndex; i++) {
        const message = allMessages[i];

        // Skip exploration-only tool messages and their results
        if (this.isExplorationOnlyToolMessage(message) || this.isExplorationOnlyToolResultMessage(message, explorationToolCallIds)) {
          continue;
        }

        contextMessages.push(this.cleanMessageForContext(message));
      }

      // Add the target message (always include, even if it's an exploration call)
      contextMessages.push(this.cleanMessageForContext(targetMessage));

      // Add ALL messages after target (excluding exploration tool calls and results)
      for (let i = targetIndex + 1; i < allMessages.length; i++) {
        const message = allMessages[i];

        // Skip exploration-only tool messages and their results
        if (this.isExplorationOnlyToolMessage(message) || this.isExplorationOnlyToolResultMessage(message, explorationToolCallIds)) {
          continue;
        }

        // Add all other messages (user, assistant, and tool messages)
        contextMessages.push(this.cleanMessageForContext(message));
      }

      const contextData = {
        projectPath: session.projectPath,
        messageCount: contextMessages.length,
        messages: contextMessages
      };

      return {
        contextData: contextData,
        jsonString: JSON.stringify(contextData, null, 2)
      };

    } catch (error) {
      console.error(`Error extracting conversation context for message ${messageId}:`, error);
      throw error;
    }
  }

  /**
   * Check if a message contains only exploration tool calls (Read, Grep, glob, etc.)
   */
  isExplorationOnlyToolMessage(messageEntry) {
    if (messageEntry.type !== 'assistant' || !messageEntry.message?.content) {
      return false;
    }

    const content = messageEntry.message.content;
    if (!Array.isArray(content)) {
      return false;
    }

    // Check if all tool_use items are exploration calls
    const toolUseItems = content.filter(item => item.type === 'tool_use');
    if (toolUseItems.length === 0) {
      return false;
    }

    // Check if there are any non-tool_use items
    const nonToolItems = content.filter(item => item.type !== 'tool_use');
    if (nonToolItems.length > 0) {
      return false; // Has other content besides tool calls
    }

    // Define exploration tools to filter out
    const explorationTools = ['Read', 'Grep', 'grep', 'glob_file_search', 'codebase_search', 'file_search'];

    // All tool calls must be exploration calls
    return toolUseItems.every(item => explorationTools.includes(item.name));
  }

  /**
   * Check if a message contains only tool results for exploration tool calls
   */
  isExplorationOnlyToolResultMessage(messageEntry, explorationToolCallIds) {
    if (messageEntry.type !== 'user' || !messageEntry.message?.content) {
      return false;
    }

    const content = messageEntry.message.content;
    if (!Array.isArray(content)) {
      return false;
    }

    // Check if all items are tool results for exploration calls
    const toolResultItems = content.filter(item => item.type === 'tool_result');
    if (toolResultItems.length === 0) {
      return false;
    }

    // Check if there are any non-tool_result items
    const nonToolResultItems = content.filter(item => item.type !== 'tool_result');
    if (nonToolResultItems.length > 0) {
      return false; // Has other content besides tool results
    }

    // All tool results must be for exploration tool calls
    return toolResultItems.every(item => explorationToolCallIds.has(item.tool_use_id));
  }

  /**
   * Clean and prepare a message entry for context export
   */
  cleanMessageForContext(messageEntry) {
    return {
      type: messageEntry.type,
      role: messageEntry.type,
      timestamp: messageEntry.timestamp,
      content: messageEntry.message?.content || null,
      gitBranch: messageEntry.gitBranch || null
    };
  }
}

module.exports = ClaudeCliHistory;