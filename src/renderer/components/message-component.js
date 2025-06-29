// Message Component for handling message display and interactions
class MessageComponent {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;
    this.isStreaming = false;
    this.editingMessageId = null;
    this.currentRevertMessageId = null;
    this.isDraftSession = false;

    // File mention state
    this.isMentioning = false;
    this.mentionQuery = '';
    this.mentionStartPos = -1;
    this.selectedMentionIndex = 0;
    this.mentionMatches = [];

    // Lock state
    this.isLocked = false;

    // Directory mismatch modal
    this.directoryMismatchModal = new DirectoryMismatchModal();

    // Layout state for compact mode
    this.isCompactMode = false;

    // Pending message update tracking
    this.pendingMessageUpdate = null;

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
    this.lockBtn = document.getElementById('lockBtn');
    this.lockIcon = this.lockBtn.querySelector('.codicon');

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

    // Lock button
    if (this.lockBtn) {
      this.lockBtn.addEventListener('click', () => this.toggleLockState());
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

    // User message saved events (for updating temp IDs with real UUIDs)
    window.electronAPI.onUserMessageSaved((event, data) => {
      this.handleUserMessageSaved(data);
    });

    // Session change events
    document.addEventListener('sessionChanged', (e) => {
      this.handleSessionChange(e.detail);
    });

    // File path click handling with event delegation
    if (this.messagesContainer) {
      this.messagesContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('file-path-link')) {
          const filePath = e.target.getAttribute('data-file-path');
          if (filePath) {
            this.handleFilePathClick(filePath, e);
          }
        }
      });
    }

    // Layout state change events for compact mode
    document.addEventListener('layoutStateChanged', (e) => {
      this.handleLayoutStateChange(e.detail);
    });

    // Tray event for Excel files
    window.electronAPI.onTrayOpenExcelFile(async (event, filePath) => {
      if (!filePath) return;

      try {
        const result = await window.electronAPI.handleTrayOpenExcelFile(filePath);
        if (result.success && result.relativePath) {
          this.insertFilePath(`Given the excel file in '@${result.relativePath}' `);
        } else {
          this.showError(result.error || 'Failed to open Excel file from tray.');
        }
      } catch (error) {
        console.error('Error handling tray open excel file:', error);
        this.showError('An error occurred while opening the Excel file.');
      }
    });

    // Tray event for Photoshop files
    window.electronAPI.onTrayOpenPhotoshopFile(async (event, filePath) => {
      if (!filePath) return;

      try {
        const result = await window.electronAPI.handleTrayOpenPhotoshopFile(filePath);
        if (result.success && result.relativePath) {
          this.insertFilePath(`Given the image file in '@${result.relativePath}' `);
        } else {
          this.showError(result.error || 'Failed to open Photoshop file from tray.');
        }
      } catch (error) {
        console.error('Error handling tray open photoshop file:', error);
        this.showError('An error occurred while opening the Photoshop file.');
      }
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

    // Check if current session is streaming (not any session)
    if (!message || this.sessionManager.isCurrentSessionStreaming()) {
      return;
    }

    try {
      // If no session exists (draft mode), create one first
      if (!sessionId) {
        if (this.sessionManager.isDraftModeActive()) {
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

      // Show typing indicator
      this.showTypingIndicator();

      // Clear input
      this.messageInput.value = '';
      this.handleInputChange();

      if (window.electronAPI && window.electronAPI.resizeWindow) {
        window.electronAPI.resizeWindow({ height: 600 });
      }

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

    // Hide the typing indicator as soon as the first stream chunk arrives
    this.hideTypingIndicator();

    if (isComplete) {
      this.setStreaming(false);
      this.finalizeAssistantMessage(message, cwd);
    } else {
      this.updateStreamingMessage(message, thinkingContent, cwd);
    }
  }

  handleUserMessageSaved(data) {
    const { sessionId, messageId, content, timestamp } = data;

    console.log('=== USER MESSAGE SAVED EVENT ===');
    console.log('Event data:', { sessionId, messageId, content: content.substring(0, 50) + '...', timestamp });

    // Only process for the current session
    if (sessionId !== this.sessionManager.getCurrentSessionId()) {
      console.log('Ignoring user message saved event for different session');
      return;
    }

    // Update the temporary message ID with the real UUID
    this.updateUserMessageId(messageId);

    console.log('=== USER MESSAGE SAVED EVENT END ===');
  }

  handleSessionChange(detail) {
    const { sessionId, context } = detail;

    // Log session transition for debugging
    console.log('📝 Session change detected:', {
      from: this.sessionManager?.getCurrentSessionId() || 'none',
      to: sessionId || 'none',
      isDraft: context?.isDraft,
      hasContext: !!context,
      claudeSessionId: context?.claudeSessionId?.substring(0, 8) + '...' || 'none'
    });

    // Close file mention dropdown when session changes
    this.hideMentionDropdown();

    this.isDraftSession = context?.isDraft || context?.id === 'draft';
    this.updateInputAreaStyling();

    this.loadSessionMessages(context);
    this.updateInputArea(context);

    // Update UI state based on new session's streaming state
    const isNewSessionStreaming = sessionId ? this.sessionManager.isSessionStreaming(sessionId) : false;

    // Update button visibility based on new session
    if (this.sendBtn && this.stopBtn) {
      if (isNewSessionStreaming) {
        this.sendBtn.style.display = 'none';
        this.stopBtn.style.display = 'flex';
      } else {
        this.sendBtn.style.display = 'flex';
        this.stopBtn.style.display = 'none';
      }
    }

    // Update send button state for new session
    this.updateSendButtonState();
  }

  handleLayoutStateChange(detail) {
    const { newState } = detail;

    // Update compact mode state
    this.isCompactMode = newState.isChatOnly;
    this.updateInputAreaStyling();

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

    // No need to manually add revert buttons - they're already included in createMessageHTML
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
    } else if (message.type === 'user') {
      // Always show the Restore checkpoint button so the user can attempt an undo at any time.
      return `
        <div class="message-actions">
          <button class="revert-btn"
                  onclick="window.messageComponent.revertChangesAfterMessage('${sessionId}', '${message.id}')"
                  title="Restore checkpoint – revert file changes from the next assistant message">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 7v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Restore checkpoint
          </button>
        </div>
      `;
    } else {
      // No actions for assistant messages or other message types
      return '<div class="message-actions"></div>';
    }
  }

  addUserMessage(content) {
    if (!this.messagesContainer) return;

    const messageId = 'temp_' + Date.now();
    const timestamp = DOMUtils.formatTimestamp(new Date().toISOString());
    const sessionId = this.sessionManager.getCurrentSessionId();

    const messageHTML = `
      <div class="conversation-turn user" id="message-${messageId}" data-temp-id="${messageId}">
        <div class="conversation-content">
          <div class="message-content">${DOMUtils.escapeHTML(content)}</div>
          ${this.createMessageActions({ id: messageId, type: 'user' }, sessionId)}
          <div class="conversation-timestamp">${timestamp}</div>
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

    // Store the temporary ID for later update
    this.pendingMessageUpdate = {
      tempId: messageId,
      content: content,
      timestamp: timestamp
    };
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

    // No need to manually add revert buttons - they're already included in createMessageHTML
  }

  async revertToMessage(sessionId, messageId) {
    console.log('=== REVERT TO MESSAGE UI START ===');
    console.log('Parameters:', { sessionId, messageId });

    try {
      // Enhanced parameter validation
      if (!sessionId || !messageId) {
        console.error('Invalid parameters for revert operation');
        this.showError('Invalid session or message information');
        return;
      }

      console.log('Calling backend revert operation...');
      const result = await window.electronAPI.revertToMessage(sessionId, messageId);
      console.log('Backend revert result:', result);

      if (result.success) {
        console.log(`Successfully reverted ${result.revertedFiles?.length || 0} files`);

        // Update UI state
        this.currentRevertMessageId = messageId;
        this.markMessagesAsInvalidated(messageId);
        this.makeMessageEditable(messageId);
        this.setupUnrevertClickHandler();

        // Show success message with details
        const fileCount = result.revertedFiles?.length || 0;
        const successMessage = result.message || `Successfully reverted ${fileCount} files`;

        // Could implement a success toast here
        console.log('Revert operation completed successfully:', successMessage);

        // If there were partial failures, log them
        if (result.failedFiles && result.failedFiles.length > 0) {
          console.warn('Some files failed to revert:', result.failedFiles);
        }

        console.log('=== REVERT TO MESSAGE UI END ===');
      } else {
        console.error('Revert operation failed:', result.error);

        // Provide enhanced error reporting
        let errorMessage = result.error || 'Failed to revert';

        // Add context from session validation if available
        if (result.sessionValidation && !result.sessionValidation.valid) {
          errorMessage += ` (${result.sessionValidation.reason})`;
        }

        // Show session statistics for debugging if available
        if (result.sessionStats) {
          console.log('Session statistics:', result.sessionStats);
        }

        this.showError(errorMessage);
        console.log('=== REVERT TO MESSAGE UI END ===');
      }
    } catch (error) {
      console.error('=== REVERT TO MESSAGE UI ERROR ===');
      console.error('Failed to revert:', error);
      console.error('Stack trace:', error.stack);
      console.error('Error context:', {
        sessionId,
        messageId,
        errorType: error.name,
        errorMessage: error.message
      });

      // Provide more specific error messages
      if (error.message.includes('network') || error.message.includes('fetch')) {
        this.showError('Network error: Unable to communicate with the backend');
      } else if (error.message.includes('timeout')) {
        this.showError('Operation timed out: Please try again');
      } else {
        this.showError(`Failed to revert to message: ${error.message}`);
      }

      console.log('=== REVERT TO MESSAGE UI END ===');
    }
  }

  // Revert file changes that occurred after a specific user message
  async revertChangesAfterMessage(sessionId, userMessageId) {
    try {
      console.log('=== REVERT CHANGES DEBUG START ===');
      console.log('Session ID:', sessionId);
      console.log('User Message ID:', userMessageId);

      // Enhanced parameter validation
      if (!sessionId || !userMessageId) {
        console.error('Invalid parameters for revert operation');
        this.showError('Invalid session or message information');
        return;
      }

      // Get the current session to find all messages
      // **Fetch latest session context from main process to avoid stale data**
      const currentSession = await window.electronAPI.getSessionContext(sessionId);
      if (!currentSession || !currentSession.messages) {
        console.log('No session found or no messages in session');
        this.showError('No conversation found to revert');
        return;
      }

      console.log('Session found with', currentSession.messages.length, 'messages');
      console.log('Session messages:', currentSession.messages.map(m => ({
        id: m.id,
        type: m.type,
        timestamp: m.timestamp,
        content: typeof m.content === 'string' ? m.content.substring(0, 50) + '...' : `[${m.content?.length || 0} blocks]`
      })));

      // Find the next assistant message after the user's message that has file changes
      const targetAssistantMessage = await this.findNextAssistantMessageWithChanges(
        currentSession.messages,
        userMessageId,
        sessionId
      );

      if (targetAssistantMessage) {
        console.log('Found target assistant message:', targetAssistantMessage.id);
        console.log('Target message timestamp:', targetAssistantMessage.timestamp);
        console.log('=== REVERT CHANGES DEBUG END ===');

        // Revert to before this assistant message's changes
        await this.revertToMessage(sessionId, targetAssistantMessage.id);
      } else {
        console.log('No target assistant message found with file changes');

        // Enhanced debugging: check if there are any assistant messages at all after the user message
        const userMessageIndex = currentSession.messages.findIndex(m => m.id === userMessageId);
        if (userMessageIndex >= 0) {
          const subsequentMessages = currentSession.messages.slice(userMessageIndex + 1);
          const assistantMessages = subsequentMessages.filter(m => m.type === 'assistant');
          console.log(`Found ${assistantMessages.length} assistant messages after user message`);

          if (assistantMessages.length > 0) {
            console.log('Assistant messages found but none have file changes');
            this.showError('No file changes were made in the following conversation turns.');
          } else {
            console.log('No assistant messages found after user message');
            this.showError('No assistant responses found after this message to revert from.');
          }
        } else {
          console.error('User message not found in session');
          this.showError('Could not locate the specified message in the conversation.');
        }

        console.log('=== REVERT CHANGES DEBUG END ===');
      }
    } catch (error) {
      console.error('=== REVERT CHANGES DEBUG ERROR ===');
      console.error('Failed to revert changes after message:', error);
      console.error('Stack trace:', error.stack);
      console.error('Error context:', {
        sessionId,
        userMessageId,
        errorType: error.name,
        errorMessage: error.message
      });
      console.error('=== REVERT CHANGES DEBUG END ===');

      // Provide more specific error messages based on error type
      if (error.message.includes('session')) {
        this.showError('Session error: Unable to access conversation data');
      } else if (error.message.includes('message')) {
        this.showError('Message error: Unable to locate the specified message');
      } else {
        this.showError(`Failed to revert file changes: ${error.message}`);
      }
    }
  }

  async unrevertFromMessage(sessionId, messageId) {
    try {
      const result = await window.electronAPI.unrevertFromMessage(sessionId, messageId);
      if (result.success) {
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

  updateInputAreaStyling() {
    if (!this.inputArea) return;

    if (this.isDraftSession && this.isCompactMode) {
      this.inputArea.classList.add('welcoming');
    } else {
      this.inputArea.classList.remove('welcoming');
    }
  }

  updateSessionInfo(context) {
    if (!this.sessionInfo) return;

    const isDraft = context?.isDraft || context?.id === 'draft';

    if (isDraft) {
        this.sessionInfo.innerHTML = '';
    } else if (context && context.claudeSessionId) {
      // Show truncated Claude session ID with tooltip showing full ID and internal session ID
      const truncatedId = context.claudeSessionId.substring(0, 8);
      this.sessionInfo.textContent = `Session: ${truncatedId}...`;
      this.sessionInfo.title = `Claude Session: ${context.claudeSessionId}\nInternal ID: ${context.id || 'N/A'}`;
    } else {
      this.sessionInfo.innerHTML = '';
    }
  }

  updateSendButtonState() {
    if (!this.sendBtn || !this.messageInput) return;

    const hasContent = this.messageInput.value.trim().length > 0;
    const sessionId = this.sessionManager.getCurrentSessionId();
    const isDraftMode = this.sessionManager.isDraftModeActive();

    // Check if current session is streaming (not any session)
    const isCurrentSessionStreaming = this.sessionManager.isCurrentSessionStreaming();

    // Can send if we have content, current session not streaming, and either have a session or are in draft mode
    const canSend = hasContent && !isCurrentSessionStreaming && (sessionId || isDraftMode);

    this.sendBtn.disabled = !canSend;
  }

  setStreaming(streaming) {
    this.isStreaming = streaming; // Keep for legacy compatibility

    // Update per-session streaming state
    const sessionId = this.sessionManager.getCurrentSessionId();
    if (sessionId) {
      this.sessionManager.setSessionStreaming(sessionId, streaming);
    }

    // Also update global state for legacy compatibility
    this.sessionManager.setStreaming(streaming);

    // Hide mention dropdown when streaming starts
    if (streaming) {
      this.hideMentionDropdown();
    }

    // Update UI
    this.updateSendButtonState();

    if (this.sendBtn && this.stopBtn) {
      const sessionId = this.sessionManager.getCurrentSessionId();
      console.log('🎮 Updating message component button states:', {
        streaming,
        sessionId: sessionId || 'draft',
        sendBtnVisible: !streaming,
        stopBtnVisible: streaming
      });

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
    // Determine message type from the DOM element
    const messageType = messageElement.classList.contains('user') ? 'user' : 'assistant';
    const message = { id: messageId, type: messageType }; // Minimal message object for actions

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

  // Find the latest (most recent) assistant message that made file changes
  async findLatestAssistantMessageWithChanges(allMessages, sessionId) {
    if (!allMessages || !Array.isArray(allMessages)) {
      console.log('No messages array provided to findLatestAssistantMessageWithChanges');
      return null;
    }

    console.log(`Searching ${allMessages.length} messages for file changes in session ${sessionId}`);

    // Look through messages in reverse order to find the most recent one with changes
    for (let i = allMessages.length - 1; i >= 0; i--) {
      const message = allMessages[i];
      if (message && message.type === 'assistant' && message.id) {
        // Check if this assistant message made file changes
        try {
          const hasChanges = await window.electronAPI.hasFileChanges(sessionId, message.id);
          console.log(`Message ${message.id} has file changes: ${hasChanges}`);
          if (hasChanges) {
            return message;
          }
        } catch (error) {
          console.error('Error checking file changes for assistant message:', message.id, error);
          // Continue checking other messages instead of failing completely
          continue;
        }
      }
    }
    console.log('No assistant messages with file changes found');
    return null;
  }

  // Find the next assistant message after a user message that made file changes
  async findNextAssistantMessageWithChanges(allMessages, userMessageId, sessionId) {
    console.log('=== FIND ASSISTANT MESSAGE DEBUG START ===');
    console.log('Looking for user message ID:', userMessageId);
    console.log('Total messages to search:', allMessages?.length || 0);

    if (!allMessages || !Array.isArray(allMessages)) {
      console.log('No messages array provided');
      return null;
    }

    const userMessageIndex = allMessages.findIndex(m => m.id === userMessageId);
    console.log('User message index:', userMessageIndex);

    if (userMessageIndex === -1) {
      console.log('User message not found for revert check');
      console.log('Available message IDs:', allMessages.map(m => m.id));
      console.log('=== FIND ASSISTANT MESSAGE DEBUG END ===');
      return null;
    }

    console.log('Found user message at index:', userMessageIndex);
    console.log('Searching', allMessages.length - userMessageIndex - 1, 'messages after user message');

    // Look for the first assistant message after the user message that has file changes
    for (let i = userMessageIndex + 1; i < allMessages.length; i++) {
      const message = allMessages[i];
      console.log(`Checking message ${i}:`, { id: message?.id, type: message?.type });

      if (message && message.type === 'assistant' && message.id) {
        try {
          console.log('Checking file changes for assistant message:', message.id);
          const hasChanges = await window.electronAPI.hasFileChanges(sessionId, message.id);
          console.log('HasFileChanges result for', message.id, ':', hasChanges);

          if (hasChanges) {
            console.log('Found assistant message with file changes:', message.id);
            console.log('=== FIND ASSISTANT MESSAGE DEBUG END ===');
            return message; // Return the first one found
          }
        } catch (error) {
          console.error('Error checking file changes for assistant message:', message.id, error);

          // For robustness, try to find checkpoints using a broader search
          // This handles cases where message IDs might have been updated after checkpoint creation
          try {
            console.log('Trying broad checkpoint search for session:', sessionId);
            const allCheckpoints = await window.electronAPI.getAllCheckpointsForSession(sessionId);
            console.log('Found checkpoints in session:', allCheckpoints?.length || 0);

            if (allCheckpoints && allCheckpoints.length > 0) {
              // Check if any checkpoint was created around this time period
              const messageTimestamp = new Date(message.timestamp);
              const recentCheckpoints = allCheckpoints.filter(cp => {
                const checkpointTime = new Date(cp.ts);
                const timeDiff = Math.abs(checkpointTime - messageTimestamp);
                return timeDiff < 60000; // Within 1 minute
              });

              if (recentCheckpoints.length > 0) {
                console.log('Found recent checkpoints, assuming this message has changes:', message.id);
                console.log('=== FIND ASSISTANT MESSAGE DEBUG END ===');
                return message;
              }
            }
          } catch (broadSearchError) {
            console.error('Broad checkpoint search also failed:', broadSearchError);
          }

          // Continue checking other messages
        }
      }
    }

    console.log('No subsequent assistant message with file changes found');
    console.log('=== FIND ASSISTANT MESSAGE DEBUG END ===');
    return null;
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

  // Handle file path clicks from formatted messages
  handleFilePathClick(filePath, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Use the existing MessageUtils handler which integrates with the app components
    if (MessageUtils && typeof MessageUtils.handleFilePathClick === 'function') {
      MessageUtils.handleFilePathClick(filePath, event);
    } else {
      // Fallback to direct component access
      this.openFileInEditor(filePath);
    }
  }

  // Fallback method to open file in editor
  async openFileInEditor(filePath) {
    try {
      // Get the file editor component
      const fileEditor = window.app?.getComponent('fileEditor');
      if (fileEditor) {
        // Open the file without automatically navigating the directory
        await fileEditor.openFile(filePath, { autoNavigateToDirectory: false });
      } else {
        console.error('File editor component not available');
        this.showError('File editor not available');
      }
    } catch (error) {
      console.error('Failed to open file:', error);
      this.showError(`Failed to open file: ${error.message}`);
    }
  }

  // Add new methods for lock state management
  toggleLockState() {
    this.isLocked = !this.isLocked;
    this.updateLockState();
    window.electronAPI.setWindowLock(this.isLocked);
  }

  updateLockState() {
    if (this.isLocked) {
      this.lockBtn.classList.add('locked');
      this.lockIcon.classList.remove('codicon-unlock');
      this.lockIcon.classList.add('codicon-lock');
      this.lockBtn.title = 'Unlock window (window can move behind others)';
    } else {
      this.lockBtn.classList.remove('locked');
      this.lockIcon.classList.remove('codicon-lock');
      this.lockIcon.classList.add('codicon-unlock');
      this.lockBtn.title = 'Lock window (stay always on top)';
    }
  }

  showTypingIndicator() {
    if (!this.messagesContainer) return;

    // Ensure no other indicators are present
    this.hideTypingIndicator();

    const indicatorHTML = `
      <div class="conversation-turn assistant" id="typing-indicator-container">
        <div class="conversation-content">
          <div class="typing-indicator">
            <div class="typing-dots">
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
              <div class="typing-dot"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.messagesContainer.insertAdjacentHTML('beforeend', indicatorHTML);
    this.scrollToBottom();
  }

  hideTypingIndicator() {
    if (!this.messagesContainer) return;

    const indicator = this.messagesContainer.querySelector('#typing-indicator-container');
    if (indicator) {
      indicator.remove();
    }
  }

    // Update temporary message ID with real UUID from backend
  updateUserMessageId(realMessageId) {
    if (!this.pendingMessageUpdate || !this.messagesContainer || !realMessageId) {
      console.log('Cannot update message ID: missing pendingUpdate, messagesContainer, or realMessageId');
      return;
    }

    console.log('=== UPDATE USER MESSAGE ID DEBUG START ===');
    console.log('Updating temp ID:', this.pendingMessageUpdate.tempId, 'to real ID:', realMessageId);

    // Validate that the real message ID looks like a UUID
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(realMessageId)) {
      console.error('Real message ID does not look like a valid UUID:', realMessageId);
      this.pendingMessageUpdate = null;
      console.log('=== UPDATE USER MESSAGE ID DEBUG END ===');
      return;
    }

    // Find the message element with the temporary ID
    const tempElement = this.messagesContainer.querySelector(`[data-temp-id="${this.pendingMessageUpdate.tempId}"]`);

    if (tempElement) {
      console.log('Found temp message element, updating ID and actions');

      // Check if an element with the target ID already exists (avoid duplicates)
      const existingElement = this.messagesContainer.querySelector(`#message-${realMessageId}`);
      if (existingElement && existingElement !== tempElement) {
        console.warn('Element with real message ID already exists, removing temp element');
        tempElement.remove();
        this.pendingMessageUpdate = null;
        console.log('=== UPDATE USER MESSAGE ID DEBUG END ===');
        return;
      }

      // Update the element ID
      tempElement.id = `message-${realMessageId}`;

      // Remove the temporary data attribute
      tempElement.removeAttribute('data-temp-id');

      // Update the message actions to use the real ID
      const actionsContainer = tempElement.querySelector('.message-actions');
      if (actionsContainer) {
        const sessionId = this.sessionManager.getCurrentSessionId();
        actionsContainer.innerHTML = this.createMessageActions({ id: realMessageId, type: 'user' }, sessionId)
          .replace('<div class="message-actions">', '')
          .replace('</div>', '');
        console.log('Updated message actions with real ID');
      }

      console.log('Successfully updated message element from temp ID to real ID');
    } else {
      console.warn('Could not find message element with temp ID:', this.pendingMessageUpdate.tempId);

      // Try to find by content as a fallback
      const allUserMessages = this.messagesContainer.querySelectorAll('.conversation-turn.user');
      for (const element of allUserMessages) {
        const messageContent = element.querySelector('.message-content');
        if (messageContent && messageContent.textContent.trim() === this.pendingMessageUpdate.content.trim()) {
          console.log('Found message by content match, updating ID');
          element.id = `message-${realMessageId}`;
          element.removeAttribute('data-temp-id');

          const actionsContainer = element.querySelector('.message-actions');
          if (actionsContainer) {
            const sessionId = this.sessionManager.getCurrentSessionId();
            actionsContainer.innerHTML = this.createMessageActions({ id: realMessageId, type: 'user' }, sessionId)
              .replace('<div class="message-actions">', '')
              .replace('</div>', '');
          }
          break;
        }
      }
    }

    // Clear the pending update
    this.pendingMessageUpdate = null;
    console.log('=== UPDATE USER MESSAGE ID DEBUG END ===');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageComponent;
} else {
  window.MessageComponent = MessageComponent;
}