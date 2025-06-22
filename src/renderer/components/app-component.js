// Main App Component that coordinates all other components
class AppComponent {
  constructor() {
    this.components = {};
    this.isInitialized = false;
    
    this.initializeComponents();
    this.setupGlobalEventListeners();
  }

  initializeComponents() {
    try {
      // Initialize all components in the correct order
      this.components.settings = new SettingsComponent();
      this.components.sessionManager = new SessionManager();
      this.components.messageComponent = new MessageComponent(this.components.sessionManager);
      this.components.fileBrowser = new FileBrowser();
      this.components.fileEditor = new FileEditorComponent();
      this.components.chatSidebar = new ChatSidebarComponent();
      
      // Set up cross-component communication
      this.setupComponentCommunication();
      
      this.isInitialized = true;
      console.log('App components initialized successfully');
      
    } catch (error) {
      console.error('Failed to initialize app components:', error);
      this.showFatalError('Failed to initialize application');
    }
  }

  setupComponentCommunication() {
    // Make components available globally for cross-component communication
    window.sessionManager = this.components.sessionManager;
    window.messageComponent = this.components.messageComponent;
    window.settingsComponent = this.components.settings;
    window.fileBrowser = this.components.fileBrowser;
    window.fileEditor = this.components.fileEditor;
    window.chatSidebar = this.components.chatSidebar;

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

    // Monitor message activity to update chat sidebar
    if (this.components.messageComponent && this.components.chatSidebar) {
      const originalSendMessage = this.components.messageComponent.sendMessage.bind(this.components.messageComponent);
      this.components.messageComponent.sendMessage = (...args) => {
        this.components.chatSidebar.notifyMessageActivity();
        return originalSendMessage(...args);
      };
    }

    // Set up file editor and file browser integration
    if (this.components.fileEditor && this.components.fileBrowser) {
      // The file browser handleFileClick already calls fileEditor.openFile
      // We could add more integration here if needed
    }

    // Handle window resize for responsive layout
    window.addEventListener('resize', () => {
      this.handleLayoutResize();
    });
  }

  handleLayoutResize() {
    // Handle responsive layout changes
    const width = window.innerWidth;
    
    // Auto-collapse chat sidebar on very small screens
    if (width < 900 && this.components.chatSidebar && 
        typeof this.components.chatSidebar.isCollapsed === 'function' && 
        !this.components.chatSidebar.isCollapsed()) {
      if (typeof this.components.chatSidebar.forceCollapse === 'function') {
        this.components.chatSidebar.forceCollapse();
      }
    }
    
    // Auto-expand on larger screens if no file is open
    if (width > 1200 && this.components.chatSidebar && 
        typeof this.components.chatSidebar.isCollapsed === 'function' && 
        this.components.chatSidebar.isCollapsed()) {
      const currentFile = this.components.fileEditor?.getCurrentFile();
      if (!currentFile && typeof this.components.chatSidebar.forceExpand === 'function') {
        this.components.chatSidebar.forceExpand();
      }
    }
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
    return {
      isInitialized: this.isInitialized,
      components: Object.keys(this.components),
      currentSession: this.components.sessionManager?.getCurrentSessionId(),
      isStreaming: this.components.messageComponent?.getIsStreaming(),
      currentDirectory: this.components.fileBrowser?.getCurrentDirectory()
    };
  }

  logDebugInfo() {
    console.log('App Debug Info:', this.getDebugInfo());
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppComponent;
} else {
  window.AppComponent = AppComponent;
}