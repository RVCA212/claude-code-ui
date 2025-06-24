// Chat Sidebar Component - Right sidebar chat interface when file editor is open
class ChatSidebarComponent {
  constructor() {
    this.container = document.getElementById('chatSidebar');
    this.isInitialized = false;
    this.isVisible = false;

    this.initializeComponent();
  }

  initializeComponent() {
    if (!this.container) {
      console.error('Chat sidebar container not found');
      return;
    }

    // Add resizing functionality
    this.setupResizing();

    // Initialize visibility state
    this.isVisible = !this.container.classList.contains('hidden');

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

  // Show/hide the chat sidebar
  show() {
    if (!this.container) return;
    
    this.container.classList.remove('hidden');
    this.isVisible = true;
    console.log('Chat sidebar shown');
  }

  hide() {
    if (!this.container) return;
    
    this.container.classList.add('hidden');
    this.isVisible = false;
    console.log('Chat sidebar hidden');
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
    return this.isVisible;
  }

  isShown() {
    return this.isVisible;
  }

  // Get the main chat component for integration
  getMainChatElement() {
    return this.container?.querySelector('.main-chat');
  }

  // Integration with existing message component
  notifyMessageActivity() {
    // This method is kept for compatibility but no longer needs to do anything
    // since there's no collapsed state to indicate activity
    console.log('Chat sidebar message activity notification received');
  }
}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatSidebarComponent;
}