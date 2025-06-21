// Settings Component for managing app settings and configuration
class SettingsComponent {
  constructor() {
    this.currentModel = '';
    
    this.initializeElements();
    this.setupEventListeners();
    this.loadInitialSettings();
  }

  initializeElements() {
    // Settings modal elements
    this.settingsModal = document.getElementById('settingsModal');
    this.settingsBtn = document.getElementById('settingsBtn');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    this.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');
    
    // Status elements
    this.setupStatus = document.getElementById('setupStatus');
    this.cliStatus = document.getElementById('cliStatus');
    this.apiKeyStatus = document.getElementById('apiKeyStatus');
    
    // Input elements
    this.apiKeyInput = document.getElementById('apiKeyInput');
    
    // Model selection
    this.modelSelect = document.getElementById('modelSelect');
  }

  setupEventListeners() {
    // Settings button
    if (this.settingsBtn) {
      this.settingsBtn.addEventListener('click', () => this.openSettings());
    }

    // Modal buttons
    if (this.saveSettingsBtn) {
      this.saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    }
    if (this.cancelSettingsBtn) {
      this.cancelSettingsBtn.addEventListener('click', () => this.closeSettings());
    }

    // Model selection
    if (this.modelSelect) {
      this.modelSelect.addEventListener('change', () => this.handleModelChange());
    }

    // Close modal when clicking outside
    if (this.settingsModal) {
      this.settingsModal.addEventListener('click', (e) => {
        if (e.target === this.settingsModal) {
          this.closeSettings();
        }
      });
    }

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isSettingsOpen()) {
        this.closeSettings();
      }
    });
  }

  async loadInitialSettings() {
    try {
      // Load current model
      const currentModel = await window.electronAPI.getCurrentModel();
      this.currentModel = currentModel;
      this.updateModelSelect();
      
      // Check setup status
      await this.checkSetupStatus();
    } catch (error) {
      console.error('Failed to load initial settings:', error);
    }
  }

  async openSettings() {
    if (!this.settingsModal) return;

    // Refresh setup status when opening
    await this.checkSetupStatus();
    
    // Clear API key input for security
    if (this.apiKeyInput) {
      this.apiKeyInput.value = '';
    }

    // Show modal
    this.settingsModal.style.display = 'flex';
  }

  closeSettings() {
    if (this.settingsModal) {
      this.settingsModal.style.display = 'none';
    }
  }

  async saveSettings() {
    try {
      // Save API key if provided
      const apiKey = this.apiKeyInput?.value.trim();
      if (apiKey) {
        await this.saveApiKey(apiKey);
      }

      // Model is saved automatically when changed
      
      this.closeSettings();
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showError('Failed to save settings');
    }
  }

  async saveApiKey(apiKey) {
    try {
      this.updateApiKeyStatus('Verifying...', 'info');
      
      const result = await window.electronAPI.setApiKey(apiKey);
      
      if (result.success) {
        this.updateApiKeyStatus('Valid', 'success');
        // Clear the input for security
        if (this.apiKeyInput) {
          this.apiKeyInput.value = '';
        }
      } else {
        this.updateApiKeyStatus('Invalid', 'error');
        throw new Error(result.message || 'API key verification failed');
      }
    } catch (error) {
      this.updateApiKeyStatus('Invalid', 'error');
      throw error;
    }
  }

  async handleModelChange() {
    if (!this.modelSelect) return;

    const selectedModel = this.modelSelect.value;
    
    try {
      const result = await window.electronAPI.setCurrentModel(selectedModel);
      this.currentModel = result;
      console.log('Model updated to:', result || 'Default (Sonnet)');
    } catch (error) {
      console.error('Failed to update model:', error);
      // Revert selection on error
      this.updateModelSelect();
      this.showError('Failed to update model');
    }
  }

  async checkSetupStatus() {
    try {
      const status = await window.electronAPI.checkSetup();
      
      this.updateCliStatus(status.cliAvailable);
      this.updateApiKeyStatus(status.apiKeySet ? 'Set' : 'Not set', status.apiKeySet ? 'success' : 'warning');
      
      // Update save button state
      this.updateSaveButtonState();
      
    } catch (error) {
      console.error('Failed to check setup status:', error);
      this.updateCliStatus(false);
      this.updateApiKeyStatus('Error checking', 'error');
    }
  }

  updateCliStatus(available) {
    if (this.cliStatus) {
      if (available) {
        this.cliStatus.textContent = 'Available';
        this.cliStatus.className = 'status-value success';
      } else {
        this.cliStatus.textContent = 'Not found';
        this.cliStatus.className = 'status-value error';
      }
    }
  }

  updateApiKeyStatus(status, type) {
    if (this.apiKeyStatus) {
      this.apiKeyStatus.textContent = status;
      this.apiKeyStatus.className = `status-value ${type}`;
    }
  }

  updateModelSelect() {
    if (this.modelSelect) {
      this.modelSelect.value = this.currentModel;
    }
  }

  updateSaveButtonState() {
    if (this.saveSettingsBtn) {
      // Enable save button if there's content in API key input
      const hasApiKey = this.apiKeyInput?.value.trim().length > 0;
      this.saveSettingsBtn.disabled = !hasApiKey;
    }
  }

  isSettingsOpen() {
    return this.settingsModal?.style.display === 'flex';
  }

  showError(message) {
    console.error('Settings error:', message);
    // You could implement a toast notification here
    alert(message); // Simple fallback
  }

  showSuccess(message) {
    console.log('Settings success:', message);
    // You could implement a toast notification here
  }

  // Public methods for external access
  getCurrentModel() {
    return this.currentModel;
  }

  async refreshSetupStatus() {
    await this.checkSetupStatus();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsComponent;
} else {
  window.SettingsComponent = SettingsComponent;
}