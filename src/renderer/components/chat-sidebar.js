// Chat Sidebar Component - Fixed chat interface for the right sidebar
class ChatSidebarComponent {
  constructor() {
    this.container = document.getElementById('chatSidebar');
    this.isInitialized = false;

    this.initializeComponent();
  }

  initializeComponent() {
    if (!this.container) {
      console.error('Chat sidebar container not found');
      return;
    }

    // Add resizing functionality
    this.setupResizing();

    this.isInitialized = true;
    console.log('Chat Sidebar component initialized');
  }

  setupResizing() {
    // Make the chat sidebar resizable
    this.addResizeHandle();
  }

  addResizeHandle() {
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'chat-sidebar-resize-handle';

    // Add the resize handle to the container
    this.container.appendChild(resizeHandle);
  }

  // Public API methods
  getContainer() {
    return this.container;
  }

  // Get the main chat component for integration
  getMainChatElement() {
    return this.container?.querySelector('.main-chat');
  }

  // Integration with existing message component
  notifyMessageActivity() {
    // This method is kept for compatibility but no longer needs to do anything
    // since there's no collapsed state to indicate activity
    console.log('Message activity notification received');
  }
}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatSidebarComponent;
}