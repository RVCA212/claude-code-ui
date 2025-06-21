// Application state
let sessions = [];
let currentSessionId = null;
let sessionToDelete = null;
let isStreaming = false;
let editingMessageId = null;
let currentRevertMessageId = null; // Track which message is currently reverted
let currentModel = ''; // Track current model selection (empty string = default Sonnet)

// File browser state
let currentDirectory = null;
let directoryContents = [];
let filteredContents = [];
let canGoBack = false;
let canGoForward = false;
let commonDirectories = [];
let fileSearchQuery = '';

// File mention state
let fileMentionActive = false;
let fileMentionQuery = '';
let fileMentionStartPos = 0;
let selectedMentionIndex = 0;
let filteredMentionFiles = [];

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

// Model selection elements
const modelSelect = document.getElementById('modelSelect');

// File browser elements
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const upBtn = document.getElementById('upBtn');
const homeBtn = document.getElementById('homeBtn');
const breadcrumb = document.getElementById('breadcrumb');
const cwdPath = document.getElementById('cwdPath');
const quickAccessList = document.getElementById('quickAccessList');
const quickAccessHeader = document.getElementById('quickAccessHeader');
const quickAccessToggle = document.getElementById('quickAccessToggle');
const fileCount = document.getElementById('fileCount');
const refreshBtn = document.getElementById('refreshBtn');
const fileSearchInput = document.getElementById('fileSearchInput');
const fileList = document.getElementById('fileList');
const loadingState = document.getElementById('loadingState');
const statusText = document.getElementById('statusText');

// File mention elements
const fileMentionDropdown = document.getElementById('fileMentionDropdown');
const fileMentionList = document.getElementById('fileMentionList');

// Initialize application
async function init() {
    console.log('Initializing Claude Code Chat...');

    // Set up event listeners
    setupEventListeners();

    // Listen for IPC events
    setupIPCListeners();

    // Initialize file browser
    await initializeFileBrowser();

    // Load sessions directly
    await loadSessions();

    // Initialize model selection
    await initializeModelSelection();
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

        // Close file mention dropdown when clicking outside
        if (fileMentionDropdown && fileMentionActive) {
            const withinMentionDropdown = fileMentionDropdown.contains(e.target);
            const isInput = messageInput && messageInput.contains(e.target);
            if (!withinMentionDropdown && !isInput) {
                hideFileMentionDropdown();
            }
        }
    });

    // File browser events
    setupFileBrowserEventListeners();

    // Model selection
    if (modelSelect) {
        modelSelect.addEventListener('change', handleModelChange);
    }
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
    // Handle file mention navigation
    if (fileMentionActive) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedMentionIndex = Math.min(selectedMentionIndex + 1, filteredMentionFiles.length - 1);
            renderFileMentionDropdown();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedMentionIndex = Math.max(selectedMentionIndex - 1, 0);
            renderFileMentionDropdown();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            insertSelectedFile();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            hideFileMentionDropdown();
        }
        return;
    }

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

    // Handle file mention detection
    handleFileMentionInput(e.target);
}

// ====================================================
// File Mention Functionality
// ====================================================

// Handle file mention input detection
function handleFileMentionInput(input) {
    const value = input.value;
    const cursorPos = input.selectionStart;
    
    // Find the @ symbol that would trigger file mention
    let atPos = -1;
    for (let i = cursorPos - 1; i >= 0; i--) {
        const char = value[i];
        if (char === '@') {
            // Check if @ is at start or preceded by whitespace (not another character)
            const prevChar = i > 0 ? value[i - 1] : ' ';
            if (prevChar === ' ' || prevChar === '\n' || prevChar === '\t' || i === 0) {
                atPos = i;
                break;
            } else {
                // @ is preceded by a character, not a valid mention
                break;
            }
        } else if (char === ' ' || char === '\n' || char === '\t') {
            // Hit whitespace before finding @, stop searching
            break;
        }
    }
    
    if (atPos !== -1) {
        // Extract the query after @
        const afterAt = value.substring(atPos + 1, cursorPos);
        
        // Check if the query contains spaces (should end mention)
        if (afterAt.includes(' ') || afterAt.includes('\n') || afterAt.includes('\t')) {
            hideFileMentionDropdown();
            return;
        }
        
        // Start or update file mention
        fileMentionActive = true;
        fileMentionQuery = afterAt;
        fileMentionStartPos = atPos;
        selectedMentionIndex = 0;
        
        filterFilesForMention();
        showFileMentionDropdown();
    } else {
        // No valid @ found, hide dropdown
        hideFileMentionDropdown();
    }
}

// Filter files based on mention query
function filterFilesForMention() {
    if (!directoryContents) {
        filteredMentionFiles = [];
        return;
    }
    
    const query = fileMentionQuery.toLowerCase();
    filteredMentionFiles = directoryContents.filter(item => {
        return item.name.toLowerCase().includes(query);
    }).slice(0, 10); // Limit to 10 results for performance
    
    // Reset selection if out of bounds
    if (selectedMentionIndex >= filteredMentionFiles.length) {
        selectedMentionIndex = 0;
    }
}

// Show file mention dropdown
function showFileMentionDropdown() {
    if (filteredMentionFiles.length > 0) {
        fileMentionDropdown.style.display = 'block';
        renderFileMentionDropdown();
    } else {
        hideFileMentionDropdown();
    }
}

// Hide file mention dropdown
function hideFileMentionDropdown() {
    fileMentionActive = false;
    fileMentionQuery = '';
    fileMentionStartPos = 0;
    selectedMentionIndex = 0;
    filteredMentionFiles = [];
    fileMentionDropdown.style.display = 'none';
}

// Render file mention dropdown contents
function renderFileMentionDropdown() {
    if (!fileMentionList) return;
    
    if (filteredMentionFiles.length === 0) {
        fileMentionList.innerHTML = '<div class="file-mention-empty">No files found</div>';
        return;
    }
    
    const itemsHtml = filteredMentionFiles.map((file, index) => {
        const icon = getFileIcon(file);
        const isSelected = index === selectedMentionIndex;
        const query = fileMentionQuery.toLowerCase();
        
        // Highlight matching text
        let highlightedName = file.name;
        if (query) {
            const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
            highlightedName = file.name.replace(regex, '<span class="file-mention-highlight">$1</span>');
        }
        
        return `
            <div class="file-mention-item ${isSelected ? 'selected' : ''}" data-index="${index}">
                <div class="file-mention-icon">${icon}</div>
                <div class="file-mention-name">${highlightedName}</div>
            </div>
        `;
    }).join('');
    
    fileMentionList.innerHTML = itemsHtml;
    
    // Add click handlers
    fileMentionList.querySelectorAll('.file-mention-item').forEach((item, index) => {
        item.addEventListener('click', () => {
            selectedMentionIndex = index;
            insertSelectedFile();
        });
    });
    
    // Scroll selected item into view
    const selectedItem = fileMentionList.querySelector('.file-mention-item.selected');
    if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
    }
}

// Insert selected file into input
function insertSelectedFile() {
    if (!fileMentionActive || filteredMentionFiles.length === 0) return;
    
    const selectedFile = filteredMentionFiles[selectedMentionIndex];
    if (!selectedFile) return;
    
    const input = messageInput;
    const value = input.value;
    
    // Build the replacement text with @ and file name
    const replacement = `@${selectedFile.name} `;
    
    // Calculate positions for replacement
    const beforeMention = value.substring(0, fileMentionStartPos);
    const afterCursor = value.substring(input.selectionStart);
    
    // Build new value
    const newValue = beforeMention + replacement + afterCursor;
    const newCursorPos = fileMentionStartPos + replacement.length;
    
    // Update input
    input.value = newValue;
    input.setSelectionRange(newCursorPos, newCursorPos);
    
    // Trigger input change event to update UI
    input.dispatchEvent(new Event('input', { bubbles: true }));
    
    // Hide dropdown
    hideFileMentionDropdown();
    
    // Focus back to input
    input.focus();
}

// Helper function to escape regex special characters
function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Render sessions list
function renderSessions() {
    // Get the conversations list from the history dropdown
    const historyConversationsList = document.querySelector('#historyDropdown .conversations-list');
    if (!historyConversationsList) return;

    historyConversationsList.innerHTML = '';

    // Sort sessions by updatedAt (most recent first)
    const sortedSessions = [...sessions].sort((a, b) =>
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );

    sortedSessions.forEach(session => {
        const sessionEl = createSessionElement(session);
        historyConversationsList.appendChild(sessionEl);
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

    // Hide file mention dropdown when switching sessions
    hideFileMentionDropdown();

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

    // Hide file mention dropdown
    hideFileMentionDropdown();

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

    // Hide file mention dropdown
    hideFileMentionDropdown();

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

// ====================================================
// Model Selection Management
// ====================================================

// Initialize model selection
async function initializeModelSelection() {
    try {
        const model = await window.electronAPI.getCurrentModel();
        currentModel = model || '';

        if (modelSelect) {
            modelSelect.value = currentModel;
        }

        console.log('Model selection initialized:', currentModel || 'Default (Sonnet)');
    } catch (error) {
        console.error('Failed to initialize model selection:', error);
        // Default to empty string (Sonnet) if there's an error
        currentModel = '';
        if (modelSelect) {
            modelSelect.value = '';
        }
    }
}

// Handle model selection change
async function handleModelChange() {
    if (!modelSelect) return;

    const newModel = modelSelect.value;
    const selectedIndex = modelSelect.selectedIndex;

    try {
        // Disable dropdown while updating
        modelSelect.disabled = true;

        await window.electronAPI.setCurrentModel(newModel);
        currentModel = newModel;

        console.log('Model changed to:', newModel || 'Default (Sonnet)');

        // Show a brief confirmation
        const originalText = modelSelect.options[selectedIndex].text;
        modelSelect.options[selectedIndex].text = '✓ ' + originalText;

        setTimeout(() => {
            if (modelSelect.options[selectedIndex]) {
                modelSelect.options[selectedIndex].text = originalText;
                // Ensure the dropdown value stays set to the selected model
                modelSelect.value = newModel;
            }
        }, 1000);

    } catch (error) {
        console.error('Failed to change model:', error);

        // Revert to previous model on error
        modelSelect.value = currentModel;

        alert(`Failed to change model: ${error.message}`);
    } finally {
        modelSelect.disabled = false;
    }
}

// ============================================================================
// File Browser Implementation
// ============================================================================

// Setup file browser event listeners
function setupFileBrowserEventListeners() {
    // Navigation buttons
    if (backBtn) backBtn.addEventListener('click', handleNavigateBack);
    if (forwardBtn) forwardBtn.addEventListener('click', handleNavigateForward);
    if (upBtn) upBtn.addEventListener('click', handleNavigateUp);
    if (homeBtn) homeBtn.addEventListener('click', handleNavigateHome);
    if (refreshBtn) refreshBtn.addEventListener('click', handleRefreshDirectory);

    // File search
    if (fileSearchInput) {
        fileSearchInput.addEventListener('input', handleFileSearch);
        fileSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                fileSearchInput.value = '';
                handleFileSearch();
            }
        });
    }

    // Quick access toggle - both header and button should work
    if (quickAccessHeader) {
        quickAccessHeader.addEventListener('click', handleQuickAccessToggle);
    }
    if (quickAccessToggle) {
        quickAccessToggle.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent double-triggering from header click
            handleQuickAccessToggle();
        });
    }

    // Keyboard shortcuts for file browser
    document.addEventListener('keydown', (e) => {
        // Only handle shortcuts when not in input fields
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.contentEditable === 'true') {
            return;
        }

        if ((e.ctrlKey || e.metaKey)) {
            switch (e.key) {
                case 'ArrowLeft':
                    e.preventDefault();
                    if (canGoBack) handleNavigateBack();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    if (canGoForward) handleNavigateForward();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    handleNavigateUp();
                    break;
            }
        }
    });
}

// Initialize file browser
async function initializeFileBrowser() {
    try {
        updateStatus('Initializing file browser...');

        // Load common directories for quick access
        const commonDirsResult = await window.electronAPI.getCommonDirectories();
        if (commonDirsResult.success) {
            commonDirectories = commonDirsResult.directories;
            renderQuickAccess();
        }

        // Load current directory
        await loadCurrentDirectory();

        updateStatus('File browser ready');
    } catch (error) {
        console.error('Failed to initialize file browser:', error);
        updateStatus(`Error: ${error.message}`);
    }
}

// Load current directory contents
async function loadCurrentDirectory() {
    try {
        showLoadingState(true);
        updateStatus('Loading directory...');

        const result = await window.electronAPI.getCurrentDirectory();

        if (result.success) {
            currentDirectory = result.path;
            directoryContents = result.contents || [];
            canGoBack = result.canGoBack || false;
            canGoForward = result.canGoForward || false;

            // Apply current search filter
            applyFileSearch();

            // Update UI
            updateNavigationState();
            updateDirectoryDisplay();
            renderDirectoryContents();

            updateStatus(`Loaded ${directoryContents.length} items`);
        } else {
            throw new Error(result.error || 'Failed to load directory');
        }
    } catch (error) {
        console.error('Failed to load current directory:', error);
        updateStatus(`Error: ${error.message}`);
    } finally {
        showLoadingState(false);
    }
}

// Navigate to a specific directory
async function navigateToDirectory(path) {
    try {
        showLoadingState(true);
        updateStatus(`Navigating to ${path}...`);

        const result = await window.electronAPI.navigateToDirectory(path);

        if (result.success) {
            currentDirectory = result.path;
            directoryContents = result.contents || [];
            canGoBack = result.canGoBack || false;
            canGoForward = result.canGoForward || false;

            // Clear search when navigating
            fileSearchInput.value = '';
            fileSearchQuery = '';
            applyFileSearch();

            // Update UI
            updateNavigationState();
            updateDirectoryDisplay();
            renderDirectoryContents();

            updateStatus(`Navigated to ${path}`);
            console.log('Working directory changed to:', path);
        } else {
            throw new Error(result.error || 'Failed to navigate to directory');
        }
    } catch (error) {
        console.error('Failed to navigate to directory:', error);
        updateStatus(`Error: ${error.message}`);
    } finally {
        showLoadingState(false);
    }
}

// Navigation handlers
async function handleNavigateBack() {
    if (!canGoBack) return;

    try {
        const result = await window.electronAPI.navigateBack();
        if (result.success) {
            currentDirectory = result.path;
            directoryContents = result.contents || [];
            canGoBack = result.canGoBack || false;
            canGoForward = result.canGoForward || false;

            applyFileSearch();
            updateNavigationState();
            updateDirectoryDisplay();
            renderDirectoryContents();
            updateStatus('Navigated back');
        } else {
            updateStatus(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Failed to navigate back:', error);
        updateStatus(`Error: ${error.message}`);
    }
}

async function handleNavigateForward() {
    if (!canGoForward) return;

    try {
        const result = await window.electronAPI.navigateForward();
        if (result.success) {
            currentDirectory = result.path;
            directoryContents = result.contents || [];
            canGoBack = result.canGoBack || false;
            canGoForward = result.canGoForward || false;

            applyFileSearch();
            updateNavigationState();
            updateDirectoryDisplay();
            renderDirectoryContents();
            updateStatus('Navigated forward');
        } else {
            updateStatus(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Failed to navigate forward:', error);
        updateStatus(`Error: ${error.message}`);
    }
}

async function handleNavigateUp() {
    try {
        const result = await window.electronAPI.navigateUp();
        if (result.success) {
            currentDirectory = result.path;
            directoryContents = result.contents || [];
            canGoBack = result.canGoBack || false;
            canGoForward = result.canGoForward || false;

            applyFileSearch();
            updateNavigationState();
            updateDirectoryDisplay();
            renderDirectoryContents();
            updateStatus('Navigated up');
        } else {
            updateStatus(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Failed to navigate up:', error);
        updateStatus(`Error: ${error.message}`);
    }
}

async function handleNavigateHome() {
    try {
        const homeResult = await window.electronAPI.getHomeDirectory();
        if (homeResult.success) {
            await navigateToDirectory(homeResult.path);
        } else {
            updateStatus('Error: Could not get home directory');
        }
    } catch (error) {
        console.error('Failed to navigate home:', error);
        updateStatus(`Error: ${error.message}`);
    }
}

async function handleRefreshDirectory() {
    await loadCurrentDirectory();
}

// Handle quick access toggle
function handleQuickAccessToggle() {
    if (!quickAccessList) return;

    const isExpanded = quickAccessList.style.display !== 'none';

    if (isExpanded) {
        // Collapse
        quickAccessList.style.display = 'none';
        quickAccessToggle.classList.add('collapsed');
        quickAccessToggle.title = 'Expand Quick Access';

        // Rotate arrow to point right
        const svg = quickAccessToggle.querySelector('svg path');
        if (svg) {
            svg.setAttribute('d', 'M9 18l6-6-6-6');
        }
    } else {
        // Expand
        quickAccessList.style.display = 'flex';
        quickAccessToggle.classList.remove('collapsed');
        quickAccessToggle.title = 'Collapse Quick Access';

        // Rotate arrow to point down
        const svg = quickAccessToggle.querySelector('svg path');
        if (svg) {
            svg.setAttribute('d', 'M18 15l-6-6-6 6');
        }
    }
}

// File search handler
function handleFileSearch() {
    fileSearchQuery = fileSearchInput.value.toLowerCase().trim();
    applyFileSearch();
    renderDirectoryContents();
}

// Apply file search filter
function applyFileSearch() {
    if (!fileSearchQuery) {
        filteredContents = [...directoryContents];
    } else {
        filteredContents = directoryContents.filter(item =>
            item.name.toLowerCase().includes(fileSearchQuery)
        );
    }
}

// Update navigation button states
function updateNavigationState() {
    if (backBtn) {
        backBtn.disabled = !canGoBack;
        backBtn.title = canGoBack ? 'Back' : 'No previous directory';
    }

    if (forwardBtn) {
        forwardBtn.disabled = !canGoForward;
        forwardBtn.title = canGoForward ? 'Forward' : 'No next directory';
    }
}

// Update directory display elements
function updateDirectoryDisplay() {
    // Update working directory indicator
    if (cwdPath) {
        // We'll get the home path from the backend instead of using require('os')
        const displayPath = currentDirectory || '~';
        cwdPath.textContent = displayPath;
        cwdPath.title = currentDirectory || '';
    }

    // Update breadcrumb
    updateBreadcrumb();

    // Update file count
    if (fileCount) {
        const total = directoryContents.length;
        const filtered = filteredContents.length;
        if (fileSearchQuery && filtered !== total) {
            fileCount.textContent = `${filtered} of ${total} items`;
        } else {
            fileCount.textContent = `${total} items`;
        }
    }
}

// Update breadcrumb navigation
function updateBreadcrumb() {
    if (!breadcrumb || !currentDirectory) return;

    const segments = currentDirectory.split('/').filter(Boolean);
    const breadcrumbHtml = [];

    // Add root segment
    breadcrumbHtml.push(`
        <span class="breadcrumb-segment" data-path="/">
            <span class="breadcrumb-icon">💾</span>
            <span class="breadcrumb-text">Root</span>
        </span>
    `);

    // Add path segments
    let currentPath = '';
    segments.forEach((segment, index) => {
        currentPath += '/' + segment;
        const isLast = index === segments.length - 1;

        breadcrumbHtml.push(`
            <span class="breadcrumb-separator">/</span>
            <span class="breadcrumb-segment ${isLast ? 'current' : ''}" data-path="${currentPath}">
                <span class="breadcrumb-text">${segment}</span>
            </span>
        `);
    });

    breadcrumb.innerHTML = breadcrumbHtml.join('');

    // Add click handlers for breadcrumb navigation
    breadcrumb.querySelectorAll('.breadcrumb-segment').forEach(segment => {
        if (!segment.classList.contains('current')) {
            segment.style.cursor = 'pointer';
            segment.addEventListener('click', () => {
                const path = segment.dataset.path;
                if (path) navigateToDirectory(path);
            });
        }
    });
}

// Render quick access shortcuts
function renderQuickAccess() {
    if (!quickAccessList || !commonDirectories) return;

    const quickAccessHtml = commonDirectories.map(dir => `
        <div class="quick-access-item" data-path="${dir.path}" title="${dir.path}">
            <span class="quick-access-icon">${dir.icon}</span>
            <span class="quick-access-name">${dir.name}</span>
        </div>
    `).join('');

    quickAccessList.innerHTML = quickAccessHtml;

    // Add click handlers
    quickAccessList.querySelectorAll('.quick-access-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            if (path) navigateToDirectory(path);
        });
    });
}

// Render directory contents
function renderDirectoryContents() {
    if (!fileList) return;

    if (filteredContents.length === 0) {
        const emptyMessage = fileSearchQuery
            ? `No files match "${fileSearchQuery}"`
            : 'This directory is empty';

        fileList.innerHTML = `
            <div class="empty-directory">
                <div class="empty-icon">📂</div>
                <div class="empty-message">${emptyMessage}</div>
            </div>
        `;
        return;
    }

    const fileListHtml = filteredContents.map(item => {
        const icon = getFileIcon(item);
        const sizeText = item.isDirectory ? '' : formatFileSize(item.size);
        const modifiedText = formatModifiedDate(item.modified);

        return `
            <div class="file-item ${item.isDirectory ? 'directory' : 'file'}"
                 data-path="${item.path}"
                 data-is-directory="${item.isDirectory}"
                 title="${item.path}">
                <div class="file-icon">${icon}</div>
                <div class="file-info">
                    <div class="file-name">${item.name}</div>
                    <div class="file-details">
                        ${sizeText && `<span class="file-size">${sizeText}</span>`}
                        <span class="file-modified">${modifiedText}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    fileList.innerHTML = fileListHtml;

    // Add click handlers
    fileList.querySelectorAll('.file-item').forEach(item => {
        item.addEventListener('click', () => {
            const path = item.dataset.path;
            const isDirectory = item.dataset.isDirectory === 'true';

            if (isDirectory) {
                navigateToDirectory(path);
            } else {
                // For files, we could potentially open them or show info
                updateStatus(`Selected file: ${path}`);
            }
        });
    });
}

// Helper functions
function getFileIcon(item) {
    if (item.isDirectory) {
        return '📁';
    }

    const ext = item.name.split('.').pop()?.toLowerCase();
    const filename = item.name.toLowerCase();
    
    // Special filename cases
    if (filename === 'readme.md' || filename === 'readme.txt' || filename === 'readme') {
        return '📖';
    }
    if (filename === 'license' || filename === 'license.txt' || filename === 'license.md') {
        return '📜';
    }
    if (filename === 'dockerfile' || filename === 'docker-compose.yml' || filename === 'docker-compose.yaml') {
        return '🐳';
    }
    if (filename === 'makefile' || filename === 'cmake.txt' || filename === 'cmakelists.txt') {
        return '🔨';
    }
    if (filename === '.gitignore' || filename === '.gitattributes') {
        return '🙈';
    }
    if (filename === 'package.json' || filename === 'package-lock.json') {
        return '📦';
    }

    const iconMap = {
        // JavaScript & TypeScript
        'js': '🟨', 'jsx': '⚛️', 'ts': '🔷', 'tsx': '⚛️',
        'vue': '💚', 'svelte': '🧡', 'angular': '🔴',
        
        // Python
        'py': '🐍', 'pyx': '🐍', 'pyw': '🐍', 'pyc': '🐍',
        'ipynb': '📊', 'pyi': '🐍',
        
        // Web Technologies
        'html': '🌐', 'htm': '🌐', 'xhtml': '🌐',
        'css': '🎨', 'scss': '🎨', 'sass': '🎨', 'less': '🎨',
        'php': '🐘', 'asp': '🔵', 'aspx': '🔵',
        
        // Other Programming Languages
        'java': '☕', 'class': '☕', 'jar': '☕',
        'cpp': '⚙️', 'cxx': '⚙️', 'cc': '⚙️', 'c': '⚙️', 'h': '⚙️', 'hpp': '⚙️',
        'cs': '🔷', 'vb': '🔷', 'fs': '🔷',
        'rb': '💎', 'gem': '💎', 'rake': '💎',
        'go': '🐹', 'rs': '🦀', 'swift': '🦉', 'kt': '🔶', 'scala': '🔴',
        'r': '📊', 'rmd': '📊', 'matlab': '🔢', 'm': '🔢',
        'sh': '🐚', 'bash': '🐚', 'zsh': '🐚', 'fish': '🐚',
        'ps1': '💙', 'bat': '⚫', 'cmd': '⚫',
        'lua': '🌙', 'perl': '🐪', 'pl': '🐪',
        
        // Configuration & Data Files
        'json': '📋', 'yaml': '📋', 'yml': '📋', 'toml': '📋', 'ini': '📋',
        'xml': '📄', 'config': '⚙️', 'conf': '⚙️', 'cfg': '⚙️',
        'env': '🔐', 'dotenv': '🔐',
        'log': '📜', 'txt': '📝',
        
        // Microsoft Office Files
        'doc': '📘', 'docx': '📘', 'rtf': '📘', 'odt': '📘',
        'xls': '📗', 'xlsx': '📗', 'xlsm': '📗', 'ods': '📗',
        'ppt': '📙', 'pptx': '📙', 'pps': '📙', 'ppsx': '📙', 'odp': '📙',
        'csv': '📊', 'tsv': '📊',
        
        // Documents & Text
        'pdf': '📕', 'epub': '📖', 'mobi': '📖',
        'md': '📄', 'markdown': '📄', 'rst': '📄', 'adoc': '📄',
        'tex': '📄', 'latex': '📄',
        
        // Images
        'png': '🖼️', 'jpg': '🖼️', 'jpeg': '🖼️', 'gif': '🖼️', 'svg': '🎨',
        'webp': '🖼️', 'ico': '🖼️', 'bmp': '🖼️', 'tiff': '🖼️', 'tga': '🖼️',
        'psd': '🎨', 'ai': '🎨', 'sketch': '🎨', 'figma': '🎨',
        
        // Audio Files
        'mp3': '🎵', 'wav': '🎵', 'flac': '🎵', 'aac': '🎵', 'ogg': '🎵',
        'wma': '🎵', 'm4a': '🎵', 'opus': '🎵',
        
        // Video Files
        'mp4': '🎬', 'avi': '🎬', 'mov': '🎬', 'mkv': '🎬', 'webm': '🎬',
        'flv': '🎬', 'wmv': '🎬', 'm4v': '🎬', '3gp': '🎬',
        
        // Archives & Compressed Files
        'zip': '📦', 'rar': '📦', '7z': '📦', 'tar': '📦', 'gz': '📦',
        'bz2': '📦', 'xz': '📦', 'lz': '📦', 'deb': '📦', 'rpm': '📦',
        'dmg': '💿', 'iso': '💿', 'img': '💿',
        
        // Database Files
        'db': '🗄️', 'sqlite': '🗄️', 'sqlite3': '🗄️', 'sql': '🗄️',
        'mdb': '🗄️', 'accdb': '🗄️',
        
        // Font Files
        'ttf': '🔤', 'otf': '🔤', 'woff': '🔤', 'woff2': '🔤', 'eot': '🔤',
        
        // Executable Files
        'exe': '⚙️', 'msi': '⚙️', 'deb': '📦', 'rpm': '📦', 'app': '📱',
        'bin': '⚙️', 'run': '⚙️',
        
        // Lock Files
        'lock': '🔒', 'lockfile': '🔒',
        
        // Certificates & Security
        'pem': '🔐', 'crt': '🔐', 'key': '🔐', 'p12': '🔐', 'pfx': '🔐',
        
        // Data Exchange
        'parquet': '📊', 'avro': '📊', 'proto': '📊', 'protobuf': '📊',
        
        // Version Control
        'patch': '🔧', 'diff': '🔧',
        
        // Jupyter & Data Science
        'ipynb': '📊', 'rmd': '📊', 'qmd': '📊'
    };

    return iconMap[ext] || '📄';
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatModifiedDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;

    return date.toLocaleDateString();
}

function showLoadingState(show) {
    if (loadingState) {
        loadingState.style.display = show ? 'flex' : 'none';
    }
}

function updateStatus(message) {
    if (statusText) {
        statusText.textContent = message;
    }
    console.log('File browser:', message);
}

// Initialize the application
document.addEventListener('DOMContentLoaded', init);