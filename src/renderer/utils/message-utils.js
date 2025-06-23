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

  // Helper to convert absolute path to relative
  static getRelativePath(absolutePath, cwd) {
    if (!cwd || !absolutePath || typeof absolutePath !== 'string') {
      return absolutePath;
    }

    // Use a simple string replacement
    if (absolutePath.startsWith(cwd)) {
      let relativePath = absolutePath.substring(cwd.length);
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      return relativePath || '.';
    }

    return absolutePath;
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
  static createToolCallSection(toolCall, cwd) {
    const toolId = 'tool_' + Math.random().toString(36).substr(2, 9);
    const isCollapsed = true;
    const contentStyle = isCollapsed ? 'display: none;' : '';

    const toolIcon = this.getToolIcon(toolCall.name);
    const toolSummary = this.getToolSummary(toolCall, cwd);

    return `
      <div class="tool-call">
        <div class="tool-header" onclick="MessageUtils.toggleTool('${toolId}')" data-collapsed="${isCollapsed}">
          <span class="tool-icon codicon ${toolIcon}"></span>
          <span class="tool-name">${toolCall.name}</span>
          <span class="tool-summary">${toolSummary}</span>
          <span class="tool-status completed"></span>
        </div>
        <div class="tool-details" id="${toolId}" style="${contentStyle}">
          ${this.createToolDetails(toolCall, cwd)}
        </div>
      </div>
    `;
  }

  // Create inline tool call HTML for use within message flow
  static createInlineToolCall(toolCall, status = 'completed', cwd) {
    const toolId = 'inline_tool_' + Math.random().toString(36).substr(2, 9);
    const isCollapsed = true;
    const contentStyle = isCollapsed ? 'display: none;' : '';

    const toolIcon = this.getToolIcon(toolCall.name);
    const toolSummary = this.getToolSummary(toolCall, cwd);

    return `
      <div class="inline-tool-call ${status}">
        <div class="inline-tool-header" onclick="MessageUtils.toggleTool('${toolId}')" data-collapsed="${isCollapsed}">
          <span class="tool-icon codicon ${toolIcon}"></span>
          <span class="tool-name">${toolCall.name}</span>
          <span class="tool-summary">${toolSummary}</span>
          <span class="tool-status ${status}">${status === 'in_progress' ? '⏳' : ''}</span>
        </div>
        <div class="tool-details" id="${toolId}" style="${contentStyle}">
          ${this.createToolDetails(toolCall, cwd)}
        </div>
      </div>
    `;
  }

  // Toggle tool call details visibility
  static toggleTool(toolId) {
    const content = document.getElementById(toolId);
    const header = content.parentElement.querySelector('.tool-header, .inline-tool-header');

    if (content.style.display === 'none') {
      content.style.display = 'block';
      header.setAttribute('data-collapsed', 'false');
    } else {
      content.style.display = 'none';
      header.setAttribute('data-collapsed', 'true');
    }
  }

  // Get tool icon based on tool name
  static getToolIcon(toolName) {
    const icons = {
      'Edit': 'codicon-edit',
      'MultiEdit': 'codicon-file-submodule',
      'Write': 'codicon-save',
      'Read': 'codicon-eye',
      'Bash': 'codicon-terminal',
      'LS': 'codicon-list-unordered',
      'Glob': 'codicon-search',
      'Grep': 'codicon-search',
      'TodoWrite': 'codicon-note',
      'TodoRead': 'codicon-book',
      'WebFetch': 'codicon-globe',
      'WebSearch': 'codicon-search',
      'Task': 'codicon-gear'
    };
    return icons[toolName] || 'codicon-tools';
  }

  // Get tool summary text
  static getToolSummary(toolCall, cwd) {
    const createRelativePath = (filePath) => {
      return this.getRelativePath(filePath, cwd);
    };

    switch (toolCall.name) {
      case 'Edit':
        const editFilePath = toolCall.input.file_path;
        const editFileName = editFilePath ? editFilePath.split('/').pop() : 'unknown';
        return editFileName;
      case 'MultiEdit':
        return `Making ${toolCall.input.edits?.length || 0} edits to: ${createRelativePath(toolCall.input.file_path)}`;
      case 'Write':
        return `Writing file: ${createRelativePath(toolCall.input.file_path)}`;
      case 'Read':
        const filePath = toolCall.input.file_path;
        const fileName = filePath ? filePath.split('/').pop() : 'unknown';
        const offset = toolCall.input.offset || 1;
        const limit = toolCall.input.limit || 'all';
        const lineRange = limit === 'all' ? `${offset}+` : `${offset}-${offset + limit - 1}`;
        return `${fileName}:${lineRange}`;
      case 'Bash':
        return toolCall.input.description || `Running command: ${toolCall.input.command}`;
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

  // Create detailed tool information with diff view for Edit/MultiEdit tools
  static createToolDetails(toolCall, cwd) {
    // For Edit and MultiEdit tools, show a professional diff view
    if (toolCall.name === 'Edit' || toolCall.name === 'MultiEdit') {
      return this.createDiffView(toolCall, cwd);
    }

    // For other tools, show the traditional input/output view
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

  // Create professional diff view for Edit and MultiEdit tools
  static createDiffView(toolCall, cwd) {
    const filePath = this.getRelativePath(toolCall.input.file_path, cwd);
    const diffViewId = 'diff_' + Math.random().toString(36).substr(2, 9);

    let diffContent = '';

    if (toolCall.name === 'Edit') {
      // Single edit
      const { old_string, new_string } = toolCall.input;
      diffContent = this.createSingleDiff(old_string, new_string, diffViewId + '_0');
    } else if (toolCall.name === 'MultiEdit') {
      // Multiple edits
      const edits = toolCall.input.edits || [];
      diffContent = edits.map((edit, index) => {
        return this.createSingleDiff(edit.old_string, edit.new_string, `${diffViewId}_${index}`, index + 1, edits.length);
      }).join('');
    }

    return `
      <div class="diff-viewer">
        <div class="diff-header">
          <div class="diff-file-info">
            <span class="codicon codicon-file-code"></span>
            <span class="diff-file-path">${this.escapeHTML(filePath)}</span>
          </div>
          <div class="diff-actions">
            <button class="diff-mode-toggle" onclick="MessageUtils.toggleDiffMode('${diffViewId}')" title="Switch to side-by-side view">
              <span class="codicon codicon-list-unordered"></span>
            </button>
          </div>
        </div>
        <div class="diff-content" id="${diffViewId}">
          ${diffContent}
        </div>
      </div>
    `;
  }

  // Create a single diff section
  static createSingleDiff(oldString, newString, diffId, editNumber = null, totalEdits = null) {
    // Generate line-by-line diff using a simple approach
    const oldLines = oldString.split('\n');
    const newLines = newString.split('\n');
    const diffLines = this.generateDiffLines(oldLines, newLines);

    const header = editNumber ? `
      <div class="diff-edit-header">
        <span class="diff-edit-number">Edit ${editNumber} of ${totalEdits}</span>
      </div>
    ` : '';

    return `
      ${header}
      <div class="diff-section" id="${diffId}">
        <div class="diff-side-by-side" style="display: none;">
          <div class="diff-left">
            <div class="diff-side-header removed">
              <span class="codicon codicon-remove"></span>
              <span>Before</span>
            </div>
            <div class="diff-lines">
              ${this.renderDiffSide(diffLines, 'old')}
            </div>
          </div>
          <div class="diff-right">
            <div class="diff-side-header added">
              <span class="codicon codicon-add"></span>
              <span>After</span>
            </div>
            <div class="diff-lines">
              ${this.renderDiffSide(diffLines, 'new')}
            </div>
          </div>
        </div>
        <div class="diff-unified">
          <div class="diff-unified-header">
            <span class="codicon codicon-diff"></span>
            <span>Unified Diff</span>
          </div>
          <div class="diff-lines">
            ${this.renderUnifiedDiff(diffLines)}
          </div>
        </div>
      </div>
    `;
  }

  // Generate diff lines using a simple LCS-based approach
  static generateDiffLines(oldLines, newLines) {
    const diffLines = [];
    let oldIndex = 0;
    let newIndex = 0;

    // Simple diff algorithm - not as sophisticated as real diff algorithms but works well for our use case
    while (oldIndex < oldLines.length || newIndex < newLines.length) {
      const oldLine = oldLines[oldIndex];
      const newLine = newLines[newIndex];

      if (oldIndex >= oldLines.length) {
        // Only new lines left
        diffLines.push({ type: 'added', oldLineNum: null, newLineNum: newIndex + 1, content: newLine });
        newIndex++;
      } else if (newIndex >= newLines.length) {
        // Only old lines left
        diffLines.push({ type: 'removed', oldLineNum: oldIndex + 1, newLineNum: null, content: oldLine });
        oldIndex++;
      } else if (oldLine === newLine) {
        // Lines are the same
        diffLines.push({ type: 'unchanged', oldLineNum: oldIndex + 1, newLineNum: newIndex + 1, content: oldLine });
        oldIndex++;
        newIndex++;
      } else {
        // Lines are different - look ahead to see if we can find a match
        let foundMatch = false;
        const lookAhead = 3;

        for (let i = 1; i <= lookAhead && newIndex + i < newLines.length; i++) {
          if (oldLine === newLines[newIndex + i]) {
            // Found old line later in new lines - these are insertions
            for (let j = 0; j < i; j++) {
              diffLines.push({ type: 'added', oldLineNum: null, newLineNum: newIndex + j + 1, content: newLines[newIndex + j] });
            }
            diffLines.push({ type: 'unchanged', oldLineNum: oldIndex + 1, newLineNum: newIndex + i + 1, content: oldLine });
            oldIndex++;
            newIndex += i + 1;
            foundMatch = true;
            break;
          }
        }

        if (!foundMatch) {
          for (let i = 1; i <= lookAhead && oldIndex + i < oldLines.length; i++) {
            if (newLine === oldLines[oldIndex + i]) {
              // Found new line later in old lines - these are deletions
              for (let j = 0; j < i; j++) {
                diffLines.push({ type: 'removed', oldLineNum: oldIndex + j + 1, newLineNum: null, content: oldLines[oldIndex + j] });
              }
              diffLines.push({ type: 'unchanged', oldLineNum: oldIndex + i + 1, newLineNum: newIndex + 1, content: newLine });
              oldIndex += i + 1;
              newIndex++;
              foundMatch = true;
              break;
            }
          }
        }

        if (!foundMatch) {
          // No match found - treat as modification
          diffLines.push({ type: 'removed', oldLineNum: oldIndex + 1, newLineNum: null, content: oldLine });
          diffLines.push({ type: 'added', oldLineNum: null, newLineNum: newIndex + 1, content: newLine });
          oldIndex++;
          newIndex++;
        }
      }
    }

    return diffLines;
  }

  // Render one side of the side-by-side diff
  static renderDiffSide(diffLines, side) {
    return diffLines.map(line => {
      let content = '';
      let lineClass = '';
      let lineNumber = '';

      if (side === 'old') {
        if (line.type === 'removed' || line.type === 'unchanged') {
          content = line.content;
          lineNumber = line.oldLineNum || '';
          lineClass = line.type === 'removed' ? 'diff-line-removed' : 'diff-line-unchanged';
        } else {
          // Empty line for additions on the old side
          content = '';
          lineNumber = '';
          lineClass = 'diff-line-empty';
        }
      } else {
        if (line.type === 'added' || line.type === 'unchanged') {
          content = line.content;
          lineNumber = line.newLineNum || '';
          lineClass = line.type === 'added' ? 'diff-line-added' : 'diff-line-unchanged';
        } else {
          // Empty line for removals on the new side
          content = '';
          lineNumber = '';
          lineClass = 'diff-line-empty';
        }
      }

      return `
        <div class="diff-line ${lineClass}">
          <div class="diff-line-number">${lineNumber}</div>
          <div class="diff-line-content">${this.escapeHTML(content)}</div>
        </div>
      `;
    }).join('');
  }

  // Render unified diff view
  static renderUnifiedDiff(diffLines) {
    return diffLines.map(line => {
      let prefix = ' ';
      let lineClass = 'diff-line-unchanged';

      if (line.type === 'added') {
        prefix = '+';
        lineClass = 'diff-line-added';
      } else if (line.type === 'removed') {
        prefix = '-';
        lineClass = 'diff-line-removed';
      }

      const lineNumbers = `${line.oldLineNum || ''}${line.oldLineNum && line.newLineNum ? ',' : ''}${line.newLineNum || ''}`;

      return `
        <div class="diff-line ${lineClass}">
          <div class="diff-line-number">${lineNumbers}</div>
          <div class="diff-line-prefix">${prefix}</div>
          <div class="diff-line-content">${this.escapeHTML(line.content)}</div>
        </div>
      `;
    }).join('');
  }

  // Toggle between side-by-side and unified diff view
  static toggleDiffMode(diffViewId) {
    const diffContent = document.getElementById(diffViewId);
    if (!diffContent) return;

    const sideBySide = diffContent.querySelector('.diff-side-by-side');
    const unified = diffContent.querySelector('.diff-unified');
    const button = diffContent.parentElement.querySelector('.diff-mode-toggle');

    if (sideBySide && unified && button) {
      const isSideBySide = sideBySide.style.display !== 'none';

      if (isSideBySide) {
        // Switch to unified
        sideBySide.style.display = 'none';
        unified.style.display = 'block';
        button.innerHTML = '<span class="codicon codicon-list-unordered"></span>';
        button.title = 'Switch to side-by-side view';
      } else {
        // Switch to side-by-side
        unified.style.display = 'none';
        sideBySide.style.display = 'flex';
        button.innerHTML = '<span class="codicon codicon-split-horizontal"></span>';
        button.title = 'Switch to unified view';
      }
    }
  }

  // Create task logs section
  static createTaskLogsSection(toolCalls, thinking, cwd) {
    if (!toolCalls.length && !thinking) return '';

    const logsId = 'logs_' + Math.random().toString(36).substr(2, 9);
    const isCollapsed = true;
    const contentStyle = isCollapsed ? 'display: none;' : '';

    let content = '';

    if (thinking) {
      content += this.createThinkingSection(thinking, false);
    }

    toolCalls.forEach(toolCall => {
      content += this.createToolCallSection(toolCall, cwd);
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
  static createMessageHTML(message, cwd) {
    const { textBlocks, toolCalls, thinking, orderedContent } = this.parseMessageContent(message.content);

    // Use inline rendering for messages with structured content
    if (orderedContent && orderedContent.length > 0) {
      return this.createInlineMessageHTML(orderedContent, thinking, cwd);
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
      html += this.createTaskLogsSection(toolCalls, thinking, cwd);
    }

    return html;
  }

  // Create message HTML with inline tool calls in sequential order
  static createInlineMessageHTML(orderedContent, thinking, cwd) {
    let html = '<div class="assistant-response inline-response">';

    orderedContent.forEach(block => {
      if (block.type === 'text') {
        if (block.text && block.text.trim()) {
          html += `<div class="response-text">${this.formatTextContent(block.text)}</div>`;
        }
      } else if (block.type === 'tool_use') {
        html += this.createInlineToolCall(block, 'completed', cwd);
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