// Settings Component for managing app settings and configuration
class SettingsComponent {
  constructor() {
    this.currentModel = '';
    this.cache = new Map();
    this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    this._elements = {};
    this.isRecordingShortcut = false;
    this.newShortcut = null;

    this.initializeElements();
    this.setupEventListeners();
    this.loadInitialSettings();
  }

  initializeElements() {
    // Core elements needed immediately
    this.settingsModal = document.getElementById('settingsModal');
    this.settingsBtn = document.getElementById('globalSettingsBtn');
    this.saveSettingsBtn = document.getElementById('saveSettingsBtn');
    this.cancelSettingsBtn = document.getElementById('cancelSettingsBtn');

    // Other elements will be initialized lazily via getters
  }

  // Lazy getters for DOM elements - improves initial load performance
  get setupStatus() { return this._getElement('setupStatus'); }
  get cliStatus() { return this._getElement('cliStatus'); }
  get apiKeyStatus() { return this._getElement('apiKeyStatus'); }
  get apiKeyInput() { return this._getElement('apiKeyInput'); }
  get modelSelect() { return this._getElement('modelSelect'); }
  get clearAllSessionsBtn() { return this._getElement('clearAllSessionsBtn'); }
  get globalShortcutInput() { return this._getElement('globalShortcutInput'); }

  // Tab elements
  get generalTabBtn() { return this._getElement('generalTabBtn'); }
  get mcpTabBtn() { return this._getElement('mcpTabBtn'); }
  get taskTemplateTabBtn() { return this._getElement('taskTemplateTabBtn'); }
  get systemPromptTabBtn() { return this._getElement('systemPromptTabBtn'); }
  get generalSection() { return this._getElement('generalSettingsSection'); }
  get mcpSection() { return this._getElement('mcpSettingsSection'); }
  get taskTemplateSection() { return this._getElement('taskTemplateSettingsSection'); }
  get systemPromptSection() { return this._getElement('systemPromptSettingsSection'); }

  // MCP elements
  get mcpServersList() { return this._getElement('mcpServersList'); }
  get mcpServerForm() { return this._getElement('mcpServerForm'); }
  get addMcpServerBtn() { return this._getElement('addMcpServerBtn'); }
  get saveMcpServerBtn() { return this._getElement('saveMcpServerBtn'); }
  get cancelMcpServerBtn() { return this._getElement('cancelMcpServerBtn'); }
  get mcpServerIdInput() { return this._getElement('mcpServerId'); }
  get mcpServerNameInput() { return this._getElement('mcpServerName'); }
  get mcpTransportTypeSelect() { return this._getElement('mcpTransportType'); }
  get mcpServerUrlInput() { return this._getElement('mcpServerUrl'); }
  get mcpHeadersContainer() { return this._getElement('mcpHeaders'); }
  get addHeaderBtn() { return this._getElement('addHeaderBtn'); }

  // Task template elements
  get taskTemplateInput() { return this._getElement('taskTemplateInput'); }
  get saveTaskTemplateBtn() { return this._getElement('saveTaskTemplateBtn'); }
  get resetTaskTemplateBtn() { return this._getElement('resetTaskTemplateBtn'); }

  // System prompt elements
  get systemPromptInput() { return this._getElement('systemPromptInput'); }
  get systemPromptEnabledToggle() { return this._getElement('systemPromptEnabledToggle'); }
  get systemPromptModeToggle() { return this._getElement('systemPromptModeToggle'); }

  // Window detection elements
  get windowDetectionTabBtn() { return this._getElement('windowDetectionTabBtn'); }
  get windowDetectionSection() { return this._getElement('windowDetectionSettingsSection'); }
  get vsCodeDetectionToggle() { return this._getElement('vsCodeDetectionToggle'); }
  get cursorDetectionToggle() { return this._getElement('cursorDetectionToggle'); }
  get excelDetectionToggle() { return this._getElement('excelDetectionToggle'); }
  get photoshopDetectionToggle() { return this._getElement('photoshopDetectionToggle'); }

  _getElement(id) {
    if (!this._elements[id]) {
      this._elements[id] = document.getElementById(id);
    }
    return this._elements[id];
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

    // Clear sessions button
    if (this.clearAllSessionsBtn) {
      this.clearAllSessionsBtn.addEventListener('click', () => this.clearAllSessions());
    }

    // Global shortcut recorder
    if (this.globalShortcutInput) {
      this.globalShortcutInput.addEventListener('click', () => this.enterRecordingMode());
      this.globalShortcutInput.addEventListener('keydown', (e) => this.handleShortcutKeyDown(e));
      this.globalShortcutInput.addEventListener('blur', () => this.exitRecordingMode());
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
    if (this.taskTemplateTabBtn) {
      this.taskTemplateTabBtn.addEventListener('click', () => this.switchTab('taskTemplate'));
    }
    if (this.systemPromptTabBtn) {
      this.systemPromptTabBtn.addEventListener('click', () => this.switchTab('systemPrompt'));
    }
    if (this.windowDetectionTabBtn) {
      this.windowDetectionTabBtn.addEventListener('click', () => this.switchTab('windowDetection'));
    }

    // Task template event listeners
    this.setupTaskTemplateEventListeners();

    // System prompt event listeners
    this.setupSystemPromptEventListeners();

    // Window detection event listeners
    this.setupWindowDetectionEventListeners();
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

  setupTaskTemplateEventListeners() {
    if (this.saveTaskTemplateBtn) {
      this.saveTaskTemplateBtn.addEventListener('click', () => this.saveTaskTemplate());
    }
    if (this.resetTaskTemplateBtn) {
      this.resetTaskTemplateBtn.addEventListener('click', () => this.resetTaskTemplate());
    }
  }

  setupSystemPromptEventListeners() {
    if (this.systemPromptEnabledToggle) {
      this.systemPromptEnabledToggle.addEventListener('change', () => this.saveSystemPromptConfig());
    }
    if (this.systemPromptInput) {
      // Using 'blur' to save on focus out, to avoid saving on every keystroke
      this.systemPromptInput.addEventListener('blur', () => this.saveSystemPromptConfig());
    }
    if (this.systemPromptModeToggle) {
      this.systemPromptModeToggle.addEventListener('change', () => this.saveSystemPromptConfig());
    }
  }

  setupWindowDetectionEventListeners() {
    if (this.vsCodeDetectionToggle) {
      this.vsCodeDetectionToggle.addEventListener('change', () => this.saveWindowDetectionSettings());
    }
    if (this.cursorDetectionToggle) {
      this.cursorDetectionToggle.addEventListener('change', () => this.saveWindowDetectionSettings());
    }
    if (this.excelDetectionToggle) {
      this.excelDetectionToggle.addEventListener('change', () => this.saveWindowDetectionSettings());
    }
    if (this.photoshopDetectionToggle) {
      this.photoshopDetectionToggle.addEventListener('change', () => this.saveWindowDetectionSettings());
    }
  }

  async loadInitialSettings() {
    try {
      // Load data in parallel for better performance
      const [currentModel, setupStatus, globalShortcut] = await Promise.all([
        this.getCachedData('currentModel', () => window.electronAPI.getCurrentModel()),
        this.getCachedData('setupStatus', () => window.electronAPI.checkSetup()),
        this.getCachedData('globalShortcut', () => window.electronAPI.getGlobalShortcut())
      ]);

      this.currentModel = currentModel;
      this.updateModelSelect();
      if (this.globalShortcutInput) {
        this.globalShortcutInput.textContent = globalShortcut || 'CommandOrControl+Shift+C';
      }
      this.updateCliStatus(setupStatus.cliAvailable);
      this.updateApiKeyStatus(setupStatus.apiKeySet ? 'Set' : 'Not set', setupStatus.apiKeySet ? 'success' : 'warning');
      this.updateSaveButtonState();
    } catch (error) {
      console.error('Failed to load initial settings:', error);
    }
  }

  async openSettings(tab = 'general') {
    if (!this.settingsModal) return;

    // Clear API key input for security
    if (this.apiKeyInput) {
      this.apiKeyInput.value = '';
    }

    // Show modal immediately for better perceived performance
    this.settingsModal.style.display = 'flex';

    /*
    if (window.electronAPI && window.electronAPI.resizeWindow) {
      window.electronAPI.resizeWindow({ height: 600 });
    }
    */

    // Default to general tab on open, or switch to specified tab
    this.switchTab(tab);

    // Load fresh setup status
    await this.checkSetupStatus();
  }

  closeSettings() {
    if (this.settingsModal) {
      this.settingsModal.style.display = 'none';
      /*
      if (window.electronAPI && window.electronAPI.resizeWindow) {
        window.electronAPI.resizeWindow({ height: 250 });
      }
      */
    }
    // Reset any pending changes
    this.newShortcut = null;
  }

  async saveSettings() {
    try {
      // Save API key if provided
      const apiKey = this.apiKeyInput?.value.trim();
      if (apiKey) {
        await this.saveApiKey(apiKey);
      }

      // Save global shortcut if changed
      if (this.newShortcut) {
        const result = await window.electronAPI.setGlobalShortcut(this.newShortcut);
        if (result.success) {
          this.invalidateCache('globalShortcut');
          this.showSuccess(`Global shortcut updated to ${this.newShortcut}`);
          this.newShortcut = null;
        } else {
          this.showError(`Failed to set shortcut: ${result.error}`);
        }
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
      const status = await this.getCachedData('setupStatus', () => window.electronAPI.checkSetup());

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

  // Cache management methods
  async getCachedData(key, fetchFn) {
    const cached = this.cache.get(key);
    const now = Date.now();

    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }

    const data = await fetchFn();
    this.cache.set(key, { data, timestamp: now });
    return data;
  }

  invalidateCache(key) {
    if (key) {
      this.cache.delete(key);
    } else {
      this.cache.clear();
    }
  }

  updateCliStatus(available) {
    if (this.cliStatus) {
      this.cliStatus.innerHTML = ''; // Clear previous content
      if (available) {
        this.cliStatus.textContent = 'Available';
        this.cliStatus.className = 'status-value success';
      } else {
        // Not available, show an install button
        this.cliStatus.className = ''; // remove status-value classes
        const installButton = document.createElement('button');
        installButton.textContent = 'Install CLI';
        installButton.className = 'btn btn--primary btn--sm';
        installButton.addEventListener('click', async () => {
          installButton.textContent = 'Starting...';
          installButton.disabled = true;
          try {
            const result = await window.electronAPI.installClaudeCli();
            if (result.success) {
              this.showSuccess('Installation started in a new terminal. After it finishes, please reopen settings to see the updated status.');
            } else {
              this.showError(result.error || 'Failed to start installation.');
            }
          } catch (error) {
            this.showError(error.message);
          } finally {
            installButton.textContent = 'Install CLI';
            installButton.disabled = false;
          }
        });
        this.cliStatus.appendChild(installButton);
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
      const hasApiKey = this.apiKeyInput?.value.trim().length > 0;
      const hasNewShortcut = !!this.newShortcut;
      this.saveSettingsBtn.disabled = !hasApiKey && !hasNewShortcut;
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
    alert(message);
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
      const servers = await this.getCachedData('mcpServers', () => window.electronAPI.getMcpServers());
      this.renderMcpServersList(servers);
    } catch (err) {
      console.error('Failed to load MCP servers:', err);
    }
  }

  renderMcpServersList(servers) {
    if (!this.mcpServersList) return;

    // Use DocumentFragment for better performance
    const fragment = document.createDocumentFragment();

    if (!servers || servers.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No MCP servers configured.';
      fragment.appendChild(empty);
    } else {
      servers.forEach(server => {
        const item = this.createMcpServerItem(server);
        fragment.appendChild(item);
      });
    }

    // Single DOM update
    this.mcpServersList.replaceChildren(fragment);
  }

  createMcpServerItem(server) {
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

    return item;
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
        this.invalidateCache('mcpServers');
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
      this.invalidateCache('mcpServers');
      await this.loadMcpServers();
    } else {
      alert('Failed to delete server');
    }
  }

  async toggleMcpServer(serverId, enabled) {
    const res = await window.electronAPI.toggleMcpServer(serverId, enabled);
    if (res.success) {
      this.invalidateCache('mcpServers');
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
    if (!this.generalSection || !this.mcpSection || !this.taskTemplateSection || !this.systemPromptSection || !this.windowDetectionSection) return;

    // Hide all sections first
    this.generalSection.style.display = 'none';
    this.mcpSection.style.display = 'none';
    this.taskTemplateSection.style.display = 'none';
    this.systemPromptSection.style.display = 'none';
    this.windowDetectionSection.style.display = 'none';

    // Remove active class from all tabs
    this.generalTabBtn?.classList.remove('active');
    this.mcpTabBtn?.classList.remove('active');
    this.taskTemplateTabBtn?.classList.remove('active');
    this.systemPromptTabBtn?.classList.remove('active');
    this.windowDetectionTabBtn?.classList.remove('active');

    // Show the selected section and activate its tab
    if (tab === 'mcp') {
      this.mcpSection.style.display = 'block';
      this.mcpTabBtn?.classList.add('active');
      // Load data only when tab is selected for the first time or cache is stale
      this.loadTabData('mcp');
    } else if (tab === 'taskTemplate') {
      this.taskTemplateSection.style.display = 'block';
      this.taskTemplateTabBtn?.classList.add('active');
      this.loadTabData('taskTemplate');
    } else if (tab === 'systemPrompt') {
      this.systemPromptSection.style.display = 'block';
      this.systemPromptTabBtn?.classList.add('active');
      this.loadTabData('systemPrompt');
    } else if (tab === 'windowDetection') {
      this.windowDetectionSection.style.display = 'block';
      this.windowDetectionTabBtn?.classList.add('active');
      this.loadTabData('windowDetection');
    } else {
      this.generalSection.style.display = 'block';
      this.generalTabBtn?.classList.add('active');
      // General tab data is already loaded on initialization
    }
  }

  async loadTabData(tab) {
    switch (tab) {
      case 'mcp':
        await this.loadMcpServers();
        break;
      case 'taskTemplate':
        await this.loadTaskTemplate();
        break;
      case 'systemPrompt':
        await this.loadSystemPromptConfig();
        break;
      case 'windowDetection':
        await this.loadWindowDetectionSettings();
        break;
    }
  }

  /* --------------------------- Task Template Management --------------------------- */

  async loadTaskTemplate() {
    try {
      const taskTemplate = await this.getCachedData('taskTemplate', () => window.electronAPI.getTaskTemplate());
      if (this.taskTemplateInput) {
        this.taskTemplateInput.value = taskTemplate;
      }
    } catch (error) {
      console.error('Failed to load task template:', error);
    }
  }

  async saveTaskTemplate() {
    try {
      const template = this.taskTemplateInput?.value?.trim() || '';

      if (!template) {
        alert('Task template cannot be empty');
        return;
      }

      const result = await window.electronAPI.setTaskTemplate(template);
      this.invalidateCache('taskTemplate');
      this.showSuccess('Task template saved successfully');
    } catch (error) {
      console.error('Failed to save task template:', error);
      this.showError('Failed to save task template');
    }
  }

  async resetTaskTemplate() {
    const confirmReset = confirm('Are you sure you want to reset the task template to default? This action cannot be undone.');

    if (!confirmReset) {
      return;
    }

    try {
      const defaultTemplate = 'Create a new folder in the cwd and accomplish the following task into it: \n\n<task>\n\n</task> ultrathink through this task to complete it effectively:';
      await window.electronAPI.setTaskTemplate(defaultTemplate);
      this.invalidateCache('taskTemplate');

            if (this.taskTemplateInput) {
        this.taskTemplateInput.value = defaultTemplate;
      }

      this.showSuccess('Task template reset to default');
    } catch (error) {
      console.error('Failed to reset task template:', error);
      this.showError('Failed to reset task template');
    }
  }

  /* ----------------------- System Prompt Management ----------------------- */

  async loadSystemPromptConfig() {
    try {
      const config = await this.getCachedData('systemPromptConfig', () => window.electronAPI.getSystemPromptConfig());
      if (this.systemPromptInput) {
        this.systemPromptInput.value = config.prompt || '';
      }
      if (this.systemPromptEnabledToggle) {
        this.systemPromptEnabledToggle.checked = config.enabled;
      }
      if (this.systemPromptModeToggle) {
        // 'append' is on, 'override' is off
        this.systemPromptModeToggle.checked = config.mode === 'append';
      }
    } catch (error) {
      console.error('Failed to load system prompt config:', error);
      this.showError('Failed to load system prompt config');
    }
  }

  async saveSystemPromptConfig() {
    try {
      const config = {
        prompt: this.systemPromptInput.value,
        enabled: this.systemPromptEnabledToggle.checked,
        mode: this.systemPromptModeToggle.checked ? 'append' : 'override'
      };
      await window.electronAPI.setSystemPromptConfig(config);
      this.invalidateCache('systemPromptConfig');
      this.showSuccess('System prompt settings saved');
    } catch (error) {
      console.error('Failed to save system prompt config:', error);
      this.showError('Failed to save system prompt config');
    }
  }

  // Clear all sessions with confirmation
  async clearAllSessions() {
    try {
      // Get current session count for confirmation
      const sessions = await window.electronAPI.getSessions();
      const sessionCount = sessions.length;

      if (sessionCount === 0) {
        alert('No sessions to clear.');
        return;
      }

      // First confirmation
      const confirmFirst = confirm(
        `Are you sure you want to delete all ${sessionCount} conversation sessions?\n\n` +
        'This action cannot be undone and will permanently remove all your chat history.'
      );

      if (!confirmFirst) {
        return;
      }

      // Second confirmation - make user type confirmation
      const confirmSecond = confirm(
        'This will PERMANENTLY DELETE all your conversation sessions.\n\n' +
        'Click OK to confirm, or Cancel to abort.'
      );

      if (!confirmSecond) {
        return;
      }

      // Disable button to prevent double-clicks
      if (this.clearAllSessionsBtn) {
        this.clearAllSessionsBtn.disabled = true;
        this.clearAllSessionsBtn.textContent = 'Clearing...';
      }

      // Clear all sessions
      const result = await window.electronAPI.clearAllSessions();

      if (result.success) {
        this.showSuccess(`Successfully cleared ${result.clearedCount} sessions.`);

        // Reload sessions in the session manager to reflect the change
        if (window.sessionManager) {
          await window.sessionManager.loadSessions();
        }

        // Close settings modal since sessions are gone
        this.closeSettings();
      } else {
        this.showError(`Failed to clear sessions: ${result.error || 'Unknown error'}`);
      }

    } catch (error) {
      console.error('Failed to clear all sessions:', error);
      this.showError('Failed to clear sessions. Please try again.');
    } finally {
      // Re-enable button
      if (this.clearAllSessionsBtn) {
        this.clearAllSessionsBtn.disabled = false;
        this.clearAllSessionsBtn.textContent = 'Clear All Sessions';
      }
    }
  }

  /* ----------------------- Window Detection Management ----------------------- */

  async loadWindowDetectionSettings() {
    try {
      const settings = await this.getCachedData('windowDetectionSettings', () => window.electronAPI.getWindowDetectionSettings());
      if (this.vsCodeDetectionToggle) {
        this.vsCodeDetectionToggle.checked = settings.vscode;
      }
      if (this.cursorDetectionToggle) {
        this.cursorDetectionToggle.checked = settings.cursor;
      }
      if (this.excelDetectionToggle) {
        this.excelDetectionToggle.checked = settings.excel;
      }
      if (this.photoshopDetectionToggle) {
        this.photoshopDetectionToggle.checked = settings.photoshop;
      }
    } catch (error) {
      console.error('Failed to load window detection settings:', error);
      this.showError('Failed to load window detection settings');
    }
  }

  async saveWindowDetectionSettings() {
    try {
      const settings = {
        vscode: this.vsCodeDetectionToggle ? this.vsCodeDetectionToggle.checked : true,
        cursor: this.cursorDetectionToggle ? this.cursorDetectionToggle.checked : true,
        excel: this.excelDetectionToggle ? this.excelDetectionToggle.checked : false,
        photoshop: this.photoshopDetectionToggle ? this.photoshopDetectionToggle.checked : false
      };
      await window.electronAPI.setWindowDetectionSettings(settings);
      this.invalidateCache('windowDetectionSettings');
      this.showSuccess('Window detection settings saved');
    } catch (error) {
      console.error('Failed to save window detection settings:', error);
      this.showError('Failed to save window detection settings');
    }
  }

  /* ---------------------- Shortcut Recorder Methods --------------------- */

  enterRecordingMode() {
    if (this.isRecordingShortcut) return;
    this.isRecordingShortcut = true;
    this.globalShortcutInput.textContent = 'Recording... Press keys';
    this.globalShortcutInput.classList.add('is-recording');
  }

  exitRecordingMode() {
    if (!this.isRecordingShortcut) return;
    this.isRecordingShortcut = false;
    this.globalShortcutInput.classList.remove('is-recording');
    // If nothing new was recorded, revert to original text
    if (!this.newShortcut) {
      this.loadInitialSettings(); // Easiest way to restore original value
    }
  }

  handleShortcutKeyDown(e) {
    if (!this.isRecordingShortcut) return;

    e.preventDefault();
    e.stopPropagation();

    const shortcut = this.acceleratorToString(e);

    if (shortcut) {
      this.globalShortcutInput.textContent = shortcut;
      this.newShortcut = shortcut;
      this.exitRecordingMode();
      this.updateSaveButtonState();
    }
  }

  acceleratorToString(e) {
    const modifiers = [];
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;

    // Determine modifiers based on platform
    if (isMac) {
      if (e.ctrlKey) modifiers.push('Control');
      if (e.altKey) modifiers.push('Option');
      if (e.shiftKey) modifiers.push('Shift');
      if (e.metaKey) modifiers.push('Command');
    } else {
      if (e.ctrlKey) modifiers.push('Control');
      if (e.altKey) modifiers.push('Alt');
      if (e.shiftKey) modifiers.push('Shift');
      // Note: No 'meta' key on Windows/Linux in this context
    }

    let key = e.key.toUpperCase();
    
    // Ignore presses of only modifier keys
    if (['CONTROL', 'ALT', 'SHIFT', 'COMMAND', 'OPTION', 'META'].includes(key)) {
      return null;
    }
    
    // Normalize key names to match Electron's accelerator format
    if (/^F\d{1,2}$/.test(e.code)) {
      key = e.code;
    } else {
      const keyMap = {
        ' ': 'Space',
        '+': 'Plus',
        'Enter': 'Return',
        'Escape': 'Escape',
        'Tab': 'Tab',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
      };
      key = keyMap[e.key] || key;
    }
    
    // A valid shortcut should have a modifier OR be a function key.
    if (modifiers.length === 0 && !/^F\d{1,2}$/.test(key)) {
      return null;
    }

    return [...modifiers, key].join('+');
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SettingsComponent;
} else {
  window.SettingsComponent = SettingsComponent;
}