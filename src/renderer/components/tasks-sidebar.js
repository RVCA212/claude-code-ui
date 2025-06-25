// Tasks Sidebar Component - Shows live Claude processes
class TasksSidebar {
  constructor() {
    this.tasks = [];
    this.isVisible = false;
    this.refreshInterval = null;
    
    this.initializeElements();
    this.setupEventListeners();
    this.startPeriodicRefresh();
  }

  initializeElements() {
    this.tasksSidebar = document.getElementById('tasksSidebar');
    this.tasksList = document.getElementById('sidebarTasksList');
  }

  setupEventListeners() {
    // Listen for process events from main process if available
    if (window.electronAPI && window.electronAPI.onProcessStatusChanged) {
      window.electronAPI.onProcessStatusChanged((event, data) => {
        this.handleProcessStatusChange(data);
      });
    }
  }

  startPeriodicRefresh() {
    // Refresh tasks every 2 seconds when visible
    this.refreshInterval = setInterval(() => {
      if (this.isVisible) {
        this.refreshTasks();
      }
    }, 2000);
  }

  async refreshTasks() {
    try {
      const result = await window.electronAPI.getRunningTasks();
      if (result.success) {
        this.tasks = result.tasks;
        this.renderTasks();
      }
    } catch (error) {
      console.error('Failed to refresh tasks:', error);
    }
  }

  renderTasks() {
    if (!this.tasksList) return;

    if (this.tasks.length === 0) {
      this.tasksList.innerHTML = `
        <div class="empty-state">
          <p>No active tasks running</p>
          <small>Tasks will appear here when Claude is processing messages</small>
        </div>
      `;
      return;
    }

    const tasksHTML = this.tasks.map(task => this.createTaskHTML(task)).join('');
    this.tasksList.innerHTML = tasksHTML;
  }

  createTaskHTML(task) {
    const timestamp = DOMUtils.formatTimestamp(task.startTime);
    const statusClass = this.getStatusClass(task.status);
    const statusText = this.getStatusText(task.status);
    
    // Get session title or fallback
    const title = task.sessionTitle || `Session ${task.sessionId.substring(0, 8)}...`;
    
    // Working directory display
    const cwdDisplay = task.workingDirectory 
      ? `<span class="task-cwd" title="Working directory: ${task.workingDirectory}">📁 ${this.getDisplayPath(task.workingDirectory)}</span>`
      : '';

    return `
      <div class="task-item" 
           data-session-id="${task.sessionId}" 
           onclick="tasksSidebar.selectTask('${task.sessionId}')"
           title="Click to switch to this conversation">
        <div class="task-content">
          <div class="task-header">
            <div class="task-title">${DOMUtils.escapeHTML(title)}</div>
            <span class="task-status ${statusClass}">${statusText}</span>
          </div>
          <div class="task-meta">
            <span class="task-timestamp">Started: ${timestamp}</span>
            ${cwdDisplay}
          </div>
          ${task.lastMessage ? `<div class="task-preview">${DOMUtils.escapeHTML(task.lastMessage.substring(0, 60))}</div>` : ''}
        </div>
        <button class="stop-task-btn" 
                onclick="event.stopPropagation(); tasksSidebar.stopTask('${task.sessionId}')" 
                title="Stop this task">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="6" width="12" height="12" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </div>
    `;
  }

  getStatusClass(status) {
    switch (status) {
      case 'streaming': return 'status-streaming';
      case 'processing': return 'status-processing';
      case 'thinking': return 'status-thinking';
      default: return 'status-active';
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

  getDisplayPath(path) {
    if (!path) return '';
    const parts = path.split('/');
    return parts[parts.length - 1] || parts[parts.length - 2] || path;
  }

  async selectTask(sessionId) {
    try {
      // Switch to the selected session using the session manager
      if (window.sessionManager && typeof window.sessionManager.selectSession === 'function') {
        await window.sessionManager.selectSession(sessionId);
        console.log('Switched to task session:', sessionId);
      } else {
        console.error('Session manager not available');
      }
    } catch (error) {
      console.error('Failed to select task:', error);
    }
  }

  async stopTask(sessionId) {
    try {
      await window.electronAPI.stopMessage(sessionId);
      console.log('Stopped task:', sessionId);
      // Refresh the tasks list
      this.refreshTasks();
    } catch (error) {
      console.error('Failed to stop task:', error);
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
      this.renderTasks();
    } else if (action === 'status_changed') {
      // Update status of existing task
      const task = this.tasks.find(t => t.sessionId === sessionId);
      if (task) {
        task.status = status;
        this.renderTasks();
      }
    }
  }

  show() {
    if (!this.tasksSidebar) return;
    
    this.tasksSidebar.style.display = 'flex';
    this.isVisible = true;
    
    // Immediately refresh tasks when shown
    this.refreshTasks();
    
    console.log('Tasks sidebar shown');
  }

  hide() {
    if (!this.tasksSidebar) return;
    
    this.tasksSidebar.style.display = 'none';
    this.isVisible = false;
    
    console.log('Tasks sidebar hidden');
  }

  cleanup() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TasksSidebar;
} else {
  window.TasksSidebar = TasksSidebar;
}