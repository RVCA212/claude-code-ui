// Session Manager Component for the renderer
class SessionManager {
  constructor() {
    this.sessions = [];
    this.currentSessionId = null;
    this.isStreaming = false;

    this.initializeElements();
    this.setupEventListeners();
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
    
    // Delete modal elements
    this.deleteModal = document.getElementById('deleteModal');
    this.confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    this.cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    
    this.sessionToDelete = null;
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
      this.selectSession(session.id);
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
      this.renderSessions();
    } catch (error) {
      console.error('Failed to load sessions:', error);
    }
  }

  async createNewSession() {
    try {
      const title = 'New Conversation';
      const session = await window.electronAPI.createSession(title);
      // Session will be added via the onSessionCreated event
    } catch (error) {
      console.error('Failed to create new session:', error);
    }
  }

  async selectSession(sessionId) {
    if (this.isStreaming) {
      console.log('Cannot switch sessions while streaming');
      return;
    }

    try {
      this.currentSessionId = sessionId;
      
      // Update UI to show selected session
      this.updateSessionSelection();
      
      // Load session context
      const context = await window.electronAPI.getSessionContext(sessionId);
      this.updateSessionInfo(context);
      
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

  renderSessions() {
    if (!this.conversationsList) return;

    if (this.sessions.length === 0) {
      this.conversationsList.innerHTML = `
        <div class="empty-state">
          <p>No conversations yet. Create your first conversation to get started!</p>
        </div>
      `;
      return;
    }

    const sessionsHTML = this.sessions.map(session => {
      const isActive = session.id === this.currentSessionId;
      const statusClass = session.statusInfo?.status || 'active';
      const statusIcon = this.getStatusIcon(statusClass);
      const preview = this.getSessionPreview(session);
      const timestamp = DOMUtils.formatTimestamp(session.lastActivity || session.updatedAt);

      return `
        <div class="conversation-item ${isActive ? 'active' : ''}" 
             onclick="sessionManager.selectSession('${session.id}')">
          <div class="conversation-content">
            <div class="conversation-header">
              <div class="conversation-title-text">${DOMUtils.escapeHTML(session.title)}</div>
              <span class="conversation-status-indicator ${statusClass}">${statusIcon}</span>
            </div>
            <div class="conversation-preview">${DOMUtils.escapeHTML(preview)}</div>
            <div class="conversation-meta">
              <span class="conversation-timestamp">${timestamp}</span>
              <span class="message-count">${session.messages?.length || 0} msgs</span>
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
    const items = this.conversationsList?.querySelectorAll('.conversation-item');
    items?.forEach(item => {
      const sessionId = item.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];
      item.classList.toggle('active', sessionId === this.currentSessionId);
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

  createStatusHTML(statusInfo) {
    const statusClass = statusInfo.status || 'active';
    const statusIcon = this.getStatusIcon(statusClass);
    
    return `
      <div class="status-badge ${statusClass}">
        ${statusIcon} ${statusClass}
      </div>
      <div class="message-count-badge">${statusInfo.messageCount} messages</div>
    `;
  }

  createContextHTML(preview) {
    if (!preview.lastUserMessage && !preview.lastAssistantMessage) {
      return '';
    }

    return `
      <div class="conversation-preview-card">
        <div class="preview-title">Recent Messages</div>
        ${preview.lastUserMessage ? `<div class="preview-user">You: ${DOMUtils.escapeHTML(preview.lastUserMessage.substring(0, 100))}${preview.lastUserMessage.length > 100 ? '...' : ''}</div>` : ''}
        ${preview.lastAssistantMessage ? `<div class="preview-assistant">Claude: ${DOMUtils.escapeHTML(preview.lastAssistantMessage.substring(0, 100))}${preview.lastAssistantMessage.length > 100 ? '...' : ''}</div>` : ''}
      </div>
    `;
  }

  getStatusIcon(status) {
    const icons = {
      'active': '🟢',
      'historical': '⚪',
      'archived': '🟡'
    };
    return icons[status] || '⚪';
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
    return this.currentSessionId;
  }

  getCurrentSession() {
    return this.sessions.find(s => s.id === this.currentSessionId);
  }

  // Notify other components about session changes
  notifySessionChange(sessionId, context) {
    // Dispatch custom event for other components to listen to
    const event = new CustomEvent('sessionChanged', {
      detail: { sessionId, context }
    });
    document.dispatchEvent(event);
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SessionManager;
} else {
  window.SessionManager = SessionManager;
}