// File Browser Component
class FileBrowser {
  constructor() {
    this.currentDirectory = null;
    this.directoryContents = [];
    this.filteredContents = [];
    this.canGoBack = false;
    this.canGoForward = false;
    this.commonDirectories = [];
    this.fileSearchQuery = '';
    this.isQuickAccessCollapsed = true; // Start minimized by default
    this.homeDirectory = '~'; // Default to '~'
    this.isHistoryView = false; // Sidebar starts in file view mode

    // Root element of file browser for easy child toggling
    this.root = document.querySelector('.file-browser');

    // Reference to the containing sidebar so we can show/hide it
    this.sidebarContainer = document.querySelector('.sidebar');

    // Sidebar toggle button located in the global header
    this.sidebarToggleBtn = document.getElementById('globalSidebarToggleBtn');

    this.initializeElements();
    this.setupEventListeners();
    this.applyInitialQuickAccessState();
    this.loadInitialDirectory();

    // Attach listener for sidebar hide/show
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.addEventListener('click', () => this.toggleSidebarVisibility());
    }

    // Listen for directory changes from session switching
    document.addEventListener('directoryChanged', (event) => {
      this.handleDirectoryChange(event.detail);
    });
  }

  initializeElements() {
    // Navigation elements
    this.backBtn = document.getElementById('backBtn');
    this.forwardBtn = document.getElementById('forwardBtn');
    this.upBtn = document.getElementById('upBtn');
    this.homeBtn = document.getElementById('homeBtn');
    this.refreshBtn = document.getElementById('refreshBtn');

    // Toggle sidebar view button & history container
    this.toggleViewBtn = document.getElementById('toggleSidebarViewBtn');
    this.conversationHistorySidebar = document.getElementById('conversationHistorySidebar');

    // Display elements
    this.breadcrumb = document.getElementById('breadcrumb');
    this.cwdPath = document.getElementById('cwdPath');
    this.fileList = document.getElementById('fileList');
    this.fileCount = document.getElementById('fileCount');
    this.statusText = document.getElementById('statusText');
    this.loadingState = document.getElementById('loadingState');

    // Search elements
    this.fileSearchInput = document.getElementById('fileSearchInput');

    // Quick access elements
    this.quickAccessHeader = document.getElementById('quickAccessHeader');
    this.quickAccessToggle = document.getElementById('quickAccessToggle');
    this.quickAccessList = document.getElementById('quickAccessList');
  }

  setupEventListeners() {
    // Navigation buttons
    if (this.backBtn) {
      this.backBtn.addEventListener('click', () => this.navigateBack());
    }
    if (this.forwardBtn) {
      this.forwardBtn.addEventListener('click', () => this.navigateForward());
    }
    if (this.upBtn) {
      this.upBtn.addEventListener('click', () => this.navigateUp());
    }
    if (this.homeBtn) {
      this.homeBtn.addEventListener('click', () => this.navigateHome());
    }
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.refreshDirectory());
    }

    // Toggle sidebar view (history / file)
    if (this.toggleViewBtn) {
      this.toggleViewBtn.addEventListener('click', () => this.toggleSidebarView());
    }

    // Search input
    if (this.fileSearchInput) {
      this.fileSearchInput.addEventListener('input', (e) => {
        this.fileSearchQuery = e.target.value.toLowerCase();
        this.filterContents();
        this.updateClearButton();
      });

      // Add Enter key handler for selecting top result
      this.fileSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.selectTopSearchResult();
        }
      });

      // Add clear button functionality
      this.addClearButton();
    }

    // Quick access toggle
    if (this.quickAccessHeader) {
      this.quickAccessHeader.addEventListener('click', () => this.toggleQuickAccess());
    }
  }

  applyInitialQuickAccessState() {
    // Apply the initial collapsed state
    if (this.quickAccessList) {
      this.quickAccessList.style.display = this.isQuickAccessCollapsed ? 'none' : 'flex';
    }

    if (this.quickAccessToggle) {
      this.quickAccessToggle.classList.toggle('collapsed', this.isQuickAccessCollapsed);
    }
  }

  async loadInitialDirectory() {
    try {
      this.showLoading(true);

      // Fetch home directory first
      const homeResult = await window.electronAPI.getHomeDirectory();
      if (homeResult.success) {
        this.homeDirectory = homeResult.path;
      }

      await this.loadCommonDirectories();
      const result = await window.electronAPI.getCurrentDirectory();
      if (result.success) {
        this.updateDirectory(result);
      } else {
        this.showError('Failed to load current directory');
      }
    } catch (error) {
      console.error('Failed to load initial directory:', error);
      this.showError('Failed to initialize file browser');
    } finally {
      this.showLoading(false);
    }
  }

  async loadCommonDirectories() {
    try {
      const result = await window.electronAPI.getCommonDirectories();
      if (result.success) {
        this.commonDirectories = result.directories;
        this.renderQuickAccess();
      }
    } catch (error) {
      console.error('Failed to load common directories:', error);
    }
  }

  async navigateToDirectory(path) {
    // Clear search input when navigating to any directory
    this.clearSearchInput();

    try {
      this.showLoading(true);
      this.setStatus('Navigating...');
      const result = await window.electronAPI.navigateToDirectory(path);
      if (result.success) {
        this.updateDirectory(result);
        this.setStatus('Ready');
      } else {
        this.showError(result.error || 'Failed to navigate to directory');
      }
    } catch (error) {
      console.error('Navigation error:', error);
      this.showError('Failed to navigate to directory');
    } finally {
      this.showLoading(false);
    }
  }

  async navigateBack() {
    // Clear search input when navigating back
    this.clearSearchInput();

    try {
      this.showLoading(true);
      const result = await window.electronAPI.navigateBack();
      if (result.success) {
        this.updateDirectory(result);
      } else {
        this.showError(result.error || 'Cannot go back');
      }
    } catch (error) {
      console.error('Navigate back error:', error);
      this.showError('Failed to go back');
    } finally {
      this.showLoading(false);
    }
  }

  async navigateForward() {
    // Clear search input when navigating forward
    this.clearSearchInput();

    try {
      this.showLoading(true);
      const result = await window.electronAPI.navigateForward();
      if (result.success) {
        this.updateDirectory(result);
      } else {
        this.showError(result.error || 'Cannot go forward');
      }
    } catch (error) {
      console.error('Navigate forward error:', error);
      this.showError('Failed to go forward');
    } finally {
      this.showLoading(false);
    }
  }

  async navigateUp() {
    // Clear search input when navigating up
    this.clearSearchInput();

    try {
      this.showLoading(true);
      const result = await window.electronAPI.navigateUp();
      if (result.success) {
        this.updateDirectory(result);
      } else {
        this.showError(result.error || 'Cannot go up');
      }
    } catch (error) {
      console.error('Navigate up error:', error);
      this.showError('Failed to go up');
    } finally {
      this.showLoading(false);
    }
  }

  async navigateHome() {
    try {
      const homeResult = await window.electronAPI.getHomeDirectory();
      if (homeResult.success) {
        await this.navigateToDirectory(homeResult.path);
      }
    } catch (error) {
      console.error('Navigate home error:', error);
      this.showError('Failed to navigate to home directory');
    }
  }

  async refreshDirectory() {
    if (this.currentDirectory) {
      await this.navigateToDirectory(this.currentDirectory);
    }
  }

  updateDirectory(result) {
    this.currentDirectory = result.path;
    this.directoryContents = result.contents || [];
    this.canGoBack = result.canGoBack || false;
    this.canGoForward = result.canGoForward || false;

    this.updateNavigationButtons();
    this.updateBreadcrumb();
    this.updateCurrentWorkingDirectory();
    this.filterContents();
  }

  updateNavigationButtons() {
    if (this.backBtn) {
      this.backBtn.disabled = !this.canGoBack;
    }
    if (this.forwardBtn) {
      this.forwardBtn.disabled = !this.canGoForward;
    }
  }

  updateBreadcrumb() {
    if (!this.breadcrumb || !this.currentDirectory) return;

    const pathParts = this.currentDirectory.split('/').filter(part => part);
    const breadcrumbHTML = pathParts.map((part, index) => {
      const fullPath = '/' + pathParts.slice(0, index + 1).join('/');
      const isLast = index === pathParts.length - 1;

      if (isLast) {
        return `<span class="breadcrumb-segment current">${part}</span>`;
      } else {
        return `<span class="breadcrumb-segment" onclick="fileBrowser.navigateToDirectory('${fullPath}')">${part}</span>`;
      }
    }).join('<span class="breadcrumb-separator">/</span>');

    this.breadcrumb.innerHTML = `
      <span class="breadcrumb-segment" onclick="fileBrowser.navigateToDirectory('/')">
        <span class="breadcrumb-icon">💾</span>
      </span>
      ${pathParts.length > 0 ? '<span class="breadcrumb-separator">/</span>' + breadcrumbHTML : ''}
    `;

    // Ensure the breadcrumb view is scrolled to the far right so the current folder is visible
    const container = this.breadcrumb.closest('.breadcrumb-container');
    if (container) {
      // Use requestAnimationFrame to guarantee DOM has rendered before scrolling
      requestAnimationFrame(() => {
        container.scrollLeft = container.scrollWidth;
      });
    }
  }

  updateCurrentWorkingDirectory() {
    if (this.cwdPath && this.currentDirectory) {
      const displayPath = this.currentDirectory.startsWith(this.homeDirectory)
        ? '~' + this.currentDirectory.slice(this.homeDirectory.length)
        : this.currentDirectory;
      this.cwdPath.textContent = displayPath;
    }
  }

  filterContents() {
    if (this.fileSearchQuery) {
      this.filteredContents = this.directoryContents.filter(item =>
        item.name.toLowerCase().includes(this.fileSearchQuery)
      );
    } else {
      this.filteredContents = [...this.directoryContents];
    }

    this.renderFileList();
    this.updateFileCount();
  }

  renderFileList() {
    if (!this.fileList) return;

    if (this.filteredContents.length === 0) {
      this.fileList.innerHTML = `
        <div class="empty-directory">
          <div class="empty-icon codicon codicon-folder"></div>
          <div class="empty-message">
            ${this.fileSearchQuery ? 'No files match your search' : 'This directory is empty'}
          </div>
        </div>
      `;
      return;
    }

    const fileListHTML = this.filteredContents.map(item => {
      const icon = item.isDirectory ? this.getFileIcon('folder') : this.getFileIcon(item.name);

      return `
        <div class="file-item ${item.isDirectory ? 'directory' : 'file'}"
             onclick="fileBrowser.handleFileClick('${item.path}', ${item.isDirectory})"
             title="${item.path}">
          <span class="file-icon codicon ${icon}"></span>
          <div class="file-info">
            <div class="file-name">${DOMUtils.escapeHTML(item.name)}</div>
          </div>
        </div>
      `;
    }).join('');

    this.fileList.innerHTML = fileListHTML;
  }

  renderQuickAccess() {
    if (!this.quickAccessList) return;

    const quickAccessHTML = this.commonDirectories.map(dir => `
      <div class="quick-access-item" onclick="fileBrowser.navigateToDirectory('${dir.path}')">
        <span class="quick-access-icon">${dir.icon}</span>
        <span class="quick-access-name">${dir.name}</span>
      </div>
    `).join('');

    this.quickAccessList.innerHTML = quickAccessHTML;
  }

  toggleQuickAccess() {
    this.isQuickAccessCollapsed = !this.isQuickAccessCollapsed;

    if (this.quickAccessList) {
      this.quickAccessList.style.display = this.isQuickAccessCollapsed ? 'none' : 'flex';
    }

    if (this.quickAccessToggle) {
      this.quickAccessToggle.classList.toggle('collapsed', this.isQuickAccessCollapsed);
    }
  }

  updateFileCount() {
    if (this.fileCount) {
      const total = this.directoryContents.length;
      const filtered = this.filteredContents.length;
      const dirs = this.filteredContents.filter(item => item.isDirectory).length;
      const files = filtered - dirs;

      if (this.fileSearchQuery && filtered !== total) {
        this.fileCount.textContent = `${filtered} of ${total} items (${dirs} folders, ${files} files)`;
      } else {
        this.fileCount.textContent = `${total} items (${dirs} folders, ${files} files)`;
      }
    }
  }



  getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();

    // Special handling for folders
    if (filename === 'folder') {
      return 'codicon-folder';
    }

    // Codicon mapping for file extensions
    const iconMap = {
      // JavaScript/TypeScript
      'js':               'codicon-symbol-variable',
      'jsx':              'codicon-symbol-variable',
      'ts':               'codicon-symbol-variable',
      'tsx':              'codicon-symbol-variable',
      'mjs':              'codicon-symbol-variable',

      // Web technologies
      'html':             'codicon-html',
      'htm':              'codicon-html',
      'css':              'codicon-symbol-color',
      'scss':             'codicon-symbol-color',
      'sass':             'codicon-symbol-color',
      'less':             'codicon-symbol-color',

      // Data formats
      'json':             'codicon-json',
      'xml':              'codicon-symbol-structure',
      'yaml':             'codicon-symbol-structure',
      'yml':              'codicon-symbol-structure',
      'toml':             'codicon-symbol-structure',
      'csv':              'codicon-graph',

      // Documentation
      'md':               'codicon-markdown',
      'markdown':         'codicon-markdown',
      'txt':              'codicon-file-text',
      'rtf':              'codicon-file-text',
      'doc':              'codicon-file-text',
      'docx':             'codicon-file-text',

      // Programming languages
      'py':               'codicon-symbol-method',
      'pyw':              'codicon-symbol-method',
      'java':             'codicon-symbol-class',
      'c':                'codicon-symbol-structure',
      'cpp':              'codicon-symbol-structure',
      'cc':               'codicon-symbol-structure',
      'h':                'codicon-symbol-structure',
      'hpp':              'codicon-symbol-structure',
      'cs':               'codicon-symbol-class',
      'php':              'codicon-symbol-method',
      'rb':               'codicon-ruby',
      'go':               'codicon-symbol-method',
      'rs':               'codicon-symbol-structure',
      'swift':            'codicon-symbol-class',
      'kt':               'codicon-symbol-class',
      'scala':            'codicon-symbol-class',

      // Shell scripts
      'sh':               'codicon-terminal',
      'bash':             'codicon-terminal',
      'zsh':              'codicon-terminal',
      'fish':             'codicon-terminal',
      'ps1':              'codicon-terminal-powershell',
      'bat':              'codicon-terminal-cmd',
      'cmd':              'codicon-terminal-cmd',

      // Configuration files
      'conf':             'codicon-settings-gear',
      'config':           'codicon-settings-gear',
      'ini':              'codicon-settings-gear',
      'cfg':              'codicon-settings-gear',
      'env':              'codicon-symbol-key',
      'gitignore':        'codicon-symbol-misc',
      'gitattributes':    'codicon-symbol-misc',
      'editorconfig':     'codicon-symbol-misc',
      'dockerfile':       'codicon-symbol-misc',

      // Images
      'png':              'codicon-file-media',
      'jpg':              'codicon-file-media',
      'jpeg':             'codicon-file-media',
      'gif':              'codicon-file-media',
      'bmp':              'codicon-file-media',
      'tiff':             'codicon-file-media',
      'webp':             'codicon-file-media',
      'ico':              'codicon-file-media',
      'svg':              'codicon-symbol-color',

      // Audio/Video
      'mp3':              'codicon-unmute',
      'wav':              'codicon-unmute',
      'flac':             'codicon-unmute',
      'aac':              'codicon-unmute',
      'mp4':              'codicon-device-camera-video',
      'avi':              'codicon-device-camera-video',
      'mov':              'codicon-device-camera-video',
      'mkv':              'codicon-device-camera-video',
      'webm':             'codicon-device-camera-video',

      // Archives
      'zip':              'codicon-file-zip',
      'tar':              'codicon-file-zip',
      'gz':               'codicon-file-zip',
      'bz2':              'codicon-file-zip',
      'xz':               'codicon-file-zip',
      '7z':               'codicon-file-zip',
      'rar':              'codicon-file-zip',

      // Documents
      'pdf':              'codicon-file-pdf',
      'epub':             'codicon-book',
      'mobi':             'codicon-book',

      // Fonts
      'ttf':              'codicon-symbol-text',
      'otf':              'codicon-symbol-text',
      'woff':             'codicon-symbol-text',
      'woff2':            'codicon-symbol-text',
      'eot':              'codicon-symbol-text',

      // Database
      'sql':              'codicon-database',
      'db':               'codicon-database',
      'sqlite':           'codicon-database',
      'sqlite3':          'codicon-database',

      // Binary/Executable
      'exe':              'codicon-symbol-misc',
      'msi':              'codicon-symbol-misc',
      'deb':              'codicon-symbol-misc',
      'rpm':              'codicon-symbol-misc',
      'dmg':              'codicon-symbol-misc',
      'pkg':              'codicon-symbol-misc',
      'app':              'codicon-symbol-misc'
    };

    return iconMap[ext] || 'codicon-file';
  }

  showLoading(show) {
    if (this.loadingState) {
      this.loadingState.style.display = show ? 'flex' : 'none';
    }
    if (this.fileList && show) {
      this.fileList.style.display = 'none';
    } else if (this.fileList && !show) {
      this.fileList.style.display = 'block';
    }
  }

  setStatus(message) {
    if (this.statusText) {
      this.statusText.textContent = message;
    }
  }

  showError(message) {
    this.setStatus(`Error: ${message}`);
    console.error('File browser error:', message);
  }

  // Get current directory for external use
  getCurrentDirectory() {
    return this.currentDirectory;
  }

  // Get filtered contents for file mentions
  getFilteredContents() {
    return this.filteredContents;
  }

  // Search files by prefix for mention autocompletion
  searchFilesByPrefix(query, maxResults = 8) {
    if (!query || !this.directoryContents) {
      return [];
    }

    const queryLower = query.toLowerCase();

    // Filter files that start with the query (case-insensitive)
    const matches = this.directoryContents
      .filter(item => item.name.toLowerCase().startsWith(queryLower))
      .sort((a, b) => {
        // Sort directories first, then by name alphabetically
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      })
      .slice(0, maxResults)
      .map(item => ({
        name: item.name,
        path: item.path,
        isDirectory: item.isDirectory,
        icon: item.isDirectory ? this.getFileIcon('folder') : this.getFileIcon(item.name)
      }));

    return matches;
  }

  /* -------------------------- Search Methods ------------------------- */

  selectTopSearchResult() {
    if (!this.filteredContents || this.filteredContents.length === 0) {
      return;
    }

    // Get the first item from filtered results
    const topResult = this.filteredContents[0];

    // Select it using the existing handleFileClick method
    this.handleFileClick(topResult.path, topResult.isDirectory);
  }

  clearSearchInput() {
    if (this.fileSearchInput) {
      this.fileSearchInput.value = '';
      this.fileSearchQuery = '';
      this.filterContents();
      this.updateClearButton();
    }
  }

  /* -------------------------- Clear Button Methods ------------------------- */

  addClearButton() {
    if (!this.fileSearchInput) return;

    // Create wrapper if it doesn't exist
    let wrapper = this.fileSearchInput.parentElement;
    if (!wrapper.classList.contains('search-input-wrapper')) {
      wrapper = document.createElement('div');
      wrapper.className = 'search-input-wrapper';
      this.fileSearchInput.parentNode.insertBefore(wrapper, this.fileSearchInput);
      wrapper.appendChild(this.fileSearchInput);
    }

    // Create clear button
    this.clearButton = document.createElement('button');
    this.clearButton.className = 'search-clear-btn';
    this.clearButton.innerHTML = '<span class="codicon codicon-close"></span>';
    this.clearButton.style.display = 'none';
    this.clearButton.title = 'Clear search';

    this.clearButton.addEventListener('click', () => {
      this.clearSearchInput();
      this.fileSearchInput.focus();
    });

    wrapper.appendChild(this.clearButton);
  }

  updateClearButton() {
    if (!this.clearButton) return;

    if (this.fileSearchQuery && this.fileSearchQuery.length > 0) {
      this.clearButton.style.display = 'flex';
    } else {
      this.clearButton.style.display = 'none';
    }
  }

  /* -------------------------- Sidebar View Toggle ------------------------- */

  toggleSidebarView() {
    this.setSidebarView(!this.isHistoryView);
  }

  setSidebarView(showHistory) {
    this.isHistoryView = showHistory;

    // Update button label
    if (this.toggleViewBtn) {
      this.toggleViewBtn.textContent = showHistory ? 'File View' : 'History';
    }

    // Show/hide conversation history container
    if (this.conversationHistorySidebar) {
      this.conversationHistorySidebar.style.display = showHistory ? 'flex' : 'none';
    }

    // Show/hide other children of file-browser (except status bar and history container)
    if (this.root) {
      Array.from(this.root.children).forEach(child => {
        if (child.classList.contains('file-browser-status') || child.id === 'conversationHistorySidebar') {
          return; // Always keep visible
        }
        child.style.display = showHistory ? 'none' : '';
      });
    }

    // Ensure conversation list is up to date when entering history view
    if (showHistory) {
      window.sessionManager?.renderSessions();
    }
  }

  /**
   * Hide or show the entire sidebar container.
   * When hidden, only the top-left toggle button remains visible so the user
   * can bring the sidebar back.
   */
  toggleSidebarVisibility() {
    if (!this.sidebarContainer) return;

    const isHidden = this.sidebarContainer.classList.toggle('hidden');

    // Update tooltip text
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.title = isHidden ? 'Show File Explorer' : 'Hide File Explorer';
    }

    // Update global header button states
    if (window.globalHeader) {
      window.globalHeader.updateButtonStates();
    }
  }

  // Handle directory change from session switching
  handleDirectoryChange(directoryResult) {
    if (directoryResult && directoryResult.success) {
      console.log('File browser updating to new directory:', directoryResult.path);

      // Update the file browser with the new directory
      this.updateDirectory(directoryResult);

      // Clear any existing search
      this.clearSearchInput();

      // Refresh the display
      this.setStatus('Directory changed to: ' + this.getDisplayPath(directoryResult.path));
    } else {
      console.warn('Failed to update file browser directory:', directoryResult?.error);
    }
  }

  // Helper to get display path (consistent with session manager)
  getDisplayPath(path) {
    if (!path) return '';

    // Replace home directory with ~ for display
    if (this.homeDirectory && path.startsWith(this.homeDirectory)) {
      return '~' + path.slice(this.homeDirectory.length);
    }

    return path;
  }



    handleFileClick(path, isDirectory) {
    // Clear search input when a file/folder is selected
    this.clearSearchInput();

    if (isDirectory) {
      this.navigateToDirectory(path);
    } else {
      // Open file in the editor
      console.log('File clicked:', path);

      // Get the file editor component and open the file
      const fileEditor = window.app?.getComponent('fileEditor');
      if (fileEditor) {
        fileEditor.openFile(path);
      } else {
        console.error('File editor component not available');
      }
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileBrowser;
} else {
  window.FileBrowser = FileBrowser;
}