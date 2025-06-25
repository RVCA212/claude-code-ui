// File Editor Component - Monaco Editor Integration
class FileEditorComponent {
  constructor() {
    this.monaco = null;
    this.editor = null;
    this.currentFile = null;
    this.isDirty = false;
    this.isInitialized = false;
    this.loadingEditor = false;

    this.container = document.getElementById('editorContainer');
    this.setupContainer();
    this.setupKeyboardShortcuts();

    // Auto-save configuration
    this.autoSaveEnabled = true;      // Toggle to disable/enable auto-save
    this.autoSaveDelay = 2000;        // Delay (ms) after last change before saving
    this.autoSaveTimer = null;        // Reference to the pending auto-save timer
  }

  setupContainer() {
    if (!this.container) {
      console.error('Editor container not found');
      return;
    }

    // Create editor wrapper with header
    this.container.innerHTML = `
      <div class="editor-wrapper">
        <div class="editor-header" id="editorHeader" style="display: none;">
          <div class="file-info">
            <span class="file-icon" id="fileIcon">📄</span>
            <span class="file-name" id="fileName">No file open</span>
            <span class="dirty-indicator" id="dirtyIndicator" style="display: none;">●</span>
          </div>
          <div class="editor-actions">
            <button class="editor-btn" id="closeBtn" title="Close file">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
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
    const saveBtn = document.getElementById('saveBtn');
    const closeBtn = document.getElementById('closeBtn');

    if (saveBtn) {
      saveBtn.addEventListener('click', () => this.saveFile());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeFile());
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + S for save
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.currentFile) {
        e.preventDefault();
        this.saveFile();
      }

      // Ctrl/Cmd + W for close
      if ((e.ctrlKey || e.metaKey) && e.key === 'w' && this.currentFile) {
        e.preventDefault();
        this.closeFile();
      }
    });
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

      // Configure Monaco
      this.configureMonaco();

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

      // Only show full loading screen for new editors
      // For existing editors, provide lightweight feedback to avoid destroying Monaco DOM
      if (!this.editor) {
        this.showLoading('Loading file...');
      } else {
        console.log('Using existing editor, providing lightweight loading feedback');
        this.showLightweightLoading(this.getFileName(filePath));
      }

      // Try to read the file first
      let result = await window.electronAPI.readFile(filePath);

      // If file read fails and auto-navigation is enabled, try to navigate to the file's directory
      if (!result.success && autoNavigateToDirectory) {
        console.log('File read failed, attempting to navigate to file directory...');

        try {
          const dirResult = await window.electronAPI.setWorkingDirectoryFromFile(filePath);
          if (dirResult.success) {
            console.log('Successfully navigated to file directory:', dirResult.path);

            // Dispatch directory change event for file browser
            document.dispatchEvent(new CustomEvent('directoryChanged', {
              detail: {
                success: true,
                path: dirResult.path,
                contents: [] // Will be populated by file browser
              }
            }));

            // Try reading the file again
            result = await window.electronAPI.readFile(filePath);
          }
        } catch (navError) {
          console.warn('Failed to navigate to file directory:', navError);
          // Continue with original error handling
        }
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to read file');
      }

      // Check if file is binary
      if (result.isBinary) {
        this.showError('Cannot edit binary files');
        return;
      }

      // Set current file
      this.currentFile = {
        path: filePath,
        name: this.getFileName(filePath),
        content: result.content,
        language: this.detectLanguage(filePath)
      };

      // Create or update editor
      const monacoEditorElement = document.getElementById('monacoEditor');
      const needsNewEditor = !this.editor || !monacoEditorElement || !monacoEditorElement.isConnected;

      if (needsNewEditor) {
        console.log('Creating Monaco editor instance...');

        // Dispose of any existing editor first
        if (this.editor) {
          try {
            this.editor.dispose();
            console.log('Disposed stale Monaco editor');
          } catch (error) {
            console.warn('Error disposing stale editor:', error);
          }
          this.editor = null;
        }

        // Clear the loading content and create editor
        const editorContent = document.getElementById('editorContent');
        if (!editorContent) {
          throw new Error('Editor content container not found');
        }

        // Create Monaco editor container
        editorContent.innerHTML = '<div id="monacoEditor" style="height: 100%; width: 100%;"></div>';

        this.editor = this.monaco.editor.create(document.getElementById('monacoEditor'), {
          value: result.content,
          language: this.currentFile.language,
          theme: this.getTheme(),
          automaticLayout: true,
          fontSize: 13,
          fontFamily: 'SF Mono, Monaco, Inconsolata, "Roboto Mono", Consolas, "Courier New", monospace',
          lineNumbers: 'on',
          wordWrap: 'off',
          // Disable the right-hand minimap for a cleaner interface
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          tabSize: 2,
          insertSpaces: true
        });

        // Set up change detection
        this.editor.onDidChangeModelContent(() => {
          this.markDirty(true);
          this.handleAutoSave();
        });

        console.log('Monaco editor created successfully');
      } else {
        console.log('Updating existing editor with new content');
        this.editor.setValue(result.content);
        // Ensure minimap stays disabled when switching files
        this.editor.updateOptions({
          language: this.currentFile.language,
          minimap: { enabled: false },
          fontSize: 12,
          wordWrap: 'off'
        });
      }

      // Update UI
      console.log('Updating file info and UI...');
      this.updateFileInfo();
      this.clearLightweightLoading(); // Clear any lightweight loading state
      this.markDirty(false);
      this.showEditor();

      // Dispatch event for global header with delay to ensure DOM is stable
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('fileOpened', {
          detail: {
            name: this.currentFile.name,
            path: this.currentFile.path,
            icon: this.getFileIcon(this.currentFile.name)
          }
        }));
      }, 50); // Small delay to ensure layout changes are complete

      console.log('File opened successfully:', filePath);

    } catch (error) {
      console.error('Failed to open file:', error);
      this.clearLightweightLoading(); // Clear any lightweight loading state on error
      this.showError(`Failed to open file: ${error.message}`);
    }
  }



  async saveFile() {
    if (!this.currentFile || !this.editor) {
      return;
    }

    try {
      const content = this.editor.getValue();

      const result = await window.electronAPI.writeFile(this.currentFile.path, content);

      if (!result.success) {
        throw new Error(result.error || 'Failed to save file');
      }

      this.markDirty(false);
      console.log('File saved successfully:', this.currentFile.path);

      // Show brief success indication
      this.showNotification('File saved', 'success');

      // Clear any pending auto-save since we just saved
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }

    } catch (error) {
      console.error('Failed to save file:', error);
      this.showError(`Failed to save file: ${error.message}`);
    }
  }

  closeFile() {
    if (this.isDirty) {
      const confirmed = confirm('You have unsaved changes. Are you sure you want to close this file?');
      if (!confirmed) {
        return;
      }
    }

    this.currentFile = null;
    this.isDirty = false;

    // Properly dispose of Monaco editor instance
    if (this.editor) {
      try {
        this.editor.dispose();
        console.log('Monaco editor disposed');
      } catch (error) {
        console.warn('Error disposing Monaco editor:', error);
      }
      this.editor = null;
    }

    this.hideEditor();

    // Dispatch event for global header with delay to ensure DOM is stable
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('fileClosed'));
    }, 50); // Small delay to ensure layout changes are complete

    console.log('File closed');

    // Cancel any pending auto-save when the file is closed
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  markDirty(dirty) {
    this.isDirty = dirty;

    const dirtyIndicator = document.getElementById('dirtyIndicator');
    const saveBtn = document.getElementById('saveBtn');

    if (dirtyIndicator) {
      dirtyIndicator.style.display = dirty ? 'inline' : 'none';
    }

    if (saveBtn) {
      saveBtn.disabled = !dirty;
    }
  }

  updateFileInfo() {
    if (!this.currentFile) return;

    const fileIcon = document.getElementById('fileIcon');
    const fileName = document.getElementById('fileName');

    if (fileIcon) {
      fileIcon.textContent = this.getFileIcon(this.currentFile.name);
    }

    if (fileName) {
      fileName.textContent = this.currentFile.name;
      fileName.title = this.currentFile.path;
    }
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
    if (this.currentFile?.path) {
      this.openFile(this.currentFile.path);
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
    return this.currentFile;
  }

  isEditorDirty() {
    return this.isDirty;
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
      if (this.isDirty) {
        this.saveFile();
      }
    }, this.autoSaveDelay);
  }


}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileEditorComponent;
}