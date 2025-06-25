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

    // Directory mismatch modal
    this.directoryMismatchModal = new DirectoryMismatchModal();

    // Layout state for compact mode
    this.isCompactMode = false;

    this.initializeElements();
    this.setupEventListeners();
    this.initializeLayoutState();
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

    // Layout state change events for compact mode
    document.addEventListener('layoutStateChanged', (e) => {
      this.handleLayoutStateChange(e.detail);
    });
  }

  initializeLayoutState() {
    // Initialize compact mode state based on current layout
    // Use setTimeout to ensure DOM is ready and app component is initialized
    setTimeout(() => {
      if (window.app && typeof window.app.getLayoutState === 'function') {
        const layoutState = window.app.getLayoutState();
        this.isCompactMode = layoutState.isChatOnly;

        // Apply initial styling class
        if (this.messagesContainer) {
          this.messagesContainer.classList.toggle('compact-mode', this.isCompactMode);
        }
      }
    }, 150);
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
    let sessionId = this.sessionManager.getCurrentSessionId();

    if (!message || this.isStreaming) {
      return;
    }

    try {
      // If no session exists (draft mode), create one first
      if (!sessionId) {
        if (this.sessionManager.isDraftModeActive()) {
          console.log('Creating session from draft mode before sending message');
          const session = await this.sessionManager.createSessionFromDraft();
          sessionId = session.id;
        } else {
          this.showError('No session available to send message');
          return;
        }
      }

      // Pre-send validation: check directory mismatch
      const validationResult = await window.electronAPI.validateSendDirectory(sessionId);

      if (!validationResult.success) {
        this.showError('Failed to validate directory: ' + validationResult.error);
        return;
      }

      // Handle directory mismatch cases
      if (!validationResult.canSend) {
        if (validationResult.mismatchReason === 'original_directory_missing') {
          // Original directory is missing, show warning and fall back to existing logic
          this.sessionManager.showDirectoryChangeWarning(
            validationResult.sessionCwd,
            'Original directory no longer exists'
          );
          // Continue with send - this will likely start a new conversation
        } else if (validationResult.mismatchReason === 'directory_changed') {
          // Directory changed but original still exists - show modal
          const shouldShowModal = DirectoryMismatchModal.shouldShowModal();

          if (shouldShowModal) {
            // Show modal and wait for user decision
            this.directoryMismatchModal.show({
              draftMessage: message,
              currentDirectory: validationResult.currentCwd,
              originalDirectory: validationResult.sessionCwd,
              onCancel: () => {
                // Do nothing - keep draft message in input
                console.log('User cancelled directory mismatch modal');
              },
              onCreateNewChat: (draftMessage) => {
                this.handleCreateNewChatWithDraft(draftMessage);
              }
            });
            return; // Stop here - don't send the message
          } else {
            // Modal suppressed - automatically create new chat
            this.handleCreateNewChatWithDraft(message);
            return;
          }
        }
      }

      // Validation passed or handled - proceed with sending
      await this.proceedWithSendMessage(message, sessionId);

    } catch (error) {
      console.error('Failed to send message:', error);
      this.setStreaming(false);
      this.showError('Failed to send message');
    }
  }

  async proceedWithSendMessage(message, sessionId) {
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
      console.error('Failed to proceed with send message:', error);
      this.setStreaming(false);
      this.showError('Failed to send message');
    }
  }

  async handleCreateNewChatWithDraft(draftMessage) {
    try {
      // This will create a session and select it.
      const newSession = await this.sessionManager.createNewSession();

      if (newSession) {
        // Set the draft message in the input
        if (this.messageInput) {
          this.messageInput.value = draftMessage;
          this.handleInputChange(); // Update UI state
          this.messageInput.focus();
        }
        console.log('Created new chat with draft message ready to send');
      }
    } catch (error) {
      console.error('Failed to create new chat with draft:', error);
      this.showError('Failed to create new conversation');
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
    const { sessionId, message, isComplete, thinkingContent, cwd } = data;

    // Only process streams for the current session
    if (sessionId !== this.sessionManager.getCurrentSessionId()) {
      return;
    }

    if (isComplete) {
      this.setStreaming(false);
      this.finalizeAssistantMessage(message, cwd);
    } else {
      this.updateStreamingMessage(message, thinkingContent, cwd);
    }
  }

  handleSessionChange(detail) {
    const { sessionId, context } = detail;

    // Close file mention dropdown when session changes
    this.hideMentionDropdown();

    this.loadSessionMessages(context);
    this.updateInputArea(context);
  }

  handleLayoutStateChange(detail) {
    const { newState } = detail;

    // Update compact mode state
    this.isCompactMode = newState.isChatOnly;

    // If currently showing empty state, refresh it with new layout mode
    if (this.messagesContainer && this.messagesContainer.querySelector('.empty-state')) {
      this.showEmptyState();
    }

    // Update messages container class for styling
    if (this.messagesContainer) {
      this.messagesContainer.classList.toggle('compact-mode', this.isCompactMode);
    }
  }

  loadSessionMessages(context) {
    if (!this.messagesContainer) return;

    if (!context || !context.messages || context.messages.length === 0) {
      this.showEmptyState();
      return;
    }

    // Reset current revert state
    this.currentRevertMessageId = null;
    this.removeUnrevertClickHandler();

    // Check if session has an active revert state
    if (context.currentRevertMessageId) {
      this.currentRevertMessageId = context.currentRevertMessageId;
    }

    const messagesHTML = context.messages.map(message =>
      this.createMessageHTML(message, context.id, context.cwd)
    ).join('');

    this.messagesContainer.innerHTML = messagesHTML;

    // Restore revert state UI if needed
    if (this.currentRevertMessageId) {
      this.makeMessageEditable(this.currentRevertMessageId);
      this.setupUnrevertClickHandler();
    }

    this.scrollToBottom();
  }

  showEmptyState() {
    if (this.messagesContainer) {
      if (this.isCompactMode) {
        // Compact mode: no welcome message, just ready for input
        this.messagesContainer.innerHTML = `
          <div class="empty-state compact">
            <!-- Ready for conversation in compact mode -->
          </div>
        `;
      } else {
        // Full mode: show complete welcome message
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
  }

  createMessageHTML(message, sessionId, cwd) {
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
      const contentHTML = MessageUtils.createMessageHTML(message, cwd);

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
    const isReverted = this.currentRevertMessageId === message.id;

    if (isReverted) {
      // Show send button for reverted/editable message
      return `
        <div class="message-actions">
          <button class="send-edited-btn"
                  onclick="window.messageComponent.sendEditedMessage('${sessionId}', '${message.id}')"
                  title="Send edited message to continue conversation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="m22 2-7 20-4-9-9-4 20-7z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Send
          </button>
        </div>
      `;
    } else {
      // Show restore checkpoint button for normal messages
      return `
        <div class="message-actions">
          <button class="revert-btn"
                  onclick="revertToMessage('${sessionId}', '${message.id}')"
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

    // Transition from compact mode to full view when user sends a message
    // if (this.isCompactMode) {
    //   this.expandToFullView();
    // }

    this.messagesContainer.insertAdjacentHTML('beforeend', messageHTML);
    this.scrollToBottom();
  }

  updateStreamingMessage(message, thinkingContent, cwd) {
    if (!this.messagesContainer) return;

    // Remove existing streaming message if any
    const existingStreaming = this.messagesContainer.querySelector('.streaming-message');
    if (existingStreaming) {
      existingStreaming.remove();
    }

    // Create streaming message with inline tool calls
    const contentHTML = this.createStreamingMessageHTML(message, thinkingContent, cwd);
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

  createStreamingMessageHTML(message, thinkingContent, cwd) {
    const { orderedContent, thinking } = MessageUtils.parseMessageContent(message.content);

    if (!orderedContent || orderedContent.length === 0) {
      // Fallback to regular message HTML for simple content
      return MessageUtils.createMessageHTML(message, cwd);
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
        html += MessageUtils.createInlineToolCall(block, status, cwd);
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

  finalizeAssistantMessage(message, cwd) {
    if (!this.messagesContainer) return;

    // Remove streaming message
    const streamingMessage = this.messagesContainer.querySelector('.streaming-message');
    if (streamingMessage) {
      streamingMessage.remove();
    }

    // Add final message
    const sessionId = this.sessionManager.getCurrentSessionId();
    const finalMessageHTML = this.createMessageHTML(message, sessionId, cwd);

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
        this.makeMessageEditable(messageId);
        this.setupUnrevertClickHandler();
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
        this.makeMessageNonEditable(messageId);
        this.removeUnrevertClickHandler();
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
    const sessionId = this.sessionManager.getCurrentSessionId();
    const isDraftMode = this.sessionManager.isDraftModeActive();

    // Can send if we have content, not streaming, and either have a session or are in draft mode
    const canSend = hasContent && !this.isStreaming && (sessionId || isDraftMode);

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

  async searchAndShowMentions() {
    if (!this.mentionQuery && this.mentionQuery !== '') {
      this.hideMentionDropdown();
      return;
    }

    try {
      // Use the new recursive file search API
      const searchResult = await window.electronAPI.searchFilesByPrefix(this.mentionQuery, 20); // Limit to 20 results for dropdown

      if (searchResult.success && searchResult.results.length > 0) {
        this.mentionMatches = searchResult.results;
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
      const relativePath = match.relativePath || match.name;
      const pathDisplay = relativePath !== match.name ? `<span class="file-mention-path">${DOMUtils.escapeHTML(relativePath)}</span>` : '';

      return `
        <div class="file-mention-item ${isSelected ? 'selected' : ''}"
             data-index="${index}"
             role="option"
             aria-selected="${isSelected}">
          <span class="file-mention-icon codicon ${match.icon}"></span>
          <div class="file-mention-details">
            <span class="file-mention-name">${highlightedName}</span>
            ${pathDisplay}
          </div>
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

    // Replace the mention with the selected file path (use relative path if available, otherwise filename)
    const beforeMention = text.substring(0, mentionInfo.start);
    const afterMention = text.substring(mentionInfo.end);
    const filePath = selectedMatch.relativePath || selectedMatch.name;

    const newText = beforeMention + '@' + filePath + ' ' + afterMention;
    const newCursorPos = beforeMention.length + filePath.length + 2; // +2 for '@' and space

    this.messageInput.value = newText;
    DOMUtils.setCursorPosition(this.messageInput, newCursorPos);

    // Hide dropdown and reset state
    this.hideMentionDropdown();

    // Trigger input change to update UI
    this.handleInputChange();
  }

  insertFilePath(filePath) {
    if (!this.messageInput) return;

    const currentText = this.messageInput.value;
    const cursorPos = DOMUtils.getCursorPosition(this.messageInput);

    // Format the file path as requested - just the path without additional formatting
    const filePathText = filePath;

    // Insert at current cursor position
    const beforeCursor = currentText.substring(0, cursorPos);
    const afterCursor = currentText.substring(cursorPos);

    // Add space before if there's text and it doesn't end with space
    const needsSpaceBefore = beforeCursor.length > 0 && !beforeCursor.endsWith(' ');
    const spaceBefore = needsSpaceBefore ? ' ' : '';

    // Add space after unless we're at the end
    const needsSpaceAfter = afterCursor.length > 0 && !afterCursor.startsWith(' ');
    const spaceAfter = needsSpaceAfter ? ' ' : '';

    const newText = beforeCursor + spaceBefore + filePathText + spaceAfter + afterCursor;
    const newCursorPos = beforeCursor.length + spaceBefore.length + filePathText.length + spaceAfter.length;

    this.messageInput.value = newText;
    DOMUtils.setCursorPosition(this.messageInput, newCursorPos);

    // Trigger input change to update UI
    this.handleInputChange();

    // Focus the input to show the cursor
    this.messageInput.focus();
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

  // Make a message editable after revert
  makeMessageEditable(messageId) {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (!messageElement) return;

    const messageContent = messageElement.querySelector('.message-content');
    if (!messageContent) return;

    // Get the original text content
    const originalText = messageContent.textContent;

    // Replace with editable textarea
    messageContent.innerHTML = `
      <textarea class="editable-message" id="edit-${messageId}" rows="3">${DOMUtils.escapeHTML(originalText)}</textarea>
    `;

    // Add editable class to message for styling
    messageElement.classList.add('message-editable');

    // Auto-resize the textarea and focus it
    const textarea = messageContent.querySelector('.editable-message');
    if (textarea) {
      DOMUtils.autoResizeTextarea(textarea);
      textarea.focus();
      textarea.addEventListener('input', () => DOMUtils.autoResizeTextarea(textarea));
    }

    // Re-render the message actions to show send button
    this.updateMessageActions(messageElement, messageId);
  }

  // Make a message non-editable (restore normal view)
  makeMessageNonEditable(messageId) {
    const messageElement = document.getElementById(`message-${messageId}`);
    if (!messageElement) return;

    const messageContent = messageElement.querySelector('.message-content');
    const textarea = messageContent?.querySelector('.editable-message');
    if (!textarea) return;

    // Get the current text from textarea
    const currentText = textarea.value;

    // Replace with normal text display
    messageContent.innerHTML = DOMUtils.escapeHTML(currentText);

    // Remove editable class
    messageElement.classList.remove('message-editable');

    // Re-render the message actions to show restore button
    this.updateMessageActions(messageElement, messageId);
  }

  // Update message actions for a specific message
  updateMessageActions(messageElement, messageId) {
    const actionsContainer = messageElement.querySelector('.message-actions');
    if (!actionsContainer) return;

    const sessionId = this.sessionManager.getCurrentSessionId();
    const message = { id: messageId }; // Minimal message object for actions

    actionsContainer.innerHTML = this.createMessageActions(message, sessionId).replace('<div class="message-actions">', '').replace('</div>', '');
  }

  // Send the edited message to continue the conversation
  async sendEditedMessage(sessionId, messageId) {
    const textarea = document.getElementById(`edit-${messageId}`);
    if (!textarea) return;

    const editedMessage = textarea.value.trim();
    if (!editedMessage) {
      this.showError('Please enter a message');
      return;
    }

    try {
      // Send the edited message while keeping files in reverted state
      // This allows Claude to process the message with the reverted codebase
      await this.proceedWithSendMessage(editedMessage, sessionId);

    } catch (error) {
      console.error('Failed to send edited message:', error);
      this.showError('Failed to send edited message');
    }
  }

  // Set up click handler to unrevert when clicking below reverted message
  setupUnrevertClickHandler() {
    if (this.unrevertClickHandler) {
      this.removeUnrevertClickHandler();
    }

    this.unrevertClickHandler = (event) => {
      if (!this.currentRevertMessageId) return;

      // Check if click is on a message below the reverted one
      const clickedMessage = event.target.closest('.conversation-turn');
      if (!clickedMessage) return;

      const clickedMessageId = clickedMessage.id.replace('message-', '');
      const revertedElement = document.getElementById(`message-${this.currentRevertMessageId}`);

      if (revertedElement && this.isElementAfter(revertedElement, clickedMessage)) {
        const sessionId = this.sessionManager.getCurrentSessionId();
        this.unrevertFromMessage(sessionId, this.currentRevertMessageId);
      }
    };

    if (this.messagesContainer) {
      this.messagesContainer.addEventListener('click', this.unrevertClickHandler);
    }
  }

  // Remove unrevert click handler
  removeUnrevertClickHandler() {
    if (this.unrevertClickHandler && this.messagesContainer) {
      this.messagesContainer.removeEventListener('click', this.unrevertClickHandler);
      this.unrevertClickHandler = null;
    }
  }

  // Check if element A comes before element B in the DOM
  isElementAfter(elementA, elementB) {
    const position = elementA.compareDocumentPosition(elementB);
    return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  }

  // Expand from compact mode to full view when user sends a message
  expandToFullView() {
    // Show the file browser to transition from compact mode to full view
    const sidebar = document.querySelector('.sidebar');
    if (sidebar && sidebar.classList.contains('hidden')) {
      sidebar.classList.remove('hidden');

      // Update global header button state
      if (window.globalHeader) {
        window.globalHeader.updateButtonStates();
      }

      // Trigger layout state change detection
      setTimeout(() => {
        if (window.app && typeof window.app.getLayoutState === 'function') {
          const newLayoutState = window.app.getLayoutState();
          this.isCompactMode = newLayoutState.isChatOnly;

          // Update styling class
          if (this.messagesContainer) {
            this.messagesContainer.classList.toggle('compact-mode', this.isCompactMode);
          }
        }
      }, 50);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageComponent;
} else {
  window.MessageComponent = MessageComponent;
}