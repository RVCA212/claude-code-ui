// Application state
let sessions = [];
let currentSessionId = null;
let sessionToDelete = null;
let isStreaming = false;
let editingMessageId = null;
let currentRevertMessageId = null; // Track which message is currently reverted

// DOM elements
const settingsModal = document.getElementById('settingsModal');
const cliStatus = document.getElementById('cliStatus');
const apiKeyStatus = document.getElementById('apiKeyStatus');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
const settingsBtn = document.getElementById('settingsBtn');

const conversationsList = document.getElementById('conversationsList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const stopBtn = document.getElementById('stopBtn');
const newConversationBtn = document.getElementById('newConversationBtn');
const conversationTitle = document.getElementById('conversationTitle');
const editTitleBtn = document.getElementById('editTitleBtn');
// const continueBtn = document.getElementById('continueBtn'); // Removed for seamless UX
const conversationStatus = document.getElementById('conversationStatus');
const conversationContext = document.getElementById('conversationContext');
const inputArea = document.getElementById('inputArea');
const charCounter = document.getElementById('charCounter');
const sessionInfo = document.getElementById('sessionInfo');
const deleteModal = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

// History dropdown elements
const historyBtn = document.getElementById('historyBtn');
const historyDropdown = document.getElementById('historyDropdown');

// Initialize application
async function init() {
    console.log('Initializing Claude Code Chat...');

    // Set up event listeners
    setupEventListeners();

    // Listen for IPC events
    setupIPCListeners();

    // Load sessions directly
    await loadSessions();
}

// Check system status for settings modal
async function checkStatus() {
    try {
        const setupStatus = await window.electronAPI.checkSetup();
        console.log('System status:', setupStatus);

        // Update CLI status
        if (setupStatus.cliAvailable) {
            cliStatus.textContent = '✅ Available';
            cliStatus.className = 'status-value success';
        } else {
            cliStatus.textContent = '❌ Not installed';
            cliStatus.className = 'status-value error';
        }

        // Update API key status
        if (setupStatus.apiKeySet) {
            apiKeyStatus.textContent = '✅ Configured';
            apiKeyStatus.className = 'status-value success';
        } else {
            apiKeyStatus.textContent = '❌ Not set';
            apiKeyStatus.className = 'status-value warning';
        }

        return setupStatus;
    } catch (error) {
        console.error('Failed to check status:', error);
        cliStatus.textContent = '❌ Error';
        cliStatus.className = 'status-value error';
        apiKeyStatus.textContent = '❌ Error';
        apiKeyStatus.className = 'status-value error';
        return { cliAvailable: false, apiKeySet: false, canUseClaudeCode: false };
    }
}

// Set up event listeners
function setupEventListeners() {
    // Settings modal events
    settingsBtn.addEventListener('click', openSettings);
    saveSettingsBtn.addEventListener('click', saveSettings);
    cancelSettingsBtn.addEventListener('click', closeSettings);
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettings();
    });

    // Main app events
    newConversationBtn.addEventListener('click', createNewSession);
    sendBtn.addEventListener('click', sendMessage);
    stopBtn.addEventListener('click', stopMessage);

    // Message input
    messageInput.addEventListener('keydown', handleInputKeydown);
    messageInput.addEventListener('input', handleInputChange);

    // Title editing
    editTitleBtn.addEventListener('click', toggleTitleEdit);
    conversationTitle.addEventListener('keydown', handleTitleKeydown);
    conversationTitle.addEventListener('blur', saveTitleEdit);

    // Conversation continuation removed for seamless UX

    // Delete modal
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    cancelDeleteBtn.addEventListener('click', cancelDelete);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) cancelDelete();
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);

    // Click detection for unrevert functionality
    messagesContainer.addEventListener('click', handleMessagesContainerClick);

    // API key input
    apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveSettings();
        }
    });

    // History dropdown toggle
    if (historyBtn) {
        historyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleHistoryDropdown();
        });
    }

    // Prevent clicks inside dropdown from closing it
    if (historyDropdown) {
        historyDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (historyDropdown && historyDropdown.style.display === 'block') {
            const withinDropdown = historyDropdown.contains(e.target);
            const isButton = historyBtn && historyBtn.contains(e.target);
            if (!withinDropdown && !isButton) {
                historyDropdown.style.display = 'none';
            }
        }
    });
}

// Set up IPC listeners
function setupIPCListeners() {
    // Listen for sessions loaded
    window.electronAPI.onSessionsLoaded((event, loadedSessions) => {
        console.log('Sessions loaded:', loadedSessions);
        sessions = loadedSessions;
        renderSessions();

        if (sessions.length > 0) {
            loadSession(sessions[0].id);
        }
    });

    // Listen for message streaming
    window.electronAPI.onMessageStream((event, data) => {
        console.log('Received message stream event:', data);
        const { sessionId, message, isComplete, thinkingContent } = data;

        if (sessionId === currentSessionId) {
            handleStreamingMessage(message, isComplete, thinkingContent);
        } else {
            console.log('Ignoring stream event for different session:', sessionId, 'current:', currentSessionId);
        }
    });

    // Listen for session updates
    window.electronAPI.onSessionUpdated((event, updatedSession) => {
        console.log('Session updated:', updatedSession);
        const sessionIndex = sessions.findIndex(s => s.id === updatedSession.id);
        if (sessionIndex >= 0) {
            sessions[sessionIndex] = updatedSession;
            renderSessions();

            // Update current session UI if it's the active one
            if (currentSessionId === updatedSession.id) {
                updateCurrentSessionUI(updatedSession);
            }
        }
    });

    // Listen for session creation
    window.electronAPI.onSessionCreated((event, newSession) => {
        console.log('Session created:', newSession);
        // Avoid adding duplicate sessions if we already inserted it locally
        if (!sessions.some(s => s.id === newSession.id)) {
            sessions.unshift(newSession);
        }
        renderSessions();
    });

    // Listen for session deletion
    window.electronAPI.onSessionDeleted((event, deletedSessionId) => {
        console.log('Session deleted:', deletedSessionId);
        sessions = sessions.filter(s => s.id !== deletedSessionId);
        renderSessions();

        // If the deleted session was current, switch to another or show empty state
        if (currentSessionId === deletedSessionId) {
            if (sessions.length > 0) {
                loadSession(sessions[0].id);
            } else {
                showEmptyState();
            }
        }
    });
}

// Open settings modal
async function openSettings() {
    await checkStatus();
    settingsModal.style.display = 'flex';
}

// Close settings modal
function closeSettings() {
    settingsModal.style.display = 'none';
    apiKeyInput.value = '';
}

// Save settings
async function saveSettings() {
    const apiKey = apiKeyInput.value.trim();

    // Only save if API key is provided
    if (apiKey) {
        saveSettingsBtn.disabled = true;
        saveSettingsBtn.textContent = 'Saving...';

        try {
            const result = await window.electronAPI.setApiKey(apiKey);
            console.log('API key set successfully:', result);

            // Update status
            apiKeyStatus.textContent = '✅ Configured';
            apiKeyStatus.className = 'status-value success';

            alert('Settings saved successfully!');
            closeSettings();

        } catch (error) {
            console.error('Failed to set API key:', error);
            alert(`Failed to verify API key: ${error.message}`);
        } finally {
            saveSettingsBtn.disabled = false;
            saveSettingsBtn.textContent = 'Save Settings';
        }
    } else {
        // Just close if no API key provided
        closeSettings();
    }
}

// Load sessions from backend
async function loadSessions() {
    try {
        sessions = await window.electronAPI.getSessions();
        renderSessions();

        if (sessions.length > 0) {
            loadSession(sessions[0].id);
        }
    } catch (error) {
        console.error('Failed to load sessions:', error);
    }
}

// Handle global keyboard shortcuts
function handleGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewSession();
    }
}

// Handle clicks in messages container for unrevert functionality
function handleMessagesContainerClick(e) {
    // Only handle if we have a reverted message and not currently editing
    if (!currentRevertMessageId || editingMessageId) return;

    // Don't trigger if clicking on interactive elements
    if (e.target.closest('button, input, textarea, .revert-btn, .message-actions')) return;

    // Don't trigger if clicking inside the editable message itself
    const editableMessage = document.querySelector(`[data-message-id="${currentRevertMessageId}"] .message-content`);
    if (editableMessage && editableMessage.contains(e.target)) return;

    // Find the reverted message element
    const revertedMessageEl = document.querySelector(`[data-message-id="${currentRevertMessageId}"]`);
    if (!revertedMessageEl) return;

    // Check if click is below the reverted message
    const revertedMessageRect = revertedMessageEl.getBoundingClientRect();
    const clickY = e.clientY;
    const revertedMessageBottom = revertedMessageRect.bottom;

    // Only trigger unrevert if click is below the reverted message
    if (clickY > revertedMessageBottom) {
        e.preventDefault();
        e.stopPropagation();
        handleUnrevertFromMessage(currentRevertMessageId);
    }
}

// Handle input keydown
function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (!isStreaming) {
            sendMessage();
        }
    }
}

// Handle input change
function handleInputChange(e) {
    const length = e.target.value.length;
    charCounter.textContent = `${length} characters`;

    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';

    // Enable/disable send button
    sendBtn.disabled = e.target.value.trim() === '' || isStreaming;
}

// Render sessions list
function renderSessions() {
    conversationsList.innerHTML = '';

    // Sort sessions by updatedAt (most recent first)
    const sortedSessions = [...sessions].sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    sortedSessions.forEach(session => {
        const sessionEl = createSessionElement(session);
        conversationsList.appendChild(sessionEl);
    });
}

// Create session element
function createSessionElement(session) {
    const div = document.createElement('div');
    div.className = `conversation-item ${session.id === currentSessionId ? 'active' : ''}`;
    div.dataset.sessionId = session.id;

    // Use statusInfo if available, fallback to legacy logic
    const statusInfo = session.statusInfo || {};
    const lastMessage = session.messages && session.messages.length > 0 ? session.messages[session.messages.length - 1] : null;
    const preview = session.lastAssistantMessage ?
        truncateText(session.lastAssistantMessage, 50) :
        (lastMessage ? truncateText(lastMessage.content, 50) : 'No messages yet');
    const timestamp = formatTimestamp(session.updatedAt);

    // Status indicator
    const statusClass = statusInfo.status || 'active';
    const canResume = statusInfo.canResume !== undefined ? statusInfo.canResume : true;
    const statusIcon = getStatusIcon(statusClass, canResume);
    const messageCount = statusInfo.messageCount || (session.messages ? session.messages.length : 0);

    div.innerHTML = `
        <div class="conversation-content">
            <div class="conversation-header">
                <div class="conversation-title-text">${session.title}</div>
                <div class="conversation-status-indicator ${statusClass}" title="${getStatusTooltip(statusClass, canResume)}">
                    ${statusIcon}
                </div>
            </div>
            <div class="conversation-preview">${preview}</div>
            <div class="conversation-meta">
                <span class="conversation-timestamp">${timestamp}</span>
                ${messageCount > 0 ? `<span class="message-count">${messageCount} messages</span>` : ''}
            </div>
        </div>
        <button class="delete-conversation-btn" data-session-id="${session.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
    `;

    // Add click event listener
    div.addEventListener('click', (e) => {
        if (!e.target.closest('.delete-conversation-btn')) {
            loadSession(session.id);
        }
    });

    // Add delete button event listener
    const deleteBtn = div.querySelector('.delete-conversation-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteModal(session.id);
    });

    return div;
}

// Reset button state to ensure clean UI
function resetButtonState() {
    isStreaming = false;
    sendBtn.disabled = messageInput.value.trim() === '';
    sendBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
}

// Load session
async function loadSession(sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return;

    currentSessionId = sessionId;

    // Reset button state when switching sessions to prevent state persistence
    resetButtonState();

    // Get full session context from backend
    try {
        const sessionContext = await window.electronAPI.getSessionContext(sessionId);
        await updateSessionUI(sessionContext);
    } catch (error) {
        console.error('Failed to get session context:', error);
        // Fallback to basic UI update
        updateBasicSessionUI(session);
    }

    // Update active session in sidebar
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.sessionId === sessionId) {
            item.classList.add('active');
        }
    });

    // Render messages
    renderMessages(session.messages);

    // Always focus input for seamless interaction
    messageInput.focus();
}

// Update session UI with full context
async function updateSessionUI(sessionContext) {
    const statusInfo = sessionContext.statusInfo || {};
    const conversationPreview = sessionContext.conversationPreview || {};

    // Restore revert state if session has active revert
    currentRevertMessageId = sessionContext.currentRevertMessageId || null;

    // Update title
    conversationTitle.textContent = sessionContext.title;
    conversationTitle.contentEditable = 'false';
    editTitleBtn.style.display = 'inline-block';

    // Update status display
    conversationStatus.style.display = 'block';
    conversationStatus.innerHTML = `
        <span class="status-badge ${statusInfo.status || 'active'}">
            ${getStatusIcon(statusInfo.status, statusInfo.canResume)}
            ${(statusInfo.status || 'active').charAt(0).toUpperCase() + (statusInfo.status || 'active').slice(1)}
        </span>
        ${statusInfo.messageCount ? `<span class="message-count-badge">${statusInfo.messageCount} messages</span>` : ''}
    `;

    // Update conversation context if historical
    if (statusInfo.status === 'historical' && (conversationPreview.lastUserMessage || conversationPreview.lastAssistantMessage)) {
        conversationContext.style.display = 'block';
        conversationContext.innerHTML = `
            <div class="conversation-preview-card">
                <div class="preview-title">Last exchange:</div>
                ${conversationPreview.lastUserMessage ? `<div class="preview-user">You: ${truncateText(conversationPreview.lastUserMessage, 60)}</div>` : ''}
                ${conversationPreview.lastAssistantMessage ? `<div class="preview-assistant">Claude: ${truncateText(conversationPreview.lastAssistantMessage, 80)}</div>` : ''}
            </div>
        `;
    } else {
        conversationContext.style.display = 'none';
    }

    // Always show input area for seamless conversation flow
    inputArea.style.display = 'block';

    // Update session info
    if (sessionContext.claudeSessionId) {
        sessionInfo.textContent = `Claude Session: ${sessionContext.claudeSessionId.substring(0, 8)}...`;
    } else {
        sessionInfo.textContent = 'New session';
    }
}

// Fallback basic UI update
function updateBasicSessionUI(session) {
    // Restore revert state if session has active revert
    currentRevertMessageId = session.currentRevertMessageId || null;

    conversationTitle.textContent = session.title;
    conversationTitle.contentEditable = 'false';
    editTitleBtn.style.display = 'inline-block';
    inputArea.style.display = 'block';
    conversationStatus.style.display = 'none';
    conversationContext.style.display = 'none';

    if (session.claudeSessionId) {
        sessionInfo.textContent = `Session: ${session.claudeSessionId.substring(0, 8)}...`;
    } else {
        sessionInfo.textContent = 'New session';
    }
}

// Render messages
function renderMessages(messages) {
    messagesContainer.innerHTML = '';

    if (messages.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.innerHTML = `
            <h3>Start a conversation</h3>
            <p>Type a message below to start chatting with Claude Code.</p>
        `;
        messagesContainer.appendChild(emptyDiv);
        return;
    }

    messages.forEach(message => {
        const messageEl = createMessageElement(message);
        messagesContainer.appendChild(messageEl);
    });

    // Check for revert buttons after all messages are rendered
    messages.forEach(message => {
        if (message.type === 'user') {
            checkAndShowRevertButton(message.id);
        }
    });

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Create conversation turn container for sequential content
function createConversationTurn(message) {
    const turnDiv = document.createElement('div');
    turnDiv.className = `conversation-turn ${message.type || 'assistant'}${message.invalidated ? ' invalidated' : ''}`;
    turnDiv.dataset.conversationId = message.id;

    const timestamp = formatTimestamp(message.timestamp || new Date().toISOString());

    turnDiv.innerHTML = `
        <div class="conversation-content"></div>
        <div class="conversation-timestamp">${timestamp}</div>
    `;

    return turnDiv;
}

// Add thinking content to conversation turn
function addThinkingContent(conversationTurn, thinkingText) {
    const contentDiv = conversationTurn.querySelector('.conversation-content');

    let thinkingSection = contentDiv.querySelector('.thinking-section');
    if (!thinkingSection) {
        thinkingSection = document.createElement('div');
        thinkingSection.className = 'thinking-section';
        thinkingSection.innerHTML = `
            <div class="thinking-header">
                <span>Claude is thinking...</span>
                <button class="thinking-toggle" title="Collapse thinking">▼</button>
            </div>
            <div class="thinking-content"></div>
        `;
        contentDiv.appendChild(thinkingSection);

        // Add toggle functionality
        const toggleBtn = thinkingSection.querySelector('.thinking-toggle');
        toggleBtn.addEventListener('click', () => toggleThinking(toggleBtn));
    }

    const thinkingContentDiv = thinkingSection.querySelector('.thinking-content');
    const thinkingChunk = document.createElement('div');
    thinkingChunk.className = 'thinking-chunk';
    thinkingChunk.textContent = thinkingText;
    thinkingContentDiv.appendChild(thinkingChunk);

    // Auto-scroll thinking content
    thinkingContentDiv.scrollTop = thinkingContentDiv.scrollHeight;
}

// Add tool call to conversation turn
function addToolCall(conversationTurn, toolUse) {
    const contentDiv = conversationTurn.querySelector('.conversation-content');

    const toolDiv = document.createElement('div');
    toolDiv.className = 'tool-call';
    toolDiv.dataset.toolId = toolUse.id;

    // Use specialized rendering based on tool type
    const toolContent = renderSpecializedTool(toolUse);

    if (toolContent) {
        toolDiv.innerHTML = toolContent;
    } else {
        // Fallback to generic tool display
        const toolIcon = getToolIcon(toolUse.name);
        const inputSummary = formatToolInput(toolUse.input);

        toolDiv.innerHTML = `
            <div class="tool-header">
                <span class="tool-icon">${toolIcon}</span>
                <span class="tool-name">${toolUse.name}</span>
                <span class="tool-status running">Running...</span>
                <button class="tool-toggle" title="Show details">▶</button>
            </div>
            <div class="tool-summary">${inputSummary}</div>
            <div class="tool-details" style="display: none;">
                <div class="tool-input">
                    <strong>Input:</strong>
                    <pre><code>${JSON.stringify(toolUse.input, null, 2)}</code></pre>
                </div>
                <div class="tool-output" style="display: none;">
                    <strong>Output:</strong>
                    <div class="tool-output-content"></div>
                </div>
            </div>
        `;

        // Add toggle functionality
        const toggleBtn = toolDiv.querySelector('.tool-toggle');
        toggleBtn.addEventListener('click', () => toggleToolDetails(toggleBtn));
    }

    contentDiv.appendChild(toolDiv);
}

// Render specialized tool components based on tool type
function renderSpecializedTool(toolUse) {
    const toolIcon = getToolIcon(toolUse.name);

    switch (toolUse.name) {
        case 'TodoWrite':
            return renderTodoWriteTool(toolUse, toolIcon);
        case 'Write':
            return renderWriteTool(toolUse, toolIcon);
        case 'Read':
            return renderReadTool(toolUse, toolIcon);
        case 'Edit':
            return renderEditTool(toolUse, toolIcon);
        case 'Bash':
            return renderBashTool(toolUse, toolIcon);
        default:
            return null; // Use generic rendering
    }
}

// Render TodoWrite tool component
function renderTodoWriteTool(toolUse, toolIcon) {
    const todos = toolUse.input.todos || [];

    const todoItems = todos.map(todo => {
        const statusIcon = {
            'pending': '○',
            'in_progress': '◑',
            'completed': '●'
        }[todo.status] || '○';

        return `
            <div class="tool-todo-item">
                <div class="tool-todo-checkbox ${todo.status}">
                    ${statusIcon}
                </div>
                <div class="tool-todo-content">${todo.content}</div>
                <div class="tool-todo-priority ${todo.priority}">${todo.priority}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="tool-header">
            <span class="tool-icon">${toolIcon}</span>
            <span class="tool-name">Todo List Update</span>
            <span class="tool-status running">Running...</span>
        </div>
        <div class="tool-todo-list">
            ${todoItems}
        </div>
    `;
}

// Render Write tool component
function renderWriteTool(toolUse, toolIcon) {
    const filePath = toolUse.input.file_path || 'Unknown file';
    const content = toolUse.input.content || '';
    const truncatedContent = content.length > 500 ? content.substring(0, 500) + '...' : content;

    return `
        <div class="tool-header">
            <span class="tool-icon">${toolIcon}</span>
            <span class="tool-name">Write File</span>
            <span class="tool-status running">Running...</span>
        </div>
        <div class="tool-file-write">
            <div class="tool-file-header">
                <span class="tool-file-icon">📄</span>
                <span class="tool-file-path">${filePath}</span>
            </div>
            <div class="tool-file-content">
                <pre><code>${truncatedContent}</code></pre>
            </div>
        </div>
    `;
}

// Render Read tool component
function renderReadTool(toolUse, toolIcon) {
    const filePath = toolUse.input.file_path || 'Unknown file';
    const limit = toolUse.input.limit;
    const offset = toolUse.input.offset;

    let statsText = '';
    if (limit || offset) {
        statsText = `Reading ${limit || 'all'} lines${offset ? ` starting from line ${offset}` : ''}`;
    }

    return `
        <div class="tool-header">
            <span class="tool-icon">${toolIcon}</span>
            <span class="tool-name">Read File</span>
            <span class="tool-status running">Running...</span>
        </div>
        <div class="tool-file-read">
            <div class="tool-file-header">
                <span class="tool-file-icon">📖</span>
                <span class="tool-file-path">${filePath}</span>
            </div>
            ${statsText ? `<div class="tool-file-stats">${statsText}</div>` : ''}
            <div class="tool-output" style="display: none;">
                <div class="tool-output-content"></div>
            </div>
        </div>
    `;
}

// Render Edit tool component
function renderEditTool(toolUse, toolIcon) {
    const filePath = toolUse.input.file_path || 'Unknown file';
    const oldString = toolUse.input.old_string || '';
    const newString = toolUse.input.new_string || '';
    const replaceAll = toolUse.input.replace_all;

    const summary = `${replaceAll ? 'Replace all occurrences' : 'Replace first occurrence'} in ${filePath}`;

    return `
        <div class="tool-header">
            <span class="tool-icon">${toolIcon}</span>
            <span class="tool-name">Edit File</span>
            <span class="tool-status running">Running...</span>
        </div>
        <div class="tool-file-edit">
            <div class="tool-file-header">
                <span class="tool-file-icon">✏️</span>
                <span class="tool-file-path">${filePath}</span>
            </div>
            <div class="tool-edit-summary">${summary}</div>
            <div class="tool-edit-changes">
                <div class="tool-edit-old">
                    <strong>- Remove:</strong><br>
                    <code>${oldString.substring(0, 100)}${oldString.length > 100 ? '...' : ''}</code>
                </div>
                <div class="tool-edit-new">
                    <strong>+ Add:</strong><br>
                    <code>${newString.substring(0, 100)}${newString.length > 100 ? '...' : ''}</code>
                </div>
            </div>
        </div>
    `;
}

// Render Bash tool component
function renderBashTool(toolUse, toolIcon) {
    const command = toolUse.input.command || '';
    const description = toolUse.input.description || '';

    return `
        <div class="tool-terminal">
            <div class="tool-terminal-header">
                <span class="tool-terminal-icon">${toolIcon}</span>
                <span class="tool-terminal-command">$ ${command}</span>
                <span class="tool-status running">Running...</span>
            </div>
            ${description ? `<div class="tool-edit-summary">${description}</div>` : ''}
            <div class="tool-output" style="display: none;">
                <div class="tool-terminal-content">
                    <div class="tool-output-content"></div>
                </div>
            </div>
        </div>
    `;
}

// Handle streaming message with structured content
function handleStreamingMessage(messageData, isComplete, thinkingContent = null) {
    console.log('Handling streaming message:', { messageData, isComplete, thinkingContent });

    // Handle different message structure
    const message = messageData.message || messageData;
    const sessionId = messageData.sessionId || currentSessionId;

    // Find or create conversation turn container
    let conversationTurn = document.querySelector(`[data-conversation-id="${message.id}"]`);

    if (!conversationTurn) {
        if (document.querySelector(`[data-message-id="${message.id}"]`)) return;
        conversationTurn = createConversationTurn(message);
        messagesContainer.appendChild(conversationTurn);

        // Initialize task logs data on the element
        conversationTurn._taskLogsData = {
            thinking: [],
            toolCalls: [],
            textResponses: []
        };
    }

    const contentDiv = conversationTurn.querySelector('.conversation-content');

    // Only clear and re-render if not complete - preserve task logs when finalizing
    if (!isComplete) {
        contentDiv.innerHTML = ''; // Clear and re-render content during streaming
    }

    // Handle thinking content - store in task logs data
    if (thinkingContent && !isComplete) {
        if (!conversationTurn._taskLogsData.thinking.some(t => t === thinkingContent)) {
            conversationTurn._taskLogsData.thinking.push(thinkingContent);
        }
        addThinkingContent(conversationTurn, thinkingContent);
    }

    // Process message content if it exists
    if (message.content && Array.isArray(message.content)) {
        // Handle structured content array
        message.content.forEach(contentItem => {
            if (contentItem.type === 'text' && contentItem.text && contentItem.text.trim()) {
                // Store text responses in task logs data
                if (!conversationTurn._taskLogsData.textResponses.some(t => t === contentItem.text)) {
                    conversationTurn._taskLogsData.textResponses.push(contentItem.text);
                }
                if (!isComplete) {
                    addTextResponse(conversationTurn, contentItem.text);
                }
            } else if (contentItem.type === 'tool_use') {
                // Store tool calls in task logs data
                if (!conversationTurn._taskLogsData.toolCalls.some(t => t.id === contentItem.id)) {
                    conversationTurn._taskLogsData.toolCalls.push(contentItem);
                }
                if (!isComplete) {
                    addToolCall(conversationTurn, contentItem);
                }
            }
        });
    } else if (message.content && typeof message.content === 'string') {
        // Handle simple string content (backwards compatibility)
        if (message.content.trim()) {
            if (!conversationTurn._taskLogsData.textResponses.some(t => t === message.content)) {
                conversationTurn._taskLogsData.textResponses.push(message.content);
            }
            if (!isComplete) {
                addTextResponse(conversationTurn, message.content);
            }
        }
    }

    // When streaming completes
    if (isComplete) {
        finalizeConversationTurn(conversationTurn, message);

        // Update session in local state
        const session = sessions.find(s => s.id === currentSessionId);
        if (session) {
            // Check if message already exists
            const existingIndex = session.messages.findIndex(m => m.id === message.id);
            if (existingIndex >= 0) {
                session.messages[existingIndex] = message;
            } else {
                session.messages.push(message);
            }
            session.updatedAt = new Date().toISOString();

            // Re-render sessions list to update preview
            renderSessions();
        }

        // Reset button state when streaming completes
        resetButtonState();
    }

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Create task logs dropdown component
function createTaskLogsDropdown(taskLogsData) {
    if (!taskLogsData || (taskLogsData.thinking.length === 0 && taskLogsData.toolCalls.length === 0)) {
        return null; // No task logs to show
    }

    const taskLogsContainer = document.createElement('div');
    taskLogsContainer.className = 'task-logs-container';

    const toggleButton = document.createElement('button');
    toggleButton.className = 'task-logs-toggle';
    toggleButton.innerHTML = `
        <span class="task-logs-label">task logs</span>
        <span class="task-logs-icon">▼</span>
    `;

    const contentContainer = document.createElement('div');
    contentContainer.className = 'task-logs-content';
    contentContainer.style.display = 'none';

    // Add thinking content if available
    if (taskLogsData.thinking.length > 0) {
        const thinkingSection = document.createElement('div');
        thinkingSection.className = 'thinking-section';
        thinkingSection.innerHTML = `
            <div class="thinking-header">
                <span>Claude's thinking</span>
            </div>
            <div class="thinking-content">
                ${taskLogsData.thinking.map(thought => `<div class="thinking-chunk">${thought}</div>`).join('')}
            </div>
        `;
        contentContainer.appendChild(thinkingSection);
    }

    // Add tool calls if available
    taskLogsData.toolCalls.forEach(toolUse => {
        const toolDiv = document.createElement('div');
        toolDiv.className = 'tool-call';
        toolDiv.dataset.toolId = toolUse.id;

        // Use specialized rendering based on tool type
        const toolContent = renderSpecializedTool(toolUse);

        if (toolContent) {
            toolDiv.innerHTML = toolContent;
        } else {
            // Fallback to generic tool display
            const toolIcon = getToolIcon(toolUse.name);
            const inputSummary = formatToolInput(toolUse.input);

            toolDiv.innerHTML = `
                <div class="tool-header">
                    <span class="tool-icon">${toolIcon}</span>
                    <span class="tool-name">${toolUse.name}</span>
                    <span class="tool-status completed">Completed</span>
                    <button class="tool-toggle" title="Show details">▶</button>
                </div>
                <div class="tool-summary">${inputSummary}</div>
                <div class="tool-details" style="display: none;">
                    <div class="tool-input">
                        <strong>Input:</strong>
                        <pre><code>${JSON.stringify(toolUse.input, null, 2)}</code></pre>
                    </div>
                </div>
            `;

            // Add toggle functionality
            const toggleBtn = toolDiv.querySelector('.tool-toggle');
            toggleBtn.addEventListener('click', () => toggleToolDetails(toggleBtn));
        }

        contentContainer.appendChild(toolDiv);
    });

    // Add toggle functionality for main dropdown
    toggleButton.addEventListener('click', () => {
        const isExpanded = contentContainer.style.display !== 'none';
        if (isExpanded) {
            contentContainer.style.display = 'none';
            toggleButton.querySelector('.task-logs-icon').textContent = '▼';
            toggleButton.classList.remove('expanded');
        } else {
            contentContainer.style.display = 'block';
            toggleButton.querySelector('.task-logs-icon').textContent = '▲';
            toggleButton.classList.add('expanded');
        }
    });

    taskLogsContainer.appendChild(toggleButton);
    taskLogsContainer.appendChild(contentContainer);

    return taskLogsContainer;
}

// Add text response to conversation turn
function addTextResponse(conversationTurn, text) {
    const contentDiv = conversationTurn.querySelector('.conversation-content');

    const responseDiv = document.createElement('div');
    responseDiv.className = 'assistant-response';

    const formattedContent = formatMessageContent(text);
    responseDiv.innerHTML = formattedContent;

    contentDiv.appendChild(responseDiv);
}

// Finalize conversation turn when streaming completes
function finalizeConversationTurn(conversationTurn, message) {
    const contentDiv = conversationTurn.querySelector('.conversation-content');
    const taskLogsData = conversationTurn._taskLogsData;

    // Clear the content div and rebuild with task logs structure
    contentDiv.innerHTML = '';

    // Create task logs dropdown if there are tool calls or thinking content
    const taskLogsDropdown = createTaskLogsDropdown(taskLogsData);
    if (taskLogsDropdown) {
        contentDiv.appendChild(taskLogsDropdown);
    }

    // Add final text response
    const finalTextResponses = [];
    if (message.content && Array.isArray(message.content)) {
        message.content.forEach(contentItem => {
            if (contentItem.type === 'text' && contentItem.text && contentItem.text.trim()) {
                finalTextResponses.push(contentItem.text);
            }
        });
    } else if (message.content && typeof message.content === 'string') {
        if (message.content.trim()) {
            finalTextResponses.push(message.content);
        }
    }

    // Add final response(s) below task logs
    finalTextResponses.forEach(text => {
        const responseDiv = document.createElement('div');
        responseDiv.className = 'assistant-response';
        const formattedContent = formatMessageContent(text);
        responseDiv.innerHTML = formattedContent;
        contentDiv.appendChild(responseDiv);
    });
}

// Handle tool result (called when tool execution completes)
function updateToolResult(conversationTurn, toolId, result) {
    const toolCall = conversationTurn.querySelector(`[data-tool-id="${toolId}"]`);
    if (!toolCall) return;

    // Update status
    const status = toolCall.querySelector('.tool-status');
    if (status) {
        status.textContent = 'Completed';
        status.classList.remove('running');
        status.classList.add('completed');
    }

    // Show output in specialized tools
    const outputDiv = toolCall.querySelector('.tool-output');
    const outputContent = toolCall.querySelector('.tool-output-content');

    if (outputDiv && outputContent) {
        outputDiv.style.display = 'block';
        outputContent.textContent = result || 'Tool completed successfully';
    }

    // For terminal commands, style the output appropriately
    const terminalContent = toolCall.querySelector('.tool-terminal-content .tool-output-content');
    if (terminalContent) {
        terminalContent.innerHTML = `<pre>${result || 'Command completed successfully'}</pre>`;
    }
}

// Helper functions
function getToolIcon(toolName) {
    const icons = {
        'Read': '📖',
        'Write': '✏️',
        'Edit': '📝',
        'Bash': '💻',
        'Task': '🔧',
        'Glob': '🔍',
        'Grep': '🔎',
        'LS': '📁',
        'WebFetch': '🌐',
        'WebSearch': '🔍',
        'TodoWrite': '📋',
        'TodoRead': '📝'
    };
    return icons[toolName] || '🛠️';
}

function formatToolInput(input) {
    if (!input) return '';

    if (input.file_path) {
        return `${input.file_path}`;
    } else if (input.pattern) {
        return `Pattern: ${input.pattern}`;
    } else if (input.command) {
        return `Command: ${input.command}`;
    } else if (input.url) {
        return `URL: ${input.url}`;
    }

    // Fallback to first meaningful property
    const key = Object.keys(input)[0];
    return key ? `${key}: ${input[key]}` : '';
}

function toggleToolDetails(button) {
    const toolCall = button.closest('.tool-call');
    const details = toolCall.querySelector('.tool-details');
    const isExpanded = details.style.display !== 'none';

    if (isExpanded) {
        details.style.display = 'none';
        button.textContent = '▶';
        button.title = 'Show details';
    } else {
        details.style.display = 'block';
        button.textContent = '▼';
        button.title = 'Hide details';
    }
}

// Create message element (legacy compatibility)
function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = `message ${message.type}${message.invalidated ? ' invalidated' : ''}`;
    div.dataset.messageId = message.id;

    const formattedContent = formatMessageContent(message.content);
    const timestamp = formatTimestamp(message.timestamp);

    // For assistant messages, check if we can create task logs from the message content
    let taskLogsHtml = '';
    if (message.type === 'assistant') {
        const taskLogsData = extractTaskLogsFromMessage(message);
        if (taskLogsData.hasLogs) {
            const taskLogsContainer = createTaskLogsDropdown(taskLogsData);
            if (taskLogsContainer) {
                // Convert the DOM element to HTML string for insertion
                const tempDiv = document.createElement('div');
                tempDiv.appendChild(taskLogsContainer);
                taskLogsHtml = tempDiv.innerHTML;
            }
        }
    }

    // Add revert button for user messages
    const revertHtml = message.type === 'user' ? `
        <div class="message-actions">
            <button class="revert-btn" title="Revert file changes made after this message" style="display: none;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 7v6a3 3 0 0 0 3 3h12m0-12l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </button>
        </div>
    ` : '';

    div.innerHTML = `
        ${taskLogsHtml}
        <div class="message-content">${formattedContent}</div>
        <div class="message-timestamp">${timestamp}</div>
        ${revertHtml}
    `;

    // Re-attach event listeners for task logs if they exist
    if (message.type === 'assistant' && taskLogsHtml) {
        const taskLogsToggle = div.querySelector('.task-logs-toggle');
        if (taskLogsToggle) {
            taskLogsToggle.addEventListener('click', () => {
                const contentContainer = div.querySelector('.task-logs-content');
                const icon = taskLogsToggle.querySelector('.task-logs-icon');
                const isExpanded = contentContainer.style.display !== 'none';

                if (isExpanded) {
                    contentContainer.style.display = 'none';
                    icon.textContent = '▼';
                    taskLogsToggle.classList.remove('expanded');
                } else {
                    contentContainer.style.display = 'block';
                    icon.textContent = '▲';
                    taskLogsToggle.classList.add('expanded');
                }
            });
        }

        // Re-attach tool toggle event listeners
        const toolToggles = div.querySelectorAll('.tool-toggle');
        toolToggles.forEach(toggle => {
            toggle.addEventListener('click', () => toggleToolDetails(toggle));
        });
    }

    // Add event listener for revert button if it's a user message
    if (message.type === 'user') {
        const revertBtn = div.querySelector('.revert-btn');
        if (revertBtn) {
            revertBtn.addEventListener('click', () => handleRevertToMessage(message.id));
        }

        // Check if this message has file changes and show revert button
        checkAndShowRevertButton(message.id);
    }

    return div;
}

// Extract task logs data from a historical message
function extractTaskLogsFromMessage(message) {
    const taskLogsData = {
        thinking: [],
        toolCalls: [],
        textResponses: [],
        hasLogs: false
    };

    if (message.content && Array.isArray(message.content)) {
        message.content.forEach(contentItem => {
            if (contentItem.type === 'thinking' && contentItem.thinking) {
                taskLogsData.thinking.push(contentItem.thinking);
                taskLogsData.hasLogs = true;
            } else if (contentItem.type === 'tool_use') {
                taskLogsData.toolCalls.push(contentItem);
                taskLogsData.hasLogs = true;
            } else if (contentItem.type === 'text' && contentItem.text) {
                taskLogsData.textResponses.push(contentItem.text);
            }
        });
    }

    return taskLogsData;
}

// Format message content (basic markdown support)
function formatMessageContent(content) {
    let textContent = '';
    if (typeof content === 'string') {
        textContent = content;
    } else if (Array.isArray(content)) {
        // For structured content, extract and concatenate text blocks.
        // This is a simplification to avoid errors in legacy rendering paths.
        textContent = content
            .filter(block => block.type === 'text' && block.text)
            .map(block => block.text)
            .join('');
    }

    // Replace code blocks
    textContent = textContent.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

    // Replace inline code
    textContent = textContent.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Replace bold text
    textContent = textContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Replace line breaks
    textContent = textContent.replace(/\n/g, '<br>');

    return textContent;
}

// Toggle thinking section visibility
function toggleThinking(button) {
    const thinkingContainer = button.closest('.message-thinking');
    const thinkingContent = thinkingContainer.querySelector('.thinking-content');
    const isExpanded = thinkingContent.style.display !== 'none';

    if (isExpanded) {
        thinkingContent.style.display = 'none';
        button.textContent = '▶';
        button.title = 'Expand thinking';
    } else {
        thinkingContent.style.display = 'block';
        button.textContent = '▼';
        button.title = 'Collapse thinking';
    }
}

// Update current session UI elements
function updateCurrentSessionUI(session) {
    if (session.title) {
        conversationTitle.textContent = session.title;
    }

    if (session.claudeSessionId) {
        sessionInfo.textContent = `Session: ${session.claudeSessionId.substring(0, 8)}...`;
    }

    // Re-render messages if needed
    if (session.messages) {
        renderMessages(session.messages);
    }
}

// Show empty state when no sessions exist
function showEmptyState() {
    currentSessionId = null;
    currentRevertMessageId = null; // Clear revert state

    // Reset button state when showing empty state
    resetButtonState();

    conversationTitle.textContent = 'Select a conversation';
    editTitleBtn.style.display = 'none';
    conversationStatus.style.display = 'none';
    conversationContext.style.display = 'none';
    inputArea.style.display = 'none';
    sessionInfo.textContent = '';
    messagesContainer.innerHTML = `
        <div class="empty-state">
            <h3>Welcome to Claude Code Chat</h3>
            <p>Select a conversation from the sidebar or start a new one to begin chatting with Claude Code.</p>
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

// Send message
async function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentSessionId || isStreaming) return;

    // Update UI state
    isStreaming = true;
    sendBtn.style.display = 'none';
    stopBtn.style.display = 'flex';

    // Add user message to UI immediately
    const userMessage = {
        id: `msg-${Date.now()}`,
        type: 'user',
        content: content,
        timestamp: new Date().toISOString()
    };

    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
        session.messages.push(userMessage);
        session.updatedAt = new Date().toISOString();
    }

    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    charCounter.textContent = '0 characters';

    // Re-render messages to show user message
    if (session) {
        renderMessages(session.messages);
    }

    try {
        // Send message to backend
        console.log('Sending message to backend:', { sessionId: currentSessionId, content });
        await window.electronAPI.sendMessage(currentSessionId, content);
        console.log('Message sent successfully, waiting for streaming response...');

        // Note: Response will come via streaming IPC events

    } catch (error) {
        console.error('Failed to send message:', error);
        alert(`Failed to send message: ${error.message}`);

        // Reset UI state on error
        resetButtonState();
    }
}

// Stop message generation
async function stopMessage() {
    if (!currentSessionId || !isStreaming) return;

    try {
        await window.electronAPI.stopMessage(currentSessionId);

        // Reset UI state
        resetButtonState();

    } catch (error) {
        console.error('Failed to stop message:', error);
    }
}

// Create new session
async function createNewSession() {
    try {
        const session = await window.electronAPI.createSession('New Conversation');

        // Immediately add the session locally so it can be loaded right away
        if (!sessions.some(s => s.id === session.id)) {
            sessions.unshift(session);
            renderSessions();
        }

        // Automatically switch to the newly created conversation
        loadSession(session.id);
    } catch (error) {
        console.error('Failed to create session:', error);
        alert(`Failed to create new conversation: ${error.message}`);
    }
}

// Toggle title edit
function toggleTitleEdit() {
    if (conversationTitle.contentEditable === 'true') {
        saveTitleEdit();
    } else {
        conversationTitle.contentEditable = 'true';
        conversationTitle.focus();

        // Select all text
        const range = document.createRange();
        range.selectNodeContents(conversationTitle);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    }
}

// Handle title keydown
function handleTitleKeydown(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveTitleEdit();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelTitleEdit();
    }
}

// Save title edit
async function saveTitleEdit() {
    const newTitle = conversationTitle.textContent.trim();
    if (newTitle && currentSessionId) {
        try {
            const updatedSession = await window.electronAPI.updateSessionTitle(currentSessionId, newTitle);

            // Update local session
            const sessionIndex = sessions.findIndex(s => s.id === currentSessionId);
            if (sessionIndex >= 0) {
                sessions[sessionIndex] = updatedSession;
                renderSessions();
            }
        } catch (error) {
            console.error('Failed to update title:', error);
        }
    }

    conversationTitle.contentEditable = 'false';
}

// Cancel title edit
function cancelTitleEdit() {
    const session = sessions.find(s => s.id === currentSessionId);
    if (session) {
        conversationTitle.textContent = session.title;
    }
    conversationTitle.contentEditable = 'false';
}

// Show delete modal
function showDeleteModal(sessionId) {
    sessionToDelete = sessionId;
    deleteModal.style.display = 'flex';
}

// Confirm delete
async function confirmDelete() {
    if (sessionToDelete) {
        try {
            await window.electronAPI.deleteSession(sessionToDelete);

            // Remove from local sessions
            sessions = sessions.filter(s => s.id !== sessionToDelete);

            // If deleted session was current, load another or show empty state
            if (sessionToDelete === currentSessionId) {
                if (sessions.length > 0) {
                    loadSession(sessions[0].id);
                } else {
                    // Show empty state
                    currentSessionId = null;
                    conversationTitle.textContent = 'Select a conversation';
                    editTitleBtn.style.display = 'none';
                    inputArea.style.display = 'none';
                    sessionInfo.textContent = '';
                    messagesContainer.innerHTML = `
                        <div class="empty-state">
                            <h3>Welcome to Claude Code Chat</h3>
                            <p>Select a conversation from the sidebar or start a new one to begin chatting with Claude Code.</p>
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

            renderSessions();

        } catch (error) {
            console.error('Failed to delete session:', error);
            alert(`Failed to delete conversation: ${error.message}`);
        }
    }

    cancelDelete();
}

// Cancel delete
function cancelDelete() {
    sessionToDelete = null;
    deleteModal.style.display = 'none';
}

// Continue conversation function removed - now handled automatically in sendMessage

// Status helper functions
function getStatusIcon(status, canResume) {
    if (status === 'active') {
        return '●'; // Active dot
    } else if (status === 'historical' && canResume) {
        return '◯'; // Can resume
    } else if (status === 'archived') {
        return '○'; // Archived
    } else {
        return '○'; // Default
    }
}

function getStatusTooltip(status, canResume) {
    if (status === 'active') {
        return 'Active conversation - ready to continue';
    } else if (status === 'historical' && canResume) {
        return 'Previous conversation - ready to continue';
    } else if (status === 'archived') {
        return 'Archived conversation';
    } else {
        return 'Ready to continue';
    }
}

// Utility functions
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) { // Less than 1 minute
        return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
        return `${Math.floor(diff / 60000)}m ago`;
    } else if (diff < 86400000) { // Less than 1 day
        return `${Math.floor(diff / 3600000)}h ago`;
    } else if (diff < 604800000) { // Less than 1 week
        return `${Math.floor(diff / 86400000)}d ago`;
    } else {
        return date.toLocaleDateString();
    }
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

// Checkpoint and revert functionality
async function checkAndShowRevertButton(messageId) {
    if (!currentSessionId) return;

    try {
        const hasChanges = await window.electronAPI.hasFileChanges(currentSessionId, messageId);
        const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
        const revertBtn = messageEl?.querySelector('.revert-btn');

        if (revertBtn) {
            revertBtn.style.display = hasChanges ? 'flex' : 'none';
        }
    } catch (error) {
        console.error('Failed to check file changes:', error);
    }
}

async function handleRevertToMessage(messageId) {
    if (!currentSessionId) return;

    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    const revertBtn = messageEl?.querySelector('.revert-btn');

    if (!revertBtn) return;

    // Show confirmation dialog
    const confirmed = confirm('This will revert all file changes made after this message and remove subsequent conversation history. This action cannot be undone. Continue?');
    if (!confirmed) return;

    // Disable button and show loading state
    revertBtn.disabled = true;
    revertBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
            <path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    `;

    try {
        const result = await window.electronAPI.revertToMessage(currentSessionId, messageId);

        if (result.success) {
            // Show success message
            alert(result.message);

            // Set the current revert state
            currentRevertMessageId = messageId;

            // Reload the current session to show updated state
            await loadSession(currentSessionId);
            // Enter inline edit mode on the reverted user message
            enterEditMode(messageId);
        } else {
            alert(`Failed to revert: ${result.error}`);
        }
    } catch (error) {
        console.error('Failed to revert to message:', error);
        alert(`Failed to revert: ${error.message}`);
    } finally {
        // Restore button state
        revertBtn.disabled = false;
        revertBtn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 7v6a3 3 0 0 0 3 3h12m0-12l-4-4m4 4l-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        `;
    }
}

async function handleUnrevertFromMessage(messageId) {
    if (!currentSessionId) return;

    try {
        const result = await window.electronAPI.unrevertFromMessage(currentSessionId, messageId);

        if (result.success) {
            // Show success message
            alert(result.message);

            // Clear the current revert state
            currentRevertMessageId = null;

            // Exit edit mode if currently editing
            if (editingMessageId === messageId) {
                exitEditMode();
            }

            // Reload the current session to show updated state
            await loadSession(currentSessionId);
        } else {
            alert(`Failed to unrevert: ${result.error}`);
        }
    } catch (error) {
        console.error('Failed to unrevert from message:', error);
        alert(`Failed to unrevert: ${error.message}`);
    }
}

// ================= Inline Edit Mode =================

function enterEditMode(messageId) {
    if (editingMessageId) return; // already editing
    const messageEl = document.querySelector(`[data-message-id="${messageId}"] .message-content`);
    if (!messageEl) return;

    editingMessageId = messageId;

    messageEl.contentEditable = 'true';
    messageEl.classList.add('editing');
    messageEl.dataset.originalContent = messageEl.innerText;
    messageEl.focus();

    // Disable global input area
    inputArea.style.pointerEvents = 'none';
    inputArea.style.opacity = '0.5';

    // Add visual feedback for unrevert functionality
    if (currentRevertMessageId === messageId) {
        messagesContainer.classList.add('has-reverted-message');
        updateUnrevertTriggerPosition(messageId);
    }

    // Event listeners
    messageEl.addEventListener('keydown', handleEditKeydown);
    messageEl.addEventListener('blur', handleEditBlur);
}

function updateUnrevertTriggerPosition(messageId) {
    const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
    if (!messageEl) return;

    const containerRect = messagesContainer.getBoundingClientRect();
    const messageRect = messageEl.getBoundingClientRect();
    const triggerTop = ((messageRect.bottom - containerRect.top) / containerRect.height) * 100;

    messagesContainer.style.setProperty('--unrevert-trigger-top', `${triggerTop}%`);
}

function exitEditMode() {
    if (!editingMessageId) return;

    const messageContainer = document.querySelector(`[data-message-id="${editingMessageId}"] .message-content`);
    if (messageContainer) {
        messageContainer.contentEditable = 'false';
        messageContainer.classList.remove('editing');
        messageContainer.removeEventListener('keydown', handleEditKeydown);
        messageContainer.removeEventListener('blur', handleEditBlur);
    }

    // Remove visual feedback for unrevert functionality
    messagesContainer.classList.remove('has-reverted-message');
    messagesContainer.style.removeProperty('--unrevert-trigger-top');

    editingMessageId = null;
    inputArea.style.pointerEvents = '';
    inputArea.style.opacity = '';
}

function handleEditKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitEditedMessage();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
    }
}

function handleEditBlur() {
    // If user clicks outside, cancel the edit
    cancelEdit();
}

function commitEditedMessage() {
    const messageContainer = document.querySelector(`[data-message-id="${editingMessageId}"] .message-content`);
    if (!messageContainer) return;

    const newText = messageContainer.innerText.trim();
    if (newText) {
        // Send modified message to backend – treated as new user message
        window.electronAPI.sendMessage(currentSessionId, newText).catch(err => console.error('Failed to send edited message', err));
    }
    exitEditMode();
}

function cancelEdit() {
    const messageContainer = document.querySelector(`[data-message-id="${editingMessageId}"] .message-content`);
    if (messageContainer) {
        // Revert text to original
        messageContainer.innerText = messageContainer.dataset.originalContent || messageContainer.innerText;
    }
    exitEditMode();
}

// ====================================================

// Toggle history dropdown visibility
function toggleHistoryDropdown() {
    if (!historyDropdown) return;
    if (historyDropdown.style.display === 'none' || historyDropdown.style.display === '') {
        historyDropdown.style.display = 'block';
    } else {
        historyDropdown.style.display = 'none';
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', init);