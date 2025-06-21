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

    // MCP elements
    this.initializeMcpElements();

    // Tab elements
    this.generalTabBtn = document.getElementById('generalTabBtn');
    this.mcpTabBtn = document.getElementById('mcpTabBtn');
    this.generalSection = document.getElementById('generalSettingsSection');
    this.mcpSection = document.getElementById('mcpSettingsSection');
  }

  initializeMcpElements() {
    this.mcpServersList = document.getElementById('mcpServersList');
    this.mcpServerForm = document.getElementById('mcpServerForm');
    this.addMcpServerBtn = document.getElementById('addMcpServerBtn');
    this.saveMcpServerBtn = document.getElementById('saveMcpServerBtn');
    this.cancelMcpServerBtn = document.getElementById('cancelMcpServerBtn');
    this.mcpServerIdInput = document.getElementById('mcpServerId');
    this.mcpServerNameInput = document.getElementById('mcpServerName');
    this.mcpTransportTypeSelect = document.getElementById('mcpTransportType');
    this.mcpServerUrlInput = document.getElementById('mcpServerUrl');
    this.mcpHeadersContainer = document.getElementById('mcpHeaders');
    this.addHeaderBtn = document.getElementById('addHeaderBtn');
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

    // MCP event listeners
    this.setupMcpEventListeners();

    // Tab buttons
    if (this.generalTabBtn) {
      this.generalTabBtn.addEventListener('click', () => this.switchTab('general'));
    }
    if (this.mcpTabBtn) {
      this.mcpTabBtn.addEventListener('click', () => this.switchTab('mcp'));
    }
  }

  setupMcpEventListeners() {
    if (this.addMcpServerBtn) {
      this.addMcpServerBtn.addEventListener('click', () => this.showMcpServerForm());
    }
    if (this.saveMcpServerBtn) {
      this.saveMcpServerBtn.addEventListener('click', () => this.saveMcpServer());
    }
    if (this.cancelMcpServerBtn) {
      this.cancelMcpServerBtn.addEventListener('click', () => this.hideMcpServerForm());
    }
    if (this.addHeaderBtn) {
      this.addHeaderBtn.addEventListener('click', () => this.addHeaderRow());
    }
  }

  async loadInitialSettings() {
    try {
      // Load current model
      const currentModel = await window.electronAPI.getCurrentModel();
      this.currentModel = currentModel;
      this.updateModelSelect();

      // Check setup status
      await this.checkSetupStatus();

      // Load MCP servers list
      await this.loadMcpServers();
    } catch (error) {
      console.error('Failed to load initial settings:', error);
    }
  }

  async openSettings() {
    if (!this.settingsModal) return;

    // Refresh setup status when opening
    await this.checkSetupStatus();

    // Default to general tab on open
    this.switchTab('general');

    // Reload MCP servers list each time modal opens
    await this.loadMcpServers();

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

  /* --------------------------- MCP Management --------------------------- */

  async loadMcpServers() {
    try {
      const servers = await window.electronAPI.getMcpServers();
      this.renderMcpServersList(servers);
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
    }
  }

  renderMcpServersList(servers) {
    if (!this.mcpServersList) return;
    this.mcpServersList.innerHTML = '';

    if (!servers || servers.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No MCP servers configured.';
      this.mcpServersList.appendChild(empty);
      return;
    }

    servers.forEach(server => {
      const item = document.createElement('div');
      item.className = `mcp-server-item ${server.enabled ? '' : 'disabled'}`;
      item.innerHTML = `
        <div class="mcp-server-info">
          <strong>${server.name}</strong><br>
          <span style="font-size: 12px;">${server.transport.toUpperCase()} – ${server.url}</span>
        </div>
        <div class="mcp-server-actions">
          <button class="btn btn--secondary btn--sm" data-action="toggle">${server.enabled ? 'Disable' : 'Enable'}</button>
          <button class="btn btn--secondary btn--sm" data-action="edit">Edit</button>
          <button class="btn btn--secondary btn--sm" data-action="delete">Delete</button>
        </div>`;

      // Attach action handlers with event delegation
      item.querySelectorAll('button').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const action = e.target.getAttribute('data-action');
          if (action === 'toggle') {
            this.toggleMcpServer(server.id, !server.enabled);
          } else if (action === 'edit') {
            this.showMcpServerForm(server);
          } else if (action === 'delete') {
            if (confirm(`Delete MCP server "${server.name}"?`)) {
              this.deleteMcpServer(server.id);
            }
          }
        });
      });

      this.mcpServersList.appendChild(item);
    });
  }

  showMcpServerForm(server = null) {
    if (!this.mcpServerForm) return;

    // Reset form
    this.mcpServerIdInput.value = server ? server.id : '';
    this.mcpServerNameInput.value = server ? server.name : '';
    this.mcpTransportTypeSelect.value = server ? server.transport : 'sse';
    this.mcpServerUrlInput.value = server ? server.url : '';

    // Clear headers container
    this.mcpHeadersContainer.innerHTML = '';
    if (server && server.headers) {
      Object.entries(server.headers).forEach(([key, value]) => {
        this.addHeaderRow(key, value);
      });
    }

    this.mcpServerForm.style.display = 'block';
    this.addMcpServerBtn.style.display = 'none';
  }

  hideMcpServerForm() {
    if (this.mcpServerForm) {
      this.mcpServerForm.style.display = 'none';
    }
    if (this.addMcpServerBtn) {
      this.addMcpServerBtn.style.display = 'block';
    }
  }

  addHeaderRow(key = '', value = '') {
    const row = document.createElement('div');
    row.className = 'header-row';
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.marginBottom = '4px';

    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.placeholder = 'Header';
    keyInput.className = 'form-control';
    keyInput.style.flex = '1';
    keyInput.value = key;

    const valueInput = document.createElement('input');
    valueInput.type = 'text';
    valueInput.placeholder = 'Value';
    valueInput.className = 'form-control';
    valueInput.style.flex = '1';
    valueInput.value = value;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn--secondary btn--sm';
    removeBtn.textContent = 'X';
    removeBtn.addEventListener('click', () => row.remove());

    row.appendChild(keyInput);
    row.appendChild(valueInput);
    row.appendChild(removeBtn);

    this.mcpHeadersContainer.appendChild(row);
  }

  collectHeaders() {
    const headers = {};
    this.mcpHeadersContainer.querySelectorAll('.header-row').forEach(row => {
      const inputs = row.querySelectorAll('input');
      const key = inputs[0].value.trim();
      const value = inputs[1].value.trim();
      if (key) headers[key] = value;
    });
    return headers;
  }

  async saveMcpServer() {
    try {
      const serverConfig = {
        id: this.mcpServerIdInput.value || undefined,
        name: this.mcpServerNameInput.value.trim() || 'Unnamed',
        transport: this.mcpTransportTypeSelect.value,
        url: this.mcpServerUrlInput.value.trim(),
        headers: this.collectHeaders(),
        enabled: true
      };

      // Basic validation
      if (!serverConfig.url) {
        alert('Server URL is required');
        return;
      }

      const result = await window.electronAPI.saveMcpServer(serverConfig);
      if (result.success) {
        await this.loadMcpServers();
        this.hideMcpServerForm();
      } else {
        alert('Failed to save server: ' + result.error);
      }
    } catch (err) {
      console.error('Failed to save MCP server:', err);
    }
  }

  async deleteMcpServer(serverId) {
    const res = await window.electronAPI.deleteMcpServer(serverId);
    if (res.success) {
      await this.loadMcpServers();
    } else {
      alert('Failed to delete server');
    }
  }

  async toggleMcpServer(serverId, enabled) {
    const res = await window.electronAPI.toggleMcpServer(serverId, enabled);
    if (res.success) {
      await this.loadMcpServers();
    } else {
      alert('Failed to toggle server: ' + res.error);
    }
  }

  validateMcpServer() {
    // Placeholder for future validation logic
    return true;
  }

  switchTab(tab) {
    if (!this.generalSection || !this.mcpSection) return;

    if (tab === 'mcp') {
      this.generalSection.style.display = 'none';
      this.mcpSection.style.display = 'block';
      this.generalTabBtn?.classList.remove('active');
      this.mcpTabBtn?.classList.add('active');
      // Ensure list up to date
      this.loadMcpServers();
    } else {
      this.generalSection.style.display = 'block';
      this.mcpSection.style.display = 'none';
      this.generalTabBtn?.classList.add('active');
      this.mcpTabBtn?.classList.remove('active');
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsComponent;
} else {
  window.SettingsComponent = SettingsComponent;
}