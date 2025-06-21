// Message Component for handling message display and interactions
class MessageComponent {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.isStreaming = false;
    this.editingMessageId = null;
    this.currentRevertMessageId = null;

    this.initializeElements();
    this.setupEventListeners();
  }

  initializeElements() {
    this.messagesContainer = document.getElementById('messagesContainer');
    this.messageInput = document.getElementById('messageInput');
    this.sendBtn = document.getElementById('sendBtn');
    this.stopBtn = document.getElementById('stopBtn');
    this.inputArea = document.getElementById('inputArea');
    this.charCounter = document.getElementById('charCounter');
    this.sessionInfo = document.getElementById('sessionInfo');
  }

  setupEventListeners() {
    // Send button
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.sendMessage());
    }

    // Stop button
    if (this.stopBtn) {
      this.stopBtn.addEventListener('click', () => this.stopMessage());
    }

    // Message input
    if (this.messageInput) {
      this.messageInput.addEventListener('input', () => this.handleInputChange());
      this.messageInput.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    // Message stream events
    window.electronAPI.onMessageStream((event, data) => {
      this.handleMessageStream(data);
    });

    // Session change events
    document.addEventListener('sessionChanged', (e) => {
      this.handleSessionChange(e.detail);
    });
  }

  handleInputChange() {
    if (this.messageInput) {
      // Auto-resize textarea
      DOMUtils.autoResizeTextarea(this.messageInput);
      
      // Update character counter
      MessageUtils.updateCharCounter(this.messageInput, this.charCounter);
      
      // Update send button state
      this.updateSendButtonState();
    }
  }

  handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.sendMessage();
    }
  }

  async sendMessage() {
    const message = this.messageInput?.value.trim();
    const sessionId = this.sessionManager.getCurrentSessionId();

    if (!message || !sessionId || this.isStreaming) {
      return;
    }

    try {
      // Add user message to UI immediately
      this.addUserMessage(message);
      
      // Clear input
      this.messageInput.value = '';
      this.handleInputChange();
      
      // Start streaming
      this.setStreaming(true);
      
      // Send message to backend
      await window.electronAPI.sendMessage(sessionId, message);
      
    } catch (error) {
      console.error('Failed to send message:', error);
      this.setStreaming(false);
      this.showError('Failed to send message');
    }
  }

  async stopMessage() {
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (!sessionId) return;

    try {
      await window.electronAPI.stopMessage(sessionId);
      this.setStreaming(false);
    } catch (error) {
      console.error('Failed to stop message:', error);
    }
  }

  handleMessageStream(data) {
    const { sessionId, message, isComplete, thinkingContent } = data;
    
    // Only process streams for the current session
    if (sessionId !== this.sessionManager.getCurrentSessionId()) {
      return;
    }

    if (isComplete) {
      this.setStreaming(false);
      this.finalizeAssistantMessage(message);
    } else {
      this.updateStreamingMessage(message, thinkingContent);
    }
  }

  handleSessionChange(detail) {
    const { sessionId, context } = detail;
    this.loadSessionMessages(context);
    this.updateInputArea(context);
  }

  loadSessionMessages(context) {
    if (!this.messagesContainer) return;

    if (!context || !context.messages || context.messages.length === 0) {
      this.showEmptyState();
      return;
    }

    const messagesHTML = context.messages.map(message => 
      this.createMessageHTML(message, context.id)
    ).join('');

    this.messagesContainer.innerHTML = messagesHTML;
    this.scrollToBottom();
  }

  showEmptyState() {
    if (this.messagesContainer) {
      this.messagesContainer.innerHTML = `
        <div class="empty-state">
          <h3>Welcome to Claude Code Chat</h3>
          <p>Start a conversation with Claude Code. You have access to all tools including file operations, web search, and more.</p>
          <div class="features-info">
            <h4>Features:</h4>
            <ul>
              <li>✨ Real Claude Code SDK integration</li>
              <li>🔄 Session-based conversations with resume capability</li>
              <li>⚡ Streaming responses</li>
              <li>🛠️ Full tool access (file operations, web search, etc.)</li>
              <li>💾 Persistent conversation history</li>
            </ul>
          </div>
        </div>
      `;
    }
  }

  createMessageHTML(message, sessionId) {
    const timestamp = DOMUtils.formatTimestamp(message.timestamp);
    const messageId = message.id;
    const isInvalidated = message.invalidated;

    if (message.type === 'user') {
      return `
        <div class="conversation-turn user ${isInvalidated ? 'invalidated' : ''}" id="message-${messageId}">
          <div class="conversation-content">
            <div class="message-content">${DOMUtils.escapeHTML(message.content)}</div>
            <div class="conversation-timestamp">${timestamp}</div>
            ${this.createMessageActions(message, sessionId)}
          </div>
        </div>
      `;
    } else if (message.type === 'assistant') {
      const contentHTML = MessageUtils.createMessageHTML(message);
      
      return `
        <div class="conversation-turn assistant ${isInvalidated ? 'invalidated' : ''}" id="message-${messageId}">
          <div class="conversation-content">
            ${contentHTML}
            <div class="conversation-timestamp">${timestamp}</div>
          </div>
        </div>
      `;
    }

    return '';
  }

  createMessageActions(message, sessionId) {
    return `
      <div class="message-actions">
        <button class="revert-btn" 
                onclick="messageComponent.revertToMessage('${sessionId}', '${message.id}')"
                title="Revert files to this point">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 12a9 9 0 0 1-9 9c-4.7 0-8.6-3.4-9-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;
  }

  addUserMessage(content) {
    if (!this.messagesContainer) return;

    const messageId = 'temp_' + Date.now();
    const timestamp = DOMUtils.formatTimestamp(new Date().toISOString());
    const sessionId = this.sessionManager.getCurrentSessionId();

    const messageHTML = `
      <div class="conversation-turn user" id="message-${messageId}">
        <div class="conversation-content">
          <div class="message-content">${DOMUtils.escapeHTML(content)}</div>
          <div class="conversation-timestamp">${timestamp}</div>
          ${this.createMessageActions({ id: messageId }, sessionId)}
        </div>
      </div>
    `;

    // Remove empty state if present
    const emptyState = this.messagesContainer.querySelector('.empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    this.messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
    this.scrollToBottom();
  }

  updateStreamingMessage(message, thinkingContent) {
    if (!this.messagesContainer) return;

    // Remove existing streaming message if any
    const existingStreaming = this.messagesContainer.querySelector('.streaming-message');
    if (existingStreaming) {
      existingStreaming.remove();
    }

    // Create streaming message
    const contentHTML = MessageUtils.createMessageHTML(message);
    const messageHTML = `
      <div class="conversation-turn assistant streaming-message" id="streaming-message">
        <div class="conversation-content">
          ${contentHTML}
          <div class="streaming-indicator"></div>
        </div>
      </div>
    `;

    this.messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
    this.scrollToBottom();
  }

  finalizeAssistantMessage(message) {
    if (!this.messagesContainer) return;

    // Remove streaming message
    const streamingMessage = this.messagesContainer.querySelector('.streaming-message');
    if (streamingMessage) {
      streamingMessage.remove();
    }

    // Add final message
    const sessionId = this.sessionManager.getCurrentSessionId();
    const finalMessageHTML = this.createMessageHTML(message, sessionId);
    
    this.messagesContainer.insertAdjacentHTML('beforeend', finalMessageHTML);
    this.scrollToBottom();
  }

  async revertToMessage(sessionId, messageId) {
    try {
      const result = await window.electronAPI.revertToMessage(sessionId, messageId);
      if (result.success) {
        console.log('Reverted successfully:', result.message);
        this.currentRevertMessageId = messageId;
        this.markMessagesAsInvalidated(messageId);
      } else {
        this.showError(result.error || 'Failed to revert');
      }
    } catch (error) {
      console.error('Failed to revert:', error);
      this.showError('Failed to revert to message');
    }
  }

  async unrevertFromMessage(sessionId, messageId) {
    try {
      const result = await window.electronAPI.unrevertFromMessage(sessionId, messageId);
      if (result.success) {
        console.log('Unreverted successfully:', result.message);
        this.currentRevertMessageId = null;
        this.unmarkMessagesAsInvalidated(messageId);
      } else {
        this.showError(result.error || 'Failed to unrevert');
      }
    } catch (error) {
      console.error('Failed to unrevert:', error);
      this.showError('Failed to unrevert from message');
    }
  }

  markMessagesAsInvalidated(messageId) {
    if (!this.messagesContainer) return;

    const messages = this.messagesContainer.querySelectorAll('.conversation-turn');
    let foundMessage = false;

    messages.forEach(messageElement => {
      if (foundMessage) {
        messageElement.classList.add('invalidated');
      }
      if (messageElement.id === `message-${messageId}`) {
        foundMessage = true;
      }
    });
  }

  unmarkMessagesAsInvalidated(messageId) {
    if (!this.messagesContainer) return;

    const messages = this.messagesContainer.querySelectorAll('.conversation-turn');
    let foundMessage = false;

    messages.forEach(messageElement => {
      if (foundMessage) {
        messageElement.classList.remove('invalidated');
      }
      if (messageElement.id === `message-${messageId}`) {
        foundMessage = true;
      }
    });
  }

  updateInputArea(context) {
    if (!this.inputArea) return;

    if (context && context.id) {
      this.inputArea.style.display = 'block';
      this.updateSessionInfo(context);
    } else {
      this.inputArea.style.display = 'none';
    }
  }

  updateSessionInfo(context) {
    if (!this.sessionInfo) return;

    if (context && context.claudeSessionId) {
      this.sessionInfo.textContent = `Session: ${context.claudeSessionId.substring(0, 8)}...`;
    } else {
      this.sessionInfo.textContent = 'New session';
    }
  }

  updateSendButtonState() {
    if (!this.sendBtn || !this.messageInput) return;

    const hasContent = this.messageInput.value.trim().length > 0;
    const canSend = hasContent && !this.isStreaming && this.sessionManager.getCurrentSessionId();
    
    this.sendBtn.disabled = !canSend;
  }

  setStreaming(streaming) {
    this.isStreaming = streaming;
    this.sessionManager.setStreaming(streaming);
    
    // Update UI
    this.updateSendButtonState();
    
    if (this.sendBtn && this.stopBtn) {
      if (streaming) {
        this.sendBtn.style.display = 'none';
        this.stopBtn.style.display = 'flex';
      } else {
        this.sendBtn.style.display = 'flex';
        this.stopBtn.style.display = 'none';
      }
    }
  }

  scrollToBottom() {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  showError(message) {
    console.error('Message component error:', message);
    // You could implement a toast notification here
  }

  // Public methods for external access
  getIsStreaming() {
    return this.isStreaming;
  }

  getCurrentRevertMessageId() {
    return this.currentRevertMessageId;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageComponent;
} else {
  window.MessageComponent = MessageComponent;
}