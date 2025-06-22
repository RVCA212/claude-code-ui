// Chat Sidebar Component - Condensed chat interface for the right sidebar
class ChatSidebarComponent {
  constructor() {
    this.isCollapsed = false; // Start expanded by default
    this.container = document.getElementById('chatSidebar');
    this.isInitialized = false;
    this.previousWidth = 400; // Default width when expanded

    this.initializeComponent();
  }

  initializeComponent() {
    if (!this.container) {
      console.error('Chat sidebar container not found');
      return;
    }

    // Add collapse/expand functionality
    this.setupEventListeners();
    this.setupResizing();

    // Ensure sidebar is expanded by default
    this.ensureExpanded();

    this.isInitialized = true;
    console.log('Chat Sidebar component initialized');
  }



  setupEventListeners() {
    // Listen for window resize to adjust layout
    window.addEventListener('resize', () => this.handleResize());

    // Listen for keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Alt/Option + C to toggle chat sidebar
      if ((e.altKey || e.metaKey) && e.key === 'c') {
        e.preventDefault();
        this.toggleCollapse();
      }
    });
  }

  setupResizing() {
    // Make the chat sidebar resizable
    this.addResizeHandle();
  }

  addResizeHandle() {
    // Create resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'chat-sidebar-resize-handle';
    resizeHandle.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: transparent;
      cursor: col-resize;
      z-index: 1000;
    `;

    // Add hover effect
    resizeHandle.addEventListener('mouseenter', () => {
      resizeHandle.style.background = 'var(--color-primary)';
    });

    resizeHandle.addEventListener('mouseleave', () => {
      resizeHandle.style.background = 'transparent';
    });

    // Add resize functionality
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = this.container.offsetWidth;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaX = startX - e.clientX; // Reverse delta since we're on the right side
      const newWidth = Math.max(280, Math.min(600, startWidth + deltaX));

      this.container.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });

    // Add the resize handle to the container
    this.container.style.position = 'relative';
    this.container.appendChild(resizeHandle);
  }

  toggleCollapse() {
    this.isCollapsed = !this.isCollapsed;

    if (this.isCollapsed) {
      this.collapse();
    } else {
      this.expand();
    }
  }

  collapse() {
    if (!this.container) return;

    // Store current width before collapsing (ensure it's at least the default)
    this.previousWidth = Math.max(this.container.offsetWidth, 400);

    // Add collapsed class and set width
    this.container.classList.add('collapsed');
    this.container.style.width = '48px'; // Just enough for a collapse/expand button

    // Hide main content and show mini interface
    this.showMiniInterface();

    console.log('Chat sidebar collapsed');
  }

  expand() {
    if (!this.container) return;

    // Remove collapsed class and restore width
    this.container.classList.remove('collapsed');
    this.container.style.width = `${this.previousWidth}px`;

    // Show main content and hide mini interface
    this.hideMiniInterface();

    console.log('Chat sidebar expanded');
  }

  showMiniInterface() {
    const mainChat = this.container.querySelector('.main-chat');
    if (mainChat) {
      mainChat.style.display = 'none';
    }

    // Create or show mini interface
    let miniInterface = this.container.querySelector('.chat-mini-interface');
    if (!miniInterface) {
      miniInterface = this.createMiniInterface();
      this.container.appendChild(miniInterface);
    }

    miniInterface.style.display = 'flex';
  }

  hideMiniInterface() {
    const mainChat = this.container.querySelector('.main-chat');
    if (mainChat) {
      mainChat.style.display = 'flex';
    }

    const miniInterface = this.container.querySelector('.chat-mini-interface');
    if (miniInterface) {
      miniInterface.style.display = 'none';
    }
  }

  createMiniInterface() {
    const miniInterface = document.createElement('div');
    miniInterface.className = 'chat-mini-interface';
    miniInterface.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      height: 100%;
      padding: var(--space-12) var(--space-8);
      background: var(--color-background);
      gap: var(--space-12);
    `;

    // Expand button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'chat-expand-btn';
    expandBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
    expandBtn.title = 'Expand chat sidebar';
    expandBtn.style.cssText = `
      background: var(--color-primary);
      color: var(--color-btn-primary-text);
      border: none;
      border-radius: var(--radius-sm);
      padding: var(--space-8);
      cursor: pointer;
      transition: background-color var(--duration-fast) var(--ease-standard);
      display: flex;
      align-items: center;
      justify-content: center;
    `;

    expandBtn.addEventListener('click', () => this.expand());
    expandBtn.addEventListener('mouseenter', () => {
      expandBtn.style.background = 'var(--color-primary-hover)';
    });
    expandBtn.addEventListener('mouseleave', () => {
      expandBtn.style.background = 'var(--color-primary)';
    });

    // Quick chat indicator (show if there's an active conversation)
    const chatIndicator = document.createElement('div');
    chatIndicator.className = 'chat-indicator';
    chatIndicator.style.cssText = `
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-success);
      opacity: 0.7;
    `;

    miniInterface.appendChild(expandBtn);
    miniInterface.appendChild(chatIndicator);

    return miniInterface;
  }

  handleResize() {
    // Adjust layout on window resize
    // Removed auto-collapse behavior to keep sidebar expanded by default
    // Users can manually collapse if needed
  }

  ensureExpanded() {
    // Make sure the sidebar starts in expanded state
    this.isCollapsed = false;

    if (this.container) {
      // Remove any collapsed classes
      this.container.classList.remove('collapsed');

      // Set default width if not already set
      if (!this.container.style.width || this.container.style.width === '48px') {
        this.container.style.width = '400px';
      }

      // Make sure main content is visible
      this.hideMiniInterface();
    }

    console.log('Chat sidebar ensured expanded');
  }

  // Public API methods
  getIsCollapsed() {
    return this.isCollapsed;
  }

  forceCollapse() {
    if (!this.isCollapsed) {
      this.collapse();
    }
  }

  forceExpand() {
    if (this.isCollapsed) {
      this.expand();
    }
  }

  getContainer() {
    return this.container;
  }

  // Get the main chat component for integration
  getMainChatElement() {
    return this.container?.querySelector('.main-chat');
  }

  // Integration with existing message component
  notifyMessageActivity() {
    // Update mini interface indicator when there's chat activity
    const indicator = this.container?.querySelector('.chat-indicator');
    if (indicator && this.isCollapsed) {
      indicator.style.background = 'var(--color-warning)';

      // Reset after a few seconds
      setTimeout(() => {
        if (indicator) {
          indicator.style.background = 'var(--color-success)';
        }
      }, 3000);
    }
  }
}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ChatSidebarComponent;
}