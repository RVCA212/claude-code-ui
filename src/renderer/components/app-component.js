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

    // Set up custom event listeners for component communication
    document.addEventListener('sessionChanged', (e) => {
      this.handleSessionChange(e.detail);
    });

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