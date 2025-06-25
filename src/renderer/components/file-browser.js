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

    // Window detection state
    this.openApplicationWindows = [];
    this.windowDetectionEnabled = true;
    this.windowDetectionLastUpdate = null;
    // Note: Automatic refresh removed - detection now triggered manually

    // Folder expansion state management
    this.expandedFolders = new Set(); // Set of expanded folder paths
    this.expandedFolderContents = new Map(); // Map of folder path to its contents

    // Progressive search state
    this.globalSearchResults = [];
    this.isGlobalSearching = false;
    this.searchDebounceTimer = null;
    this.lastGlobalSearchQuery = '';

    // Keyboard navigation state for search results
    this.searchSelectionIndex = -1;

    // Tooltip state
    this.tooltip = null;
    this.tooltipTimeout = null;

    // Root element of file browser for easy child toggling
    this.root = document.querySelector('.file-browser');

    // Reference to the containing sidebar so we can show/hide it
    this.sidebarContainer = document.querySelector('.sidebar');

    // Sidebar toggle button located in the global header
    this.sidebarToggleBtn = document.getElementById('globalSidebarToggleBtn');

    // Sidebar resizer for dynamic width adjustment
    this.sidebarResizer = null;
    this.currentIndentationPx = 20; // Default indentation per level

    // Workspace context state
    this.currentWorkspace = null;
    this.workspaceFolders = [];
    this.isWorkspaceActive = false;

    this.initializeElements();
    this.setupEventListeners();
    this.applyInitialQuickAccessState();
    this.loadInitialDirectory();
    this.loadOpenApplicationWindows();
    this.initializeSidebarResizer();

    // Listen for directory changes from session switching
    document.addEventListener('directoryChanged', (event) => {
      this.handleDirectoryChange(event.detail);
    });

    // Listen for tray events that should trigger window detection refresh
    if (window.electronAPI?.onTrayInteraction) {
      window.electronAPI.onTrayInteraction(() => {
        if (this.windowDetectionEnabled) {
          console.log('Tray interaction detected - refreshing window detection');
          this.refreshWindowDetection();
        }
      });
    }

    // Listen for tray workspace open event (sent from main process)
    if (window.electronAPI?.onTrayOpenWorkspace) {
      window.electronAPI.onTrayOpenWorkspace(async (event, workspacePath) => {
        if (workspacePath && typeof workspacePath === 'string') {
          console.log('Tray requested open workspace:', workspacePath);
          await this.navigateToDirectory(workspacePath);

          try {
            const title = workspacePath.split('/').pop() || 'New Conversation';
            const newSession = await window.electronAPI.createSession(title);
            if (newSession && window.sessionManager?.selectSession) {
              await window.sessionManager.selectSession(newSession.id);
            }
          } catch (err) {
            console.warn('Failed to create session for workspace:', err);
          }
        }
      });
    }
  }

  initializeElements() {
    // Navigation elements
    this.backBtn = document.getElementById('backBtn');
    this.forwardBtn = document.getElementById('forwardBtn');
    this.upBtn = document.getElementById('upBtn');
    this.homeBtn = document.getElementById('homeBtn');
    this.newTaskBtn = document.getElementById('newTaskBtn');
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
    if (this.newTaskBtn) {
      this.newTaskBtn.addEventListener('click', () => this.createNewTask());
      const tooltipContent = `Create a new task from a template. <a href="#" onclick="event.stopPropagation(); window.app.getComponent('settings').openSettings('taskTemplate'); return false;">Edit Template</a>`;
      this.newTaskBtn.addEventListener('mouseenter', (e) => {
        this.showTooltip(e.currentTarget, tooltipContent, true);
      });
      this.newTaskBtn.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });
    }
    if (this.refreshBtn) {
      this.refreshBtn.addEventListener('click', () => this.refreshDirectory());
    }

    // File list click delegation
    if (this.fileList) {
      this.fileList.addEventListener('click', (e) => this.handleFileListClick(e));
    }

    // Quick access click delegation
    if (this.quickAccessList) {
      this.quickAccessList.addEventListener('click', (e) => this.handleQuickAccessClick(e));
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
        switch (e.key) {
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
      await this.loadWorkspaceContext();

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

  async loadOpenApplicationWindows() {
    if (!this.windowDetectionEnabled) {
      return;
    }

    try {
      console.log('Loading open application windows...');
      const result = await window.electronAPI.getOpenApplicationWindows();

      if (result.success) {
        this.openApplicationWindows = result.files || [];
        this.windowDetectionLastUpdate = Date.now();
        console.log(`Loaded ${this.openApplicationWindows.length} open files from applications`);

        // Re-render quick access to include new window data
        this.renderQuickAccess();

        // Note: Automatic refresh removed - now only triggered manually
      } else if (result.requiresPermissions) {
        console.warn('Window detection requires accessibility permissions');
        this.handlePermissionRequired();
      } else {
        console.error('Failed to load open application windows:', result.error);
        this.openApplicationWindows = [];
        this.renderQuickAccess();
      }
    } catch (error) {
      console.error('Error loading open application windows:', error);
      this.openApplicationWindows = [];
      this.renderQuickAccess();
    }
  }

  // Manual refresh method for specific triggers
  async refreshWindowDetection() {
    console.log('Manually refreshing window detection...');
    await this.loadOpenApplicationWindows();
  }

  async handlePermissionRequired() {
    // Show a subtle notification about permissions
    this.setStatus('Window detection requires accessibility permissions');

    // Optionally auto-request permissions (user will see system dialog)
    try {
      const permissionResult = await window.electronAPI.requestWindowDetectionPermissions();
      if (permissionResult.granted) {
        console.log('Accessibility permissions granted');
        this.setStatus('Window detection enabled');
        // Retry loading windows
        setTimeout(() => this.loadOpenApplicationWindows(), 1000);
      } else {
        console.log('User needs to manually grant permissions in System Preferences');
        this.setStatus('Open System Preferences > Security & Privacy > Accessibility to enable window detection');
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
    }
  }

  toggleWindowDetection() {
    this.windowDetectionEnabled = !this.windowDetectionEnabled;

    if (this.windowDetectionEnabled) {
      this.loadOpenApplicationWindows();
    } else {
      // Reset data
      this.openApplicationWindows = [];
      this.renderQuickAccess();
    }
  }

  async forceRefreshWindowDetection() {
    // Clear cache and force refresh (used for debugging)
    try {
      await window.electronAPI.clearWindowDetectionCache();
      await this.loadOpenApplicationWindows();
    } catch (error) {
      console.error('Error refreshing window detection:', error);
    }
  }

  // Window Detection Debug Methods
  async enableWindowDetectionDebug() {
    try {
      const result = await window.electronAPI.setWindowDetectionDebug(true);
      console.log('Window detection debug enabled:', result);
      return result;
    } catch (error) {
      console.error('Error enabling window detection debug:', error);
      return { success: false, error: error.message };
    }
  }

  async disableWindowDetectionDebug() {
    try {
      const result = await window.electronAPI.setWindowDetectionDebug(false);
      console.log('Window detection debug disabled:', result);
      return result;
    } catch (error) {
      console.error('Error disabling window detection debug:', error);
      return { success: false, error: error.message };
    }
  }

  async getWindowDetectionDiagnostics() {
    try {
      const result = await window.electronAPI.getWindowDetectionDiagnostics();
      console.log('Window detection diagnostics:', result);
      return result;
    } catch (error) {
      console.error('Error getting window detection diagnostics:', error);
      return { success: false, error: error.message };
    }
  }

  async testAppleScript() {
    try {
      const result = await window.electronAPI.testAppleScript();
      console.log('AppleScript test result:', result);
      return result;
    } catch (error) {
      console.error('Error testing AppleScript:', error);
      return { success: false, error: error.message };
    }
  }

  // Debug helper to log all window detection information
  async debugWindowDetection() {
    console.log('\n=== WINDOW DETECTION DEBUG SESSION ===');

    // Enable debug mode
    console.log('1. Enabling debug mode...');
    await this.enableWindowDetectionDebug();

    // Get diagnostics
    console.log('2. Getting diagnostics...');
    const diagnostics = await this.getWindowDetectionDiagnostics();

    // Test AppleScript
    console.log('3. Testing AppleScript...');
    const appleScriptTest = await this.testAppleScript();

    // Clear cache and reload
    console.log('4. Clearing cache and reloading...');
    await window.electronAPI.clearWindowDetectionCache();
    await this.loadOpenApplicationWindows();

    console.log('=== DEBUG SESSION COMPLETE ===\n');

    return {
      diagnostics,
      appleScriptTest,
      currentOpenFiles: this.openApplicationWindows
    };
  }

  /* -------------------------- Folder Expansion Methods ------------------------- */

  // Toggle folder expansion state
  async toggleFolderExpansion(folderPath) {
    if (this.expandedFolders.has(folderPath)) {
      this.collapseFolder(folderPath);
    } else {
      await this.expandFolder(folderPath);
    }
  }

  // Expand a folder and fetch its contents
  async expandFolder(folderPath) {
    try {
      // Don't expand if already expanded
      if (this.expandedFolders.has(folderPath)) {
        return;
      }

      this.setStatus('Loading folder contents...');

      // Fetch folder contents without changing current directory
      const result = await window.electronAPI.getDirectoryContentsOnly(folderPath);

      if (result.success) {
        this.expandedFolders.add(folderPath);
        this.expandedFolderContents.set(folderPath, result.contents || []);
        this.renderFileList();
        this.updateFileCount();
        this.setStatus('Ready');
      } else {
        this.showError(result.error || 'Failed to load folder contents');
      }
    } catch (error) {
      console.error('Failed to expand folder:', error);
      this.showError('Failed to expand folder');
    }
  }

  // Collapse a folder
  collapseFolder(folderPath) {
    this.expandedFolders.delete(folderPath);
    this.expandedFolderContents.delete(folderPath);

    // Also collapse any nested expanded folders
    for (const expandedPath of this.expandedFolders) {
      if (expandedPath.startsWith(folderPath + '/')) {
        this.expandedFolders.delete(expandedPath);
        this.expandedFolderContents.delete(expandedPath);
      }
    }

    this.renderFileList();
    this.updateFileCount();
  }

  // Check if a folder is expanded
  isFolderExpanded(folderPath) {
    return this.expandedFolders.has(folderPath);
  }

  // Clear all expanded folders (useful when navigating to a new directory)
  clearExpandedFolders() {
    this.expandedFolders.clear();
    this.expandedFolderContents.clear();
  }

  async navigateToDirectory(path) {
    // Clear search input when navigating to any directory
    this.clearSearchInput();

    // Clear expanded folders when navigating to a new directory
    this.clearExpandedFolders();

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

  async createNewTask() {
    try {
      // Get the message input element from the message component
      const messageInput = document.getElementById('messageInput');
      if (!messageInput) {
        console.error('Message input not found');
        return;
      }

      // Get the task template from settings
      let taskTemplate;
      try {
        taskTemplate = await window.electronAPI.getTaskTemplate();
      } catch (error) {
        console.warn('Failed to load custom task template, using default:', error);
        // Fallback to default template
        taskTemplate = 'Create a new folder in the cwd and accomplish the following task into it: \n\n<task>\n\n</task> ultrathink through this task to complete it effectively:';
      }

      messageInput.value = taskTemplate;

      // Position cursor between the XML tags (after the first newline)
      const cursorPosition = taskTemplate.indexOf('\n') + 1;
      DOMUtils.setCursorPosition(messageInput, cursorPosition);

      // Focus the input and trigger input change event
      messageInput.focus();

      // Trigger input change to update UI state
      if (window.messageComponent && typeof window.messageComponent.handleInputChange === 'function') {
        window.messageComponent.handleInputChange();
      }

      console.log('Task template inserted successfully');
    } catch (error) {
      console.error('Failed to create new task:', error);
      this.showError('Failed to create task template');
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

    // Update workspace UI if workspace is active
    if (this.isWorkspaceActive) {
      this.updateWorkspaceUI();
    }
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

    let breadcrumbHTML = '';

    if (this.isWorkspaceActive && this.currentWorkspace) {
      // Workspace-aware breadcrumb
      breadcrumbHTML += `
        <span class="breadcrumb-segment workspace-root" onclick="fileBrowser.showWorkspaceRoot()">
          <span class="codicon codicon-folder"></span>
          <span class="breadcrumb-text">${this.escapeHTML(this.currentWorkspace.name)}</span>
        </span>
      `;

      // Find which workspace folder contains current directory
      const currentFolder = this.getCurrentWorkspaceFolder();
      if (currentFolder) {
        breadcrumbHTML += `
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-segment workspace-folder" onclick="fileBrowser.navigateToDirectory('${currentFolder.path}')">
            <span class="codicon codicon-folder"></span>
            <span class="breadcrumb-text">${this.escapeHTML(currentFolder.name)}</span>
          </span>
        `;

        // Show relative path within the workspace folder
        const relativePath = this.currentDirectory.slice(currentFolder.path.length);
        if (relativePath && relativePath !== '/') {
          const pathParts = relativePath.split('/').filter(part => part);
          pathParts.forEach((part, index) => {
            const fullPath = currentFolder.path + '/' + pathParts.slice(0, index + 1).join('/');
            const isLast = index === pathParts.length - 1;

            breadcrumbHTML += `<span class="breadcrumb-separator">/</span>`;
            if (isLast) {
              breadcrumbHTML += `<span class="breadcrumb-segment current">${this.escapeHTML(part)}</span>`;
            } else {
              breadcrumbHTML += `<span class="breadcrumb-segment" onclick="fileBrowser.navigateToDirectory('${fullPath}')">${this.escapeHTML(part)}</span>`;
            }
          });
        }
      } else {
        // Current directory is outside workspace folders, show full path
        breadcrumbHTML += `
          <span class="breadcrumb-separator">/</span>
          <span class="breadcrumb-segment current">${this.escapeHTML(this.currentDirectory)}</span>
        `;
      }
    } else {
      // Normal breadcrumb for non-workspace mode
      const pathParts = this.currentDirectory.split('/').filter(part => part);
      const pathSegments = pathParts.map((part, index) => {
        const fullPath = '/' + pathParts.slice(0, index + 1).join('/');
        const isLast = index === pathParts.length - 1;

        if (isLast) {
          return `<span class="breadcrumb-segment current">${this.escapeHTML(part)}</span>`;
        } else {
          return `<span class="breadcrumb-segment" onclick="fileBrowser.navigateToDirectory('${fullPath}')">${this.escapeHTML(part)}</span>`;
        }
      }).join('<span class="breadcrumb-separator">/</span>');

      breadcrumbHTML = `
        <span class="breadcrumb-segment" onclick="fileBrowser.navigateToDirectory('/')">
          <span class="breadcrumb-icon">💾</span>
        </span>
        ${pathParts.length > 0 ? '<span class="breadcrumb-separator">/</span>' + pathSegments : ''}
      `;
    }

    this.breadcrumb.innerHTML = breadcrumbHTML;

    // Ensure the breadcrumb view is scrolled to the far right so the current folder is visible
    const container = this.breadcrumb.closest('.global-breadcrumb-container');
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

  async filterContents() {
    if (this.fileSearchQuery) {
      // First, perform local search
      const localResults = this.directoryContents.filter(item =>
        item.name.toLowerCase().includes(this.fileSearchQuery)
      );

      this.filteredContents = [...localResults];

      // If no local results found, trigger progressive global search
      if (localResults.length === 0 && this.fileSearchQuery.length >= 2) {
        this.triggerGlobalSearch(this.fileSearchQuery);
      } else {
        // Clear global results if we have local results or query is too short
        this.globalSearchResults = [];
      }
    } else {
      // No search query - show all local contents
      this.filteredContents = [...this.directoryContents];
      this.globalSearchResults = [];
    }

    // Reset keyboard selection whenever the result set changes
    this.searchSelectionIndex = -1;

    this.renderFileList();
    this.updateFileCount();
  }

  renderFileList() {
    if (!this.fileList) return;

    // Clean up any existing tooltips before re-rendering
    this.hideTooltip();

    const hasLocalResults = this.filteredContents.length > 0;
    const hasGlobalResults = this.globalSearchResults.length > 0;
    const isSearching = this.fileSearchQuery.length > 0;

    // Handle empty state
    if (!hasLocalResults && !hasGlobalResults) {
      let emptyMessage;
      if (isSearching) {
        if (this.isGlobalSearching) {
          emptyMessage = 'Searching project files...';
        } else {
          emptyMessage = 'No files match your search';
        }
      } else {
        emptyMessage = 'This directory is empty';
      }

      this.fileList.innerHTML = `
        <div class="empty-directory">
          <div class="empty-icon codicon ${this.isGlobalSearching ? 'codicon-loading' : 'codicon-folder'}"></div>
          <div class="empty-message">${emptyMessage}</div>
        </div>
      `;
      return;
    }

    let fileListHTML = '';

    // Render local results first with hierarchical structure
    if (hasLocalResults) {
      fileListHTML += this.renderHierarchicalItems(this.filteredContents, 0);
    }

    // Add separator if we have both local and global results
    if (hasLocalResults && hasGlobalResults) {
      fileListHTML += `
        <div class="search-results-separator">
          <div class="separator-line"></div>
          <div class="separator-text">Found in project</div>
          <div class="separator-line"></div>
        </div>
      `;
    }

    // Render global results
    if (hasGlobalResults) {
      fileListHTML += this.globalSearchResults.map(item => {
        const icon = item.isDirectory ? this.getFileIcon('folder') : this.getFileIcon(item.name);
        const relativePath = item.relativePath || item.path;

        return `
          <div class="file-item ${item.isDirectory ? 'directory' : 'file'} global-result"
               data-file-path="${DOMUtils.escapeHTML(item.path)}"
               data-is-global="true">
            <span class="file-icon codicon ${icon}"></span>
            <div class="file-info">
              <div class="file-name">${DOMUtils.escapeHTML(item.name)}</div>
              <div class="file-path">${DOMUtils.escapeHTML(relativePath)}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    this.fileList.innerHTML = fileListHTML;

    // Add hover event listeners for tooltips
    this.addTooltipListeners();

    // Re-apply keyboard selection highlight (if any)
    this.applyKeyboardSelection();
  }

  // Render hierarchical file structure with expansion support
  renderHierarchicalItems(items, indentLevel) {
    return items.map(item => {
      const icon = item.isDirectory ? this.getFileIcon('folder') : this.getFileIcon(item.name);
      const isExpanded = this.isFolderExpanded(item.path);
      const hasDropdown = item.isDirectory;
      const indentStyle = `padding-left: ${12 + (indentLevel * this.currentIndentationPx)}px`;

      let itemHTML = `
        <div class="file-item ${item.isDirectory ? 'directory' : 'file'} ${isExpanded ? 'expanded' : ''}"
             data-file-path="${DOMUtils.escapeHTML(item.path)}"
             data-indent-level="${indentLevel}"
             style="${indentStyle}">
      `;

      // Add dropdown icon for directories
      if (hasDropdown) {
        const dropdownIcon = isExpanded ? 'codicon-chevron-down' : 'codicon-chevron-right';
        itemHTML += `
          <button class="folder-expand-btn"
                  data-folder-path="${DOMUtils.escapeHTML(item.path)}"
                  title="${isExpanded ? 'Collapse folder' : 'Expand folder'}">
            <span class="codicon ${dropdownIcon}"></span>
          </button>
        `;
      } else {
        // Add spacer for files to align with directories
        itemHTML += `<div class="folder-expand-spacer"></div>`;
      }

      itemHTML += `
          <span class="file-icon codicon ${icon}"></span>
          <div class="file-info">
            <div class="file-name">${DOMUtils.escapeHTML(item.name)}</div>
          </div>
        </div>
      `;

      // Add expanded folder contents if folder is expanded
      if (isExpanded && this.expandedFolderContents.has(item.path)) {
        const expandedContents = this.expandedFolderContents.get(item.path);
        if (expandedContents && expandedContents.length > 0) {
          itemHTML += this.renderHierarchicalItems(expandedContents, indentLevel + 1);
        }
      }

      return itemHTML;
    }).join('');
  }

  renderQuickAccess() {
    if (!this.quickAccessList) return;

    let quickAccessHTML = '';

    // Common directories section
    if (this.commonDirectories && this.commonDirectories.length > 0) {
      const commonDirsHTML = this.commonDirectories.map(dir => `
        <div class="quick-access-item"
             data-file-path="${DOMUtils.escapeHTML(dir.path)}"
             data-is-quick-access="true">
          <span class="quick-access-icon">${dir.icon}</span>
          <span class="quick-access-name">${dir.name}</span>
        </div>
      `).join('');

      quickAccessHTML += commonDirsHTML;
    }

    // Open files section (if any)
    if (this.openApplicationWindows && this.openApplicationWindows.length > 0) {
      // Add separator if we have both sections
      if (quickAccessHTML) {
        quickAccessHTML += `
          <div class="quick-access-separator">
            <div class="separator-line"></div>
            <div class="separator-text">Open Files</div>
            <div class="separator-line"></div>
          </div>
        `;
      }

      // Group files by application
      const filesByApp = this.groupFilesByApplication(this.openApplicationWindows);

      for (const [appName, files] of Object.entries(filesByApp)) {
        // App header
        const appIcon = files[0]?.appIcon || '📝';
        quickAccessHTML += `
          <div class="quick-access-app-header">
            <span class="app-header-icon">${appIcon}</span>
            <span class="app-header-name">${appName}</span>
            <span class="app-header-count">(${files.length})</span>
          </div>
        `;

        // Files for this app
        const openFilesHTML = files.map(file => {
          // Check if this is a workspace item
          const isWorkspace = file.isWorkspace || false;
          const workspaceDirectory = file.workspaceDirectory || file.path;
          const displayName = isWorkspace ? file.name : file.name;
          const displayPath = isWorkspace ? file.path : (file.directory || file.path);

          return `
            <div class="quick-access-item open-file ${isWorkspace ? 'workspace-item' : ''}"
                 data-file-path="${DOMUtils.escapeHTML(file.path)}"
                 data-is-open-file="true"
                 data-is-workspace="${isWorkspace}"
                 data-workspace-directory="${DOMUtils.escapeHTML(workspaceDirectory)}"
                 data-app-name="${DOMUtils.escapeHTML(file.app)}"
                 title="${DOMUtils.escapeHTML(isWorkspace ? `Workspace: ${file.path}` : file.path)}">
              <span class="quick-access-icon codicon ${file.icon}"></span>
              <div class="open-file-info">
                <span class="open-file-name">${DOMUtils.escapeHTML(displayName)}</span>
                ${!isWorkspace && file.directory ? `<span class="open-file-dir">${DOMUtils.escapeHTML(this.truncatePath(file.directory))}</span>` : ''}
                ${isWorkspace ? `<span class="workspace-indicator">📁 Workspace</span>` : ''}
              </div>
              <span class="app-indicator" title="${DOMUtils.escapeHTML(file.app)}">${appIcon}</span>
            </div>
          `;
        }).join('');

        quickAccessHTML += openFilesHTML;
      }
    } else if (this.windowDetectionEnabled) {
      // Show empty state for window detection
      if (quickAccessHTML) {
        quickAccessHTML += `
          <div class="quick-access-separator">
            <div class="separator-line"></div>
            <div class="separator-text">Open Files</div>
            <div class="separator-line"></div>
          </div>
        `;
      }

      quickAccessHTML += `
        <div class="quick-access-empty">
          <span class="empty-icon codicon codicon-search"></span>
          <span class="empty-text">No open files detected</span>
        </div>
      `;
    }

    this.quickAccessList.innerHTML = quickAccessHTML;

    // Add tooltip listeners for quick access items
    this.addQuickAccessTooltipListeners();
  }

  groupFilesByApplication(files) {
    const grouped = {};

    files.forEach(file => {
      const appName = file.appDisplayName || file.app || 'Unknown';
      if (!grouped[appName]) {
        grouped[appName] = [];
      }
      grouped[appName].push(file);
    });

    return grouped;
  }

  truncatePath(path, maxLength = 30) {
    if (!path || path.length <= maxLength) {
      return path;
    }

    // Try to show the most relevant part (end of path)
    return '...' + path.slice(-(maxLength - 3));
  }

  toggleQuickAccess() {
    this.isQuickAccessCollapsed = !this.isQuickAccessCollapsed;

    if (this.quickAccessList) {
      this.quickAccessList.style.display = this.isQuickAccessCollapsed ? 'none' : 'flex';
    }

    if (this.quickAccessToggle) {
      this.quickAccessToggle.classList.toggle('collapsed', this.isQuickAccessCollapsed);
    }

    // Refresh window detection when quick access is opened
    if (!this.isQuickAccessCollapsed && this.windowDetectionEnabled) {
      console.log('Quick access opened - refreshing window detection');
      this.refreshWindowDetection();
    }
  }

  updateFileCount() {
    if (this.fileCount) {
      const total = this.directoryContents.length;
      const localFiltered = this.filteredContents.length;
      const globalResults = this.globalSearchResults.length;

      // Count expanded folder contents
      let expandedItemsCount = 0;
      for (const contents of this.expandedFolderContents.values()) {
        expandedItemsCount += contents.length;
      }

      const totalShown = localFiltered + globalResults + expandedItemsCount;

      const localDirs = this.filteredContents.filter(item => item.isDirectory).length;
      const globalDirs = this.globalSearchResults.filter(item => item.isDirectory).length;

      // Count expanded directories
      let expandedDirs = 0;
      for (const contents of this.expandedFolderContents.values()) {
        expandedDirs += contents.filter(item => item.isDirectory).length;
      }

      const totalDirs = localDirs + globalDirs + expandedDirs;
      const totalFiles = totalShown - totalDirs;

      if (this.fileSearchQuery) {
        if (globalResults > 0) {
          this.fileCount.textContent = `${localFiltered} local + ${globalResults} project (${totalDirs} folders, ${totalFiles} files)`;
        } else {
          this.fileCount.textContent = `${localFiltered} of ${total} items (${localDirs} folders, ${totalFiles} files)`;
        }
      } else {
        const expandedText = this.expandedFolders.size > 0 ? ` (+${expandedItemsCount} expanded)` : '';
        this.fileCount.textContent = `${total} items${expandedText} (${totalDirs} folders, ${totalFiles} files)`;
      }
    }
  }

  getFileTypeForViewing(filePath) {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    // Files that should be opened in the file viewer
    const viewableExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'pdf'];
    
    console.log('File type detection:', filePath, 'extension:', extension, 'viewable:', viewableExtensions.includes(extension));
    
    if (viewableExtensions.includes(extension)) {
      return 'viewable';
    }
    
    // All other files go to the text editor
    return 'editable';
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

  // ============================================================================
  // Workspace Management Methods
  // ============================================================================

  // Load current workspace context
  async loadWorkspaceContext() {
    try {
      const activeWorkspaceResult = await window.electronAPI.getActiveWorkspace();
      const workspaceFoldersResult = await window.electronAPI.getWorkspaceFolders();

      if (activeWorkspaceResult.success && activeWorkspaceResult.activeWorkspace) {
        this.currentWorkspace = activeWorkspaceResult.activeWorkspace;
        this.isWorkspaceActive = true;
        console.log('Loaded active workspace:', this.currentWorkspace.name);
      } else {
        this.currentWorkspace = null;
        this.isWorkspaceActive = false;
      }

      if (workspaceFoldersResult.success && workspaceFoldersResult.hasWorkspace) {
        this.workspaceFolders = workspaceFoldersResult.folders || [];
        console.log(`Loaded ${this.workspaceFolders.length} workspace folders`);
      } else {
        this.workspaceFolders = [];
      }

      // Update UI to reflect workspace state
      this.updateWorkspaceUI();
    } catch (error) {
      console.error('Error loading workspace context:', error);
      this.currentWorkspace = null;
      this.workspaceFolders = [];
      this.isWorkspaceActive = false;
    }
  }

  // Update UI elements to show workspace context
  updateWorkspaceUI() {
    // Update breadcrumb to show workspace context
    this.updateBreadcrumb();

    // Update directory tree to show workspace folders
    this.renderWorkspaceFolders();
  }

  // Render workspace folders in the quick access area
  renderWorkspaceFolders() {
    if (!this.isWorkspaceActive || this.workspaceFolders.length === 0) {
      return;
    }

    // Add workspace folders section to quick access
    const quickAccessContent = document.querySelector('.quick-access-content');
    if (!quickAccessContent) return;

    // Remove existing workspace section if it exists
    const existingWorkspaceSection = quickAccessContent.querySelector('.workspace-folders-section');
    if (existingWorkspaceSection) {
      existingWorkspaceSection.remove();
    }

    // Create workspace folders section
    const workspaceSection = document.createElement('div');
    workspaceSection.className = 'workspace-folders-section';
    workspaceSection.innerHTML = `
      <div class="workspace-section-header">
        <span class="codicon codicon-folder"></span>
        <span class="workspace-section-title">${this.escapeHTML(this.currentWorkspace.name)}</span>
        <span class="workspace-folder-count">${this.workspaceFolders.length}</span>
      </div>
      <div class="workspace-folders-list">
        ${this.workspaceFolders.map(folder => `
          <div class="workspace-folder-item"
               data-folder-path="${this.escapeHTML(folder.path)}"
               title="${this.escapeHTML(folder.path)}">
            <span class="codicon codicon-folder"></span>
            <span class="folder-name">${this.escapeHTML(folder.name)}</span>
          </div>
        `).join('')}
      </div>
    `;

    // Insert workspace section at the top of quick access
    quickAccessContent.insertBefore(workspaceSection, quickAccessContent.firstChild);

    // Add click handlers for workspace folders
    workspaceSection.querySelectorAll('.workspace-folder-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        e.preventDefault();
        const folderPath = item.dataset.folderPath;
        if (folderPath) {
          await this.navigateToDirectory(folderPath);
        }
      });
    });
  }

  // Check if current directory is within workspace
  getCurrentWorkspaceFolder() {
    if (!this.isWorkspaceActive || !this.currentDirectory) {
      return null;
    }

    return this.workspaceFolders.find(folder =>
      this.currentDirectory.startsWith(folder.path)
    );
  }


  // Show workspace root (used by breadcrumb)
  showWorkspaceRoot() {
    if (this.isWorkspaceActive && this.workspaceFolders.length > 0) {
      // Navigate to the first workspace folder as the root
      this.navigateToDirectory(this.workspaceFolders[0].path);
    }
  }

  // Utility method to escape HTML
  escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
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

  // Progressive global search with debouncing
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
    this.setStatus('Searching project files...');

    try {
      const result = await window.electronAPI.searchFilesByPrefix(query, 20);

      if (result.success && result.results) {
        // Filter out files that are already in the current directory
        const currentDirFiles = new Set(this.directoryContents.map(item => item.path));
        this.globalSearchResults = result.results.filter(item =>
          !currentDirFiles.has(item.path)
        );

        // Re-render if the search query is still current
        if (query === this.fileSearchQuery) {
          this.renderFileList();
          this.updateFileCount();
        }

        this.setStatus(this.globalSearchResults.length > 0 ?
          `Found ${this.globalSearchResults.length} files in project` :
          'Ready'
        );
      } else {
        console.warn('Global search failed:', result.error);
        this.setStatus('Ready');
      }
    } catch (error) {
      console.error('Global search error:', error);
      this.setStatus('Ready');
    } finally {
      this.isGlobalSearching = false;
    }
  }

  selectTopSearchResult() {
    // Prioritize local results first, then global
    if (this.filteredContents && this.filteredContents.length > 0) {
      const topResult = this.filteredContents[0];
      this.handleFileClick(topResult.path, topResult.isDirectory);
    } else if (this.globalSearchResults && this.globalSearchResults.length > 0) {
      const topResult = this.globalSearchResults[0];
      this.handleGlobalFileClick(topResult.path, topResult.isDirectory || false);
    }
  }

  clearSearchInput() {
    if (this.fileSearchInput) {
      this.fileSearchInput.value = '';
      this.fileSearchQuery = '';
      this.globalSearchResults = [];
      this.lastGlobalSearchQuery = '';

      // Clear any pending search timer
      if (this.searchDebounceTimer) {
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = null;
      }

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

    const isNowHidden = this.sidebarContainer.classList.toggle('hidden');

    // If sidebar is now visible, check window height and expand if needed
    if (!isNowHidden) {
      const minHeight = 450;
      if (window.innerHeight < minHeight) {
        console.log(`File browser opened, ensuring window height is at least ${minHeight}px`);
        window.electronAPI.resizeWindow({ height: minHeight });
      }
    }

    // Update tooltip text
    if (this.sidebarToggleBtn) {
      this.sidebarToggleBtn.title = isNowHidden ? 'Show File Explorer' : 'Hide File Explorer';
    }

    // Update resizer visibility
    if (this.sidebarResizer && typeof this.sidebarResizer.updateResizerVisibility === 'function') {
      this.sidebarResizer.updateResizerVisibility();
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

  /* -------------------------- Tooltip Methods ------------------------- */

  // Create and show tooltip for file path
  showTooltip(element, content, isHTML = false) {
    // Clear any existing tooltip
    this.hideTooltip();

    // Clear any pending tooltip timer
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }

    // Set a delay before showing the tooltip
    this.tooltipTimeout = setTimeout(() => {
      this.createTooltip(element, content, isHTML);
    }, 500); // 500ms delay
  }

  // Create the tooltip element and position it
  createTooltip(element, content, isHTML = false) {
    // Check if element is still valid (hasn't been removed from DOM)
    if (!element || !element.isConnected) {
      return;
    }

    // Create tooltip element
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'file-tooltip';
    if (isHTML) {
      this.tooltip.innerHTML = content;
    } else {
      this.tooltip.textContent = content;
    }

    // Add to body for proper positioning
    document.body.appendChild(this.tooltip);

    // Position the tooltip
    this.positionTooltip(element);

    // Show tooltip with animation
    requestAnimationFrame(() => {
      // Check if tooltip still exists (might have been cleaned up)
      if (this.tooltip) {
        this.tooltip.classList.add('show');
      }
    });
  }

  // Position tooltip near the element but within viewport
  positionTooltip(element) {
    if (!this.tooltip || !element || !element.isConnected) return;

    const rect = element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Calculate initial position above the element
    let left = rect.left;
    let top = rect.top - tooltipRect.height - 12; // 12px gap

    // Adjust horizontal position if tooltip would go outside viewport
    if (left + tooltipRect.width > viewportWidth - 20) {
      left = viewportWidth - tooltipRect.width - 20;
    }
    if (left < 20) {
      left = 20;
    }

    // If tooltip would go above viewport, show below element instead
    if (top < 20) {
      top = rect.bottom + 12;
    }

    // Final check - if still outside viewport vertically, position at mouse
    if (top + tooltipRect.height > viewportHeight - 20) {
      top = Math.max(20, viewportHeight - tooltipRect.height - 20);
    }

    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  // Hide and remove tooltip
  hideTooltip() {
    // Clear any pending tooltip timer
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    if (this.tooltip) {
      this.tooltip.remove();
      this.tooltip = null;
    }
  }

  // Add hover event listeners to all file items
  addTooltipListeners() {
    if (!this.fileList) return;

    const fileItems = this.fileList.querySelectorAll('.file-item[data-file-path]');

    fileItems.forEach(item => {
      const filePath = item.getAttribute('data-file-path');

      item.addEventListener('mouseenter', () => {
        this.showTooltip(item, filePath);
      });

      item.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });
    });
  }

  // Add hover event listeners for quick access items
  addQuickAccessTooltipListeners() {
    if (!this.quickAccessList) return;

    const quickAccessItems = this.quickAccessList.querySelectorAll('.quick-access-item[data-file-path]');

    quickAccessItems.forEach(item => {
      const filePath = item.getAttribute('data-file-path');

      item.addEventListener('mouseenter', () => {
        this.showTooltip(item, filePath);
      });

      item.addEventListener('mouseleave', () => {
        this.hideTooltip();
      });
    });
  }

  // Optimized event delegation for file list clicks
  handleFileListClick(event) {
    // Check if clicking on expand button - handle separately
    const expandBtn = event.target.closest('.folder-expand-btn');
    if (expandBtn) {
      event.stopPropagation();
      const folderPath = expandBtn.dataset.folderPath;
      if (folderPath) {
        this.toggleFolderExpansion(folderPath);
      }
      return;
    }

    // Find the nearest file item element
    const fileItem = event.target.closest('.file-item');
    if (!fileItem) return;

    // Get the file path from data attribute
    const filePath = fileItem.dataset.filePath;
    const isDirectory = fileItem.classList.contains('directory');
    const isGlobal = fileItem.dataset.isGlobal === 'true';

    if (!filePath) {
      console.warn('No file path found for clicked item');
      return;
    }

    // Handle global search results differently
    if (isGlobal) {
      this.handleGlobalFileClick(filePath, isDirectory);
    } else {
      // Add loading state and call file click handler
      this.handleFileClickWithFeedback(filePath, isDirectory, fileItem);
    }
  }

  // Enhanced file click handler with visual feedback and debouncing
  handleFileClickWithFeedback(path, isDirectory, fileItem) {
    // Prevent rapid clicking on the same item
    if (fileItem && fileItem.classList.contains('clicking')) {
      console.log('File click ignored - already processing');
      return;
    }

    // Clear search input when a file/folder is selected
    this.clearSearchInput();

    if (isDirectory) {
      this.navigateToDirectory(path);
    } else {
      // Add visual feedback
      if (fileItem) {
        fileItem.classList.add('clicking');
      }

      // Determine file type and route to appropriate component
      const fileType = this.getFileTypeForViewing(path);
      console.log('File clicked:', path, 'Type:', fileType);

      if (fileType === 'viewable') {
        // Route to file viewer for images and PDFs
        const fileViewer = window.app?.getComponent('fileViewer');
        if (fileViewer) {
          try {
            fileViewer.openFile(path);
            // Remove visual feedback after a short delay
            setTimeout(() => {
              if (fileItem) {
                fileItem.classList.remove('clicking');
              }
            }, 200);
          } catch (error) {
            console.error('Failed to open file in viewer:', error);
            if (fileItem) {
              fileItem.classList.remove('clicking');
            }
          }
        } else {
          console.error('File viewer component not available');
          if (fileItem) {
            fileItem.classList.remove('clicking');
          }
        }
      } else {
        // Route to file editor for text files
        const fileEditor = window.app?.getComponent('fileEditor');
        if (fileEditor) {
          try {
            fileEditor.openFile(path);
            // Remove visual feedback after a short delay
            setTimeout(() => {
              if (fileItem) {
                fileItem.classList.remove('clicking');
              }
            }, 200);
          } catch (error) {
            console.error('Failed to open file in editor:', error);
            if (fileItem) {
              fileItem.classList.remove('clicking');
            }
          }
        } else {
          console.error('File editor component not available');
          if (fileItem) {
            fileItem.classList.remove('clicking');
          }
        }
      }
    }
  }

  // Quick access click delegation handler
  handleQuickAccessClick(event) {
    const quickAccessItem = event.target.closest('.quick-access-item');
    if (!quickAccessItem) return;

    const filePath = quickAccessItem.dataset.filePath;
    if (!filePath) return;

    const isOpenFile = quickAccessItem.dataset.isOpenFile === 'true';
    const isQuickAccess = quickAccessItem.dataset.isQuickAccess === 'true';

    if (isOpenFile) {
      // Handle open file click - open in editor
      this.handleOpenFileClick(filePath, quickAccessItem);
    } else if (isQuickAccess) {
      // Handle quick access directory click - navigate to directory
      this.navigateToDirectory(filePath);
    }
  }

  // Helper method to convert Mac-style paths to Unix paths
  normalizePath(filePath) {
    if (!filePath) return filePath;
    
    // Convert Mac-style paths (e.g., "Macintosh HD:Users:..." to "/Users/...")
    if (filePath.includes('Macintosh HD:')) {
      // Remove "Macintosh HD:" prefix and convert colons to slashes
      let normalized = filePath.replace(/^Macintosh HD:/, '/');
      normalized = normalized.replace(/:/g, '/');
      console.log('Converted Mac path:', filePath, '->', normalized);
      return normalized;
    }
    
    return filePath;
  }

  async handleOpenFileClick(filePath, itemElement) {
    try {
      // Add visual feedback
      itemElement.classList.add('clicking');

      // Normalize the path (convert Mac-style paths to Unix paths)
      const normalizedPath = this.normalizePath(filePath);
      console.log('Open file clicked:', filePath, 'normalized to:', normalizedPath);

      // Check if this is a workspace item (has isWorkspace property)
      const isWorkspace = itemElement.dataset.isWorkspace === 'true';
      const workspaceDirectory = itemElement.dataset.workspaceDirectory;

      if (isWorkspace && workspaceDirectory) {
        // Handle workspace navigation - navigate to the workspace directory
        console.log('Navigating to workspace:', workspaceDirectory);
        await this.navigateToDirectory(workspaceDirectory);

        // Remove visual feedback
        setTimeout(() => {
          if (itemElement) {
            itemElement.classList.remove('clicking');
          }
        }, 200);
        return;
      }

      // Check if this looks like a relative path (no leading slash)
      // This happens when window detector can't find the exact file location
      if (!normalizedPath.startsWith('/')) {
        console.log('Detected relative path from window detector:', normalizedPath);

        // Extract the directory name (first part of the path)
        const pathParts = normalizedPath.split('/');
        const directoryName = pathParts[0];

                        if (directoryName) {
          // Try to find this directory in common locations
          // Get the actual home directory path (this.homeDirectory should be absolute)
          const actualHomeDir = this.homeDirectory && this.homeDirectory !== '~' ? this.homeDirectory : null;

          const commonPaths = [];

          // Only add paths if we have a valid home directory
          if (actualHomeDir) {
            commonPaths.push(
              `${actualHomeDir}/Desktop/${directoryName}`,
              `${actualHomeDir}/Documents/${directoryName}`,
              `${actualHomeDir}/${directoryName}`
            );
          }

          // Add some fallback paths that don't rely on process.env
          commonPaths.push(
            `/Users/Shared/${directoryName}`,
            `/${directoryName}` // Root level directory as last resort
          );

          console.log('Searching for directory in common locations:', commonPaths);

          // Try each common path to see if the directory exists
          for (const testPath of commonPaths) {
            try {
              const result = await window.electronAPI.navigateToDirectory(testPath);
              if (result.success) {
                console.log('Found directory at:', testPath);
                await this.navigateToDirectory(testPath);

                // Remove visual feedback
                setTimeout(() => {
                  if (itemElement) {
                    itemElement.classList.remove('clicking');
                  }
                }, 200);
                return;
              }
            } catch (error) {
              // Continue to next path
              console.log('Path not found:', testPath);
            }
          }

          // If we can't find the directory, show an error
          console.warn('Could not locate directory:', directoryName);
          this.showError(`Could not locate directory: ${directoryName}`);

          // Remove visual feedback
          setTimeout(() => {
            if (itemElement) {
              itemElement.classList.remove('clicking');
            }
          }, 200);
          return;
        }
      }

      // Handle individual file opening (for absolute paths)
      
      // Set working directory to file's parent directory first
      const result = await window.electronAPI.setWorkingDirectoryFromFile(normalizedPath);
      if (result.success) {
        console.log('Working directory updated:', result.newCwd || result.path);

        // Navigate to the parent directory in file browser
        await this.navigateToDirectory(result.newCwd || result.path);
      } else {
        console.warn('Failed to update working directory:', result.error);
        // Still try to open the file even if directory update failed
      }

      // Determine file type and route to appropriate component
      const fileType = this.getFileTypeForViewing(normalizedPath);
      console.log('Open file clicked:', normalizedPath, 'Type:', fileType);

      // Debug: Check component availability
      console.log('Available components:', window.app ? Object.keys(window.app.components || {}) : 'window.app not available');
      console.log('FileViewer available:', !!window.app?.getComponent('fileViewer'));
      console.log('FileEditor available:', !!window.app?.getComponent('fileEditor'));

      if (fileType === 'viewable') {
        // Route to file viewer for images and PDFs
        const fileViewer = window.app?.getComponent('fileViewer');
        if (fileViewer) {
          console.log('Opening file in viewer:', normalizedPath);
          fileViewer.openFile(normalizedPath);
        } else {
          console.error('File viewer component not available');
          console.error('App components:', window.app?.components);
        }
      } else {
        // Route to file editor for text files
        const fileEditor = window.app?.getComponent('fileEditor');
        if (fileEditor) {
          console.log('Opening file in editor:', normalizedPath);
          fileEditor.openFile(normalizedPath);
        } else {
          console.error('File editor component not available');
          console.error('App components:', window.app?.components);
        }
      }

      // Remove visual feedback after a short delay
      setTimeout(() => {
        if (itemElement) {
          itemElement.classList.remove('clicking');
        }
      }, 200);
    } catch (error) {
      console.error('Failed to open file:', error);
      if (itemElement) {
        itemElement.classList.remove('clicking');
      }
    }
  }

  // Legacy method kept for compatibility
  handleFileClick(path, isDirectory) {
    this.handleFileClickWithFeedback(path, isDirectory, null);
  }

  // Handle clicks on global search results
  async handleGlobalFileClick(filePath, isDirectory) {
    // Clear search input when a file/folder is selected
    this.clearSearchInput();

    if (isDirectory) {
      // Navigate to the directory
      await this.navigateToDirectory(filePath);
    } else {
      // For files, navigate to parent directory first, then open the file
      const parentDir = filePath.substring(0, filePath.lastIndexOf('/'));

      try {
        // Navigate to the parent directory
        await this.navigateToDirectory(parentDir);

        // Determine file type and route to appropriate component
        const fileType = this.getFileTypeForViewing(filePath);
        console.log('Global file clicked:', filePath, 'Type:', fileType);

        if (fileType === 'viewable') {
          // Route to file viewer for images and PDFs
          const fileViewer = window.app?.getComponent('fileViewer');
          if (fileViewer) {
            fileViewer.openFile(filePath);
          } else {
            console.error('File viewer component not available');
          }
        } else {
          // Route to file editor for text files
          const fileEditor = window.app?.getComponent('fileEditor');
          if (fileEditor) {
            fileEditor.openFile(filePath);
          } else {
            console.error('File editor component not available');
          }
        }
      } catch (error) {
        console.error('Failed to navigate to file location:', error);
        // Fallback: just try to open the file directly
        const fileType = this.getFileTypeForViewing(filePath);
        
        if (fileType === 'viewable') {
          const fileViewer = window.app?.getComponent('fileViewer');
          if (fileViewer) {
            fileViewer.openFile(filePath);
          }
        } else {
          const fileEditor = window.app?.getComponent('fileEditor');
          if (fileEditor) {
            fileEditor.openFile(filePath);
          }
        }
      }
    }
  }

  /* -------------------------- Sidebar Resizer Integration ------------------------- */

  // Initialize the sidebar resizer component
  initializeSidebarResizer() {
    // Wait for SidebarResizer to be available
    if (typeof SidebarResizer !== 'undefined') {
      this.sidebarResizer = new SidebarResizer();
      console.log('Sidebar resizer initialized');
    } else {
      // Retry after a short delay if SidebarResizer isn't loaded yet
      setTimeout(() => {
        this.initializeSidebarResizer();
      }, 100);
    }
  }

  // Update file indentation based on sidebar width
  updateIndentationForWidth(width, indentationPx) {
    this.currentIndentationPx = indentationPx;
    console.log(`Updating indentation: width=${width}px, indentation=${indentationPx}px per level`);
    
    // Re-render the file list with new indentation
    this.renderFileList();
  }

  /* -------------------------- Keyboard Navigation Methods ------------------------- */

  // Move selection up or down by 'direction' (1 for down, -1 for up)
  moveSelection(direction) {
    const totalResults = this.filteredContents.length + this.globalSearchResults.length;
    if (totalResults === 0) return;

    // If no selection yet, start at first/last depending on direction
    if (this.searchSelectionIndex === -1) {
      this.searchSelectionIndex = direction > 0 ? 0 : totalResults - 1;
    } else {
      this.searchSelectionIndex = (this.searchSelectionIndex + direction + totalResults) % totalResults;
    }

    this.applyKeyboardSelection();
  }

  // Highlight the currently selected result in the DOM
  applyKeyboardSelection() {
    if (!this.fileList) return;

    const items = Array.from(this.fileList.querySelectorAll('.file-item'));
    items.forEach((el, idx) => {
      if (idx === this.searchSelectionIndex) {
        el.classList.add('selected');
        // Ensure the selected item is visible
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.classList.remove('selected');
      }
    });
  }

  // Activate (open) the currently selected result
  activateSelection() {
    const combined = [...this.filteredContents, ...this.globalSearchResults];
    if (combined.length === 0) return;

    let targetIndex = this.searchSelectionIndex;
    if (targetIndex === -1) {
      targetIndex = 0; // Default to top result
    }

    const item = combined[targetIndex];
    if (!item) return;

    if (targetIndex < this.filteredContents.length) {
      // Local result
      this.handleFileClick(item.path, item.isDirectory);
    } else {
      // Global result
      this.handleGlobalFileClick(item.path, item.isDirectory || false);
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileBrowser;
} else {
  window.FileBrowser = FileBrowser;
}