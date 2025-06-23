const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class FileOperations {
  constructor() {
    this.currentWorkingDirectory = os.homedir(); // Start in user's home directory
    this.directoryHistory = []; // Navigation history for back/forward
    this.historyIndex = -1; // Current position in history
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

  // Security helper to validate file path is within workspace
  validateFilePath(filePath) {
    const resolvedPath = path.resolve(filePath);
    const workspaceRoot = path.resolve(this.currentWorkingDirectory);

    // Check if the file is within the current workspace
    if (!resolvedPath.startsWith(workspaceRoot)) {
      throw new Error('File access denied: Path is outside workspace');
    }

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

      // Don't create duplicate watchers
      if (this.fileWatchers.has(validatedPath)) {
        return {
          success: true,
          message: 'File already being watched',
          path: filePath
        };
      }

      const watcher = fs.watch(validatedPath, (eventType, filename) => {
        if (eventType === 'change') {
          callback({
            type: 'file-changed',
            path: filePath,
            timestamp: Date.now()
          });
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
}

module.exports = FileOperations;