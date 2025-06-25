// Main App Component that coordinates all other components
class AppComponent {
  constructor() {
    this.components = {};
    this.isInitialized = false;
    this.isHandlingResize = false; // Flag to prevent recursive resize handling


    this.initializeComponents();
    this.setupGlobalEventListeners();
  }

  initializeComponents() {
    try {
      // 1. Settings first (independent)
      this.components.settings = new SettingsComponent();

      // 2. File browser next so it can listen for directory change events *before* sessions are restored
      this.components.fileBrowser = new FileBrowser();

      // 3. Session manager (triggers async session load which will emit directoryChanged)
      this.components.sessionManager = new SessionManager();

      // 4. Remaining components that depend on sessionManager
      this.components.messageComponent = new MessageComponent(this.components.sessionManager);
      this.components.fileEditor = new FileEditorComponent();
      this.components.chatSidebar = new ChatSidebarComponent();
      this.components.globalSearch = new GlobalSearch();

      // Hide folder sidebar by default
      this.hideFolderSidebarByDefault();

      // Set chat area to blank by default
      this.setChatAreaBlankByDefault();

      // Initialize session manager after other components are ready
      this.components.sessionManager.init();

      // Set up cross-component communication after DOM is stable
      setTimeout(() => {
        this.setupComponentCommunication();
      }, 100);

      // Initialize global header button states after everything is ready
      setTimeout(() => {
        if (window.globalHeader) {
          window.globalHeader.updateButtonStates();
        }
      }, 200);

      this.isInitialized = true;
      console.log('App components initialized successfully');

    } catch (error) {
      console.error('Failed to initialize app components:', error);
      this.showFatalError('Failed to initialize application');
    }
  }

  hideFolderSidebarByDefault() {
    // Hide the folder sidebar by default for a compact layout
    const sidebar = document.querySelector('.sidebar');
    if (sidebar) {
      sidebar.classList.add('hidden');
      console.log('Folder sidebar hidden by default for compact layout');
    }
  }

  setChatAreaBlankByDefault() {
    // Set the chat area to blank by default (no welcome message)
    const applyBlankState = () => {
      const emptyState = document.querySelector('.empty-state');
      if (emptyState && !emptyState.classList.contains('compact')) {
        emptyState.classList.add('compact');
        console.log('Chat area set to blank by default');
      }
    };

    // Try immediately
    applyBlankState();

    // Use a slight delay to ensure DOM elements are available
    setTimeout(applyBlankState, 100);

    // Set up a mutation observer to catch dynamically created empty states
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the added node is an empty state or contains one
              if (node.classList?.contains('empty-state')) {
                node.classList.add('compact');
              } else if (node.querySelector) {
                const emptyState = node.querySelector('.empty-state');
                if (emptyState) {
                  emptyState.classList.add('compact');
                }
              }
            }
          });
        }
      });
    });

    // Observe the messages container for changes
    const messagesContainer = document.querySelector('#messagesContainer');
    if (messagesContainer) {
      observer.observe(messagesContainer, { childList: true, subtree: true });
    }

    // Store observer for cleanup if needed
    this.blankStateObserver = observer;
  }

  setupComponentCommunication() {
    // Make components available globally for cross-component communication
    window.sessionManager = this.components.sessionManager;
    window.messageComponent = this.components.messageComponent;
    window.settingsComponent = this.components.settings;
    window.fileBrowser = this.components.fileBrowser;
    window.fileEditor = this.components.fileEditor;
    window.chatSidebar = this.components.chatSidebar;
    window.globalSearch = this.components.globalSearch;

    // Make app instance and debug methods globally available
    window.app = this;
    window.debugApp = () => this.logDebugInfo();
    window.diagnoseChatLayout = () => this.diagnoseChatLayout();
    window.toggleChatSidebarDebug = () => this.toggleChatSidebarDebug();

    // Set up custom event listeners for component communication
    document.addEventListener('sessionChanged', (e) => {
      this.handleSessionChange(e.detail);
    });

    // Set up file change notifications
    if (window.electronAPI && window.electronAPI.onFileChanged) {
      window.electronAPI.onFileChanged((event, data) => {
        this.handleFileChanged(data);
      });
    }

    // Set up cross-component integration
    this.setupCrossComponentIntegration();


    // Set up periodic status updates
    this.setupPeriodicUpdates();
  }

  setupGlobalEventListeners() {
    // Handle app-wide keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleGlobalKeydown(e);
    });

    // Handle window focus/blur for security
    window.addEventListener('focus', () => {
      this.handleWindowFocus();
    });

    window.addEventListener('blur', () => {
      this.handleWindowBlur();
    });

    // Handle before unload
    window.addEventListener('beforeunload', (e) => {
      this.handleBeforeUnload(e);
    });
  }



  setupPeriodicUpdates() {
    // Periodically update timestamps
    setInterval(() => {
      this.updateTimestamps();
    }, 60000); // Update every minute

    // Periodically check setup status
    setInterval(() => {
      if (this.components.settings) {
        this.components.settings.refreshSetupStatus();
      }
    }, 300000); // Check every 5 minutes
  }

  handleGlobalKeydown(e) {
    // Ctrl/Cmd + N: New conversation
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      if (this.components.sessionManager) {
        this.components.sessionManager.createNewSession();
      }
    }

    // Ctrl/Cmd + ,: Open settings
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      if (this.components.settings) {
        this.components.settings.openSettings();
      }
    }

    // Escape: Stop streaming if active
    if (e.key === 'Escape') {
      if (this.components.messageComponent?.getIsStreaming()) {
        this.components.messageComponent.stopMessage();
      }
    }
  }

  handleSessionChange(detail) {
    const { sessionId, context } = detail;

    // Update window title
    this.updateWindowTitle(context?.title || 'Claude Code Chat');

    // Update any other global UI elements based on session change
    this.updateGlobalUI(context);
  }

  handleWindowFocus() {
    // Refresh setup status when window gains focus
    if (this.components.settings) {
      this.components.settings.refreshSetupStatus();
    }
  }

  handleWindowBlur() {
    // Could implement auto-save or other blur-related functionality
  }

  handleBeforeUnload(e) {
    // Clean up observers
    this.cleanup();

    // Warn if there's active streaming
    if (this.components.messageComponent?.getIsStreaming()) {
      e.preventDefault();
      e.returnValue = 'You have an active conversation. Are you sure you want to leave?';
    }

    // Warn if there are unsaved files
    if (this.components.fileEditor?.isEditorDirty()) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }
  }

  cleanup() {
    // Clean up mutation observers
    if (this.blankStateObserver) {
      this.blankStateObserver.disconnect();
      this.blankStateObserver = null;
    }

    if (this.layoutObserver) {
      this.layoutObserver.disconnect();
      this.layoutObserver = null;
    }
  }

  handleFileChanged(data) {
    // Handle file change notifications from the main process
    console.log('File changed:', data);

    // If the changed file is currently open in the editor, notify the user
    if (this.components.fileEditor) {
      const currentFile = this.components.fileEditor.getCurrentFile();
      if (currentFile && currentFile.path === data.path) {
        // File was changed externally, offer to reload
        if (confirm('The file has been changed externally. Would you like to reload it?')) {
          this.components.fileEditor.openFile(data.path);
        }
      }
    }
  }

  setupCrossComponentIntegration() {
    // Set up integration between components

    // Monitor message activity to update chat component
    if (this.components.messageComponent && this.components.chatSidebar) {
      const originalSendMessage = this.components.messageComponent.sendMessage.bind(this.components.messageComponent);
      this.components.messageComponent.sendMessage = (...args) => {
        // Notify the chat sidebar component
        if (this.components.chatSidebar && this.components.chatSidebar.isShown()) {
          this.components.chatSidebar.notifyMessageActivity();
        }
        return originalSendMessage(...args);
      };
    }

    // Set up file editor and file browser integration
    if (this.components.fileEditor && this.components.fileBrowser) {
      // The file browser handleFileClick already calls fileEditor.openFile
      // We could add more integration here if needed
    }

    // Set up layout change monitoring
    this.setupLayoutChangeMonitoring();

    // Set up chat sidebar resizing after DOM is ready
    setTimeout(() => {
      this.setupChatSidebarResizing();
    }, 100);

    // Handle window resize for responsive layout with throttling
    let resizeTimeout;
    window.addEventListener('resize', () => {
      // Throttle resize events to prevent excessive calls
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        this.handleLayoutResize();
      }, 100); // Debounce to 100ms
    });
  }

  handleLayoutResize() {
    // Prevent recursive resize handling
    if (this.isHandlingResize) {
      return;
    }

    this.isHandlingResize = true;

    try {
      // Handle responsive layout changes
      // Note: With CSS Grid, most layout is handled automatically
      // Only handle specific cases that need JavaScript intervention

      const appContent = document.querySelector('.app-content');
      if (!appContent) {
        return;
      }

      // Check window width for responsive breakpoints
      const windowWidth = window.innerWidth;

      // On very small screens, we might want to hide one sidebar
      if (windowWidth < 900) {
        // Could add logic to auto-hide sidebars on small screens
        // For now, let CSS media queries handle this
      }

      // Ensure chat sidebar width constraints are still valid
      const currentWidth = getComputedStyle(document.documentElement)
        .getPropertyValue('--chat-sidebar-width');

      if (currentWidth) {
        const widthValue = parseInt(currentWidth);
        const minWidth = 350;
        const maxWidth = Math.min(600, windowWidth * 0.4); // Max 40% of window width

        if (widthValue < minWidth || widthValue > maxWidth) {
          const newWidth = Math.max(minWidth, Math.min(maxWidth, widthValue));
          document.documentElement.style.setProperty('--chat-sidebar-width', `${newWidth}px`);
        }
      }

    } catch (error) {
      console.warn('Layout resize handling failed:', error);
    } finally {
      // Always clear the flag, even if there was an error
      setTimeout(() => {
        this.isHandlingResize = false;
      }, 50); // Small delay to prevent immediate re-entry
    }
  }

  setupChatSidebarResizing() {
    // Set up chat sidebar resizing functionality at the app level
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

    // Find the resize handle
    const resizeHandle = document.querySelector('.chat-sidebar-resize-handle');
    if (!resizeHandle) {
      console.warn('Chat sidebar resize handle not found');
      return;
    }

    resizeHandle.addEventListener('mousedown', (e) => {
      // Only allow resizing in split mode (when editor is active)
      const appContent = document.querySelector('.app-content');
      if (!appContent || !appContent.classList.contains('editor-active')) {
        return;
      }

      const chatSidebar = document.getElementById('chatSidebar');
      if (!chatSidebar) return;

      isResizing = true;
      startX = e.clientX;
      startWidth = chatSidebar.offsetWidth;

      // Add visual feedback class to body
      document.body.classList.add('resizing-chat-sidebar');

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      try {
        const deltaX = startX - e.clientX; // Reverse delta since we're on the right side

        const appContent = document.querySelector('.app-content');
        const chatSidebar = document.getElementById('chatSidebar');
        if (!appContent || !chatSidebar) return;

        const appWidth = appContent.offsetWidth;

        // Fixed widths / minimums for other panes
        const sidebarWidth = 280; // Left file-browser sidebar (fixed)

        // Honour the editor's CSS driven min-width so we don't shrink it too far
        const editorMinWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--editor-min-width')) || 200;

        const minChatWidth = 350;

        // Ensure we never grow the chat sidebar beyond the space that would keep the editor >= its min width
        const maxChatWidthByEditor = appWidth - sidebarWidth - editorMinWidth;

        // Additional hard cap (either 60% of the app or 600px – whichever is smaller)
        const maxChatWidthUi = Math.min(600, Math.floor(appWidth * 0.6));

        const maxChatWidth = Math.min(maxChatWidthByEditor, maxChatWidthUi);

        // Guard: if available width is already smaller than minChatWidth, stick to minChatWidth
        const safeMaxChatWidth = Math.max(minChatWidth, maxChatWidth);

        const tentativeWidth = startWidth + deltaX;
        const newWidth = Math.max(minChatWidth, Math.min(safeMaxChatWidth, tentativeWidth));

        // Update CSS custom property which controls the layout
        document.documentElement.style.setProperty('--chat-sidebar-width', `${newWidth}px`);

      } catch (error) {
        console.warn('Resize operation failed:', error);
        // Stop resizing on error to prevent loops
        this.stopChatSidebarResizing();
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        this.stopChatSidebarResizing();
      }
    });
  }

  stopChatSidebarResizing() {
    // Clear visual feedback
    document.body.classList.remove('resizing-chat-sidebar');
  }

  setupLayoutChangeMonitoring() {
    // Monitor layout state changes for compact mode
    let currentLayoutState = this.getLayoutState();

    // Set up mutation observer to watch for layout changes
    const observer = new MutationObserver(() => {
      const newLayoutState = this.getLayoutState();
      if (newLayoutState.isChatOnly !== currentLayoutState.isChatOnly) {
        this.notifyLayoutStateChange(newLayoutState, currentLayoutState);
        currentLayoutState = newLayoutState;
      }
    });

    // Watch for class changes on key elements
    const appContent = document.querySelector('.app-content');
    const sidebar = document.querySelector('.sidebar');
    const editorContainer = document.getElementById('editorContainer');
    const chatSidebar = document.getElementById('chatSidebar');

    if (appContent) {
      observer.observe(appContent, { attributes: true, attributeFilter: ['class'] });
    }
    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }
    if (editorContainer) {
      observer.observe(editorContainer, { attributes: true, attributeFilter: ['class'] });
    }
    if (chatSidebar) {
      observer.observe(chatSidebar, { attributes: true, attributeFilter: ['class'] });
    }

    // Store observer for cleanup if needed
    this.layoutObserver = observer;
  }

  getLayoutState() {
    const sidebar = document.querySelector('.sidebar');
    const editorContainer = document.getElementById('editorContainer');
    const chatSidebar = document.getElementById('chatSidebar');

    const isFileBrowserVisible = sidebar && !sidebar.classList.contains('hidden');
    const isEditorVisible = editorContainer && editorContainer.classList.contains('active');
    const isChatSidebarVisible = chatSidebar && !chatSidebar.classList.contains('hidden');

    // Chat-only mode: file browser and editor are both closed/hidden
    const isChatOnly = !isFileBrowserVisible && !isEditorVisible && isChatSidebarVisible;

    return {
      isFileBrowserVisible,
      isEditorVisible,
      isChatSidebarVisible,
      isChatOnly
    };
  }

  notifyLayoutStateChange(newState, oldState) {
    // Emit custom event for layout state changes
    const event = new CustomEvent('layoutStateChanged', {
      detail: {
        newState,
        oldState,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(event);

    console.log('Layout state changed:', {
      from: oldState.isChatOnly ? 'chat-only' : 'split-view',
      to: newState.isChatOnly ? 'chat-only' : 'split-view'
    });
  }

  updateTimestamps() {
    // Update all visible timestamps
    const timestampElements = document.querySelectorAll('.conversation-timestamp, .file-modified');
    timestampElements.forEach(element => {
      const originalTime = element.getAttribute('data-timestamp');
      if (originalTime) {
        element.textContent = DOMUtils.formatTimestamp(originalTime);
      }
    });
  }

  updateWindowTitle(title) {
    document.title = title;
  }

  updateGlobalUI(context) {
    // Update any global UI elements based on session context
    if (context) {
      // Could update global status indicators, etc.
    }
  }

  showFatalError(message) {
    const errorHTML = `
      <div class="fatal-error">
        <h2>Application Error</h2>
        <p>${DOMUtils.escapeHTML(message)}</p>
        <button onclick="window.location.reload()">Reload Application</button>
      </div>
    `;

    document.body.innerHTML = errorHTML;
  }

  // Public API for external access
  getComponent(name) {
    return this.components[name];
  }

  isReady() {
    return this.isInitialized;
  }

  // Utility methods for components
  async showConfirmDialog(message, title = 'Confirm') {
    return new Promise((resolve) => {
      const result = confirm(`${title}\n\n${message}`);
      resolve(result);
    });
  }

  async showInputDialog(message, defaultValue = '', title = 'Input') {
    return new Promise((resolve) => {
      const result = prompt(`${title}\n\n${message}`, defaultValue);
      resolve(result);
    });
  }

  showNotification(message, type = 'info', duration = 3000) {
    // Simple notification implementation
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 4px;
      color: white;
      font-size: 14px;
      z-index: 10000;
      opacity: 0;
      transition: opacity 0.3s ease;
    `;

    // Set background color based on type
    const colors = {
      info: '#007bff',
      success: '#28a745',
      warning: '#ffc107',
      error: '#dc3545'
    };
    notification.style.backgroundColor = colors[type] || colors.info;

    document.body.appendChild(notification);

    // Fade in
    requestAnimationFrame(() => {
      notification.style.opacity = '1';
    });

    // Remove after duration
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, duration);
  }

  // Debug methods
  getDebugInfo() {
    const editorContainer = document.getElementById('editorContainer');
    const chatSidebar = document.getElementById('chatSidebar');
    const appContent = document.querySelector('.app-content');

    return {
      isInitialized: this.isInitialized,
      components: Object.keys(this.components),
      currentSession: this.components.sessionManager?.getCurrentSessionId(),
      isStreaming: this.components.messageComponent?.getIsStreaming(),
      currentDirectory: this.components.fileBrowser?.getCurrentDirectory(),
      layoutState: {
        editorActive: editorContainer?.classList.contains('active'),
        appContentEditorActive: appContent?.classList.contains('editor-active'),
        chatSidebarHidden: chatSidebar?.classList.contains('hidden')
      },
      domElements: {
        editorContainer: !!editorContainer,
        chatSidebar: !!chatSidebar,
        appContent: !!appContent
      }
    };
  }

  logDebugInfo() {
    console.group('🔍 App Debug Info');
    console.log('App State:', this.getDebugInfo());
    console.log('Components:', this.components);
    if (window.globalHeader) {
      console.log('Global Header Available:', !!window.globalHeader);
    }
    console.groupEnd();
  }

  // Helper method to diagnose layout issues
  diagnoseChatLayout() {
    const debug = this.getDebugInfo();
    const chatSidebar = document.getElementById('chatSidebar');

    console.group('🧪 Chat Layout Diagnosis');

    console.log('Current Layout Mode:', debug.layoutState.editorActive ? 'Editor + Sidebar' : 'Chat Only');
    console.log('Expected Visibility:');
    console.log('  - Chat Sidebar:', !debug.layoutState.chatSidebarHidden ? 'visible' : 'hidden');

    console.log('Actual DOM State:');
    console.log('  - Editor Active:', debug.layoutState.editorActive);
    console.log('  - App Content Editor Active:', debug.layoutState.appContentEditorActive);
    console.log('  - Chat Sidebar Hidden:', debug.layoutState.chatSidebarHidden);

    // Check CSS computed styles
    if (chatSidebar) {
      const computedStyle = window.getComputedStyle(chatSidebar);
      console.log('CSS Computed Styles:');
      console.log('  - Display:', computedStyle.display);
      console.log('  - Visibility:', computedStyle.visibility);
      console.log('  - Opacity:', computedStyle.opacity);
      console.log('  - Width:', computedStyle.width);
      console.log('  - Height:', computedStyle.height);
      console.log('  - Position:', computedStyle.position);
      console.log('  - Z-Index:', computedStyle.zIndex);

      console.log('CSS Classes Applied:', Array.from(chatSidebar.classList));
    }

    // Check for mismatches
    const issues = [];
    if (debug.layoutState.editorActive !== debug.layoutState.appContentEditorActive) {
      issues.push('Mismatch: editor container and app-content editor-active state');
    }

    // CSS-specific checks
    if (chatSidebar) {
      const computedStyle = window.getComputedStyle(chatSidebar);
      if (!debug.layoutState.chatSidebarHidden && computedStyle.display === 'none') {
        issues.push('Critical: Chat sidebar should be visible but CSS display is "none"');
      }
      if (computedStyle.display !== 'none' && computedStyle.width === '0px') {
        issues.push('Warning: Chat sidebar is displayed but has zero width');
      }
    }

    if (issues.length > 0) {
      console.warn('🚨 Layout Issues Detected:', issues);
    } else {
      console.log('✅ Layout appears consistent');
    }

    console.groupEnd();
  }

  // Visual debug method to highlight chat sidebar
  toggleChatSidebarDebug() {
    const chatSidebar = document.getElementById('chatSidebar');
    if (chatSidebar) {
      chatSidebar.classList.toggle('debug-visible');
      console.log('Chat sidebar debug overlay toggled');
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppComponent;
} else {
  window.AppComponent = AppComponent;
}