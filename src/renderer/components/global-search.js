// Global Search Component
class GlobalSearch {
  constructor() {
    console.log('GlobalSearch: Constructor called');
    this.currentDirectory = null;
    this.directoryContents = [];
    this.filteredContents = [];
    this.searchQuery = '';
    this.isOpen = false;

    // Progressive search state
    this.globalSearchResults = [];
    this.isGlobalSearching = false;
    this.searchDebounceTimer = null;
    this.lastGlobalSearchQuery = '';

    // Keyboard navigation state
    this.searchSelectionIndex = -1;

    // Quick select workspaces
    this.quickSelectWorkspaces = [];
    this.isLoadingWorkspaces = false;

    this.initializeElements();
    this.setupEventListeners();
    this.bindKeyboardEvents();

    // Listen for directory changes from file browser
    document.addEventListener('directoryChanged', (event) => {
      this.handleDirectoryChange(event.detail);
    });

    console.log('GlobalSearch: Initialization complete');
  }

  initializeElements() {
    console.log('GlobalSearch: Initializing elements...');
    // Modal elements
    this.modal = document.getElementById('globalSearchModal');
    this.searchInput = document.getElementById('globalSearchInput');
    this.closeBtn = document.getElementById('globalSearchClose');
    this.resultsContainer = document.getElementById('globalSearchResults');
    this.emptyState = document.getElementById('globalSearchEmpty');

    console.log('GlobalSearch elements found:', {
      modal: !!this.modal,
      searchInput: !!this.searchInput,
      closeBtn: !!this.closeBtn,
      resultsContainer: !!this.resultsContainer,
      emptyState: !!this.emptyState
    });
  }

  setupEventListeners() {
    // Close button
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    // Click outside to close
    if (this.modal) {
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.close();
        }
      });
    }

    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.toLowerCase();
        this.performSearch();
      });

      // Keyboard navigation
      this.searchInput.addEventListener('keydown', (e) => {
        switch (e.key) {
          case 'Escape':
            e.preventDefault();
            this.close();
            break;
          case 'Enter':
            e.preventDefault();
            this.activateSelection();
            break;
          case 'ArrowDown':
            e.preventDefault();
            this.moveSelection(1);
            break;
          case 'ArrowUp':
            e.preventDefault();
            this.moveSelection(-1);
            break;
          default:
            break;
        }
      });
    }

    // Results container click delegation
    if (this.resultsContainer) {
      this.resultsContainer.addEventListener('click', (e) => this.handleResultClick(e));
    }
  }

  bindKeyboardEvents() {
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Cmd/Ctrl + K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !this.isOpen) {
        e.preventDefault();
        this.open();
      }
    });
  }

  // Open the global search modal
  async open() {
    console.log('GlobalSearch.open() called');
    if (this.isOpen) return;

    this.isOpen = true;

    // Get current directory from file browser
    if (window.fileBrowser) {
      this.currentDirectory = window.fileBrowser.getCurrentDirectory();
      this.directoryContents = window.fileBrowser.getFilteredContents() || [];
      console.log('Current directory:', this.currentDirectory);
    }

    // Show modal
    if (this.modal) {
      console.log('Showing modal');
      this.modal.style.display = 'flex';
      this.modal.style.zIndex = '1000'; // Temporary high z-index for debugging
      document.body.style.overflow = 'hidden'; // Prevent background scrolling

      // Debug: Log computed styles
      setTimeout(() => {
        const computedStyle = window.getComputedStyle(this.modal);
        console.log('Modal computed styles:', {
          display: computedStyle.display,
          position: computedStyle.position,
          zIndex: computedStyle.zIndex,
          top: computedStyle.top,
          left: computedStyle.left,
          width: computedStyle.width,
          height: computedStyle.height,
          opacity: computedStyle.opacity,
          visibility: computedStyle.visibility
        });
      }, 100);
    } else {
      console.error('Modal element not found!');
    }

    // Focus search input
    if (this.searchInput) {
      console.log('Focusing search input');
      this.searchInput.focus();
      this.searchInput.select(); // Select any existing text
    } else {
      console.error('Search input element not found!');
    }

    // Reset search state
    this.searchQuery = '';
    this.globalSearchResults = [];
    this.searchSelectionIndex = -1;

    // Load quick select workspaces
    await this.loadQuickSelectWorkspaces();

    this.renderResults();
  }

  // Close the global search modal
  close() {
    if (!this.isOpen) return;

    this.isOpen = false;

    if (this.modal) {
      this.modal.style.display = 'none';
      document.body.style.overflow = ''; // Restore scrolling
    }

    // Clear search
    this.clearSearch();

    // Clear any pending search timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
  }

  // Toggle modal open/close
  toggle() {
    console.log('GlobalSearch.toggle() called, isOpen:', this.isOpen);
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  // Clear search input and results
  clearSearch() {
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    this.searchQuery = '';
    this.globalSearchResults = [];
    this.filteredContents = [];
    this.lastGlobalSearchQuery = '';
    this.searchSelectionIndex = -1;
    this.renderResults();
  }

  // Perform search with same logic as file browser
  async performSearch() {
    if (!this.searchQuery) {
      // No search query - show empty state
      this.filteredContents = [];
      this.globalSearchResults = [];
      this.searchSelectionIndex = -1;
      this.renderResults();
      return;
    }

    // First, perform local search in current directory
    const localResults = this.directoryContents.filter(item =>
      item.name.toLowerCase().includes(this.searchQuery)
    );

    this.filteredContents = [...localResults];

    // If no local results found, trigger progressive global search
    if (localResults.length === 0 && this.searchQuery.length >= 2) {
      this.triggerGlobalSearch(this.searchQuery);
    } else {
      // Clear global results if we have local results or query is too short
      this.globalSearchResults = [];
    }

    // Reset keyboard selection whenever the result set changes
    this.searchSelectionIndex = -1;

    this.renderResults();
  }

  // Progressive global search with debouncing (same as file browser)
  triggerGlobalSearch(query) {
    // Clear previous timer
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }

    // Don't search if query hasn't changed
    if (query === this.lastGlobalSearchQuery) {
      return;
    }

    // Debounce the search to avoid excessive API calls
    this.searchDebounceTimer = setTimeout(async () => {
      await this.performGlobalSearch(query);
    }, 300); // 300ms debounce
  }

  // Perform the actual global search
  async performGlobalSearch(query) {
    if (this.isGlobalSearching || !query || query.length < 2) {
      return;
    }

    this.isGlobalSearching = true;
    this.lastGlobalSearchQuery = query;

    // Show loading state
    this.showLoading(true);

    try {
      const result = await window.electronAPI.searchFilesByPrefix(query, 20);

      if (result.success && result.results) {
        // Filter out files that are already in the current directory
        const currentDirFiles = new Set(this.directoryContents.map(item => item.path));
        this.globalSearchResults = result.results.filter(item =>
          !currentDirFiles.has(item.path)
        );

        // Re-render if the search query is still current
        if (query === this.searchQuery) {
          this.renderResults();
        }
      } else {
        console.warn('Global search failed:', result.error);
      }
    } catch (error) {
      console.error('Global search error:', error);
    } finally {
      this.isGlobalSearching = false;
      this.showLoading(false);
    }
  }

  // Show loading state
  showLoading(show) {
    if (show) {
      this.renderLoadingState();
    }
    // Loading state is cleared by renderResults()
  }

  // Render search results
  renderResults() {
    if (!this.resultsContainer) return;

    const hasLocalResults = this.filteredContents.length > 0;
    const hasGlobalResults = this.globalSearchResults.length > 0;
    const isSearching = this.searchQuery.length > 0;

    // Handle empty state - show quick select workspaces if no search query
    if (!hasLocalResults && !hasGlobalResults) {
      if (!isSearching) {
        // Show quick select workspaces instead of default empty state
        this.renderQuickSelectState();
        return;
      } else if (this.isGlobalSearching) {
        // Show loading state
        this.renderLoadingState();
        return;
      } else {
        // Show no results state
        this.renderNoResultsState();
        return;
      }
    }

    let resultsHTML = '';

    // Render local results first
    if (hasLocalResults) {
      resultsHTML += this.renderItems(this.filteredContents, false);
    }

    // Add separator if we have both local and global results
    if (hasLocalResults && hasGlobalResults) {
      resultsHTML += `
        <div class="global-search-separator">
          <div class="separator-line"></div>
          <div class="separator-text">Found in project</div>
          <div class="separator-line"></div>
        </div>
      `;
    }

    // Render global results
    if (hasGlobalResults) {
      resultsHTML += this.renderItems(this.globalSearchResults, true);
    }

    this.resultsContainer.innerHTML = resultsHTML;

    // Re-apply keyboard selection highlight (if any)
    this.applyKeyboardSelection();
  }

  // Render individual items
  renderItems(items, isGlobal) {
    return items.map(item => {
      const icon = item.isDirectory ? this.getFileIcon('folder') : this.getFileIcon(item.name);
      const relativePath = isGlobal ? (item.relativePath || item.path) : this.getRelativePath(item.path);

      return `
        <div class="global-search-item ${item.isDirectory ? 'directory' : 'file'} ${isGlobal ? 'global-result' : ''}"
             data-file-path="${this.escapeHTML(item.path)}"
             data-is-global="${isGlobal}">
          <span class="global-search-item-icon codicon ${icon}"></span>
          <div class="global-search-item-info">
            <div class="global-search-item-name">${this.escapeHTML(item.name)}</div>
            <div class="global-search-item-path">${this.escapeHTML(relativePath)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Get file icon (same logic as file browser)
  getFileIcon(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();

    // Special handling for folders
    if (filename === 'folder') {
      return 'codicon-folder';
    }

    // Icon mapping (simplified version)
    const iconMap = {
      'js': 'codicon-symbol-variable',
      'jsx': 'codicon-symbol-variable',
      'ts': 'codicon-symbol-variable',
      'tsx': 'codicon-symbol-variable',
      'html': 'codicon-html',
      'css': 'codicon-symbol-color',
      'json': 'codicon-json',
      'md': 'codicon-markdown',
      'py': 'codicon-symbol-method',
      'txt': 'codicon-file-text',
      'png': 'codicon-file-media',
      'jpg': 'codicon-file-media',
      'pdf': 'codicon-file-pdf'
    };

    return iconMap[ext] || 'codicon-file';
  }

  // Get relative path for display
  getRelativePath(path) {
    if (!this.currentDirectory || !path) return path;

    if (path.startsWith(this.currentDirectory)) {
      const relativePath = path.slice(this.currentDirectory.length);
      return relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    }

    return path;
  }

  // Handle result click
  handleResultClick(event) {
    const resultItem = event.target.closest('.global-search-item');
    if (!resultItem) return;

    const filePath = resultItem.dataset.filePath;
    const isDirectory = resultItem.classList.contains('directory');
    const isGlobal = resultItem.dataset.isGlobal === 'true';
    const isQuickSelect = resultItem.classList.contains('quick-select-item');

    if (!filePath) return;

    // Close the modal
    this.close();

    // Handle the file/directory opening
    if (isDirectory || isQuickSelect) {
      if (window.fileBrowser) {
        window.fileBrowser.navigateToDirectory(filePath);
      }
    } else {
      const fileEditor = window.app?.getComponent('fileEditor');
      if (fileEditor) {
        fileEditor.openFile(filePath);
      }
    }
  }

  // Keyboard navigation methods
  moveSelection(direction) {
    // When no search query, navigate through quick select items
    if (!this.searchQuery) {
      const totalResults = this.quickSelectWorkspaces.length;
      if (totalResults === 0) return;

      if (this.searchSelectionIndex === -1) {
        this.searchSelectionIndex = direction > 0 ? 0 : totalResults - 1;
      } else {
        this.searchSelectionIndex = (this.searchSelectionIndex + direction + totalResults) % totalResults;
      }
    } else {
      // Normal search results navigation
      const totalResults = this.filteredContents.length + this.globalSearchResults.length;
      if (totalResults === 0) return;

      if (this.searchSelectionIndex === -1) {
        this.searchSelectionIndex = direction > 0 ? 0 : totalResults - 1;
      } else {
        this.searchSelectionIndex = (this.searchSelectionIndex + direction + totalResults) % totalResults;
      }
    }

    this.applyKeyboardSelection();
  }

  applyKeyboardSelection() {
    if (!this.resultsContainer) return;

    const items = Array.from(this.resultsContainer.querySelectorAll('.global-search-item'));
    items.forEach((el, idx) => {
      if (idx === this.searchSelectionIndex) {
        el.classList.add('keyboard-selected');
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('keyboard-selected');
      }
    });
  }

  activateSelection() {
    // Handle quick select activation when no search query
    if (!this.searchQuery) {
      if (this.quickSelectWorkspaces.length === 0) return;

      let targetIndex = this.searchSelectionIndex;
      if (targetIndex === -1) {
        targetIndex = 0;
      }

      const workspace = this.quickSelectWorkspaces[targetIndex];
      if (!workspace) return;

      this.close();

      if (window.fileBrowser) {
        window.fileBrowser.navigateToDirectory(workspace.path);
      }
    } else {
      // Normal search results activation
      const combined = [...this.filteredContents, ...this.globalSearchResults];
      if (combined.length === 0) return;

      let targetIndex = this.searchSelectionIndex;
      if (targetIndex === -1) {
        targetIndex = 0;
      }

      const item = combined[targetIndex];
      if (!item) return;

      this.close();

      if (item.isDirectory) {
        if (window.fileBrowser) {
          window.fileBrowser.navigateToDirectory(item.path);
        }
      } else {
        const fileEditor = window.app?.getComponent('fileEditor');
        if (fileEditor) {
          fileEditor.openFile(item.path);
        }
      }
    }
  }

  renderQuickSelectState() {
    if (this.isLoadingWorkspaces) {
      this.resultsContainer.innerHTML = `
        <div class="global-search-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">Loading workspaces...</div>
        </div>
      `;
      return;
    }

    if (this.quickSelectWorkspaces.length === 0) {
      // Fallback to original empty state if no workspaces available
      this.resultsContainer.innerHTML = `
        <div class="global-search-empty">
          <div class="empty-icon">🔍</div>
          <div class="empty-message">Type to search for files and folders</div>
        </div>
      `;
      return;
    }

    // Render quick select header
    let quickSelectHTML = `
      <div class="quick-select-header">
        <div class="quick-select-title">Recent Workspaces</div>
        <div class="quick-select-subtitle">Choose a workspace to navigate to</div>
      </div>
    `;

    // Render quick select items
    quickSelectHTML += this.quickSelectWorkspaces.map(workspace => `
      <div class="global-search-item quick-select-item directory"
           data-file-path="${this.escapeHTML(workspace.path)}">
        <span class="global-search-item-icon codicon ${workspace.icon}"></span>
        <div class="global-search-item-info">
          <div class="global-search-item-name">${this.escapeHTML(workspace.name)}</div>
          <div class="global-search-item-path">${this.escapeHTML(workspace.path)}</div>
        </div>
        <div class="quick-select-app-badge">
          <span class="app-badge-icon">${workspace.appIcon || '📁'}</span>
          <span class="app-badge-text">${this.escapeHTML(workspace.appDisplayName || workspace.app || '')}</span>
        </div>
      </div>
    `).join('');

    this.resultsContainer.innerHTML = quickSelectHTML;

    // Re-apply keyboard selection highlight (if any)
    this.applyKeyboardSelection();
  }

  renderEmptyState() {
    this.resultsContainer.innerHTML = `
      <div class="global-search-empty">
        <div class="empty-icon">🔍</div>
        <div class="empty-message">Type to search for files and folders</div>
      </div>
    `;
  }

  renderLoadingState() {
    this.resultsContainer.innerHTML = `
      <div class="global-search-loading">
        <div class="loading-spinner"></div>
        <div class="loading-text">Searching project files...</div>
      </div>
    `;
  }

  renderNoResultsState() {
    this.resultsContainer.innerHTML = `
      <div class="global-search-no-results">
        <div class="empty-icon">🔍</div>
        <div class="empty-message">No files match "${this.searchQuery}"</div>
      </div>
    `;
  }

  handleDirectoryChange(directoryResult) {
    if (directoryResult && directoryResult.success) {
      this.currentDirectory = directoryResult.path;
      if (this.isOpen && window.fileBrowser) {
        this.directoryContents = window.fileBrowser.getFilteredContents() || [];
        if (this.searchQuery) {
          this.performSearch();
        }
      }
    }
  }

  // Utility method to escape HTML
  escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Load workspace folders for quick selection
  async loadQuickSelectWorkspaces() {
    if (this.isLoadingWorkspaces) return;

    this.isLoadingWorkspaces = true;

    try {
      // Get workspace data from main process (same data used by tray menu)
      if (window.electronAPI && window.electronAPI.getOpenApplicationWindows) {
        const result = await window.electronAPI.getOpenApplicationWindows();

        if (result.success && Array.isArray(result.files)) {
          // Filter for workspaces and directories, similar to tray menu logic
          const workspaces = result.files.filter(f => f.isWorkspace || f.isDirectory);

          // Deduplicate by path and limit to reasonable number
          const seenPaths = new Set();
          this.quickSelectWorkspaces = workspaces
            .filter(ws => {
              const workspacePath = ws.workspaceDirectory || ws.path || ws.directory;
              if (!workspacePath || seenPaths.has(workspacePath)) return false;
              seenPaths.add(workspacePath);
              return true;
            })
            .slice(0, 8) // Limit to 8 items for UI
            .map(ws => {
              const workspacePath = ws.workspaceDirectory || ws.path || ws.directory;
              const workspaceName = ws.workspaceName || ws.name || (workspacePath ? workspacePath.split('/').pop() || workspacePath.split('\\').pop() : '');
              return {
                name: workspaceName,
                path: workspacePath,
                app: ws.app,
                appDisplayName: ws.appDisplayName,
                appIcon: ws.appIcon,
                icon: 'codicon-folder',
                isDirectory: true,
                isWorkspace: true
              };
            });

          console.log(`Loaded ${this.quickSelectWorkspaces.length} quick select workspaces`);
        }
      }
    } catch (error) {
      console.error('Error loading quick select workspaces:', error);
      this.quickSelectWorkspaces = [];
    } finally {
      this.isLoadingWorkspaces = false;
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GlobalSearch;
} else {
  window.GlobalSearch = GlobalSearch;
}