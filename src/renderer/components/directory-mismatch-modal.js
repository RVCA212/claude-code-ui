// Directory Mismatch Modal Component
class DirectoryMismatchModal {
  constructor() {
    this.isVisible = false;
    this.onCancelCallback = null;
    this.onCreateNewChatCallback = null;
    this.draftMessage = '';
    this.currentDirectory = '';
    this.originalDirectory = '';

    this.createModalElements();
    this.setupEventListeners();
  }

  createModalElements() {
    // Create modal overlay
    this.overlay = document.createElement('div');
    this.overlay.id = 'directoryMismatchModalOverlay';
    this.overlay.className = 'modal-overlay';
    this.overlay.style.display = 'none';

    // Create modal container
    this.modal = document.createElement('div');
    this.modal.className = 'modal-container directory-mismatch-modal';

    // Create modal content
    this.modal.innerHTML = `
      <div class="modal-header">
        <div class="modal-icon warning">❗️</div>
        <h2 class="modal-title">Start new chat in this directory?</h2>
      </div>

      <div class="modal-body">
        <p class="modal-description">
          Conversations can only be held within the same directory.
        </p>
        <div class="directory-info">
          <div class="directory-item">
            <span class="directory-label">Current directory:</span>
            <code class="directory-path current-dir"></code>
          </div>
          <div class="directory-item">
            <span class="directory-label">Original directory:</span>
            <code class="directory-path original-dir"></code>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <div class="modal-buttons">
          <button class="modal-button secondary" id="cancelDirectoryMismatch">Cancel</button>
          <button class="modal-button primary" id="createNewChatBtn">Create new chat</button>
        </div>
      </div>
    `;

    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);

    // Cache element references
    this.cancelBtn = this.modal.querySelector('#cancelDirectoryMismatch');
    this.createNewChatBtn = this.modal.querySelector('#createNewChatBtn');
    this.currentDirElement = this.modal.querySelector('.current-dir');
    this.originalDirElement = this.modal.querySelector('.original-dir');
  }

  setupEventListeners() {
    // Cancel button
    this.cancelBtn.addEventListener('click', () => this.handleCancel());

    // Create new chat button
    this.createNewChatBtn.addEventListener('click', () => this.handleCreateNewChat());

    // Close on overlay click
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) {
        this.handleCancel();
      }
    });

    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.handleCancel();
      }
    });
  }

  show(options = {}) {
    const {
      draftMessage = '',
      currentDirectory = '',
      originalDirectory = '',
      onCancel = null,
      onCreateNewChat = null
    } = options;

    this.draftMessage = draftMessage;
    this.currentDirectory = currentDirectory;
    this.originalDirectory = originalDirectory;
    this.onCancelCallback = onCancel;
    this.onCreateNewChatCallback = onCreateNewChat;

    // Update directory display
    this.updateDirectoryDisplay();

    // Show modal
    this.overlay.style.display = 'flex';
    this.isVisible = true;

    // Focus the cancel button by default
    setTimeout(() => {
      this.cancelBtn.focus();
    }, 100);
  }

  hide() {
    this.overlay.style.display = 'none';
    this.isVisible = false;

    // Reset callbacks
    this.onCancelCallback = null;
    this.onCreateNewChatCallback = null;
  }

  handleCancel() {
    if (this.onCancelCallback) {
      this.onCancelCallback();
    }

    this.hide();
  }

  handleCreateNewChat() {
    if (this.onCreateNewChatCallback) {
      this.onCreateNewChatCallback(this.draftMessage);
    }

    this.hide();
  }

  updateDirectoryDisplay() {
    if (this.currentDirElement) {
      this.currentDirElement.textContent = this.getDisplayPath(this.currentDirectory);
    }

    if (this.originalDirElement) {
      this.originalDirElement.textContent = this.getDisplayPath(this.originalDirectory);
    }
  }

  getDisplayPath(path) {
    if (!path) return '';

    // Replace home directory with ~ for display
    if (path.startsWith('/Users/')) {
      return path.replace(/^\/Users\/[^\/]+/, '~');
    }

    return path;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DirectoryMismatchModal;
} else {
  window.DirectoryMismatchModal = DirectoryMismatchModal;
}