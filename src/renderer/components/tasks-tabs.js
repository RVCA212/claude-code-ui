// Tasks Tabs Component - Shows running tasks as clickable tabs below the global header
class TasksTabs {
  constructor() {
    this.tasks = [];
    this.isVisible = false;
    this.currentSessionId = null;
    this.refreshInterval = null;
    this.durations = new Map(); // Track task durations
    
    this.initializeElements();
    this.setupEventListeners();
    this.startPeriodicRefresh();
  }

  initializeElements() {
    this.tasksTabsContainer = document.getElementById('tasksTabsContainer');
    this.tasksTabsList = document.getElementById('tasksTabsList');
    this.appContent = document.querySelector('.app-content');
  }

  setupEventListeners() {
    // Listen for session changes to hide tabs when in current task session
    document.addEventListener('sessionChanged', (event) => {
      this.currentSessionId = event.detail.sessionId;
      this.updateVisibility();
    });

    // Listen for process events from main process if available
    if (window.electronAPI && window.electronAPI.onProcessStatusChanged) {
      window.electronAPI.onProcessStatusChanged((event, data) => {
        this.handleProcessStatusChange(data);
      });
    }

    // Listen for streaming state changes
    if (window.electronAPI && window.electronAPI.onStreamingStateChanged) {
      window.electronAPI.onStreamingStateChanged((event, data) => {
        this.handleStreamingStateChange(data);
      });
    }
  }

  startPeriodicRefresh() {
    // Refresh tasks every 2 seconds to update durations and status
    this.refreshInterval = setInterval(() => {
      if (this.isVisible) {
        this.updateDurations();
        this.refreshTasks();
      }
    }, 2000);
  }

  async refreshTasks() {
    try {
      const result = await window.electronAPI.getRunningTasks();
      if (result.success) {
        this.tasks = result.tasks;
        this.updateVisibility();
        if (this.shouldShowTabs()) {
          this.renderTabs();
        }
      }
    } catch (error) {
      console.error('Failed to refresh tasks for tabs:', error);
    }
  }

  shouldShowTabs() {
    // Show tabs only if:
    // 1. There are running tasks
    // 2. We're not currently in a running task session
    if (this.tasks.length === 0) {
      return false;
    }

    // Hide if we're currently in one of the running task sessions
    if (this.currentSessionId) {
      const isInRunningTask = this.tasks.some(task => task.sessionId === this.currentSessionId);
      if (isInRunningTask) {
        return false;
      }
    }

    return true;
  }

  updateVisibility() {
    const shouldShow = this.shouldShowTabs();
    
    if (shouldShow && !this.isVisible) {
      this.show();
    } else if (!shouldShow && this.isVisible) {
      this.hide();
    }
  }

  show() {
    if (!this.tasksTabsContainer) return;
    
    this.tasksTabsContainer.style.display = 'block';
    this.tasksTabsContainer.classList.remove('hidden');
    this.tasksTabsContainer.classList.add('visible');
    this.isVisible = true;
    
    // Add class to app content for layout adjustment
    if (this.appContent) {
      this.appContent.classList.add('tasks-tabs-visible');
    }
    
    this.renderTabs();
    console.log('Tasks tabs shown');
  }

  hide() {
    if (!this.tasksTabsContainer) return;
    
    this.tasksTabsContainer.classList.remove('visible');
    this.tasksTabsContainer.classList.add('hidden');
    
    // Remove class from app content
    if (this.appContent) {
      this.appContent.classList.remove('tasks-tabs-visible');
    }
    
    // Hide after animation completes
    setTimeout(() => {
      if (this.tasksTabsContainer) {
        this.tasksTabsContainer.style.display = 'none';
      }
    }, 200);
    
    this.isVisible = false;
    console.log('Tasks tabs hidden');
  }

  renderTabs() {
    if (!this.tasksTabsList) return;

    if (this.tasks.length === 0) {
      this.tasksTabsList.innerHTML = '<div class="tasks-tabs-empty">No active tasks</div>';
      return;
    }

    const tabsHTML = this.tasks.map(task => this.createTabHTML(task)).join('');
    this.tasksTabsList.innerHTML = tabsHTML;
  }

  createTabHTML(task) {
    const statusClass = this.getStatusClass(task.status);
    const statusText = this.getStatusText(task.status);
    const duration = this.getTaskDuration(task);
    
    // Get session title or fallback
    const title = task.sessionTitle || `Session ${task.sessionId.substring(0, 8)}...`;
    
    return `
      <div class="task-tab ${statusClass}" 
           data-session-id="${task.sessionId}" 
           onclick="tasksTabs.selectTask('${task.sessionId}')"
           title="Click to switch to this conversation: ${DOMUtils.escapeHTML(title)}">
        <div class="task-tab-content">
          <div class="task-tab-status ${statusClass}"></div>
          <div class="task-tab-title">${DOMUtils.escapeHTML(title)}</div>
          <div class="task-tab-meta">
            <span class="task-tab-duration">${duration}</span>
          </div>
        </div>
      </div>
    `;
  }

  getStatusClass(status) {
    switch (status) {
      case 'streaming': return 'streaming';
      case 'processing': return 'processing';
      case 'thinking': return 'thinking';
      default: return 'active';
    }
  }

  getStatusText(status) {
    switch (status) {
      case 'streaming': return 'Streaming';
      case 'processing': return 'Processing';
      case 'thinking': return 'Thinking';
      default: return 'Active';
    }
  }

  getTaskDuration(task) {
    const now = Date.now();
    const startTime = new Date(task.startTime).getTime();
    const durationMs = now - startTime;
    
    // Store duration for this task
    this.durations.set(task.sessionId, durationMs);
    
    // Format duration
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  updateDurations() {
    // Update duration displays without full re-render
    if (!this.isVisible) return;
    
    const tabElements = this.tasksTabsList?.querySelectorAll('.task-tab');
    if (!tabElements) return;
    
    tabElements.forEach(tabElement => {
      const sessionId = tabElement.getAttribute('data-session-id');
      const task = this.tasks.find(t => t.sessionId === sessionId);
      
      if (task) {
        const durationElement = tabElement.querySelector('.task-tab-duration');
        if (durationElement) {
          durationElement.textContent = this.getTaskDuration(task);
        }
      }
    });
  }

  async selectTask(sessionId) {
    try {
      // Switch to the selected session using the session manager
      if (window.sessionManager && typeof window.sessionManager.selectSession === 'function') {
        await window.sessionManager.selectSession(sessionId);
        console.log('Switched to task session from tabs:', sessionId);
        
        // Tabs will be hidden automatically via session change event
      } else {
        console.error('Session manager not available');
      }
    } catch (error) {
      console.error('Failed to select task from tabs:', error);
    }
  }

  handleProcessStatusChange(data) {
    // Handle real-time process status changes
    const { sessionId, status, action } = data;
    
    if (action === 'started') {
      // A new process started, refresh tasks
      this.refreshTasks();
    } else if (action === 'stopped') {
      // A process stopped, remove it from tasks
      this.tasks = this.tasks.filter(task => task.sessionId !== sessionId);
      this.durations.delete(sessionId);
      this.updateVisibility();
      if (this.isVisible) {
        this.renderTabs();
      }
    } else if (action === 'status_changed') {
      // Update status of existing task
      const task = this.tasks.find(t => t.sessionId === sessionId);
      if (task) {
        task.status = status;
        if (this.isVisible) {
          this.renderTabs();
        }
      }
    }
  }

  handleStreamingStateChange(data) {
    // Handle streaming state changes
    const { sessionId, isStreaming } = data;
    
    const task = this.tasks.find(t => t.sessionId === sessionId);
    if (task) {
      task.status = isStreaming ? 'streaming' : 'active';
      if (this.isVisible) {
        this.renderTabs();
      }
    }
  }

  // Public method to force refresh (called by other components)
  forceRefresh() {
    this.refreshTasks();
  }

  // Public method to update current session (called by session manager)
  updateCurrentSession(sessionId) {
    this.currentSessionId = sessionId;
    this.updateVisibility();
  }

  cleanup() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    
    // Clean up durations
    this.durations.clear();
    
    // Remove app content class
    if (this.appContent) {
      this.appContent.classList.remove('tasks-tabs-visible');
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TasksTabs;
} else {
  window.TasksTabs = TasksTabs;
}