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
}

module.exports = FileOperations;