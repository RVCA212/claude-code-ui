// Session Manager Component for the renderer
class SessionManager {
  constructor() {
    this.sessions = [];
    this.currentSessionId = null;
    this.isStreaming = false;
    this.isDraftMode = false; // Track when we're in draft mode (no actual session created yet)
    this.draftTitle = null; // Store draft session title

    this.initializeElements();
    this.setupEventListeners();
    // this.loadSessions();
  }

  init() {
    this.loadSessions();
  }

  initializeElements() {
    // Session-related elements
    this.conversationsList = document.getElementById('conversationsList');
    this.newConversationBtn = document.getElementById('newConversationBtn');
    this.conversationTitle = document.getElementById('conversationTitle');
    this.editTitleBtn = document.getElementById('editTitleBtn');
    this.conversationStatus = document.getElementById('conversationStatus');
    this.conversationContext = document.getElementById('conversationContext');

    // History dropdown elements
    this.historyBtn = document.getElementById('historyBtn');
    this.historyDropdown = document.getElementById('historyDropdown');

    // Sidebar conversation list element (for sidebar history view)
    this.sidebarConversationsList = document.getElementById('sidebarConversationsList');

    // Delete modal elements
    this.deleteModal = document.getElementById('deleteModal');
    this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

    this.sessionToDelete = null;

    this.conversationTitleContainer = document.querySelector('.conversation-title-container');
  }

  setupEventListeners() {
    // New conversation button
    if (this.newConversationBtn) {
      this.newConversationBtn.addEventListener('click', () => this.createNewSession());
    }

    // Edit title button
    if (this.editTitleBtn) {
      this.editTitleBtn.addEventListener('click', () => this.startEditingTitle());
    }

    // Title editing
    if (this.conversationTitle) {
      this.conversationTitle.addEventListener('blur', () => this.finishEditingTitle());
      this.conversationTitle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.finishEditingTitle();
        } else if (e.key === 'Escape') {
          this.cancelEditingTitle();
        }
      });
    }

    // History dropdown
    if (this.historyBtn) {
      this.historyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleHistoryDropdown();
      });
    }

    // Delete modal
    if (this.confirmDeleteBtn) {
      this.confirmDeleteBtn.addEventListener('click', () => this.confirmDeleteSession());
    }
    if (this.cancelDeleteBtn) {
      this.cancelDeleteBtn.addEventListener('click', () => this.hideDeleteModal());
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (this.historyDropdown && !this.historyBtn?.contains(e.target)) {
        this.hideHistoryDropdown();
      }
    });

    // IPC event listeners
    window.electronAPI.onSessionsLoaded((event, sessions) => {
      this.sessions = sessions;
      this.renderSessions();
    });

    window.electronAPI.onSessionCreated((event, session) => {
      this.sessions.unshift(session);
      this.renderSessions();
    });

    window.electronAPI.onSessionUpdated((event, session) => {
      const index = this.sessions.findIndex(s => s.id === session.id);
      if (index !== -1) {
        this.sessions[index] = session;
        this.renderSessions();
        if (session.id === this.currentSessionId) {
          this.updateSessionInfo(session);
        }
      }
    });

    window.electronAPI.onSessionDeleted((event, sessionId) => {
      this.sessions = this.sessions.filter(s => s.id !== sessionId);
      this.renderSessions();
      if (sessionId === this.currentSessionId) {
        this.currentSessionId = null;
        this.updateSessionInfo(null);
      }
    });
  }

  async loadSessions() {
    try {
      const sessions = await window.electronAPI.getSessions();
      this.sessions = sessions;

      // If this is the first time the user opens the app (no sessions yet),
      // put the app in draft mode ready for the user to start typing.
      if (this.sessions.length === 0) {
        this.enterDraftMode('New Conversation');
        this.renderSessions(); // Render empty state
        return;
      }

      // Otherwise render existing sessions and automatically select the most
      // recent one so that a conversation is ready as soon as the UI appears.
      this.sortSessions();
      this.renderSessions();
      this.selectSession(this.sessions[0].id);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  async createNewSession() {
    // Instead of creating a session immediately, enter draft mode
    // The actual session will be created when the first message is sent
    const title = 'New Conversation';
    this.enterDraftMode(title);
    return { isDraft: true, title: title };
  }

  async selectSession(sessionId) {
    if (this.isStreaming) {
      console.log('Cannot switch sessions while streaming');
      return;
    }

    try {
      // Exit draft mode when selecting an existing session
      this.exitDraftMode();

      this.currentSessionId = sessionId;

      // Update UI to show selected session
      this.updateSessionSelection();

      // Load session context
      const context = await window.electronAPI.getSessionContext(sessionId);
      this.updateSessionInfo(context);

      // Restore working directory if the session has one
      if (context.cwdInfo && context.cwdInfo.hasWorkingDirectory) {
        console.log(`Restoring working directory for session ${sessionId}: ${context.cwdInfo.path}`);

        try {
          const restoreResult = await window.electronAPI.restoreSessionCwd(sessionId);

          if (restoreResult.success) {
            console.log(`Successfully restored working directory: ${restoreResult.path}`);

            // Tell the file browser to navigate to the restored directory
            // This ensures it loads the directory contents properly
            if (window.fileBrowser && typeof window.fileBrowser.navigateToDirectory === 'function') {
              try {
                await window.fileBrowser.navigateToDirectory(restoreResult.path);
                console.log('File browser navigated to restored directory');
              } catch (err) {
                console.warn('File browser navigation failed:', err);
                // Fallback to direct update
                if (typeof window.fileBrowser.updateDirectory === 'function') {
                  window.fileBrowser.updateDirectory(restoreResult);
                }
              }
            }

          } else {
            console.warn(`Failed to restore working directory: ${restoreResult.error}`);
            this.showDirectoryChangeWarning(context.cwdInfo.path, restoreResult.error);
          }
        } catch (error) {
          console.error('Error restoring working directory:', error);
          this.showDirectoryChangeWarning(context.cwdInfo.path, error.message);
        }
      } else {
        console.log(`Session ${sessionId} has no working directory set`);
      }

      // Notify other components about session change
      this.notifySessionChange(sessionId, context);

    } catch (error) {
      console.error('Failed to select session:', error);
    }
  }

  async deleteSession(sessionId) {
    this.sessionToDelete = sessionId;
    this.showDeleteModal();
  }

  async confirmDeleteSession() {
    if (!this.sessionToDelete) return;

    try {
      await window.electronAPI.deleteSession(this.sessionToDelete);
      // Session will be removed via the onSessionDeleted event
    } catch (error) {
      console.error('Failed to delete session:', error);
    } finally {
      this.hideDeleteModal();
      this.sessionToDelete = null;
    }
  }

  async updateSessionTitle(sessionId, newTitle) {
    try {
      await window.electronAPI.updateSessionTitle(sessionId, newTitle);
      // Session will be updated via the onSessionUpdated event
    } catch (error) {
      console.error('Failed to update session title:', error);
    }
  }

  // Utility: sort sessions newest first by lastActivity/updatedAt/createdAt
  sortSessions() {
    this.sessions.sort((a, b) => {
      const dateA = new Date(a.lastActivity || a.updatedAt || a.createdAt || 0);
      const dateB = new Date(b.lastActivity || b.updatedAt || b.createdAt || 0);
      return dateB - dateA; // Newest first
    });
  }

  renderSessions() {
    // Ensure sessions are ordered newest -> oldest each time we render
    this.sortSessions();

    if (!this.conversationsList) return;

    if (this.sessions.length === 0) {
      const emptyHTML = `
        <div class="empty-state">
          <p>No conversations yet. Create your first conversation to get started!</p>
        </div>
      `;
      this.conversationsList.innerHTML = emptyHTML;
      if (this.sidebarConversationsList) {
        this.sidebarConversationsList.innerHTML = emptyHTML;
      }
      return;
    }

    const sessionsHTML = this.sessions.map(session => {
      const isActive = session.id === this.currentSessionId;
      const statusClass = session.statusInfo?.status || 'active';
      const preview = this.getSessionPreview(session);
      const timestamp = DOMUtils.formatTimestamp(session.lastActivity || session.updatedAt);

      // Add working directory info if available
      const cwdDisplay = session.statusInfo?.hasWorkingDirectory
        ? `<span class="conversation-cwd" title="Working directory: ${session.statusInfo.workingDirectory}">📁 ${this.getDisplayPath(session.statusInfo.workingDirectory)}</span>`
        : '';

      return `
        <div class="conversation-item ${isActive ? 'active' : ''}"
             onclick="sessionManager.selectSession('${session.id}')">
          <div class="conversation-content">
            <div class="conversation-header">
              <div class="conversation-title-text">${DOMUtils.escapeHTML(session.title)}</div>
              <span class="conversation-status-indicator ${statusClass}"></span>
            </div>
            <div class="conversation-preview">${DOMUtils.escapeHTML(preview)}</div>
            <div class="conversation-meta">
              <span class="conversation-timestamp">${timestamp}</span>
              ${cwdDisplay}
            </div>
          </div>
          <button class="delete-conversation-btn"
                  onclick="event.stopPropagation(); sessionManager.deleteSession('${session.id}')"
                  title="Delete conversation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>
      `;
    }).join('');

    this.conversationsList.innerHTML = sessionsHTML;

    if (this.sidebarConversationsList) {
      this.sidebarConversationsList.innerHTML = sessionsHTML;
    }

    // Also update history dropdown
    if (this.historyDropdown) {
      const dropdownHTML = `
        <div class="conversations-list">
          ${sessionsHTML}
        </div>
      `;
      this.historyDropdown.innerHTML = dropdownHTML;
    }
  }

  updateSessionSelection() {
    // Update visual selection in conversations list
    const allLists = [this.conversationsList, this.sidebarConversationsList, this.historyDropdown];
    allLists.forEach(listEl => {
      const items = listEl?.querySelectorAll('.conversation-item');
      items?.forEach(item => {
        const sessionId = item.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
        item.classList.toggle('active', sessionId === this.currentSessionId);
      });
    });
  }

  updateSessionInfo(session) {
    if (!session) {
      // No session selected
      if (this.conversationTitle) {
        this.conversationTitle.textContent = 'Select a conversation';
      }
      if (this.editTitleBtn) {
        this.editTitleBtn.style.display = 'none';
      }
      if (this.conversationStatus) {
        this.conversationStatus.style.display = 'none';
      }
      if (this.conversationContext) {
        this.conversationContext.style.display = 'none';
      }
      return;
    }

    // Update title
    if (this.conversationTitle) {
      this.conversationTitle.textContent = session.title;
    }

    // For draft mode, hide edit button and show draft indicator
    if (session.isDraft) {
      if (this.editTitleBtn) {
        this.editTitleBtn.style.display = 'none';
      }
      if (this.conversationStatus) {
        this.conversationStatus.style.display = 'flex';
        this.conversationStatus.innerHTML = '<div class="status-badge draft"><span class="status-dot"></span> Draft</div>';
      }
      if (this.conversationContext) {
        this.conversationContext.style.display = 'none';
      }
    } else {
      // Normal session
      if (this.editTitleBtn) {
        this.editTitleBtn.style.display = 'flex';
      }

      // Update status
      if (this.conversationStatus && session.statusInfo) {
        this.conversationStatus.style.display = 'flex';
        this.conversationStatus.innerHTML = this.createStatusHTML(session.statusInfo);
      }

      // Update context/preview
      if (this.conversationContext && session.conversationPreview) {
        this.conversationContext.style.display = 'block';
        this.conversationContext.innerHTML = this.createContextHTML(session.conversationPreview);
      }
    }

    // Move the status element next to the title (inside the title container) so
    // that only a small dot is shown to the right of the conversation title.
    if (this.conversationTitleContainer && this.conversationStatus) {
      // Ensure the status element is the last child in the title container
      // (after the editable title itself).
      this.conversationTitleContainer.appendChild(this.conversationStatus);
    }
  }

  createStatusHTML(statusInfo) {
    const statusClass = statusInfo.status || 'active';

    // Determine whether to include a text label. We want to hide the label for
    // the common "active" and "historical" states so that only the colored dot
    // is rendered in the chat header. For any other custom states (e.g.
    // "archived") we continue to display the text label.
    let statusLabelHTML = '';
    if (statusClass !== 'active' && statusClass !== 'historical') {
      const labelMap = {
        'archived': 'Archived',
      };
      const labelText = labelMap[statusClass] || statusClass;
      statusLabelHTML = ` ${labelText}`;
    }

    // Build the status badge HTML (dot + optional label)
    const statusBadge = `
      <div class="status-badge ${statusClass}">
        <span class="status-dot"></span>${statusLabelHTML}
      </div>
    `;

    // Add working directory badge if available
    const cwdBadge = statusInfo.hasWorkingDirectory
      ? `<div class="cwd-badge" title="Working directory: ${statusInfo.workingDirectory}">📁 ${this.getDisplayPath(statusInfo.workingDirectory)}</div>`
      : '';

    return `${statusBadge}${cwdBadge}`;
  }

  createContextHTML(preview) {
    return '';
  }

  getStatusIcon(status) {
    // Icons are now rendered purely with CSS dot, so return empty string
    return '';
  }

  getSessionPreview(session) {
    if (session.lastUserMessage) {
      return session.lastUserMessage.substring(0, 80) + (session.lastUserMessage.length > 80 ? '...' : '');
    }
    if (session.messages && session.messages.length > 0) {
      const lastMessage = session.messages[session.messages.length - 1];
      return lastMessage.content.substring(0, 80) + (lastMessage.content.length > 80 ? '...' : '');
    }
    return 'New conversation';
  }

  startEditingTitle() {
    if (this.conversationTitle) {
      this.conversationTitle.contentEditable = 'true';
      this.conversationTitle.focus();

      // Select all text
      const range = document.createRange();
      range.selectNodeContents(this.conversationTitle);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  async finishEditingTitle() {
    if (!this.conversationTitle || !this.currentSessionId) return;

    this.conversationTitle.contentEditable = 'false';
    const newTitle = this.conversationTitle.textContent.trim();

    if (newTitle) {
      try {
        await this.updateSessionTitle(this.currentSessionId, newTitle);
      } catch (error) {
        console.error('Failed to update title:', error);
        // Revert title on error
        const session = this.sessions.find(s => s.id === this.currentSessionId);
        if (session) {
          this.conversationTitle.textContent = session.title;
        }
      }
    }
  }

  cancelEditingTitle() {
    if (!this.conversationTitle || !this.currentSessionId) return;

    this.conversationTitle.contentEditable = 'false';

    // Revert to original title
    const session = this.sessions.find(s => s.id === this.currentSessionId);
    if (session) {
      this.conversationTitle.textContent = session.title;
    }
  }

  toggleHistoryDropdown() {
    if (this.historyDropdown) {
      const isVisible = this.historyDropdown.style.display === 'block';
      this.historyDropdown.style.display = isVisible ? 'none' : 'block';
    }
  }

  hideHistoryDropdown() {
    if (this.historyDropdown) {
      this.historyDropdown.style.display = 'none';
    }
  }

  showDeleteModal() {
    if (this.deleteModal) {
      this.deleteModal.style.display = 'flex';
    }
  }

  hideDeleteModal() {
    if (this.deleteModal) {
      this.deleteModal.style.display = 'none';
    }
  }

  setStreaming(streaming) {
    this.isStreaming = streaming;
  }

  getCurrentSessionId() {
    // Return null when in draft mode (no actual session created yet)
    return this.isDraftMode ? null : this.currentSessionId;
  }

  getCurrentSession() {
    return this.sessions.find(s => s.id === this.currentSessionId);
  }

    // Enter draft mode - UI is ready for conversation but no session created yet
  enterDraftMode(title) {
    this.isDraftMode = true;
    this.draftTitle = title;
    this.currentSessionId = null;

    // Update UI to show draft state
    this.updateSessionInfo({
      title: title,
      isDraft: true,
      id: null
    });

    // Notify other components about draft mode
    this.notifySessionChange(null, {
      id: 'draft',
      title: title,
      isDraft: true
    });

    console.log('Entered draft mode with title:', title);
  }

  // Create actual session from draft mode (called when first message is sent)
  async createSessionFromDraft() {
    if (!this.isDraftMode) {
      throw new Error('Not in draft mode');
    }

    try {
      const session = await window.electronAPI.createSession(this.draftTitle);

      // Exit draft mode and select the new session
      this.isDraftMode = false;
      this.draftTitle = null;

      // Add session to list and select it
      this.sessions.unshift(session);
      this.renderSessions();
      await this.selectSession(session.id);

      console.log('Created session from draft:', session.id);
      return session;
    } catch (error) {
      console.error('Failed to create session from draft:', error);
      throw error;
    }
  }

  // Check if currently in draft mode
  isDraftModeActive() {
    return this.isDraftMode;
  }

  // Exit draft mode without creating session (when user selects existing session)
  exitDraftMode() {
    if (this.isDraftMode) {
      this.isDraftMode = false;
      this.draftTitle = null;
      console.log('Exited draft mode');
    }
  }

  // Notify other components about session changes
  notifySessionChange(sessionId, context) {
    // Dispatch custom event for other components to listen to
    const event = new CustomEvent('sessionChanged', {
      detail: { sessionId, context }
    });
    document.dispatchEvent(event);
  }

  // Show warning when directory change fails
  showDirectoryChangeWarning(path, error) {
    let notification = document.getElementById('cwdChangeNotification');
    if (!notification) {
      notification = document.createElement('div');
      notification.id = 'cwdChangeNotification';
      notification.className = 'cwd-notification warning';
      document.body.appendChild(notification);
    }

    const displayPath = path.startsWith('/Users/') ? path.replace(/^\/Users\/[^\/]+/, '~') : path;
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-icon">⚠️</div>
        <div class="notification-text">
          <strong>Directory Unavailable</strong><br>
          <code>${DOMUtils.escapeHTML(displayPath)}</code><br>
          <small>${DOMUtils.escapeHTML(error)}</small>
        </div>
      </div>
    `;
    notification.className = 'cwd-notification warning show';

    // Auto-hide after 5 seconds for warnings
    setTimeout(() => {
      notification.classList.remove('show');
    }, 5000);
  }

  // Notify file browser about directory change
  notifyDirectoryChange(directoryResult) {
    const event = new CustomEvent('directoryChanged', {
      detail: directoryResult
    });
    document.dispatchEvent(event);
  }

  // Helper to get display path (replace home directory with ~)
  getDisplayPath(path) {
    if (!path) return '';

    // Get just the directory name for display
    const parts = path.split('/');
    const dirName = parts[parts.length - 1] || parts[parts.length - 2] || path;
    return dirName;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
} else {
  window.SessionManager = SessionManager;
}