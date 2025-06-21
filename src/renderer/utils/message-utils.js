// Message utility functions for rendering and formatting
class MessageUtils {
  // Parse structured message content
  static parseMessageContent(content) {
    if (!content) return { textBlocks: [], toolCalls: [], thinking: null, orderedContent: [] };

    if (typeof content === 'string') {
      // Legacy string content
      const orderedContent = [{ type: 'text', text: content }];
      return {
        textBlocks: [{ type: 'text', text: content }],
        toolCalls: [],
        thinking: null,
        orderedContent
      };
    }

    if (Array.isArray(content)) {
      const textBlocks = content.filter(block => block.type === 'text');
      const toolCalls = content.filter(block => block.type === 'tool_use');
      const thinking = content.find(block => block.type === 'thinking');

      // Preserve the original order of content blocks for inline display
      const orderedContent = content.filter(block =>
        block.type === 'text' || block.type === 'tool_use'
      );

      return { textBlocks, toolCalls, thinking, orderedContent };
    }

    return { textBlocks: [], toolCalls: [], thinking: null, orderedContent: [] };
  }

  // Format text content with markdown-like formatting
  static formatTextContent(text) {
    if (!text) return '';

    return text
      // Handle code blocks
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || '';
        return `<pre class="code-block" data-language="${language}"><code>${this.escapeHTML(code.trim())}</code></pre>`;
      })
      // Handle inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Handle bold text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Handle italic text
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Handle line breaks
      .replace(/\n/g, '<br>');
  }

  // Escape HTML to prevent XSS
  static escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Create thinking section HTML
  static createThinkingSection(thinking, isCollapsed = true) {
    if (!thinking || !thinking.thinking) return '';

    const thinkingId = 'thinking_' + Math.random().toString(36).substr(2, 9);
    const toggleText = isCollapsed ? 'expand' : 'collapse';
    const contentStyle = isCollapsed ? 'display: none;' : '';

    return `
      <div class="thinking-section">
        <div class="thinking-header">
          <span>🤔 Thinking</span>
          <button class="thinking-toggle" onclick="MessageUtils.toggleThinking('${thinkingId}')">${toggleText}</button>
        </div>
        <div class="thinking-content" id="${thinkingId}" style="${contentStyle}">
          ${this.escapeHTML(thinking.thinking)}
        </div>
      </div>
    `;
  }

  // Toggle thinking section visibility
  static toggleThinking(thinkingId) {
    const content = document.getElementById(thinkingId);
    const button = content.previousElementSibling.querySelector('.thinking-toggle');

    if (content.style.display === 'none') {
      content.style.display = 'block';
      button.textContent = 'collapse';
    } else {
      content.style.display = 'none';
      button.textContent = 'expand';
    }
  }

  // Create tool call HTML
  static createToolCallSection(toolCall) {
    const toolId = 'tool_' + Math.random().toString(36).substr(2, 9);
    const isCollapsed = true;
    const contentStyle = isCollapsed ? 'display: none;' : '';
    const toggleText = isCollapsed ? 'expand' : 'collapse';

    const toolIcon = this.getToolIcon(toolCall.name);
    const toolSummary = this.getToolSummary(toolCall);

    return `
      <div class="tool-call">
        <div class="tool-header">
          <span class="tool-icon">${toolIcon}</span>
          <span class="tool-name">${toolCall.name}</span>
          <span class="tool-status completed">completed</span>
          <button class="tool-toggle" onclick="MessageUtils.toggleTool('${toolId}')">${toggleText}</button>
        </div>
        <div class="tool-summary">${toolSummary}</div>
        <div class="tool-details" id="${toolId}" style="${contentStyle}">
          ${this.createToolDetails(toolCall)}
        </div>
      </div>
    `;
  }

  // Create inline tool call HTML for use within message flow
  static createInlineToolCall(toolCall, status = 'completed') {
    const toolId = 'inline_tool_' + Math.random().toString(36).substr(2, 9);
    const isCollapsed = true;
    const contentStyle = isCollapsed ? 'display: none;' : '';
    const toggleText = isCollapsed ? 'expand' : 'collapse';

    const toolIcon = this.getToolIcon(toolCall.name);
    const toolSummary = this.getToolSummary(toolCall);

    return `
      <div class="inline-tool-call ${status}">
        <div class="inline-tool-header">
          <span class="tool-icon">${toolIcon}</span>
          <span class="tool-name">${toolCall.name}</span>
          <span class="tool-summary">${toolSummary}</span>
          <span class="tool-status ${status}">${status === 'in_progress' ? '⏳' : '✅'}</span>
          <button class="tool-toggle" onclick="MessageUtils.toggleTool('${toolId}')">${toggleText}</button>
        </div>
        <div class="tool-details" id="${toolId}" style="${contentStyle}">
          ${this.createToolDetails(toolCall)}
        </div>
      </div>
    `;
  }

  // Toggle tool call details visibility
  static toggleTool(toolId) {
    const content = document.getElementById(toolId);
    const button = content.parentElement.querySelector('.tool-toggle');

    if (content.style.display === 'none') {
      content.style.display = 'block';
      button.textContent = 'collapse';
    } else {
      content.style.display = 'none';
      button.textContent = 'expand';
    }
  }

  // Get tool icon based on tool name
  static getToolIcon(toolName) {
    const icons = {
      'Edit': '✏️',
      'MultiEdit': '📝',
      'Write': '📄',
      'Read': '👁️',
      'Bash': '💻',
      'LS': '📂',
      'Glob': '🔍',
      'Grep': '🔎',
      'TodoWrite': '✅',
      'TodoRead': '📋',
      'WebFetch': '🌐',
      'WebSearch': '🔍',
      'Task': '⚙️'
    };
    return icons[toolName] || '🔧';
  }

  // Get tool summary text
  static getToolSummary(toolCall) {
    switch (toolCall.name) {
      case 'Edit':
        return `Editing file: ${toolCall.input.file_path}`;
      case 'MultiEdit':
        return `Making ${toolCall.input.edits?.length || 0} edits to: ${toolCall.input.file_path}`;
      case 'Write':
        return `Writing file: ${toolCall.input.file_path}`;
      case 'Read':
        return `Reading file: ${toolCall.input.file_path}`;
      case 'Bash':
        return `Running command: ${toolCall.input.command}`;
      case 'LS':
        return `Listing directory: ${toolCall.input.path || 'current directory'}`;
      case 'Glob':
        return `Finding files: ${toolCall.input.pattern}`;
      case 'Grep':
        return `Searching for: ${toolCall.input.pattern}`;
      case 'TodoWrite':
        return `Managing ${toolCall.input.todos?.length || 0} todo items`;
      case 'TodoRead':
        return 'Reading todo list';
      case 'WebFetch':
        return `Fetching: ${toolCall.input.url}`;
      case 'WebSearch':
        return `Searching: ${toolCall.input.query}`;
      case 'Task':
        return toolCall.input.description || 'Running task';
      default:
        return `Using ${toolCall.name}`;
    }
  }

  // Create detailed tool information
  static createToolDetails(toolCall) {
    let details = '<div class="tool-input"><strong>Input:</strong><pre>' +
                  this.escapeHTML(JSON.stringify(toolCall.input, null, 2)) +
                  '</pre></div>';

    if (toolCall.output) {
      details += '<div class="tool-output"><strong>Output:</strong><div class="tool-output-content">' +
                  this.escapeHTML(toolCall.output) +
                  '</div></div>';
    }

    return details;
  }

  // Create task logs section
  static createTaskLogsSection(toolCalls, thinking) {
    if (!toolCalls.length && !thinking) return '';

    const logsId = 'logs_' + Math.random().toString(36).substr(2, 9);
    const isCollapsed = true;
    const contentStyle = isCollapsed ? 'display: none;' : '';

    let content = '';

    if (thinking) {
      content += this.createThinkingSection(thinking, false);
    }

    toolCalls.forEach(toolCall => {
      content += this.createToolCallSection(toolCall);
    });

    return `
      <div class="task-logs-container">
        <button class="task-logs-toggle" onclick="MessageUtils.toggleTaskLogs('${logsId}')">
          <span class="task-logs-label">Task Logs (${toolCalls.length} tools)</span>
          <span class="task-logs-icon">▼</span>
        </button>
        <div class="task-logs-content" id="${logsId}" style="${contentStyle}">
          ${content}
        </div>
      </div>
    `;
  }

  // Toggle task logs visibility
  static toggleTaskLogs(logsId) {
    const content = document.getElementById(logsId);
    const button = content.parentElement.querySelector('.task-logs-toggle');
    const icon = button.querySelector('.task-logs-icon');

    if (content.style.display === 'none') {
      content.style.display = 'block';
      icon.textContent = '▲';
      button.classList.add('expanded');
    } else {
      content.style.display = 'none';
      icon.textContent = '▼';
      button.classList.remove('expanded');
    }
  }

  // Create complete message HTML with inline tool calls
  static createMessageHTML(message) {
    const { textBlocks, toolCalls, thinking, orderedContent } = this.parseMessageContent(message.content);

    // Use inline rendering for messages with structured content
    if (orderedContent && orderedContent.length > 0) {
      return this.createInlineMessageHTML(orderedContent, thinking);
    }

    // Fallback to legacy rendering for simple text messages
    let html = '';

    // Add text content FIRST and prominently (this is the main response)
    if (textBlocks.length > 0) {
      const textContent = textBlocks.map(block => block.text || '').join('\n\n');
      html += `<div class="assistant-response primary-response">${this.formatTextContent(textContent)}</div>`;
    }

    // Add task logs AFTER the main response (as supporting details)
    if (toolCalls.length > 0 || thinking) {
      html += this.createTaskLogsSection(toolCalls, thinking);
    }

    return html;
  }

  // Create message HTML with inline tool calls in sequential order
  static createInlineMessageHTML(orderedContent, thinking) {
    let html = '<div class="assistant-response inline-response">';

    orderedContent.forEach(block => {
      if (block.type === 'text') {
        if (block.text && block.text.trim()) {
          html += `<div class="response-text">${this.formatTextContent(block.text)}</div>`;
        }
      } else if (block.type === 'tool_use') {
        html += this.createInlineToolCall(block);
      }
    });

    // Add thinking section at the end if present
    if (thinking) {
      html += this.createThinkingSection(thinking, true);
    }

    html += '</div>';
    return html;
  }

  // Create message actions (revert button, etc.)
  static createMessageActions(message, sessionId) {
    return `
      <div class="message-actions">
        <button class="revert-btn"
                onclick="MessageActions.revertToMessage('${sessionId}', '${message.id}')"
                title="Revert files to this point">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 3v5h-5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M21 12a9 9 0 0 1-9 9c-4.7 0-8.6-3.4-9-8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    `;
  }

  // Update character counter
  static updateCharCounter(input, counter) {
    if (input && counter) {
      const length = input.value.length;
      counter.textContent = `${length} characters`;
    }
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MessageUtils;
} else {
  window.MessageUtils = MessageUtils;
}