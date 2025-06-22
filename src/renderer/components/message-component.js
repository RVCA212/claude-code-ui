// Message Component for handling message display and interactions
class MessageComponent {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.isStreaming = false;
    this.editingMessageId = null;
    this.currentRevertMessageId = null;

    // File mention state
    this.isMentioning = false;
    this.mentionQuery = '';
    this.mentionStartPos = -1;
    this.selectedMentionIndex = 0;
    this.mentionMatches = [];

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

    // File mention dropdown elements
    this.fileMentionDropdown = document.getElementById('fileMentionDropdown');
    this.fileMentionList = document.getElementById('fileMentionList');

    // Ensure file mention elements exist, create if missing
    if (!this.fileMentionDropdown) {
      console.warn('File mention dropdown not found in DOM, creating fallback');
      this.createFileMentionElements();
    }
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
      this.messageInput.addEventListener('blur', () => this.hideMentionDropdown());
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

      // Handle file mention detection and search
      this.handleMentionDetection();

      // Update send button state
      this.updateSendButtonState();
    }
  }

  handleKeyDown(e) {
    // Handle file mention dropdown navigation
    if (this.isMentioning && this.mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.selectedMentionIndex = Math.min(this.selectedMentionIndex + 1, this.mentionMatches.length - 1);
        this.updateMentionSelection();
        return;
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.selectedMentionIndex = Math.max(this.selectedMentionIndex - 1, 0);
        this.updateMentionSelection();
        return;
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        this.insertSelectedMention();
        return;
      } else if (e.key === 'Escape') {
        e.preventDefault();
        this.hideMentionDropdown();
        return;
      } else if (e.key === ' ') {
        // Close mention dropdown on space
        this.hideMentionDropdown();
      }
    }

    // Regular message handling
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

    // Close file mention dropdown when session changes
    this.hideMentionDropdown();

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
            ${this.createMessageActions(message, sessionId)}
            <div class="conversation-timestamp">${timestamp}</div>
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
                title="Restore checkpoint - revert files to this point">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 7v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Restore checkpoint
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

    // Create streaming message with inline tool calls
    const contentHTML = this.createStreamingMessageHTML(message, thinkingContent);
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

  createStreamingMessageHTML(message, thinkingContent) {
    const { orderedContent, thinking } = MessageUtils.parseMessageContent(message.content);

    if (!orderedContent || orderedContent.length === 0) {
      // Fallback to regular message HTML for simple content
      return MessageUtils.createMessageHTML(message);
    }

    let html = '<div class="assistant-response inline-response streaming">';

    orderedContent.forEach(block => {
      if (block.type === 'text') {
        if (block.text && block.text.trim()) {
          html += `<div class="response-text">${MessageUtils.formatTextContent(block.text)}</div>`;
        }
      } else if (block.type === 'tool_use') {
        // During streaming, show tool calls as "in_progress" unless they have output
        const status = block.output ? 'completed' : 'in_progress';
        html += MessageUtils.createInlineToolCall(block, status);
      }
    });

    // Add thinking content if provided during streaming
    if (thinkingContent) {
      html += MessageUtils.createThinkingSection({ thinking: thinkingContent }, true);
    } else if (thinking) {
      html += MessageUtils.createThinkingSection(thinking, true);
    }

    html += '</div>';
    return html;
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
      // Hide mention dropdown when input area is hidden
      this.hideMentionDropdown();
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

    // Hide mention dropdown when streaming starts
    if (streaming) {
      this.hideMentionDropdown();
    }

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

  // Create file mention elements if they don't exist
  createFileMentionElements() {
    if (!this.inputArea) {
      console.error('Input area not found, cannot create file mention elements');
      return;
    }

    // Create dropdown container
    const dropdown = DOMUtils.createElement('div', {
      id: 'fileMentionDropdown',
      className: 'file-mention-dropdown',
      style: 'display: none;'
    });

    // Create list container
    const list = DOMUtils.createElement('div', {
      id: 'fileMentionList',
      className: 'file-mention-list',
      role: 'listbox'
    });

    dropdown.appendChild(list);
    this.inputArea.insertBefore(dropdown, this.inputArea.firstChild);

    // Update references
    this.fileMentionDropdown = dropdown;
    this.fileMentionList = list;

    console.log('File mention elements created successfully');
  }

  // File mention methods
  handleMentionDetection() {
    if (!this.messageInput) return;

    const text = this.messageInput.value;
    const cursorPos = DOMUtils.getCursorPosition(this.messageInput);

    // Extract mention query from current cursor position
    const mentionInfo = DOMUtils.extractMentionQuery(text, cursorPos);

    if (mentionInfo) {
      // Check if this is a new mention or continuing an existing one
      if (!this.isMentioning || this.mentionStartPos !== mentionInfo.start) {
        // New mention started
        this.isMentioning = true;
        this.mentionStartPos = mentionInfo.start;
        this.selectedMentionIndex = 0;
      }

      // Update query and search for files
      this.mentionQuery = mentionInfo.query;
      this.searchAndShowMentions();
    } else {
      // No mention detected, hide dropdown
      this.hideMentionDropdown();
    }
  }

  searchAndShowMentions() {
    if (!this.mentionQuery && this.mentionQuery !== '') {
      this.hideMentionDropdown();
      return;
    }

    // Get file browser instance
    const fileBrowser = window.fileBrowser;
    if (!fileBrowser) {
      console.debug('File browser not available for mention search');
      this.hideMentionDropdown();
      return;
    }

    // Ensure file browser has content to search
    if (!fileBrowser.getFilteredContents || typeof fileBrowser.searchFilesByPrefix !== 'function') {
      console.warn('File browser search method not available');
      this.hideMentionDropdown();
      return;
    }

    try {
      // Search for matching files
      this.mentionMatches = fileBrowser.searchFilesByPrefix(this.mentionQuery);

      if (this.mentionMatches.length > 0) {
        this.selectedMentionIndex = 0;
        this.showMentionDropdown();
      } else {
        this.hideMentionDropdown();
      }
    } catch (error) {
      console.error('Error searching for file mentions:', error);
      this.hideMentionDropdown();
    }
  }

  showMentionDropdown() {
    if (!this.fileMentionDropdown || !this.fileMentionList) return;

    // Populate dropdown with file matches
    const itemsHTML = this.mentionMatches.map((match, index) => {
      const isSelected = index === this.selectedMentionIndex;
      const highlightedName = this.highlightMentionQuery(match.name, this.mentionQuery);

      return `
        <div class="file-mention-item ${isSelected ? 'selected' : ''}"
             data-index="${index}"
             role="option"
             aria-selected="${isSelected}">
          <span class="file-mention-icon">${match.icon}</span>
          <span class="file-mention-name">${highlightedName}</span>
        </div>
      `;
    }).join('');

    if (itemsHTML) {
      this.fileMentionList.innerHTML = itemsHTML;

      // Set ARIA attributes
      if (this.messageInput) {
        this.messageInput.setAttribute('aria-owns', 'fileMentionList');
        this.messageInput.setAttribute('aria-expanded', 'true');
      }

      // Add click handlers for dropdown items
      this.addMentionClickHandlers();

      // Show dropdown
      this.fileMentionDropdown.style.display = 'block';
    } else {
      this.hideMentionDropdown();
    }
  }

  hideMentionDropdown() {
    if (this.fileMentionDropdown) {
      this.fileMentionDropdown.style.display = 'none';
    }

    if (this.messageInput) {
      this.messageInput.removeAttribute('aria-owns');
      this.messageInput.setAttribute('aria-expanded', 'false');
    }

    // Reset mention state
    this.isMentioning = false;
    this.mentionQuery = '';
    this.mentionStartPos = -1;
    this.selectedMentionIndex = 0;
    this.mentionMatches = [];
  }

  updateMentionSelection() {
    if (!this.fileMentionList) return;

    const items = this.fileMentionList.querySelectorAll('.file-mention-item');
    items.forEach((item, index) => {
      const isSelected = index === this.selectedMentionIndex;
      item.classList.toggle('selected', isSelected);
      item.setAttribute('aria-selected', isSelected);
    });

    // Scroll selected item into view
    const selectedItem = items[this.selectedMentionIndex];
    if (selectedItem) {
      DOMUtils.scrollIntoView(selectedItem, { block: 'nearest' });
    }
  }

  insertSelectedMention() {
    if (!this.messageInput || this.selectedMentionIndex >= this.mentionMatches.length) return;

    const selectedMatch = this.mentionMatches[this.selectedMentionIndex];
    const text = this.messageInput.value;

    // Get the mention info to know what to replace
    const mentionInfo = DOMUtils.extractMentionQuery(text, DOMUtils.getCursorPosition(this.messageInput));
    if (!mentionInfo) return;

    // Replace the mention with the selected file path (relative path + trailing space)
    const beforeMention = text.substring(0, mentionInfo.start);
    const afterMention = text.substring(mentionInfo.end);
    const relativePath = selectedMatch.name; // Use just the filename for simplicity

    const newText = beforeMention + '@' + relativePath + ' ' + afterMention;
    const newCursorPos = beforeMention.length + relativePath.length + 2; // +2 for '@' and space

    this.messageInput.value = newText;
    DOMUtils.setCursorPosition(this.messageInput, newCursorPos);

    // Hide dropdown and reset state
    this.hideMentionDropdown();

    // Trigger input change to update UI
    this.handleInputChange();
  }

  addMentionClickHandlers() {
    if (!this.fileMentionList) return;

    const items = this.fileMentionList.querySelectorAll('.file-mention-item');
    items.forEach((item, index) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        this.selectedMentionIndex = index;
        this.insertSelectedMention();
      });
    });
  }

  highlightMentionQuery(filename, query) {
    if (!query) return DOMUtils.escapeHTML(filename);

    const escapedFilename = DOMUtils.escapeHTML(filename);
    const escapedQuery = DOMUtils.escapeHTML(query);
    const queryLength = query.length;

    if (filename.toLowerCase().startsWith(query.toLowerCase())) {
      const beforeMatch = escapedFilename.substring(0, queryLength);
      const afterMatch = escapedFilename.substring(queryLength);
      return `<span class="file-mention-highlight">${beforeMatch}</span>${afterMatch}`;
    }

    return escapedFilename;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageComponent;
} else {
  window.MessageComponent = MessageComponent;
}