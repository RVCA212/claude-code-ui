// Application state
let conversations = [];
let currentConversationId = null;
let conversationToDelete = null;

// DOM elements
const conversationsList = document.getElementById('conversationsList');
const messagesContainer = document.getElementById('messagesContainer');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const newConversationBtn = document.getElementById('newConversationBtn');
const conversationTitle = document.getElementById('conversationTitle');
const editTitleBtn = document.getElementById('editTitleBtn');
const inputArea = document.getElementById('inputArea');
const charCounter = document.getElementById('charCounter');
const deleteModal = document.getElementById('deleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');

// Initialize application
function init() {
    // Load initial data
    loadInitialData();
    
    // Render conversations
    renderConversations();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load first conversation if available
    if (conversations.length > 0) {
        loadConversation(conversations[0].id);
    }
}

// Load initial data
function loadInitialData() {
    const initialData = {
        "conversations": [
            {
                "id": "conv-1",
                "title": "Debug Python Function",
                "messages": [
                    {
                        "id": "msg-1",
                        "type": "user",
                        "content": "I have a Python function that's not working correctly. Can you help me debug it?\n\n```python\ndef calculate_average(numbers):\n    total = 0\n    for num in numbers:\n        total += num\n    return total / len(numbers)\n```",
                        "timestamp": "2025-06-20T14:30:00Z"
                    },
                    {
                        "id": "msg-2",
                        "type": "assistant",
                        "content": "I can help you debug this function! The code looks mostly correct for calculating an average, but there's one potential issue: **division by zero**.\n\nIf an empty list is passed to the function, `len(numbers)` will be 0, causing a `ZeroDivisionError`. Here's an improved version:\n\n```python\ndef calculate_average(numbers):\n    if not numbers:  # Handle empty list\n        return 0  # or raise ValueError(\"Cannot calculate average of empty list\")\n    \n    total = 0\n    for num in numbers:\n        total += num\n    return total / len(numbers)\n```\n\nAlternatively, you can use Python's built-in functions for a more concise approach:\n\n```python\ndef calculate_average(numbers):\n    if not numbers:\n        return 0\n    return sum(numbers) / len(numbers)\n```\n\nWhat specific issue were you encountering with the original function?",
                        "timestamp": "2025-06-20T14:30:15Z"
                    }
                ],
                "createdAt": "2025-06-20T14:30:00Z",
                "updatedAt": "2025-06-20T14:30:15Z"
            },
            {
                "id": "conv-2",
                "title": "React Component Optimization",
                "messages": [
                    {
                        "id": "msg-3",
                        "type": "user",
                        "content": "How can I optimize this React component for better performance?",
                        "timestamp": "2025-06-20T13:15:00Z"
                    },
                    {
                        "id": "msg-4",
                        "type": "assistant",
                        "content": "I'd be happy to help optimize your React component! However, I don't see the component code in your message. Could you please share the component you'd like me to review?\n\nIn the meantime, here are some common React optimization techniques:\n\n## Common Optimization Strategies:\n\n1. **Use React.memo()** for functional components\n2. **Use useMemo()** for expensive calculations\n3. **Use useCallback()** for function references\n4. **Lazy loading** with React.lazy()\n5. **Proper key props** in lists\n6. **Avoid anonymous functions** in JSX\n\nOnce you share your component, I can provide specific recommendations!",
                        "timestamp": "2025-06-20T13:15:30Z"
                    }
                ],
                "createdAt": "2025-06-20T13:15:00Z",
                "updatedAt": "2025-06-20T13:15:30Z"
            },
            {
                "id": "conv-3",
                "title": "SQL Query Help",
                "messages": [
                    {
                        "id": "msg-5",
                        "type": "user",
                        "content": "I need help writing a SQL query to find the top 5 customers by total purchase amount.",
                        "timestamp": "2025-06-20T12:00:00Z"
                    },
                    {
                        "id": "msg-6",
                        "type": "assistant",
                        "content": "I'll help you write a SQL query to find the top 5 customers by total purchase amount. Here's a query that should work:\n\n```sql\nSELECT \n    c.customer_id,\n    c.customer_name,\n    SUM(o.total_amount) as total_purchases\nFROM \n    customers c\nINNER JOIN \n    orders o ON c.customer_id = o.customer_id\nGROUP BY \n    c.customer_id, c.customer_name\nORDER BY \n    total_purchases DESC\nLIMIT 5;\n```\n\n## Explanation:\n- **JOIN**: Links customers and orders tables\n- **GROUP BY**: Groups results by customer\n- **SUM()**: Calculates total purchase amount per customer\n- **ORDER BY DESC**: Sorts by highest amount first\n- **LIMIT 5**: Returns only top 5 results\n\nIf your table structure is different, let me know the column names and I can adjust the query!",
                        "timestamp": "2025-06-20T12:00:45Z"
                    }
                ],
                "createdAt": "2025-06-20T12:00:00Z",
                "updatedAt": "2025-06-20T12:00:45Z"
            }
        ],
        "currentConversationId": "conv-1"
    };
    
    conversations = initialData.conversations;
    currentConversationId = initialData.currentConversationId;
}

// Set up event listeners
function setupEventListeners() {
    // New conversation button
    newConversationBtn.addEventListener('click', createNewConversation);
    
    // Send message
    sendBtn.addEventListener('click', sendMessage);
    
    // Message input
    messageInput.addEventListener('keydown', handleInputKeydown);
    messageInput.addEventListener('input', handleInputChange);
    
    // Title editing
    editTitleBtn.addEventListener('click', toggleTitleEdit);
    conversationTitle.addEventListener('keydown', handleTitleKeydown);
    conversationTitle.addEventListener('blur', saveTitleEdit);
    
    // Delete modal
    confirmDeleteBtn.addEventListener('click', confirmDelete);
    cancelDeleteBtn.addEventListener('click', cancelDelete);
    deleteModal.addEventListener('click', (e) => {
        if (e.target === deleteModal) cancelDelete();
    });
    
    // Keyboard shortcuts
    document.addEventListener('keydown', handleGlobalKeydown);
}

// Handle global keyboard shortcuts
function handleGlobalKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewConversation();
    }
}

// Handle input keydown
function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
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
    sendBtn.disabled = e.target.value.trim() === '';
}

// Render conversations list
function renderConversations() {
    conversationsList.innerHTML = '';
    
    // Sort conversations by updatedAt (most recent first)
    const sortedConversations = [...conversations].sort((a, b) => 
        new Date(b.updatedAt) - new Date(a.updatedAt)
    );
    
    sortedConversations.forEach(conversation => {
        const conversationEl = createConversationElement(conversation);
        conversationsList.appendChild(conversationEl);
    });
}

// Create conversation element
function createConversationElement(conversation) {
    const div = document.createElement('div');
    div.className = `conversation-item ${conversation.id === currentConversationId ? 'active' : ''}`;
    div.dataset.conversationId = conversation.id;
    
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    const preview = lastMessage ? truncateText(lastMessage.content, 50) : 'No messages yet';
    const timestamp = formatTimestamp(conversation.updatedAt);
    
    div.innerHTML = `
        <div class="conversation-content">
            <div class="conversation-title-text">${conversation.title}</div>
            <div class="conversation-preview">${preview}</div>
            <div class="conversation-timestamp">${timestamp}</div>
        </div>
        <button class="delete-conversation-btn" data-conversation-id="${conversation.id}">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>
    `;
    
    // Add click event listener
    div.addEventListener('click', (e) => {
        if (!e.target.closest('.delete-conversation-btn')) {
            loadConversation(conversation.id);
        }
    });
    
    // Add delete button event listener
    const deleteBtn = div.querySelector('.delete-conversation-btn');
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showDeleteModal(conversation.id);
    });
    
    return div;
}

// Load conversation
function loadConversation(conversationId) {
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) return;
    
    currentConversationId = conversationId;
    
    // Update UI
    conversationTitle.textContent = conversation.title;
    conversationTitle.contentEditable = 'false';
    editTitleBtn.style.display = 'inline-block';
    inputArea.style.display = 'block';
    
    // Update active conversation in sidebar
    document.querySelectorAll('.conversation-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.conversationId === conversationId) {
            item.classList.add('active');
        }
    });
    
    // Render messages
    renderMessages(conversation.messages);
    
    // Focus input
    messageInput.focus();
}

// Render messages
function renderMessages(messages) {
    messagesContainer.innerHTML = '';
    
    messages.forEach(message => {
        const messageEl = createMessageElement(message);
        messagesContainer.appendChild(messageEl);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Create message element
function createMessageElement(message) {
    const div = document.createElement('div');
    div.className = `message ${message.type}`;
    
    const formattedContent = formatMessageContent(message.content);
    const timestamp = formatTimestamp(message.timestamp);
    
    div.innerHTML = `
        <div class="message-content">${formattedContent}</div>
        <div class="message-timestamp">${timestamp}</div>
    `;
    
    return div;
}

// Format message content (basic markdown support)
function formatMessageContent(content) {
    // Replace code blocks
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');
    
    // Replace inline code
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Replace bold text
    content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Replace line breaks
    content = content.replace(/\n/g, '<br>');
    
    return content;
}

// Send message
function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !currentConversationId) return;
    
    const conversation = conversations.find(c => c.id === currentConversationId);
    if (!conversation) return;
    
    // Create user message
    const userMessage = {
        id: `msg-${Date.now()}`,
        type: 'user',
        content: content,
        timestamp: new Date().toISOString()
    };
    
    // Add to conversation
    conversation.messages.push(userMessage);
    conversation.updatedAt = new Date().toISOString();
    
    // Clear input
    messageInput.value = '';
    messageInput.style.height = 'auto';
    charCounter.textContent = '0 characters';
    sendBtn.disabled = true;
    
    // Render messages
    renderMessages(conversation.messages);
    
    // Show typing indicator
    showTypingIndicator();
    
    // Simulate assistant response
    setTimeout(() => {
        const assistantMessage = {
            id: `msg-${Date.now()}-assistant`,
            type: 'assistant',
            content: generateAssistantResponse(content),
            timestamp: new Date().toISOString()
        };
        
        conversation.messages.push(assistantMessage);
        conversation.updatedAt = new Date().toISOString();
        
        // Render messages
        renderMessages(conversation.messages);
        
        // Update conversations list
        renderConversations();
    }, 1500);
    
    // Update conversations list
    renderConversations();
}

// Show typing indicator
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.className = 'message assistant';
    typingDiv.innerHTML = `
        <div class="typing-indicator">
            Claude is typing...
        </div>
    `;
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Remove after response
    setTimeout(() => {
        if (typingDiv.parentNode) {
            typingDiv.remove();
        }
    }, 1500);
}

// Generate assistant response (simulated)
function generateAssistantResponse(userMessage) {
    const responses = [
        "I'd be happy to help you with that! Could you provide more details about what you're trying to accomplish?",
        "That's a great question! Let me break this down for you:\n\n1. First, consider the context\n2. Then, think about the implementation\n3. Finally, test your solution\n\nWhat specific part would you like me to explain further?",
        "I can help you with that code! Here's what I notice:\n\n```javascript\n// Example solution\nfunction example() {\n    return 'This is a simulated response';\n}\n```\n\nWould you like me to explain this approach?",
        "That's an interesting problem! Here are a few approaches you could consider:\n\n**Option 1**: Use a direct implementation\n**Option 2**: Leverage existing libraries\n**Option 3**: Build a custom solution\n\nWhich approach seems most suitable for your use case?"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
}

// Create new conversation
function createNewConversation() {
    const newConversation = {
        id: `conv-${Date.now()}`,
        title: 'New Conversation',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    conversations.unshift(newConversation);
    renderConversations();
    loadConversation(newConversation.id);
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
function saveTitleEdit() {
    const newTitle = conversationTitle.textContent.trim();
    if (newTitle && currentConversationId) {
        const conversation = conversations.find(c => c.id === currentConversationId);
        if (conversation) {
            conversation.title = newTitle;
            conversation.updatedAt = new Date().toISOString();
            renderConversations();
        }
    }
    
    conversationTitle.contentEditable = 'false';
}

// Cancel title edit
function cancelTitleEdit() {
    const conversation = conversations.find(c => c.id === currentConversationId);
    if (conversation) {
        conversationTitle.textContent = conversation.title;
    }
    conversationTitle.contentEditable = 'false';
}

// Show delete modal
function showDeleteModal(conversationId) {
    conversationToDelete = conversationId;
    deleteModal.style.display = 'flex';
}

// Confirm delete
function confirmDelete() {
    if (conversationToDelete) {
        // Remove conversation
        conversations = conversations.filter(c => c.id !== conversationToDelete);
        
        // If deleted conversation was current, load another or show empty state
        if (conversationToDelete === currentConversationId) {
            if (conversations.length > 0) {
                loadConversation(conversations[0].id);
            } else {
                // Show empty state
                currentConversationId = null;
                conversationTitle.textContent = 'Select a conversation';
                editTitleBtn.style.display = 'none';
                inputArea.style.display = 'none';
                messagesContainer.innerHTML = `
                    <div class="empty-state">
                        <h3>Welcome to Claude Code Chat</h3>
                        <p>Select a conversation from the sidebar or start a new one to begin chatting.</p>
                    </div>
                `;
            }
        }
        
        renderConversations();
    }
    
    cancelDelete();
}

// Cancel delete
function cancelDelete() {
    conversationToDelete = null;
    deleteModal.style.display = 'none';
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

// Initialize the application
document.addEventListener('DOMContentLoaded', init);