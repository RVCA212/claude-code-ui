// File Editor Component - Monaco Editor Integration
class FileEditorComponent {
  constructor() {
    this.monaco = null;
    this.editor = null;
    
    // New state for tabbed editor
    this.openFiles = new Map(); // filePath -> { path, name, language, isDirty, model, viewState }
    this.activeFilePath = null;

    this.isInitialized = false;
    this.loadingEditor = false;

    // Real-time file watching state
    this.fileChangeListeners = new Map(); // path -> handler
    this.ignoreNextChange = new Set(); // Set of paths to ignore changes for

    this.container = document.getElementById('editorContainer');
    this.setupContainer();
    this.setupKeyboardShortcuts();
    this.setupFileWatching(); // Sets up the main channel listener

    // Auto-save configuration
    this.autoSaveEnabled = true;
    this.autoSaveDelay = 2000;
    this.autoSaveTimer = null;
  }

  setupContainer() {
    if (!this.container) {
      console.error('Editor container not found');
      return;
    }

    // Create editor wrapper with header for tabs
    this.container.innerHTML = `
      <div class="editor-wrapper">
        <div class="editor-header" id="editorHeader" style="display: none;">
          <div class="editor-tabs" id="editorTabs">
            <!-- Tabs will be dynamically inserted here -->
          </div>
          <div class="editor-actions">
            <!-- Global actions can go here if needed -->
          </div>
        </div>
        <div class="editor-content" id="editorContent">
          <div class="editor-placeholder">
            <div class="placeholder-icon">📝</div>
            <div class="placeholder-text">
              <h3>No file selected</h3>
              <p>Select a file from the sidebar to start editing</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    const editorTabs = document.getElementById('editorTabs');
    if (editorTabs) {
      editorTabs.addEventListener('click', async (e) => {
        const tab = e.target.closest('.editor-tab');
        if (!tab) return;

        e.stopPropagation();
        const filePath = tab.dataset.filePath;

        if (e.target.closest('.close-tab-btn')) {
          this.closeFile(filePath);
        } else {
          await this.switchToFile(filePath);
        }
      });
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + S for save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.activeFilePath) {
        e.preventDefault();
        this.saveFile();
      }

      // Ctrl/Cmd + W for close
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && this.activeFilePath) {
        e.preventDefault();
        this.closeFile(this.activeFilePath);
      }
    });
  }

  setupFileWatching() {
    // This listener handles all file change events, dispatched to specific handlers
    if (window.electronAPI?.onFileChanged) {
      window.electronAPI.onFileChanged((event, data) => {
        if (this.fileChangeListeners.has(data.path)) {
          this.fileChangeListeners.get(data.path)(data);
        }
      });
      console.log('Global file watching event listener set up');
    }
  }

  async initializeMonaco() {
    if (this.isInitialized || this.loadingEditor) {
      return;
    }

    this.loadingEditor = true;
    this.showLoading('Initializing editor...');

    try {
      // Use the global Monaco loader that was loaded via script tag
      if (!window.require) {
        throw new Error('Monaco loader not available');
      }

      console.log('Starting Monaco initialization...');

      // Load Monaco Editor with timeout
      const monaco = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Monaco loading timed out after 10 seconds'));
        }, 10000);

        window.require(['vs/editor/editor.main'], (monaco) => {
          clearTimeout(timeout);
          console.log('Monaco loaded successfully');
          resolve(monaco);
        }, (error) => {
          clearTimeout(timeout);
          console.error('Monaco require failed:', error);
          reject(error);
        });
      });

      this.monaco = monaco;

      // Configure Monaco - this is no longer needed as monaco comes with languages built-in.
      // this.configureMonaco();

      // Don't create the editor instance here, just ensure Monaco is loaded
      // The actual editor will be created in openFile() after all loading is done

      this.isInitialized = true;
      console.log('Monaco Editor initialized successfully');

    } catch (error) {
      console.error('Failed to initialize Monaco Editor:', error);
      this.showError(`Failed to load editor: ${error.message}`);

      // Reset initialization state so user can retry
      this.isInitialized = false;
      this.monaco = null;
      this.editor = null;
    } finally {
      this.loadingEditor = false;
    }
  }

  /*
  configureMonaco() {
    // Configure languages and themes
    if (this.monaco?.languages) {
      // Set up common language associations
      this.monaco.languages.register({ id: 'javascript' });
      this.monaco.languages.register({ id: 'typescript' });
      this.monaco.languages.register({ id: 'json' });
      this.monaco.languages.register({ id: 'markdown' });
      this.monaco.languages.register({ id: 'python' });
      this.monaco.languages.register({ id: 'html' });
      this.monaco.languages.register({ id: 'css' });
    }
  }
  */

  getTheme() {
    // Match the app's theme
    const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return isDark ? 'vs-dark' : 'vs';
  }

  async openFile(filePath, options = {}) {
    if (!filePath) {
      console.error('No file path provided');
      return;
    }

    // If file is already open, just switch to it
    if (this.openFiles.has(filePath)) {
      await this.switchToFile(filePath);
      return;
    }

    try {
      console.log('Opening file:', filePath);

      // Check if we need to handle directory context
      const autoNavigateToDirectory = options.autoNavigateToDirectory !== false; // Default to true

      // Initialize Monaco if needed FIRST
      if (!this.isInitialized) {
        this.showLoading('Initializing editor...');
        console.log('Monaco not initialized, initializing now...');
        await this.initializeMonaco();

        // Check if initialization failed
        if (!this.isInitialized) {
          throw new Error('Monaco Editor failed to initialize');
        }
      }

      // Provide lightweight feedback for existing editors
      if (this.editor) {
        this.showLightweightLoading(this.getFileName(filePath));
      } else {
        this.showLoading('Loading file...');
      }
      
      const result = await window.electronAPI.readFile(filePath);

      if (!result.success) {
        // With the new validation logic, this part is less likely to be needed for path reasons,
        // but we can keep the directory navigation as a feature for user convenience.
        // For now, we'll just throw the error as the new validator should allow any path.
        throw new Error(result.error || 'Failed to read file');
      }

      if (result.isBinary) {
        this.showError('Cannot edit binary files');
        return;
      }

      const language = this.detectLanguage(filePath);
      const newFile = {
        path: filePath,
        name: this.getFileName(filePath),
        language: language,
        isDirty: false,
        model: this.monaco.editor.createModel(result.content, language),
        viewState: null,
      };

      this.openFiles.set(filePath, newFile);

      // Create editor instance if it doesn't exist
      const monacoEditorElement = document.getElementById('monacoEditor');
      const needsNewEditor = !this.editor || !monacoEditorElement || !monacoEditorElement.isConnected;

      if (needsNewEditor) {
        console.log('Creating Monaco editor instance...');

        if (this.editor) {
          this.editor.dispose();
        }

        const editorContent = document.getElementById('editorContent');
        editorContent.innerHTML = '<div id="monacoEditor" style="height: 100%; width: 100%;"></div>';

        this.editor = this.monaco.editor.create(document.getElementById('monacoEditor'), {
          model: null, // Model will be set by switchToFile
          theme: this.getTheme(),
          automaticLayout: true,
          fontSize: 13,
          fontFamily: 'SF Mono, Monaco, Inconsolata, "Roboto Mono", Consolas, "Courier New", monospace',
          lineNumbers: 'on',
          wordWrap: 'off',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          tabSize: 2,
          insertSpaces: true
        });

        this.editor.onDidChangeModelContent(() => {
          if (this.activeFilePath) {
            const activeFile = this.openFiles.get(this.activeFilePath);
            if (activeFile && !activeFile.isDirty) {
              this.markDirty(this.activeFilePath, true);
            }
          }
          this.handleAutoSave();
        });
        
        console.log('Monaco editor created successfully');
      }
      
      // Switch to the new file, which handles setting the model and updating UI
      await this.switchToFile(filePath);

      this.clearLightweightLoading();
      this.showEditor();

      await this.startWatchingFile(filePath);

      console.log('File opened successfully:', filePath);

    } catch (error) {
      console.error('Failed to open file:', error);
      this.clearLightweightLoading();
      this.showError(`Failed to open file: ${error.message}`);
    }
  }

  async switchToFile(filePath) {
    if (!this.openFiles.has(filePath)) {
      console.error(`Attempted to switch to a file that is not open: ${filePath}`);
      return;
    }
    
    if (this.activeFilePath === filePath) {
      return; // Already active
    }

    const fileToSwitch = this.openFiles.get(filePath);

    // Reload file content from disk before switching to check for external changes
    try {
        const result = await window.electronAPI.readFile(filePath);
        if (result.success) {
            const newContent = result.content;
            const currentContent = fileToSwitch.model.getValue();

            if (newContent !== currentContent) {
                if (fileToSwitch.isDirty) {
                    // We have local unsaved changes, and the file on disk is different.
                    this.handleFileConflict(fileToSwitch, newContent);
                } else {
                    // File is not dirty, so we can safely update it.
                    this.reloadFileContent(fileToSwitch, newContent);
                    this.showNotification(`${fileToSwitch.name} reloaded to latest version.`, 'info');
                }
            }
        } else {
            console.warn(`Could not reload file ${filePath} on tab switch: ${result.error}`);
        }
    } catch (error) {
        console.error('Error reloading file on switch:', error);
    }
    
    // Save view state of the previously active file
    if (this.activeFilePath) {
      const previousFile = this.openFiles.get(this.activeFilePath);
      if (previousFile && this.editor) {
        previousFile.viewState = this.editor.saveViewState();
      }
    }
    
    this.activeFilePath = filePath;
    const newActiveFile = this.openFiles.get(filePath);

    if (this.editor) {
      this.editor.setModel(newActiveFile.model);
      if (newActiveFile.viewState) {
        this.editor.restoreViewState(newActiveFile.viewState);
      }
      this.editor.focus();
    }
    
    this.renderTabs();
    
    // Dispatch event for global header
    setTimeout(() => {
        document.dispatchEvent(new CustomEvent('fileOpened', {
            detail: {
                name: newActiveFile.name,
                path: newActiveFile.path,
                icon: this.getFileIcon(newActiveFile.name)
            }
        }));
    }, 50);
  }

  async saveFile() {
    if (!this.activeFilePath || !this.editor) {
      return;
    }
    const fileToSave = this.openFiles.get(this.activeFilePath);
    if (!fileToSave) return;

    try {
      const content = this.editor.getValue();

      this.ignoreNextChange.add(fileToSave.path);

      const result = await window.electronAPI.writeFile(fileToSave.path, content);

      if (!result.success) {
        this.ignoreNextChange.delete(fileToSave.path);
        throw new Error(result.error || 'Failed to save file');
      }

      this.markDirty(fileToSave.path, false);
      console.log('File saved successfully:', fileToSave.path);

      this.showNotification('File saved', 'success');

      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      this.showError(`Failed to save file: ${error.message}`);
    }
  }

  async closeFile(filePath) {
    const fileToClose = this.openFiles.get(filePath);
    if (!fileToClose) return;

    if (fileToClose.isDirty) {
      const confirmed = confirm(`You have unsaved changes in ${fileToClose.name}. Are you sure you want to close?`);
      if (!confirmed) {
        return;
      }
    }

    await this.stopWatchingFile(filePath);

    const openFilePaths = Array.from(this.openFiles.keys());
    const closingIndex = openFilePaths.indexOf(filePath);

    fileToClose.model.dispose();
    this.openFiles.delete(filePath);
    
    if (this.activeFilePath === filePath) {
      this.activeFilePath = null;
      if (this.openFiles.size > 0) {
        let nextActiveIndex = closingIndex >= this.openFiles.size ? this.openFiles.size - 1 : closingIndex;
        if (nextActiveIndex < 0) nextActiveIndex = 0;
        const newActiveFilePath = Array.from(this.openFiles.keys())[nextActiveIndex];
        await this.switchToFile(newActiveFilePath);
      }
    }

    if (this.openFiles.size === 0) {
      this.hideEditor();
      document.dispatchEvent(new CustomEvent('fileClosed'));
    } else {
      this.renderTabs();
    }
    
    if (this.autoSaveTimer && this.activeFilePath !== filePath) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  markDirty(filePath, dirty) {
    const file = this.openFiles.get(filePath);
    if (file) {
      if (file.isDirty === dirty) return;
      file.isDirty = dirty;
      this.renderTabs();
    }
  }

  renderTabs() {
    const tabsContainer = document.getElementById('editorTabs');
    if (!tabsContainer) return;

    // Preserve scroll position
    const scrollLeft = tabsContainer.scrollLeft;
    
    tabsContainer.innerHTML = '';
    
    this.openFiles.forEach(file => {
      const tab = document.createElement('div');
      tab.className = 'editor-tab';
      tab.dataset.filePath = file.path;
      tab.title = file.path;
      if (file.path === this.activeFilePath) {
        tab.classList.add('active');
      }

      tab.innerHTML = `
        <span class="file-icon">${this.getFileIcon(file.name)}</span>
        <span class="file-name">${file.name}</span>
        <span class="dirty-indicator" style="display: ${file.isDirty ? 'inline' : 'none'};">●</span>
        <button class="close-tab-btn" title="Close file">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      `;
      tabsContainer.appendChild(tab);
    });

    // Restore scroll position
    tabsContainer.scrollLeft = scrollLeft;
  }

  updateFileInfo() {
    // This is now handled by renderTabs()
  }

  getFileName(filePath) {
    return filePath.split('/').pop() || filePath;
  }

  detectLanguage(filePath) {
    const extension = filePath.split('.').pop()?.toLowerCase();

    const languageMap = {
      'js': 'javascript',
      'jsx': 'javascript',
      'ts': 'typescript',
      'tsx': 'typescript',
      'json': 'json',
      'md': 'markdown',
      'markdown': 'markdown',
      'py': 'python',
      'html': 'html',
      'htm': 'html',
      'css': 'css',
      'scss': 'scss',
      'sass': 'sass',
      'less': 'less',
      'xml': 'xml',
      'yml': 'yaml',
      'yaml': 'yaml',
      'sh': 'shell',
      'bash': 'shell',
      'zsh': 'shell',
      'sql': 'sql',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'h': 'c',
      'hpp': 'cpp'
    };

    return languageMap[extension] || 'plaintext';
  }

  getFileIcon(fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase();

    const iconMap = {
      'js': '📄',
      'jsx': '⚛️',
      'ts': '📘',
      'tsx': '⚛️',
      'json': '📋',
      'md': '📝',
      'markdown': '📝',
      'py': '🐍',
      'html': '🌐',
      'css': '🎨',
      'scss': '🎨',
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'svg': '🎨',
      'pdf': '📕',
      'txt': '📄'
    };

    return iconMap[extension] || '📄';
  }

  showEditor() {
    console.log('showEditor() called');

    const header = document.getElementById('editorHeader');
    if (header) {
      console.log('Showing editor header');
      header.style.display = 'flex';
    } else {
      console.error('Editor header not found');
    }

    // Reveal the editor pane first
    if (this.container) {
      console.log('Adding active class to editor container');
      this.container.classList.add('active');
    } else {
      console.error('Editor container not found');
    }

    // Add editor-active class to app-content container for layout adjustments
    const appContent = document.querySelector('.app-content');
    if (appContent) {
      appContent.classList.add('editor-active');
    }

    // Use double requestAnimationFrame to ensure all layout changes are complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // Update global header button states after layout is stable
        if (window.globalHeader && typeof window.globalHeader.updateButtonStates === 'function') {
          window.globalHeader.updateButtonStates();
        }
      });
    });

    console.log('showEditor() completed');
  }

  hideEditor() {
    const header = document.getElementById('editorHeader');
    const content = document.getElementById('editorContent');

    if (header) {
      header.style.display = 'none';
    }

    // Dispose of editor if it still exists (defensive cleanup)
    if (this.editor) {
      try {
        this.editor.dispose();
        console.log('Monaco editor disposed during hideEditor');
      } catch (error) {
        console.warn('Error disposing Monaco editor during hideEditor:', error);
      }
      this.editor = null;
    }

    if (content) {
      content.innerHTML = `
        <div class="editor-placeholder">
          <div class="placeholder-icon">📝</div>
          <div class="placeholder-text">
            <h3>No file selected</h3>
            <p>Select a file from the sidebar to start editing</p>
          </div>
        </div>
      `;
    }

    // Hide the editor pane
    if (this.container) {
      this.container.classList.remove('active');
    }

    // Remove editor-active class from app-content container
    const appContent = document.querySelector('.app-content');
    if (appContent) {
      appContent.classList.remove('editor-active');
    }

    // Ensure chat sidebar is visible when returning to "no file selected" state
    const chatSidebar = document.getElementById('chatSidebar');
    if (chatSidebar && chatSidebar.classList.contains('hidden')) {
      chatSidebar.classList.remove('hidden');
    }

    // Use requestAnimationFrame to ensure layout changes are complete before updating buttons
    requestAnimationFrame(() => {
      if (window.globalHeader && typeof window.globalHeader.updateButtonStates === 'function') {
        window.globalHeader.updateButtonStates();
      }
    });

    console.log('hideEditor() completed - chat sidebar visibility unchanged');
  }

  showLoading(message) {
    const content = document.getElementById('editorContent');
    if (content) {
      content.innerHTML = `
        <div class="editor-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">${message}</div>
        </div>
      `;
    }
  }

  showLightweightLoading(fileName) {
    // Provide lightweight feedback without destroying Monaco editor DOM
    // Just update the file header to show loading state
    const fileNameElement = document.getElementById('fileName');
    if (fileNameElement) {
      fileNameElement.textContent = `Loading ${fileName}...`;
      fileNameElement.style.fontStyle = 'italic';
      fileNameElement.style.opacity = '0.7';
    }
    console.log('Showing lightweight loading for:', fileName);
  }

  clearLightweightLoading() {
    // Clear the lightweight loading state
    const fileNameElement = document.getElementById('fileName');
    if (fileNameElement) {
      fileNameElement.style.fontStyle = 'normal';
      fileNameElement.style.opacity = '1';
    }
  }

  showError(message) {
    const content = document.getElementById('editorContent');
    if (content) {
      content.innerHTML = `
        <div class="editor-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">${message}</div>
          <button onclick="window.app?.getComponent('fileEditor')?.retryInitialization()" class="retry-btn">Retry</button>
        </div>
      `;
    }
  }

  retryInitialization() {
    // Reset state and try again
    this.isInitialized = false;
    this.loadingEditor = false;
    this.monaco = null;
    this.editor = null;

    // If we have a current file path, try to open it again
    if (this.activeFilePath) {
      this.openFile(this.activeFilePath);
    } else {
      this.initializeMonaco();
    }
  }

  showNotification(message, type = 'info') {
    // Simple notification - could be enhanced with a toast system
    console.log(`${type.toUpperCase()}: ${message}`);
  }

  // Public API methods
  getCurrentFile() {
    return this.activeFilePath ? this.openFiles.get(this.activeFilePath) : null;
  }

  isEditorDirty() {
    return this.activeFilePath ? this.openFiles.get(this.activeFilePath).isDirty : false;
  }

  getEditorContent() {
    return this.editor ? this.editor.getValue() : '';
  }

  /* --------------------------------------------------
   * Auto-save helpers
   * -------------------------------------------------- */

  handleAutoSave() {
    if (!this.autoSaveEnabled) return;

    // Reset any existing timer so we only save once the user pauses typing
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(() => {
      // Only save if there are unsaved changes
      if (this.activeFilePath && this.isEditorDirty()) {
        this.saveFile();
      }
    }, this.autoSaveDelay);
  }

  async handleExternalFileChange(data) {
    const file = this.openFiles.get(data.path);
    if (!file) return;

    // Don't react to changes we made ourselves
    if (this.ignoreNextChange.has(data.path)) {
      this.ignoreNextChange.delete(data.path);
      console.log('Ignoring file change - caused by our own save');
      return;
    }

    console.log('External file change detected for open file:', data.path);

    try {
      const result = await window.electronAPI.readFile(data.path);

      if (!result.success) {
        this.showError(`File may have been deleted or moved: ${result.error}`);
        return;
      }

      if (file.isDirty) {
        const currentContent = file.model.getValue();
        if (currentContent !== result.content) {
          this.handleFileConflict(file, result.content);
        }
      } else {
        this.reloadFileContent(file, result.content);
        this.showNotification(`${file.name} updated externally`, 'info');
      }
    } catch (error) {
      console.error('Error handling external file change:', error);
      this.showError(`Error reloading file: ${error.message}`);
    }
  }

  handleFileConflict(file, newContent) {
    // Show a conflict resolution dialog
    const userChoice = confirm(
      `'${file.name}' has been modified externally and you have unsaved changes.\n\n` +
      'Click "OK" to reload the external changes (your changes will be lost)\n' +
      'Click "Cancel" to keep your changes (external changes will be ignored)'
    );

    if (userChoice) {
      this.reloadFileContent(file, newContent);
      this.showNotification('File reloaded with external changes', 'warning');
    } else {
      this.showNotification('Keeping your changes - file may be out of sync', 'warning');
    }
  }

  reloadFileContent(file, newContent) {
    if (file && file.model) {
      let position = null;
      if (this.activeFilePath === file.path && this.editor) {
        position = this.editor.getPosition();
      }

      file.model.setValue(newContent);
      
      if (this.activeFilePath === file.path && this.editor && position) {
        try {
          this.editor.setPosition(position);
        } catch (error) {
          // Position might be invalid if file shrunk
        }
      }
      
      this.markDirty(file.path, false);
    }
  }

  async startWatchingFile(filePath) {
    if (this.fileChangeListeners.has(filePath)) {
      return; // Already watching
    }

    try {
      const result = await window.electronAPI.watchFile(filePath);
      if (result.success) {
        const handler = (data) => this.handleExternalFileChange(data);
        this.fileChangeListeners.set(filePath, handler);
        console.log('Started watching file:', filePath);
      } else {
        console.warn('Failed to start watching file:', result.error);
      }
    } catch (error) {
      console.error('Error starting file watch:', error);
    }
  }

  async stopWatchingFile(filePath) {
    if (!this.fileChangeListeners.has(filePath)) {
      return;
    }

    try {
      const result = await window.electronAPI.unwatchFile(filePath);
      if (result.success) {
        this.fileChangeListeners.delete(filePath);
        console.log('Stopped watching file:', filePath);
      } else {
        console.warn('Failed to stop watching file:', result.error);
      }
    } catch (error) {
      console.error('Error stopping file watch:', error);
    }
  }

  /* --------------------------------------------------
   * Cleanup methods
   * -------------------------------------------------- */

  async cleanup() {
    // Stop watching all files
    for (const filePath of this.fileChangeListeners.keys()) {
      await this.stopWatchingFile(filePath);
    }
    this.fileChangeListeners.clear();

    // Clear auto-save timer
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }

    // No need to remove global listener, it's managed by main process
    
    // Dispose all models
    this.openFiles.forEach(file => {
      if(file.model) {
        file.model.dispose();
      }
    });
    this.openFiles.clear();

    // Dispose Monaco editor
    if (this.editor) {
      try {
        this.editor.dispose();
        this.editor = null;
        console.log('Monaco editor disposed during cleanup');
      } catch (error) {
        console.warn('Error disposing Monaco editor during cleanup:', error);
      }
    }

    console.log('File editor cleanup completed');
  }
}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileEditorComponent;
}