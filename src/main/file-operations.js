const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const WindowDetector = require('./window-detector');

class FileOperations {
  constructor(modelConfig = null) {
    this.currentWorkingDirectory = os.homedir(); // Start in user's home directory
    this.directoryHistory = []; // Navigation history for back/forward
    this.historyIndex = -1; // Current position in history
    this.windowDetector = new WindowDetector(modelConfig); // Initialize window detector with model config

    // Workspace management
    this.workspaces = new Map(); // Store loaded workspaces
    this.activeWorkspace = null; // Currently active workspace
    this.workspaceStoragePath = path.join(os.homedir(), '.claude-code-chat', 'workspaces.json');
  }

  // Helper function to get directory contents with file info
  async getDirectoryContents(dirPath) {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const contents = [];

      for (const entry of entries) {
        try {
          const fullPath = path.join(dirPath, entry.name);
          const stats = await fs.stat(fullPath);

          contents.push({
            name: entry.name,
            path: fullPath,
            isDirectory: entry.isDirectory(),
            isFile: entry.isFile(),
            size: stats.size,
            modified: stats.mtime,
            permissions: {
              readable: true, // We'll assume readable if we can stat it
              writable: false // We'll check this separately if needed
            }
          });
        } catch (statError) {
          // Skip files we can't stat (permission issues, etc.)
          console.warn(`Could not stat ${entry.name}:`, statError.message);
        }
      }

      // Sort: directories first, then files, both alphabetically
      contents.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      });

      return contents;
    } catch (error) {
      throw new Error(`Cannot read directory ${dirPath}: ${error.message}`);
    }
  }

  // Helper function to validate directory path
  async validateDirectory(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch (error) {
      return false;
    }
  }

  // Helper function to update directory history
  updateDirectoryHistory(newPath) {
    // Remove any history after current index (for new navigation)
    this.directoryHistory = this.directoryHistory.slice(0, this.historyIndex + 1);

    // Add new path if it's different from current
    if (this.directoryHistory.length === 0 || this.directoryHistory[this.historyIndex] !== newPath) {
      this.directoryHistory.push(newPath);
      this.historyIndex = this.directoryHistory.length - 1;
    }
  }

  // Get directory contents
  async getDirectoryContentsHandler(dirPath) {
    try {
      const targetPath = dirPath || this.currentWorkingDirectory;
      const isValid = await this.validateDirectory(targetPath);

      if (!isValid) {
        throw new Error(`Invalid directory: ${targetPath}`);
      }

      const contents = await this.getDirectoryContents(targetPath);
      return {
        success: true,
        path: targetPath,
        contents: contents
      };
    } catch (error) {
      console.error('Failed to get directory contents:', error);
      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  // Navigate to directory
  async navigateToDirectory(dirPath) {
    try {
      const resolvedPath = path.resolve(dirPath);
      const isValid = await this.validateDirectory(resolvedPath);

      if (!isValid) {
        throw new Error(`Cannot navigate to: ${resolvedPath}`);
      }

      // Update working directory and history
      this.currentWorkingDirectory = resolvedPath;
      this.updateDirectoryHistory(resolvedPath);

      // Get contents of new directory
      const contents = await this.getDirectoryContents(resolvedPath);

      console.log('Navigated to directory:', resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        contents: contents,
        canGoBack: this.historyIndex > 0,
        canGoForward: this.historyIndex < this.directoryHistory.length - 1
      };
    } catch (error) {
      console.error('Failed to navigate to directory:', error);
      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  // Get current working directory
  async getCurrentDirectory() {
    try {
      const contents = await this.getDirectoryContents(this.currentWorkingDirectory);
      return {
        success: true,
        path: this.currentWorkingDirectory,
        contents: contents,
        canGoBack: this.historyIndex > 0,
        canGoForward: this.historyIndex < this.directoryHistory.length - 1
      };
    } catch (error) {
      console.error('Failed to get current directory:', error);
      return {
        success: false,
        error: error.message,
        path: this.currentWorkingDirectory
      };
    }
  }

  // Get user's home directory
  getHomeDirectory() {
    return {
      success: true,
      path: os.homedir()
    };
  }

  // Get common directories (macOS-optimized)
  async getCommonDirectories() {
    const homeDir = os.homedir();
    const commonDirs = [
      { name: 'Home', path: homeDir, icon: '🏠' },
      { name: 'Desktop', path: path.join(homeDir, 'Desktop'), icon: '🖥️' },
      { name: 'Documents', path: path.join(homeDir, 'Documents'), icon: '📄' },
      { name: 'Downloads', path: path.join(homeDir, 'Downloads'), icon: '⬇️' },
      { name: 'Applications', path: '/Applications', icon: '📦' },
      { name: 'Root', path: '/', icon: '💾' }
    ];

    // Filter to only include existing directories
    const validDirs = [];
    for (const dir of commonDirs) {
      if (await this.validateDirectory(dir.path)) {
        validDirs.push(dir);
      }
    }

    return {
      success: true,
      directories: validDirs
    };
  }

  // Navigate back in history
  async navigateBack() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.currentWorkingDirectory = this.directoryHistory[this.historyIndex];

      try {
        const contents = await this.getDirectoryContents(this.currentWorkingDirectory);
        return {
          success: true,
          path: this.currentWorkingDirectory,
          contents: contents,
          canGoBack: this.historyIndex > 0,
          canGoForward: this.historyIndex < this.directoryHistory.length - 1
        };
      } catch (error) {
        // Revert on error
        this.historyIndex++;
        this.currentWorkingDirectory = this.directoryHistory[this.historyIndex];
        return {
          success: false,
          error: error.message
        };
      }
    }

    return {
      success: false,
      error: 'No previous directory in history'
    };
  }

  // Navigate forward in history
  async navigateForward() {
    if (this.historyIndex < this.directoryHistory.length - 1) {
      this.historyIndex++;
      this.currentWorkingDirectory = this.directoryHistory[this.historyIndex];

      try {
        const contents = await this.getDirectoryContents(this.currentWorkingDirectory);
        return {
          success: true,
          path: this.currentWorkingDirectory,
          contents: contents,
          canGoBack: this.historyIndex > 0,
          canGoForward: this.historyIndex < this.directoryHistory.length - 1
        };
      } catch (error) {
        // Revert on error
        this.historyIndex--;
        this.currentWorkingDirectory = this.directoryHistory[this.historyIndex];
        return {
          success: false,
          error: error.message
        };
      }
    }

    return {
      success: false,
      error: 'No next directory in history'
    };
  }

  // Navigate up one directory level
  async navigateUp() {
    const parentPath = path.dirname(this.currentWorkingDirectory);

    // Don't go up if we're already at root
    if (parentPath === this.currentWorkingDirectory) {
      return {
        success: false,
        error: 'Already at root directory'
      };
    }

    // Navigate to parent directory
    try {
      const resolvedPath = path.resolve(parentPath);
      const isValid = await this.validateDirectory(resolvedPath);

      if (!isValid) {
        throw new Error(`Cannot navigate to: ${resolvedPath}`);
      }

      // Update working directory and history
      this.currentWorkingDirectory = resolvedPath;
      this.updateDirectoryHistory(resolvedPath);

      // Get contents of new directory
      const contents = await this.getDirectoryContents(resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        contents: contents,
        canGoBack: this.historyIndex > 0,
        canGoForward: this.historyIndex < this.directoryHistory.length - 1
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        path: parentPath
      };
    }
  }

  // Get the current working directory for other operations
  getCurrentWorkingDirectory() {
    return this.currentWorkingDirectory;
  }

  // Set the current working directory
  setCurrentWorkingDirectory(dirPath) {
    this.currentWorkingDirectory = dirPath;
  }

  // Set working directory from a file path (navigates to parent directory)
  async setWorkingDirectoryFromFile(filePath) {
    try {
      // Start with the immediate parent of the provided file path
      let candidateDir = path.dirname(filePath);
      let resolvedPath = path.resolve(candidateDir);

      // Walk up the directory tree until we find an existing directory
      // Prevent infinite loop by stopping at filesystem root
      while (!(await this.validateDirectory(resolvedPath)) && resolvedPath !== path.dirname(resolvedPath)) {
        resolvedPath = path.dirname(resolvedPath);
      }

      // If even the root directory is invalid, abort
      const isValid = await this.validateDirectory(resolvedPath);
      if (!isValid) {
        throw new Error(`No existing parent directory found for ${filePath}`);
      }

      // Update working directory and history
      this.currentWorkingDirectory = resolvedPath;
      this.updateDirectoryHistory(resolvedPath);

      console.log('Set working directory from file (fallback):', filePath, '=>', resolvedPath);

      return {
        success: true,
        path: resolvedPath,
        originalFilePath: filePath,
        message: `Working directory set to ${resolvedPath}`
      };
    } catch (error) {
      console.error('Failed to set working directory from file:', error);
      return {
        success: false,
        error: error.message,
        originalFilePath: filePath
      };
    }
  }

  // Security helper to validate file path is within workspace
  validateFilePath(filePath) {
    const resolvedPath = path.resolve(filePath);
    // The check for being within the CWD has been removed to allow opening
    // any file from anywhere on the filesystem, as is typical for an editor.
    // The primary security measure is that the user is explicitly selecting a file.
    return resolvedPath;
  }

  // Check if file is binary
  async isBinaryFile(filePath) {
    try {
      // Read first 1024 bytes to check for binary content
      const buffer = await fs.readFile(filePath, { encoding: null });
      const chunk = buffer.slice(0, Math.min(1024, buffer.length));

      // Check for null bytes which typically indicate binary files
      for (let i = 0; i < chunk.length; i++) {
        if (chunk[i] === 0) {
          return true;
        }
      }

      // Additional checks for common binary file signatures
      const fileExt = path.extname(filePath).toLowerCase();
      const binaryExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dmg', '.app'];

      return binaryExtensions.includes(fileExt);
    } catch (error) {
      // If we can't read the file, assume it might be binary for safety
      return true;
    }
  }

  // Read file content
  async readFile(filePath) {
    try {
      const validatedPath = this.validateFilePath(filePath);

      // Check if file exists and is readable
      await fs.access(validatedPath, fs.constants.R_OK);

      // Check if file is binary
      const isBinary = await this.isBinaryFile(validatedPath);

      if (isBinary) {
        return {
          success: false,
          error: 'Cannot read binary file',
          isBinary: true,
          path: filePath
        };
      }

      // Read text file
      const content = await fs.readFile(validatedPath, 'utf-8');

      // Check file size (limit to 5MB for safety)
      const stats = await fs.stat(validatedPath);
      if (stats.size > 5 * 1024 * 1024) {
        return {
          success: false,
          error: 'File too large (>5MB)',
          path: filePath
        };
      }

      console.log('File read successfully:', filePath);

      return {
        success: true,
        content: content,
        path: filePath,
        size: stats.size,
        modified: stats.mtime
      };

    } catch (error) {
      console.error('Failed to read file:', error);
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  // Write file content
  async writeFile(filePath, content) {
    try {
      const validatedPath = this.validateFilePath(filePath);

      // Check if parent directory exists
      const parentDir = path.dirname(validatedPath);
      try {
        await fs.access(parentDir, fs.constants.W_OK);
      } catch (error) {
        throw new Error(`Parent directory not writable: ${parentDir}`);
      }

      // Create backup if file exists
      let backupPath = null;
      try {
        await fs.access(validatedPath, fs.constants.F_OK);
        backupPath = `${validatedPath}.backup.${Date.now()}`;
        await fs.copyFile(validatedPath, backupPath);
      } catch (error) {
        // File doesn't exist, no backup needed
      }

      // Write the file
      await fs.writeFile(validatedPath, content, 'utf-8');

      // Clean up backup after successful write
      if (backupPath) {
        setTimeout(async () => {
          try {
            await fs.unlink(backupPath);
          } catch (error) {
            // Backup cleanup failed, not critical
          }
        }, 5000);
      }

      console.log('File written successfully:', filePath);

      return {
        success: true,
        path: filePath,
        backup: backupPath
      };

    } catch (error) {
      console.error('Failed to write file:', error);
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  // File watching functionality
  watchFile(filePath, callback) {
    try {
      const validatedPath = this.validateFilePath(filePath);

      if (!this.fileWatchers) {
        this.fileWatchers = new Map();
      }

      if (!this.fileWatcherTimers) {
        this.fileWatcherTimers = new Map();
      }

      // Don't create duplicate watchers
      if (this.fileWatchers.has(validatedPath)) {
        return {
          success: true,
          message: 'File already being watched',
          path: filePath
        };
      }

      const watcher = fs.watch(validatedPath, (eventType, filename) => {
        // Many editors (VS Code, JetBrains, etc.) perform an *atomic save* that writes to a
        // temporary file and then renames it over the original. That triggers a `rename`
        // event instead of `change`, causing us to miss updates. We therefore treat both
        // `change` *and* `rename` as indications that the file *may* have new contents.
        if (eventType === 'change' || eventType === 'rename') {
          // Debounce rapid file changes (common during saves)
          const existingTimer = this.fileWatcherTimers.get(validatedPath);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            callback({
              type: 'file-changed',
              path: filePath,
              timestamp: Date.now()
            });
            this.fileWatcherTimers.delete(validatedPath);
          }, 100); // 100ms debounce

          this.fileWatcherTimers.set(validatedPath, timer);

          // If we received a `rename`, the original watcher can stop firing further
          // events because the inode it watched was replaced. In that case we recreate
          // the watcher after the debounce window to continue monitoring the file.
          if (eventType === 'rename') {
            // Delay re-establishing the watcher until after we have handled the change.
            setTimeout(() => {
              try {
                if (this.fileWatchers.has(validatedPath)) {
                  const staleWatcher = this.fileWatchers.get(validatedPath);
                  staleWatcher.close();
                  this.fileWatchers.delete(validatedPath);
                }
                // Recreate the watcher with the same callback so future changes are captured.
                // This can also fail if the file was, for example, deleted.
                const rewatchResult = this.watchFile(filePath, callback);
                if (!rewatchResult.success) {
                  console.warn(`Failed to re-establish watcher for ${filePath}:`, rewatchResult.error);
                }
              } catch (rewatchErr) {
                console.error('Error while re-establishing file watcher:', rewatchErr);
                // If closing the stale watcher or re-watching failed, it's probably invalid.
                // Remove it to prevent errors on subsequent unwatch calls.
                if (this.fileWatchers.has(validatedPath)) {
                  this.fileWatchers.delete(validatedPath);
                }
              }
            }, 150); // slightly longer than debounce to avoid immediate recursion
          }
        }
      });

      this.fileWatchers.set(validatedPath, watcher);

      console.log('Started watching file:', filePath);

      return {
        success: true,
        message: 'File watching started',
        path: filePath
      };

    } catch (error) {
      console.error('Failed to watch file:', error);
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  // Stop watching file
  unwatchFile(filePath) {
    try {
      const validatedPath = this.validateFilePath(filePath);

      if (!this.fileWatchers || !this.fileWatchers.has(validatedPath)) {
        return {
          success: false,
          error: 'File not being watched',
          path: filePath
        };
      }

      const watcher = this.fileWatchers.get(validatedPath);
      watcher.close();
      this.fileWatchers.delete(validatedPath);

      // Clean up any pending timer for this file
      if (this.fileWatcherTimers && this.fileWatcherTimers.has(validatedPath)) {
        clearTimeout(this.fileWatcherTimers.get(validatedPath));
        this.fileWatcherTimers.delete(validatedPath);
      }

      console.log('Stopped watching file:', filePath);

      return {
        success: true,
        message: 'File watching stopped',
        path: filePath
      };

    } catch (error) {
      console.error('Failed to unwatch file:', error);
      return {
        success: false,
        error: error.message,
        path: filePath
      };
    }
  }

  // Clean up all file watchers
  cleanupWatchers() {
    if (this.fileWatchers) {
      for (const watcher of this.fileWatchers.values()) {
        watcher.close();
      }
      this.fileWatchers.clear();
    }

    // Clean up all pending timers
    if (this.fileWatcherTimers) {
      for (const timer of this.fileWatcherTimers.values()) {
        clearTimeout(timer);
      }
      this.fileWatcherTimers.clear();
    }

    // Clean up directory watchers
    if (this.directoryWatchers) {
      for (const watcher of this.directoryWatchers.values()) {
        watcher.close();
      }
      this.directoryWatchers.clear();
    }

    // Clean up directory watcher timers
    if (this.directoryWatcherTimers) {
      for (const timer of this.directoryWatcherTimers.values()) {
        clearTimeout(timer);
      }
      this.directoryWatcherTimers.clear();
    }
  }

  // Directory watching functionality
  watchDirectory(dirPath, callback) {
    try {
      const resolvedPath = path.resolve(dirPath);

      if (!this.directoryWatchers) {
        this.directoryWatchers = new Map();
      }

      if (!this.directoryWatcherTimers) {
        this.directoryWatcherTimers = new Map();
      }

      // Don't create duplicate watchers
      if (this.directoryWatchers.has(resolvedPath)) {
        return {
          success: true,
          message: 'Directory already being watched',
          path: dirPath
        };
      }

      const watcher = fs.watch(resolvedPath, (eventType, filename) => {
        if (eventType === 'rename') { // rename events cover file/folder creation and deletion
          // Debounce rapid directory changes
          const existingTimer = this.directoryWatcherTimers.get(resolvedPath);
          if (existingTimer) {
            clearTimeout(existingTimer);
          }

          const timer = setTimeout(() => {
            callback({
              type: 'directory-changed',
              path: dirPath,
              filename: filename,
              timestamp: Date.now()
            });
            this.directoryWatcherTimers.delete(resolvedPath);
          }, 200); // 200ms debounce (slightly longer than file changes)

          this.directoryWatcherTimers.set(resolvedPath, timer);
        }
      });

      this.directoryWatchers.set(resolvedPath, watcher);

      console.log('Started watching directory:', dirPath);

      return {
        success: true,
        message: 'Directory watching started',
        path: dirPath
      };

    } catch (error) {
      console.error('Failed to watch directory:', error);
      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  // Stop watching directory
  unwatchDirectory(dirPath) {
    try {
      const resolvedPath = path.resolve(dirPath);

      if (!this.directoryWatchers || !this.directoryWatchers.has(resolvedPath)) {
        return {
          success: false,
          error: 'Directory not being watched',
          path: dirPath
        };
      }

      const watcher = this.directoryWatchers.get(resolvedPath);
      watcher.close();
      this.directoryWatchers.delete(resolvedPath);

      // Clean up any pending timer for this directory
      if (this.directoryWatcherTimers && this.directoryWatcherTimers.has(resolvedPath)) {
        clearTimeout(this.directoryWatcherTimers.get(resolvedPath));
        this.directoryWatcherTimers.delete(resolvedPath);
      }

      console.log('Stopped watching directory:', dirPath);

      return {
        success: true,
        message: 'Directory watching stopped',
        path: dirPath
      };

    } catch (error) {
      console.error('Failed to unwatch directory:', error);
      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  // Get directory contents without changing current working directory
  async getDirectoryContentsOnly(dirPath) {
    try {
      const resolvedPath = path.resolve(dirPath);
      const isValid = await this.validateDirectory(resolvedPath);

      if (!isValid) {
        throw new Error(`Invalid directory: ${resolvedPath}`);
      }

      const contents = await this.getDirectoryContents(resolvedPath);
      return {
        success: true,
        path: resolvedPath,
        contents: contents
      };
    } catch (error) {
      console.error('Failed to get directory contents only:', error);
      return {
        success: false,
        error: error.message,
        path: dirPath
      };
    }
  }

  // Recursively search for files by name prefix
  async searchFilesByPrefix(query, maxResults = 50) {
    try {
      const results = [];
      const searchStartPath = this.currentWorkingDirectory;

      console.log(`Searching for files with prefix "${query}" in ${searchStartPath}`);

      await this._searchFilesRecursive(searchStartPath, query.toLowerCase(), results, maxResults, 0, 5); // Max depth of 5

      // Sort results by relevance: exact matches first, then by file name length, then alphabetically
      results.sort((a, b) => {
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();
        const queryLower = query.toLowerCase();

        // Exact prefix match gets highest priority
        const aExactPrefix = aName.startsWith(queryLower) ? 1 : 0;
        const bExactPrefix = bName.startsWith(queryLower) ? 1 : 0;

        if (aExactPrefix !== bExactPrefix) {
          return bExactPrefix - aExactPrefix;
        }

        // Then by name length (shorter names first)
        if (aName.length !== bName.length) {
          return aName.length - bName.length;
        }

        // Finally alphabetically
        return aName.localeCompare(bName);
      });

      return {
        success: true,
        results: results.slice(0, maxResults),
        query: query,
        searchPath: searchStartPath
      };

    } catch (error) {
      console.error('Failed to search files:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        query: query
      };
    }
  }

  // Helper method for recursive file searching
  async _searchFilesRecursive(dirPath, query, results, maxResults, currentDepth, maxDepth) {
    // Stop if we've found enough results or reached max depth
    if (results.length >= maxResults || currentDepth >= maxDepth) {
      return;
    }

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files and common directories to ignore
        if (entry.name.startsWith('.') ||
            entry.name === 'node_modules' ||
            entry.name === '.git' ||
            entry.name === 'dist' ||
            entry.name === 'build') {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);

        if (entry.isFile()) {
          // Check if filename matches query
          const fileName = entry.name.toLowerCase();
          if (fileName.includes(query)) {
            try {
              const stats = await fs.stat(fullPath);

              // Determine file icon based on extension
              const icon = this._getFileIcon(entry.name);

              results.push({
                name: entry.name,
                path: fullPath,
                relativePath: path.relative(this.currentWorkingDirectory, fullPath),
                isFile: true,
                isDirectory: false,
                size: stats.size,
                modified: stats.mtime,
                icon: icon
              });

              // Stop if we've reached max results
              if (results.length >= maxResults) {
                return;
              }
            } catch (statError) {
              // Skip files we can't stat
              continue;
            }
          }
        } else if (entry.isDirectory()) {
          // Recursively search subdirectories
          await this._searchFilesRecursive(fullPath, query, results, maxResults, currentDepth + 1, maxDepth);
        }
      }
    } catch (error) {
      // Skip directories we can't read
      console.warn(`Could not read directory ${dirPath}:`, error.message);
    }
  }

  // Helper method to get file icon based on extension
  _getFileIcon(fileName) {
    const ext = path.extname(fileName).toLowerCase();
    const iconMap = {
      '.js': 'codicon-symbol-method',
      '.ts': 'codicon-symbol-method',
      '.jsx': 'codicon-symbol-method',
      '.tsx': 'codicon-symbol-method',
      '.html': 'codicon-symbol-structure',
      '.css': 'codicon-symbol-color',
      '.scss': 'codicon-symbol-color',
      '.less': 'codicon-symbol-color',
      '.json': 'codicon-symbol-misc',
      '.md': 'codicon-symbol-text',
      '.txt': 'codicon-symbol-text',
      '.py': 'codicon-symbol-method',
      '.java': 'codicon-symbol-method',
      '.cpp': 'codicon-symbol-method',
      '.c': 'codicon-symbol-method',
      '.h': 'codicon-symbol-method',
      '.xml': 'codicon-symbol-structure',
      '.yml': 'codicon-symbol-misc',
      '.yaml': 'codicon-symbol-misc',
      '.png': 'codicon-symbol-color',
      '.jpg': 'codicon-symbol-color',
      '.jpeg': 'codicon-symbol-color',
      '.gif': 'codicon-symbol-color',
      '.svg': 'codicon-symbol-color'
    };

    return iconMap[ext] || 'codicon-symbol-file';
  }

  // Get open application windows (VS Code, Cursor, etc.)
  async getOpenApplicationWindows() {
    try {
      console.log('Detecting open application windows...');
      const result = await this.windowDetector.getOpenFiles();

      if (!result.success) {
        return result; // Return error result as-is
      }

      console.log(`Found ${result.files.length} open files from ${result.runningApps?.length || 0} applications`);

      return {
        success: true,
        files: result.files || [],
        runningApps: result.runningApps || [],
        permissions: {
          hasAccessibilityPermissions: await this.windowDetector.checkAccessibilityPermissions()
        }
      };
    } catch (error) {
      console.error('Error getting open application windows:', error);
      return {
        success: false,
        error: error.message,
        files: [],
        runningApps: []
      };
    }
  }

  // Request accessibility permissions for window detection
  async requestWindowDetectionPermissions() {
    try {
      const granted = await this.windowDetector.requestAccessibilityPermissions();
      return {
        success: true,
        granted: granted,
        message: granted ?
          'Accessibility permissions granted' :
          'User must manually grant permissions in System Preferences'
      };
    } catch (error) {
      console.error('Error requesting window detection permissions:', error);
      return {
        success: false,
        error: error.message,
        granted: false
      };
    }
  }

  // Clear window detection cache (useful for testing)
  clearWindowDetectionCache() {
    this.windowDetector.clearCache();
    return {
      success: true,
      message: 'Window detection cache cleared'
    };
  }

  // Enable/disable window detection debug mode
  setWindowDetectionDebugMode(enabled) {
    this.windowDetector.setDebugMode(enabled);
    return {
      success: true,
      debugMode: enabled,
      message: `Window detection debug mode ${enabled ? 'enabled' : 'disabled'}`
    };
  }

  // Get comprehensive diagnostic information
  async getWindowDetectionDiagnostics() {
    try {
      const diagnostics = await this.windowDetector.getDiagnosticInfo();
      return {
        success: true,
        diagnostics: diagnostics
      };
    } catch (error) {
      console.error('Error getting window detection diagnostics:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Test AppleScript execution
  async testAppleScript() {
    try {
      const result = await this.windowDetector.testAppleScript();
      return {
        success: true,
        test: result
      };
    } catch (error) {
      console.error('Error testing AppleScript:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // ============================================================================
  // Workspace Management Methods
  // ============================================================================

  // Load workspaces from storage
  async loadWorkspaces() {
    try {
      const dir = path.dirname(this.workspaceStoragePath);
      await fs.mkdir(dir, { recursive: true });

      const data = await fs.readFile(this.workspaceStoragePath, 'utf8');
      const workspaceData = JSON.parse(data);

      this.workspaces.clear();
      workspaceData.forEach(workspace => {
        // Ensure workspaces have all required fields
        const normalizedWorkspace = {
          id: workspace.id,
          name: workspace.name || 'Untitled Workspace',
          folders: workspace.folders || [],
          createdAt: workspace.createdAt || new Date().toISOString(),
          lastUsed: workspace.lastUsed || workspace.createdAt || new Date().toISOString(),
          isActive: workspace.isActive || false
        };
        this.workspaces.set(workspace.id, normalizedWorkspace);
      });

      console.log(`Loaded ${this.workspaces.size} workspaces from storage`);
      return {
        success: true,
        workspaces: Array.from(this.workspaces.values())
      };
    } catch (error) {
      // File doesn't exist or is invalid, start with empty workspaces
      console.log('No existing workspaces found, starting fresh');
      return {
        success: true,
        workspaces: []
      };
    }
  }

  // Save workspaces to storage
  async saveWorkspaces() {
    try {
      const dir = path.dirname(this.workspaceStoragePath);
      await fs.mkdir(dir, { recursive: true });

      const workspaceArray = Array.from(this.workspaces.values());
      await fs.writeFile(this.workspaceStoragePath, JSON.stringify(workspaceArray, null, 2));

      console.log(`Saved ${workspaceArray.length} workspaces to storage`);
      return {
        success: true,
        message: `Saved ${workspaceArray.length} workspaces`
      };
    } catch (error) {
      console.error('Failed to save workspaces:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Create a new workspace
  async createWorkspace(name, folders) {
    try {
      // Validate inputs
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Workspace name is required');
      }

      if (!Array.isArray(folders) || folders.length === 0) {
        throw new Error('At least one folder is required');
      }

      // Validate all folders exist and are directories
      const validatedFolders = [];
      for (const folderPath of folders) {
        const resolvedPath = path.resolve(folderPath);
        const isValid = await this.validateDirectory(resolvedPath);

        if (!isValid) {
          throw new Error(`Invalid folder: ${folderPath}`);
        }

        validatedFolders.push({
          path: resolvedPath,
          name: path.basename(resolvedPath)
        });
      }

      // Check if workspace name already exists
      const existingWorkspace = Array.from(this.workspaces.values()).find(ws => ws.name === name.trim());
      if (existingWorkspace) {
        throw new Error(`Workspace "${name.trim()}" already exists`);
      }

      // Create workspace object
      const workspace = {
        id: uuidv4(),
        name: name.trim(),
        folders: validatedFolders,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString(),
        isActive: false
      };

      // Add to workspaces collection
      this.workspaces.set(workspace.id, workspace);

      // Save to storage
      await this.saveWorkspaces();

      console.log(`Created workspace "${workspace.name}" with ${workspace.folders.length} folders`);

      return {
        success: true,
        workspace: workspace,
        message: `Workspace "${workspace.name}" created successfully`
      };
    } catch (error) {
      console.error('Failed to create workspace:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get all workspaces
  async getWorkspaces() {
    try {
      // Load workspaces if not already loaded
      if (this.workspaces.size === 0) {
        await this.loadWorkspaces();
      }

      const workspaces = Array.from(this.workspaces.values());

      // Sort by last used (most recent first)
      workspaces.sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed));

      return {
        success: true,
        workspaces: workspaces,
        activeWorkspace: this.activeWorkspace
      };
    } catch (error) {
      console.error('Failed to get workspaces:', error);
      return {
        success: false,
        error: error.message,
        workspaces: []
      };
    }
  }

  // Delete a workspace
  async deleteWorkspace(workspaceId) {
    try {
      if (!this.workspaces.has(workspaceId)) {
        throw new Error('Workspace not found');
      }

      const workspace = this.workspaces.get(workspaceId);

      // If deleting the active workspace, clear active workspace
      if (this.activeWorkspace && this.activeWorkspace.id === workspaceId) {
        this.activeWorkspace = null;
      }

      // Remove from collection
      this.workspaces.delete(workspaceId);

      // Save to storage
      await this.saveWorkspaces();

      console.log(`Deleted workspace "${workspace.name}"`);

      return {
        success: true,
        message: `Workspace "${workspace.name}" deleted successfully`
      };
    } catch (error) {
      console.error('Failed to delete workspace:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Set active workspace and update working directory
  async setActiveWorkspace(workspaceId) {
    try {
      if (!this.workspaces.has(workspaceId)) {
        throw new Error('Workspace not found');
      }

      const workspace = this.workspaces.get(workspaceId);

      // Clear current active status from all workspaces
      for (const ws of this.workspaces.values()) {
        ws.isActive = false;
      }

      // Set new active workspace
      workspace.isActive = true;
      workspace.lastUsed = new Date().toISOString();
      this.activeWorkspace = workspace;

      // Update working directory to first folder in workspace
      if (workspace.folders.length > 0) {
        const firstFolder = workspace.folders[0].path;
        this.currentWorkingDirectory = firstFolder;
        this.updateDirectoryHistory(firstFolder);
      }

      // Save changes
      await this.saveWorkspaces();

      console.log(`Activated workspace "${workspace.name}"`);

      return {
        success: true,
        workspace: workspace,
        message: `Workspace "${workspace.name}" activated`,
        currentDirectory: this.currentWorkingDirectory
      };
    } catch (error) {
      console.error('Failed to set active workspace:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get active workspace
  getActiveWorkspace() {
    return {
      success: true,
      activeWorkspace: this.activeWorkspace
    };
  }

  // Clear active workspace (return to normal single-folder mode)
  async clearActiveWorkspace() {
    try {
      if (this.activeWorkspace) {
        // Clear active status from all workspaces
        for (const ws of this.workspaces.values()) {
          ws.isActive = false;
        }

        this.activeWorkspace = null;
        await this.saveWorkspaces();

        console.log('Cleared active workspace');
      }

      return {
        success: true,
        message: 'Active workspace cleared'
      };
    } catch (error) {
      console.error('Failed to clear active workspace:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if current directory is within any workspace folder
  getCurrentWorkspaceContext() {
    if (!this.activeWorkspace) {
      return {
        success: true,
        hasWorkspace: false,
        activeWorkspace: null,
        currentFolder: null
      };
    }

    // Find which folder in the workspace contains the current directory
    const currentDir = this.currentWorkingDirectory;
    const matchingFolder = this.activeWorkspace.folders.find(folder =>
      currentDir.startsWith(folder.path)
    );

    return {
      success: true,
      hasWorkspace: true,
      activeWorkspace: this.activeWorkspace,
      currentFolder: matchingFolder || null,
      currentDirectory: currentDir
    };
  }

  // Get workspace folders for navigation
  getWorkspaceFolders() {
    if (!this.activeWorkspace) {
      return {
        success: true,
        hasWorkspace: false,
        folders: []
      };
    }

    return {
      success: true,
      hasWorkspace: true,
      workspace: this.activeWorkspace,
      folders: this.activeWorkspace.folders
    };
  }
}

module.exports = FileOperations;