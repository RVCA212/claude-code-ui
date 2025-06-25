// File Viewer Component - Image and PDF Display
class FileViewerComponent {
  constructor() {
    this.currentFile = null;
    this.isInitialized = false;
    this.currentZoom = 1;
    this.minZoom = 0.1;
    this.maxZoom = 5;
    this.zoomStep = 0.2;
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.imagePosition = { x: 0, y: 0 };

    this.container = document.getElementById('viewerContainer');
    this.setupContainer();
    this.setupKeyboardShortcuts();
  }

  setupContainer() {
    if (!this.container) {
      console.error('Viewer container not found');
      return;
    }

    // Create viewer wrapper with header
    this.container.innerHTML = `
      <div class="viewer-wrapper">
        <div class="viewer-header" id="viewerHeader" style="display: none;">
          <div class="file-info">
            <span class="file-icon" id="viewerFileIcon">📄</span>
            <span class="file-name" id="viewerFileName">No file open</span>
            <span class="file-type" id="viewerFileType"></span>
          </div>
          <div class="viewer-actions">
            <div class="zoom-controls" id="zoomControls" style="display: none;">
              <button class="viewer-btn" id="zoomOutBtn" title="Zoom out">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
                  <path d="M8 11h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
              <span class="zoom-level" id="zoomLevel">100%</span>
              <button class="viewer-btn" id="zoomInBtn" title="Zoom in">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
                  <path d="M8 11h6M11 8v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
              <button class="viewer-btn" id="resetZoomBtn" title="Reset zoom">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 4v6h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
              <button class="viewer-btn" id="fitToWindowBtn" title="Fit to window">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M16 21h3a2 2 0 0 0 2-2v-3M8 21H5a2 2 0 0 0-2-2v-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
            <button class="viewer-btn" id="closeViewerBtn" title="Close file">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                <line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
        <div class="viewer-content" id="viewerContent">
          <div class="viewer-placeholder">
            <div class="placeholder-icon">👁️</div>
            <div class="placeholder-text">
              <h3>No file selected</h3>
              <p>Select an image or PDF from the sidebar to view</p>
            </div>
          </div>
        </div>
      </div>
    `;

    // Set up event listeners
    this.setupEventListeners();
  }

  setupEventListeners() {
    const closeBtn = document.getElementById('closeViewerBtn');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const resetZoomBtn = document.getElementById('resetZoomBtn');
    const fitToWindowBtn = document.getElementById('fitToWindowBtn');

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.closeFile());
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => this.zoomIn());
    }

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => this.zoomOut());
    }

    if (resetZoomBtn) {
      resetZoomBtn.addEventListener('click', () => this.resetZoom());
    }

    if (fitToWindowBtn) {
      fitToWindowBtn.addEventListener('click', () => this.fitToWindow());
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!this.currentFile) return;

      // Ctrl/Cmd + W for close
      if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault();
        this.closeFile();
      }

      // Zoom shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        this.zoomIn();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        this.zoomOut();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        this.resetZoom();
      }
    });
  }

  async openFile(filePath, options = {}) {
    if (!filePath) {
      console.error('No file path provided');
      return;
    }

    try {
      console.log('Opening file in viewer:', filePath);

      // Check if we need to handle directory context
      const autoNavigateToDirectory = options.autoNavigateToDirectory !== false;

      this.showLoading('Loading file...');

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
                contents: []
              }
            }));

            // Try reading the file again
            result = await window.electronAPI.readFile(filePath);
          }
        } catch (navError) {
          console.warn('Failed to navigate to file directory:', navError);
        }
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to read file');
      }

      // Detect file type
      const fileType = this.getFileType(filePath);
      
      if (!this.isSupportedFileType(fileType)) {
        throw new Error('Unsupported file type. Viewer supports images (PNG, JPG, JPEG) and PDF files.');
      }

      // Set current file
      this.currentFile = {
        path: filePath,
        name: this.getFileName(filePath),
        type: fileType,
        size: result.size || 0
      };

      // Reset viewer state
      this.resetViewerState();

      // Display the file
      await this.displayFile();

      // Update UI
      this.updateFileInfo();
      this.showViewer();

      // Dispatch event for global header
      setTimeout(() => {
        document.dispatchEvent(new CustomEvent('fileOpened', {
          detail: {
            name: this.currentFile.name,
            path: this.currentFile.path,
            icon: this.getFileIcon(this.currentFile.name)
          }
        }));
      }, 50);

      console.log('File opened successfully in viewer:', filePath);

    } catch (error) {
      console.error('Failed to open file in viewer:', error);
      this.showError(`Failed to open file: ${error.message}`);
    }
  }

  async displayFile() {
    const content = document.getElementById('viewerContent');
    if (!content || !this.currentFile) return;

    const { type, path } = this.currentFile;

    if (type === 'image') {
      await this.displayImage(content, path);
    } else if (type === 'pdf') {
      this.displayPDF(content, path);
    }
  }

  async displayImage(container, filePath) {
    container.innerHTML = `
      <div class="image-viewer" id="imageViewerContainer">
        <div class="image-container" id="imageContainer">
          <img id="viewerImage" src="file://${filePath}" alt="${this.currentFile.name}" 
               style="transform: scale(${this.currentZoom}) translate(${this.imagePosition.x}px, ${this.imagePosition.y}px);">
        </div>
      </div>
    `;

    const image = document.getElementById('viewerImage');
    const imageContainer = document.getElementById('imageContainer');

    // Set up image event listeners
    image.addEventListener('load', () => {
      console.log('Image loaded successfully');
      this.updateZoomControls();
      this.fitToWindow(); // Auto-fit on load
    });

    image.addEventListener('error', () => {
      this.showError('Failed to load image');
    });

    // Set up drag functionality for images
    this.setupImageDragging(imageContainer, image);

    // Show zoom controls for images
    const zoomControls = document.getElementById('zoomControls');
    if (zoomControls) {
      zoomControls.style.display = 'flex';
    }
  }

  displayPDF(container, filePath) {
    container.innerHTML = `
      <div class="pdf-viewer">
        <embed id="viewerPDF" src="file://${filePath}" type="application/pdf" width="100%" height="100%">
        <div class="pdf-fallback" style="display: none;">
          <div class="fallback-message">
            <h3>PDF Viewer Not Available</h3>
            <p>Your browser doesn't support embedded PDFs.</p>
            <button class="viewer-btn" onclick="window.electronAPI.openFileInDefaultApp('${filePath}')">
              Open in Default App
            </button>
          </div>
        </div>
      </div>
    `;

    const embed = document.getElementById('viewerPDF');
    const fallback = container.querySelector('.pdf-fallback');

    // Show fallback if PDF embed fails
    embed.addEventListener('error', () => {
      embed.style.display = 'none';
      if (fallback) {
        fallback.style.display = 'flex';
      }
    });

    // Hide zoom controls for PDFs (PDF viewer has its own controls)
    const zoomControls = document.getElementById('zoomControls');
    if (zoomControls) {
      zoomControls.style.display = 'none';
    }
  }

  setupImageDragging(container, image) {
    let isDragging = false;
    let startX, startY, startTranslateX, startTranslateY;

    container.addEventListener('mousedown', (e) => {
      if (this.currentZoom <= 1) return; // Only allow dragging when zoomed in
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startTranslateX = this.imagePosition.x;
      startTranslateY = this.imagePosition.y;
      container.style.cursor = 'grabbing';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      this.imagePosition.x = startTranslateX + deltaX;
      this.imagePosition.y = startTranslateY + deltaY;
      
      this.updateImageTransform();
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        container.style.cursor = this.currentZoom > 1 ? 'grab' : 'default';
      }
    });

    // Mouse wheel zoom
    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -1 : 1;
      
      if (delta > 0) {
        this.zoomIn();
      } else {
        this.zoomOut();
      }
    });
  }

  updateImageTransform() {
    const image = document.getElementById('viewerImage');
    if (image) {
      image.style.transform = `scale(${this.currentZoom}) translate(${this.imagePosition.x}px, ${this.imagePosition.y}px)`;
      
      const container = document.getElementById('imageContainer');
      if (container) {
        container.style.cursor = this.currentZoom > 1 ? 'grab' : 'default';
      }
    }
  }

  zoomIn() {
    if (this.currentZoom < this.maxZoom) {
      this.currentZoom = Math.min(this.maxZoom, this.currentZoom + this.zoomStep);
      this.updateImageTransform();
      this.updateZoomControls();
    }
  }

  zoomOut() {
    if (this.currentZoom > this.minZoom) {
      this.currentZoom = Math.max(this.minZoom, this.currentZoom - this.zoomStep);
      this.updateImageTransform();
      this.updateZoomControls();
    }
  }

  resetZoom() {
    this.currentZoom = 1;
    this.imagePosition = { x: 0, y: 0 };
    this.updateImageTransform();
    this.updateZoomControls();
  }

  fitToWindow() {
    const image = document.getElementById('viewerImage');
    const container = document.getElementById('imageViewerContainer');
    
    if (!image || !container) return;

    // Wait for image to load if needed
    if (image.naturalWidth === 0) {
      image.addEventListener('load', () => this.fitToWindow(), { once: true });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const imageAspect = image.naturalWidth / image.naturalHeight;
    const containerAspect = containerRect.width / containerRect.height;

    let scale;
    if (imageAspect > containerAspect) {
      // Image is wider, fit to width
      scale = (containerRect.width * 0.9) / image.naturalWidth;
    } else {
      // Image is taller, fit to height
      scale = (containerRect.height * 0.9) / image.naturalHeight;
    }

    this.currentZoom = Math.max(this.minZoom, Math.min(this.maxZoom, scale));
    this.imagePosition = { x: 0, y: 0 };
    this.updateImageTransform();
    this.updateZoomControls();
  }

  updateZoomControls() {
    const zoomLevel = document.getElementById('zoomLevel');
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');

    if (zoomLevel) {
      zoomLevel.textContent = `${Math.round(this.currentZoom * 100)}%`;
    }

    if (zoomInBtn) {
      zoomInBtn.disabled = this.currentZoom >= this.maxZoom;
    }

    if (zoomOutBtn) {
      zoomOutBtn.disabled = this.currentZoom <= this.minZoom;
    }
  }

  closeFile() {
    this.currentFile = null;
    this.resetViewerState();
    this.hideViewer();

    // Dispatch event for global header
    setTimeout(() => {
      document.dispatchEvent(new CustomEvent('fileClosed'));
    }, 50);

    console.log('File closed in viewer');
  }

  resetViewerState() {
    this.currentZoom = 1;
    this.imagePosition = { x: 0, y: 0 };
  }

  updateFileInfo() {
    if (!this.currentFile) return;

    const fileIcon = document.getElementById('viewerFileIcon');
    const fileName = document.getElementById('viewerFileName');
    const fileType = document.getElementById('viewerFileType');

    if (fileIcon) {
      fileIcon.textContent = this.getFileIcon(this.currentFile.name);
    }

    if (fileName) {
      fileName.textContent = this.currentFile.name;
      fileName.title = this.currentFile.path;
    }

    if (fileType) {
      fileType.textContent = this.currentFile.type.toUpperCase();
    }
  }

  getFileName(filePath) {
    return filePath.split('/').pop() || filePath;
  }

  getFileType(filePath) {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    if (['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'].includes(extension)) {
      return 'image';
    } else if (extension === 'pdf') {
      return 'pdf';
    }
    
    return 'unknown';
  }

  isSupportedFileType(fileType) {
    return ['image', 'pdf'].includes(fileType);
  }

  getFileIcon(fileName) {
    const extension = fileName.split('.').pop()?.toLowerCase();

    const iconMap = {
      'png': '🖼️',
      'jpg': '🖼️',
      'jpeg': '🖼️',
      'gif': '🖼️',
      'bmp': '🖼️',
      'webp': '🖼️',
      'pdf': '📕'
    };

    return iconMap[extension] || '📄';
  }

  showViewer() {
    console.log('showViewer() called');

    const header = document.getElementById('viewerHeader');
    if (header) {
      console.log('Showing viewer header');
      header.style.display = 'flex';
    }

    // Reveal the viewer pane
    if (this.container) {
      console.log('Adding active class to viewer container');
      this.container.classList.add('active');
    }

    // Add viewer-active class to app-content container for layout adjustments
    const appContent = document.querySelector('.app-content');
    if (appContent) {
      appContent.classList.add('viewer-active');
    }

    // Update global header button states
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (window.globalHeader && typeof window.globalHeader.updateButtonStates === 'function') {
          window.globalHeader.updateButtonStates();
        }
      });
    });

    console.log('showViewer() completed');
  }

  hideViewer() {
    const header = document.getElementById('viewerHeader');
    const content = document.getElementById('viewerContent');

    if (header) {
      header.style.display = 'none';
    }

    if (content) {
      content.innerHTML = `
        <div class="viewer-placeholder">
          <div class="placeholder-icon">👁️</div>
          <div class="placeholder-text">
            <h3>No file selected</h3>
            <p>Select an image or PDF from the sidebar to view</p>
          </div>
        </div>
      `;
    }

    // Hide the viewer pane
    if (this.container) {
      this.container.classList.remove('active');
    }

    // Remove viewer-active class from app-content container
    const appContent = document.querySelector('.app-content');
    if (appContent) {
      appContent.classList.remove('viewer-active');
    }

    // Update global header button states
    requestAnimationFrame(() => {
      if (window.globalHeader && typeof window.globalHeader.updateButtonStates === 'function') {
        window.globalHeader.updateButtonStates();
      }
    });

    console.log('hideViewer() completed');
  }

  showLoading(message) {
    const content = document.getElementById('viewerContent');
    if (content) {
      content.innerHTML = `
        <div class="viewer-loading">
          <div class="loading-spinner"></div>
          <div class="loading-text">${message}</div>
        </div>
      `;
    }
  }

  showError(message) {
    const content = document.getElementById('viewerContent');
    if (content) {
      content.innerHTML = `
        <div class="viewer-error">
          <div class="error-icon">⚠️</div>
          <div class="error-text">${message}</div>
          <button onclick="window.app?.getComponent('fileViewer')?.retryFile()" class="retry-btn">Retry</button>
        </div>
      `;
    }
  }

  retryFile() {
    if (this.currentFile?.path) {
      this.openFile(this.currentFile.path);
    }
  }

  // Public API methods
  getCurrentFile() {
    return this.currentFile;
  }

  isViewerActive() {
    return this.container?.classList.contains('active') || false;
  }
}

// Export for module compatibility
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FileViewerComponent;
}