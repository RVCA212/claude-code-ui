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

    // Initialize drag and drop functionality
    this.setupDragAndDrop();

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

  setupDragAndDrop() {
    if (!this.container) return;

    // Prevent default drag behaviors on the container
    this.container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.container.classList.add('drag-over');
    });

    this.container.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.container.classList.add('drag-over');
    });

    this.container.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Only remove drag-over if we're actually leaving the container
      if (!this.container.contains(e.relatedTarget)) {
        this.container.classList.remove('drag-over');
      }
    });

    this.container.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.container.classList.remove('drag-over');
      
      this.handleFileDrop(e);
    });

    console.log('Chat sidebar drag and drop initialized');
  }

  handleFileDrop(event) {
    const files = Array.from(event.dataTransfer.files);
    
    if (files.length === 0) {
      console.log('No files dropped');
      return;
    }

    console.log(`Dropped ${files.length} file(s)`);

    // Get the message component to insert file paths
    const messageComponent = window.messageComponent;
    if (!messageComponent) {
      console.error('Message component not available');
      return;
    }

    // Collect all valid file paths
    const filePaths = files
      .map(file => file.path)
      .filter(path => path); // Filter out any undefined paths

    if (filePaths.length === 0) {
      console.warn('No valid file paths found');
      return;
    }

    // Insert all file paths as a single operation
    if (filePaths.length === 1) {
      // Single file - just insert the path
      messageComponent.insertFilePath(filePaths[0]);
    } else {
      // Multiple files - insert them separated by spaces
      const allPaths = filePaths.join(' ');
      messageComponent.insertFilePath(allPaths);
    }

    console.log(`Inserted ${filePaths.length} file path(s)`);
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