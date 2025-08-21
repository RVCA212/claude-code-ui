// Claude CLI History Viewer Component
class ClaudeCliHistory {
  constructor() {
    console.log('ClaudeCliHistory: Constructor called');
    this.sessions = [];
    this.filteredSessions = [];
    this.searchQuery = '';
    this.isOpen = false;
    this.currentView = 'list'; // 'list' or 'conversation'
    this.currentConversation = null;
    this.loading = false;

    this.initializeElements();
    this.setupEventListeners();
    this.bindKeyboardEvents();

    console.log('ClaudeCliHistory: Initialization complete');
  }

  initializeElements() {
    console.log('ClaudeCliHistory: Initializing elements...');

    // Modal elements
    this.modal = document.getElementById('claudeCliHistoryModal');
    this.closeBtn = document.getElementById('claudeCliHistoryClose');
    this.searchInput = document.getElementById('claudeCliHistorySearch');
    this.refreshBtn = document.getElementById('claudeCliHistoryRefresh');

    // View containers
    this.listView = document.getElementById('claudeCliHistoryList');
    this.conversationView = document.getElementById('claudeCliHistoryConversation');
    this.backBtn = document.getElementById('claudeCliHistoryBack');

    // Content containers
    this.sessionsList = document.getElementById('claudeCliSessionsList');
    this.conversationContent = document.getElementById('claudeCliConversationContent');
    this.conversationHeader = document.getElementById('claudeCliConversationHeader');
    this.emptyState = document.getElementById('claudeCliHistoryEmpty');
    this.loadingState = document.getElementById('claudeCliHistoryLoading');

    console.log('ClaudeCliHistory elements found:', {
      modal: !!this.modal,
      closeBtn: !!this.closeBtn,
      searchInput: !!this.searchInput,
      listView: !!this.listView,
      conversationView: !!this.conversationView,
      sessionsList: !!this.sessionsList
    });
  }

  setupEventListeners() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Back button
    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => this.showList());
    }

    // Refresh button
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.refreshSessions());
    }

    // Click outside to close
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      });
    }

    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.filterSessions();
      });
    }
  }

  bindKeyboardEvents() {
    // Global keyboard handler when modal is open
    this.keyboardHandler = (e) => {
      if (!this.isOpen) return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          if (this.currentView === 'conversation') {
            this.showList();
          } else {
            this.close();
          }
          break;
        case '/':
          if (this.currentView === 'list' && document.activeElement !== this.searchInput) {
            e.preventDefault();
            this.searchInput?.focus();
          }
          break;
      }
    };

    document.addEventListener('keydown', this.keyboardHandler);
  }

  async open() {
    console.log('ClaudeCliHistory: Opening...');
    this.isOpen = true;

    if (this.modal) {
      this.modal.style.display = 'flex';
      // Focus search input after modal is visible
      setTimeout(() => {
        this.searchInput?.focus();
      }, 100);
    }

    // Load sessions if not already loaded
    if (this.sessions.length === 0) {
      await this.loadSessions();
    }

    this.showList();
  }

  close() {
    console.log('ClaudeCliHistory: Closing...');
    this.isOpen = false;

    if (this.modal) {
      this.modal.style.display = 'none';
    }

    this.currentView = 'list';
    this.currentConversation = null;
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  showLoading(show = true) {
    if (this.loadingState) {
      this.loadingState.style.display = show ? 'flex' : 'none';
    }
    if (this.listView) {
      this.listView.style.display = show ? 'none' : 'block';
    }
    if (this.conversationView) {
      this.conversationView.style.display = 'none';
    }
  }

  showList() {
    this.currentView = 'list';
    this.currentConversation = null;

    if (this.listView) {
      this.listView.style.display = 'block';
    }
    if (this.conversationView) {
      this.conversationView.style.display = 'none';
    }

    this.renderSessionsList();
  }

  showConversation(session) {
    this.currentView = 'conversation';
    this.currentConversation = session;

    if (this.listView) {
      this.listView.style.display = 'none';
    }
    if (this.conversationView) {
      this.conversationView.style.display = 'block';
    }

    this.loadConversation(session);
  }

  async loadSessions() {
    console.log('ClaudeCliHistory: Loading sessions...');
    this.loading = true;
    this.showLoading(true);

    try {
      this.sessions = await window.electronAPI.getClaudeCliSessions();
      console.log('Loaded', this.sessions.length, 'Claude CLI sessions');
      this.filterSessions();
    } catch (error) {
      console.error('Error loading Claude CLI sessions:', error);
      this.sessions = [];
      this.filteredSessions = [];
    } finally {
      this.loading = false;
      this.showLoading(false);
    }
  }

  async refreshSessions() {
    console.log('ClaudeCliHistory: Refreshing sessions...');
    // Clear cache first
    try {
      await window.electronAPI.clearClaudeCliSessionsCache();
    } catch (error) {
      console.warn('Error clearing cache:', error);
    }

    await this.loadSessions();
  }

  filterSessions() {
    if (!this.searchQuery) {
      this.filteredSessions = [...this.sessions];
    } else {
      this.filteredSessions = this.sessions.filter(session => {
        return session.projectPath.toLowerCase().includes(this.searchQuery) ||
               session.preview.toLowerCase().includes(this.searchQuery) ||
               session.sessionId.toLowerCase().includes(this.searchQuery);
      });
    }

    this.renderSessionsList();
  }

  renderSessionsList() {
    if (!this.sessionsList) return;

    if (this.filteredSessions.length === 0) {
      if (this.sessions.length === 0 && !this.loading) {
        this.sessionsList.innerHTML = `
          <div class="claude-cli-history-empty">
            <div class="empty-icon">📂</div>
            <div class="empty-title">No Claude CLI Sessions Found</div>
            <div class="empty-subtitle">Your Claude CLI conversation history will appear here</div>
            <p>Sessions are stored in <code>~/.claude/projects/</code></p>
          </div>
        `;
      } else if (this.searchQuery) {
        this.sessionsList.innerHTML = `
          <div class="claude-cli-history-empty">
            <div class="empty-icon">🔍</div>
            <div class="empty-title">No Results Found</div>
            <div class="empty-subtitle">Try adjusting your search query</div>
          </div>
        `;
      } else {
        this.sessionsList.innerHTML = '<div class="loading">Loading sessions...</div>';
      }
      return;
    }

    const sessionsHtml = this.filteredSessions.map(session => {
      const lastActivity = new Date(session.lastActivity);
      const timeAgo = this.getTimeAgo(lastActivity);
      const projectName = this.getProjectDisplayName(session.projectPath);

      return `
        <div class="claude-cli-session-item" data-session-id="${session.id}">
          <div class="session-main">
            <div class="session-header">
              <div class="session-project">${DOMUtils.escapeHTML(projectName)}</div>
              <div class="session-meta">
                <span class="session-time">${timeAgo}</span>
                <span class="session-messages">${session.messageCount} messages</span>
              </div>
            </div>
            <div class="session-preview">${DOMUtils.escapeHTML(session.preview)}</div>
            <div class="session-details">
              <span class="session-model">${session.modelUsed}</span>
              ${session.gitBranch ? `<span class="session-branch">${session.gitBranch}</span>` : ''}
            </div>
          </div>
          <div class="session-actions">
            <button class="session-view-btn" title="View conversation">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.sessionsList.innerHTML = sessionsHtml;

    // Add click event listeners
    this.sessionsList.querySelectorAll('.claude-cli-session-item').forEach(item => {
      const sessionId = item.dataset.sessionId;
      const session = this.filteredSessions.find(s => s.id === sessionId);

      item.addEventListener('click', (e) => {
        // Don't trigger if clicking on action buttons
        if (e.target.closest('.session-actions')) return;

        this.showConversation(session);
      });

      // Handle view button click
      const viewBtn = item.querySelector('.session-view-btn');
      if (viewBtn) {
        viewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showConversation(session);
        });
      }
    });
  }

  async loadConversation(session) {
    if (!this.conversationContent || !this.conversationHeader) return;

    // Show loading state
    this.conversationContent.innerHTML = '<div class="loading">Loading conversation...</div>';

    // Update header
    const projectName = this.getProjectDisplayName(session.projectPath);
    const lastActivity = new Date(session.lastActivity);
    this.conversationHeader.innerHTML = `
      <div class="conversation-header-left">
        <button id="claudeCliHistoryBack" class="conversation-back-btn" title="Back to sessions list">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Back
        </button>
        <div class="conversation-title">
          <h3>${DOMUtils.escapeHTML(projectName)}</h3>
          <div class="conversation-subtitle">
            ${session.messageCount} messages • ${this.formatDate(lastActivity)}
          </div>
        </div>
      </div>
      <div class="conversation-meta">
        ${session.gitBranch ? `<span class="conversation-branch">${session.gitBranch}</span>` : ''}
        <button class="conversation-copy-btn" title="Copy session ID" data-session-id="${session.sessionId}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    `;

    // Re-add event listeners for the dynamically created buttons
    const backBtn = document.getElementById('claudeCliHistoryBack');
    if (backBtn) {
      backBtn.addEventListener('click', () => this.showList());
    }

    const copyBtn = this.conversationHeader.querySelector('.conversation-copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const sessionId = copyBtn.getAttribute('data-session-id');
        try {
          await navigator.clipboard.writeText(sessionId);
          // Show temporary success feedback
          const originalTitle = copyBtn.getAttribute('title');
          copyBtn.setAttribute('title', 'Copied!');
          copyBtn.style.color = 'var(--color-success, #10b981)';

          setTimeout(() => {
            copyBtn.setAttribute('title', originalTitle);
            copyBtn.style.color = '';
          }, 2000);
        } catch (error) {
          console.error('Failed to copy session ID:', error);
          // Fallback for older browsers
          const textArea = document.createElement('textarea');
          textArea.value = sessionId;
          document.body.appendChild(textArea);
          textArea.select();
          document.execCommand('copy');
          document.body.removeChild(textArea);

          // Show feedback
          const originalTitle = copyBtn.getAttribute('title');
          copyBtn.setAttribute('title', 'Copied!');
          setTimeout(() => {
            copyBtn.setAttribute('title', originalTitle);
          }, 2000);
        }
      });
    }

    try {
      const details = await window.electronAPI.getClaudeCliSessionDetails(session.id);
      this.renderConversation(details.conversation);
    } catch (error) {
      console.error('Error loading conversation:', error);
      this.conversationContent.innerHTML = `
        <div class="error-state">
          <div class="error-icon">⚠️</div>
          <div class="error-title">Failed to Load Conversation</div>
          <div class="error-subtitle">${error.message}</div>
        </div>
      `;
    }
  }

  renderConversation(conversation) {
    if (!this.conversationContent) return;

    // Apply raw mode styling to keep this view minimal and performant
    this.conversationContent.classList.add('raw-mode');

    const messagesHtml = conversation.map(message => {
      const timestamp = new Date(message.timestamp);
      const headerParts = [
        `[${this.formatTime(timestamp)}]`,
        message.role === 'user' ? 'You' : 'Claude',
        message.model ? `(${message.model})` : ''
      ].filter(Boolean).join(' ');

      const content = message && typeof message.content === 'string' ? message.content : '';
      const hasContent = content && content.trim().length > 0;
      const hasToolCalls = message.hasToolCalls && message.toolCalls && message.toolCalls.length > 0;
      const hasFileChanges = this.messageHasFileChanges(message.toolCalls);
      const isUserMessage = message.role === 'user';

      // If this is a tool-only message (no text content), render as tool result container
      if (hasToolCalls && !hasContent) {
        return this.renderToolCallsRaw(message.toolCalls, timestamp, headerParts);
      }

      // Only show message container if there's actual content
      if (!hasContent && !hasToolCalls) {
        return ''; // Skip empty messages entirely
      }

      return `
        <div class="raw-message ${isUserMessage ? 'raw-user' : 'raw-assistant'} ${hasFileChanges ? 'has-file-changes' : ''}" data-message-id="${message.id}">
          <div class="raw-message-header">
            <span class="raw-message-header-text">${DOMUtils.escapeHTML(headerParts)}</span>
            ${isUserMessage ? `
              <div class="copy-context-container">
                <span class="copy-context-label">📋 Conversation</span>
                <button class="copy-context-btn" title="Copy conversation context from this message" data-message-id="${message.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  <span class="copy-context-text">Copy Context</span>
                </button>
              </div>
            ` : hasFileChanges ? `
              <div class="copy-changes-container">
                <span class="copy-changes-label">📝 File Changes</span>
                <button class="copy-changes-btn" title="Copy all file changes from this message" data-message-id="${message.id}">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                  </svg>
                  <span class="copy-changes-text">Copy Changes</span>
                </button>
              </div>
            ` : ''}
          </div>
          <div class="raw-message-content">
            <pre class="raw-text">${DOMUtils.escapeHTML(content)}</pre>
            ${hasToolCalls ? this.renderToolCallsRaw(message.toolCalls) : ''}
          </div>
        </div>
      `;
    }).join('');

    this.conversationContent.innerHTML = messagesHtml;

    // Add event listeners for copy buttons
    this.attachCopyChangesEventHandlers();
    this.attachCopyContextEventHandlers();
  }

  renderToolCalls(toolCalls, messageId) {
    return toolCalls.map((toolCall, index) => {
      const toolCallId = `${messageId}-tool-${index}`;
      const hasResult = toolCall.result !== null && toolCall.result !== undefined;

      return `
        <div class="tool-call-container" data-tool-id="${toolCallId}">
          <div class="tool-call-header">
            <div class="tool-call-info">
              <span class="tool-call-name">${DOMUtils.escapeHTML(toolCall.name)}</span>
              ${hasResult ? `
                <button class="tool-result-toggle" data-tool-id="${toolCallId}" title="View tool result">
                  <span class="tool-result-status">Result available</span>
                  <div class="expand-indicator">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </div>
                </button>
              ` : ''}
            </div>
          </div>
          <div class="tool-call-payload">
            <div class="code-block">
              <div class="code-language">Tool Call JSON</div>
              <pre><code>${JSON.stringify(toolCall.input, null, 2)}</code></pre>
            </div>
          </div>
          ${hasResult ? `
            <div class="tool-result-details" data-tool-id="${toolCallId}" style="display: none;">
              <div class="tool-result-header">
                <strong>Tool Result:</strong>
                <button class="tool-result-copy-btn" data-tool-id="${toolCallId}" title="Copy result to clipboard">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" stroke="currentColor" stroke-width="2"/>
                    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </button>
              </div>
              <div class="tool-result-content">
                <pre><code>${DOMUtils.escapeHTML(String(toolCall.result))}</code></pre>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  // Condensed, minimal rendering for tool calls using native <details> for performance
  renderToolCallsRaw(toolCalls, timestamp = null, headerParts = null) {
    if (!toolCalls || toolCalls.length === 0) return '';

    // If this is a standalone tool result container (no message content)
    if (timestamp && headerParts) {
      return toolCalls.map((toolCall) => {
        const hasResult = toolCall.result !== null && toolCall.result !== undefined;
        const inputJson = (() => { try { return JSON.stringify(toolCall.input, null, 2); } catch { return String(toolCall.input); } })();
        const resultJson = hasResult ? (() => { try { return typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2); } catch { return String(toolCall.result); } })() : '';

        return `
          <div class="tool-result-container">
            <details class="tool-result-details">
              <summary class="tool-result-summary">
                <span class="tool-result-badge">Tool Result</span>
                <span class="tool-result-name">${DOMUtils.escapeHTML(toolCall.name || 'unknown')}</span>
                <span class="tool-result-timestamp">${DOMUtils.escapeHTML(headerParts)}</span>
              </summary>
              <div class="tool-result-body">
                <div>
                  <div class="tool-label">input</div>
                  <pre class="raw-code">${DOMUtils.escapeHTML(inputJson)}</pre>
                </div>
                ${hasResult ? `
                <div>
                  <div class="tool-label">result</div>
                  <pre class="raw-code">${DOMUtils.escapeHTML(String(resultJson))}</pre>
                </div>` : ''}
              </div>
            </details>
          </div>
        `;
      }).join('');
    }

    // Inline tool calls within message content
    return toolCalls.map((toolCall) => {
      const hasResult = toolCall.result !== null && toolCall.result !== undefined;
      const inputJson = (() => { try { return JSON.stringify(toolCall.input, null, 2); } catch { return String(toolCall.input); } })();
      const resultJson = hasResult ? (() => { try { return typeof toolCall.result === 'string' ? toolCall.result : JSON.stringify(toolCall.result, null, 2); } catch { return String(toolCall.result); } })() : '';

      return `
        <details class="tool-call">
          <summary>tool_use: ${DOMUtils.escapeHTML(toolCall.name || 'unknown')}${hasResult ? ' (result)' : ''}</summary>
          <div class="tool-call-body">
            <div>
              <div class="tool-label">input</div>
              <pre class="raw-code">${DOMUtils.escapeHTML(inputJson)}</pre>
            </div>
            ${hasResult ? `
            <div>
              <div class="tool-label">result</div>
              <pre class="raw-code">${DOMUtils.escapeHTML(String(resultJson))}</pre>
            </div>` : ''}
          </div>
        </details>
      `;
    }).join('');
  }

  attachToolCallEventHandlers() {
    if (!this.conversationContent) return;

    // Handle tool result toggle buttons
    const toggleButtons = this.conversationContent.querySelectorAll('.tool-result-toggle');
    toggleButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const toolId = button.getAttribute('data-tool-id');
        const expandIndicator = button.querySelector('.expand-indicator');
        this.toggleToolResultDetails(toolId, expandIndicator);
      });
    });

    // Handle copy buttons
    const copyButtons = this.conversationContent.querySelectorAll('.tool-result-copy-btn');
    copyButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        const toolId = button.getAttribute('data-tool-id');
        await this.copyToolResultToClipboard(toolId, button);
      });
    });
  }

  toggleToolResultDetails(toolId, expandIndicator) {
    const detailsContainer = this.conversationContent.querySelector(`.tool-result-details[data-tool-id="${toolId}"]`);
    const toolContainer = this.conversationContent.querySelector(`.tool-call-container[data-tool-id="${toolId}"]`);
    const expandIcon = expandIndicator.querySelector('svg path');

    if (!detailsContainer || !toolContainer) return;

    const isExpanded = detailsContainer.style.display !== 'none';

    if (isExpanded) {
      // Collapse
      detailsContainer.style.display = 'none';
      expandIcon.setAttribute('d', 'M9 18l6-6-6-6'); // Right arrow
      toolContainer.classList.remove('expanded');
      expandIndicator.classList.remove('expanded');
    } else {
      // Expand
      detailsContainer.style.display = 'block';
      expandIcon.setAttribute('d', 'M18 15l-6-6-6 6'); // Down arrow
      toolContainer.classList.add('expanded');
      expandIndicator.classList.add('expanded');
    }
  }

  async copyToolResultToClipboard(toolId, button) {
    const detailsContainer = this.conversationContent.querySelector(`.tool-result-details[data-tool-id="${toolId}"]`);
    const codeContent = detailsContainer?.querySelector('pre code');

    if (!codeContent) return;

    try {
      await navigator.clipboard.writeText(codeContent.textContent);

      // Show temporary feedback
      const originalTitle = button.getAttribute('title');
      button.setAttribute('title', 'Copied!');
      button.style.color = 'var(--color-success, #10b981)';

      setTimeout(() => {
        button.setAttribute('title', originalTitle);
        button.style.color = '';
      }, 2000);
    } catch (error) {
      console.error('Failed to copy tool result:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = codeContent.textContent;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
  }

  /**
   * Check if a message has file-modifying tool calls
   */
  messageHasFileChanges(toolCalls) {
    if (!toolCalls || !Array.isArray(toolCalls)) return false;

    const fileModifyingTools = ['Edit', 'Write', 'MultiEdit'];
    return toolCalls.some(toolCall => fileModifyingTools.includes(toolCall.name));
  }

  /**
   * Attach event handlers for copy changes buttons
   */
  attachCopyChangesEventHandlers() {
    if (!this.conversationContent) return;

    const copyButtons = this.conversationContent.querySelectorAll('.copy-changes-btn');
    copyButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        const messageId = button.getAttribute('data-message-id');
        await this.copyFileChangesToClipboard(messageId, button);
      });
    });
  }

  /**
   * Attach event handlers for copy context buttons
   */
  attachCopyContextEventHandlers() {
    if (!this.conversationContent) return;

    const copyButtons = this.conversationContent.querySelectorAll('.copy-context-btn');
    copyButtons.forEach(button => {
      button.addEventListener('click', async (e) => {
        e.stopPropagation();
        const messageId = button.getAttribute('data-message-id');
        await this.copyConversationContextToClipboard(messageId, button);
      });
    });
  }

  /**
   * Copy all file changes from a message to clipboard
   */
  async copyFileChangesToClipboard(messageId, button) {
    try {
      // Show loading state
      const originalText = button.querySelector('.copy-changes-text');
      const originalTextContent = originalText.textContent;
      originalText.textContent = 'Copying...';
      button.disabled = true;
      button.classList.add('loading');

      // Get current session ID from the conversation
      const sessionId = this.currentConversation?.id;
      if (!sessionId) {
        throw new Error('No active session');
      }

      // Extract file changes via IPC
      const result = await window.electronAPI.extractFileChanges(sessionId, messageId);

      if (!result.success) {
        throw new Error(result.error || 'Failed to extract file changes');
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(result.formattedText);

      // Show success feedback
      originalText.textContent = 'Copied!';
      button.classList.remove('loading');
      button.classList.add('success');

      setTimeout(() => {
        originalText.textContent = originalTextContent;
        button.classList.remove('success');
        button.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('Failed to copy file changes:', error);

      // Show error feedback
      const originalText = button.querySelector('.copy-changes-text');
      const originalTextContent = originalText.textContent;
      originalText.textContent = 'Error';
      button.classList.remove('loading');
      button.classList.add('error');
      button.disabled = false;

      setTimeout(() => {
        originalText.textContent = originalTextContent;
        button.classList.remove('error');
      }, 3000);
    }
  }

  /**
   * Copy conversation context from a user message to clipboard
   */
  async copyConversationContextToClipboard(messageId, button) {
    try {
      // Show loading state
      const originalText = button.querySelector('.copy-context-text');
      const originalTextContent = originalText.textContent;
      originalText.textContent = 'Copying...';
      button.disabled = true;
      button.classList.add('loading');
      
      // Get current session ID from the conversation
      const sessionId = this.currentConversation?.id;
      if (!sessionId) {
        throw new Error('No active session');
      }

      // Extract conversation context via IPC
      const result = await window.electronAPI.extractConversationContext(sessionId, messageId);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to extract conversation context');
      }

      // Copy JSON to clipboard
      await navigator.clipboard.writeText(result.jsonString);

      // Show success feedback
      originalText.textContent = 'Copied!';
      button.classList.remove('loading');
      button.classList.add('success');

      setTimeout(() => {
        originalText.textContent = originalTextContent;
        button.classList.remove('success');
        button.disabled = false;
      }, 2000);

    } catch (error) {
      console.error('Failed to copy conversation context:', error);
      
      // Show error feedback
      const originalText = button.querySelector('.copy-context-text');
      const originalTextContent = originalText.textContent;
      originalText.textContent = 'Error';
      button.classList.remove('loading');
      button.classList.add('error');
      button.disabled = false;

      setTimeout(() => {
        originalText.textContent = originalTextContent;
        button.classList.remove('error');
      }, 3000);
    }
  }

  formatMessageContent(content) {
    if (!content) return '';

    // Escape HTML and convert newlines to <br>
    const escaped = DOMUtils.escapeHTML(content);

    // Handle bold text (markdown **bold** syntax)
    let formatted = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Simple code block detection
    const withCodeBlocks = formatted.replace(/```(\w+)?\n([\s\S]*?)\n```/g, (match, language, code) => {
      const lang = language || '';
      return `<div class="code-block">
        ${lang ? `<div class="code-language">${lang}</div>` : ''}
        <pre><code>${code}</code></pre>
      </div>`;
    });

    // Convert remaining newlines to <br>
    return withCodeBlocks.replace(/\n/g, '<br>');
  }

  getProjectDisplayName(projectPath) {
    const parts = projectPath.split('/');
    return parts[parts.length - 1] || projectPath;
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;

    return this.formatDate(date);
  }

  formatDate(date) {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Cleanup method
  destroy() {
    if (this.keyboardHandler) {
      document.removeEventListener('keydown', this.keyboardHandler);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClaudeCliHistory;
} else {
  window.ClaudeCliHistory = ClaudeCliHistory;
}