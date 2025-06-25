// Sidebar Resizer Component
class SidebarResizer {
  constructor() {
    this.isDragging = false;
    this.startX = 0;
    this.startWidth = 0;
    this.currentWidth = 280; // Default sidebar width from CSS variables
    this.minWidth = 180;
    this.maxWidth = 500;
    this.autoCloseThreshold = 180;
    
    // Storage key for persisting width
    this.storageKey = 'sidebar-width';
    
    // References to DOM elements
    this.sidebar = null;
    this.resizer = null;
    this.fileBrowser = null;
    
    this.initializeElements();
    this.loadSavedWidth();
    this.setupEventListeners();
  }

  initializeElements() {
    this.sidebar = document.querySelector('.sidebar');
    this.resizer = document.querySelector('.sidebar-resizer');
    
    // Get reference to file browser for indentation updates
    this.fileBrowser = window.fileBrowser;
    
    if (!this.sidebar) {
      console.error('Sidebar element not found');
      return;
    }
    
    if (!this.resizer) {
      console.warn('Sidebar resizer element not found - will be created');
    }
  }

  loadSavedWidth() {
    try {
      const savedWidth = localStorage.getItem(this.storageKey);
      if (savedWidth) {
        const width = parseInt(savedWidth, 10);
        if (width >= this.minWidth && width <= this.maxWidth) {
          this.currentWidth = width;
          this.updateSidebarWidth(this.currentWidth);
        }
      }
    } catch (error) {
      console.warn('Failed to load saved sidebar width:', error);
    }
  }

  saveWidth() {
    try {
      localStorage.setItem(this.storageKey, this.currentWidth.toString());
    } catch (error) {
      console.warn('Failed to save sidebar width:', error);
    }
  }

  setupEventListeners() {
    if (!this.resizer) {
      console.warn('Cannot setup resizer event listeners - resizer element not found');
      return;
    }

    // Mouse events for drag functionality
    this.resizer.addEventListener('mousedown', this.handleMouseDown.bind(this));
    document.addEventListener('mousemove', this.handleMouseMove.bind(this));
    document.addEventListener('mouseup', this.handleMouseUp.bind(this));
    
    // Prevent text selection during drag
    this.resizer.addEventListener('selectstart', (e) => e.preventDefault());
    
    // Double-click to reset to default width
    this.resizer.addEventListener('dblclick', this.resetToDefault.bind(this));
  }

  handleMouseDown(e) {
    if (!this.sidebar) return;
    
    this.isDragging = true;
    this.startX = e.clientX;
    this.startWidth = this.currentWidth;
    
    // Add visual feedback
    document.body.classList.add('sidebar-resizing');
    this.resizer.classList.add('dragging');
    
    // Prevent text selection and other interactions during drag
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Started resizing sidebar from width:', this.startWidth);
  }

  handleMouseMove(e) {
    if (!this.isDragging || !this.sidebar) return;
    
    const deltaX = e.clientX - this.startX;
    let newWidth = this.startWidth + deltaX;
    
    // Check for auto-close
    if (newWidth < this.autoCloseThreshold) {
      this.closeSidebar();
      return;
    }
    
    // Constrain within min/max bounds
    newWidth = Math.max(this.minWidth, Math.min(this.maxWidth, newWidth));
    
    if (newWidth !== this.currentWidth) {
      this.currentWidth = newWidth;
      this.updateSidebarWidth(newWidth);
      this.updateFileIndentation();
    }
  }

  handleMouseUp() {
    if (!this.isDragging) return;
    
    this.isDragging = false;
    
    // Remove visual feedback
    document.body.classList.remove('sidebar-resizing');
    this.resizer?.classList.remove('dragging');
    
    // Save the new width
    this.saveWidth();
    
    console.log('Finished resizing sidebar to width:', this.currentWidth);
  }

  updateSidebarWidth(width) {
    if (!this.sidebar) return;
    
    // Update CSS custom property
    document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
    
    // Also directly update the sidebar style as fallback
    this.sidebar.style.width = `${width}px`;
    
    console.log('Updated sidebar width to:', width);
  }

  updateFileIndentation() {
    if (!this.fileBrowser || typeof this.fileBrowser.updateIndentationForWidth !== 'function') {
      return;
    }
    
    // Calculate indentation based on current width
    const indentationPx = this.calculateIndentationForWidth(this.currentWidth);
    this.fileBrowser.updateIndentationForWidth(this.currentWidth, indentationPx);
  }

  calculateIndentationForWidth(width) {
    // Progressive indentation reduction based on width
    if (width >= 280) {
      return 20; // Normal indentation (20px per level)
    } else if (width >= 240) {
      return 15; // Reduced indentation (15px per level)
    } else if (width >= 200) {
      return 10; // Minimal indentation (10px per level)
    } else {
      return 0;  // No indentation (0px per level)
    }
  }

  closeSidebar() {
    if (!this.sidebar || !this.fileBrowser) return;
    
    console.log('Auto-closing sidebar due to minimum width threshold');
    
    // Use the file browser's toggle method if available
    if (typeof this.fileBrowser.toggleSidebarVisibility === 'function') {
      // Only close if not already hidden
      if (!this.sidebar.classList.contains('hidden')) {
        this.fileBrowser.toggleSidebarVisibility();
      }
    } else {
      // Fallback to direct manipulation
      this.sidebar.classList.add('hidden');
    }
    
    // Stop the current drag operation
    this.isDragging = false;
    document.body.classList.remove('sidebar-resizing');
    this.resizer?.classList.remove('dragging');
  }

  resetToDefault() {
    const defaultWidth = 280;
    this.currentWidth = defaultWidth;
    this.updateSidebarWidth(defaultWidth);
    this.updateFileIndentation();
    this.saveWidth();
    
    console.log('Reset sidebar to default width:', defaultWidth);
  }

  // Public method to update resizer position when sidebar is toggled
  updateResizerVisibility() {
    if (!this.resizer || !this.sidebar) return;
    
    const isHidden = this.sidebar.classList.contains('hidden');
    this.resizer.style.display = isHidden ? 'none' : 'block';
  }

  // Public method to get current width
  getCurrentWidth() {
    return this.currentWidth;
  }

  // Public method to set width programmatically
  setWidth(width) {
    if (width < this.autoCloseThreshold) {
      this.closeSidebar();
      return;
    }
    
    const constrainedWidth = Math.max(this.minWidth, Math.min(this.maxWidth, width));
    this.currentWidth = constrainedWidth;
    this.updateSidebarWidth(constrainedWidth);
    this.updateFileIndentation();
    this.saveWidth();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SidebarResizer;
} else {
  window.SidebarResizer = SidebarResizer;
}