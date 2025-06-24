// Main Chat Component - Full-width chat interface for the main area
class MainChatComponent {
  constructor() {
    this.container = document.getElementById('mainChat');
    this.isInitialized = false;
    this.isVisible = false;

    this.initializeComponent();
  }

  initializeComponent() {
    if (!this.container) {
      console.error('Main chat container not found');
      return;
    }

    this.isInitialized = true;
    console.log('Main Chat component initialized');
  }

  // Public API methods
  getContainer() {
    return this.container;
  }

  // Show/hide the main chat
  show() {
    if (!this.container) return;
    
    this.container.classList.remove('hidden');
    this.isVisible = true;
    console.log('Main chat shown');
  }

  hide() {
    if (!this.container) return;
    
    this.container.classList.add('hidden');
    this.isVisible = false;
    console.log('Main chat hidden');
  }

  isShown() {
    return this.isVisible;
  }

  // Get the main chat element for integration with message component
  getMainChatElement() {
    return this.container?.querySelector('.main-chat');
  }

  // Integration with existing message component
  notifyMessageActivity() {
    // This method is for compatibility with existing message component integration
    console.log('Main chat message activity notification received');
  }
}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MainChatComponent;
}