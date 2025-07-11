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

  // Helper to convert a (possibly relative) path to an absolute path using cwd
  static toAbsolutePath(filePath, cwd) {
    if (!filePath || !cwd) return filePath;

    // If already absolute or home-relative, return as-is
    if (filePath.startsWith('/') || filePath.startsWith('~')) {
      return filePath;
    }

    // Attempt to use Node's path module first (available in Electron renderers with nodeIntegration)
    let pathModule = null;
    try {
      // eslint-disable-next-line global-require
      pathModule = require('path');
    } catch (_) {
      // Fallback to simple string handling if require is not available
    }

    if (pathModule && typeof pathModule.resolve === 'function') {
      return pathModule.resolve(cwd, filePath);
    }

    // Fallback: naïve join that handles leading './' and '../'
    const trimmedCwd = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd;
    return `${trimmedCwd}/${filePath.replace(/^\.\//, '')}`;
  }

  // Format text content with markdown-like formatting and clickable file paths
  static formatTextContent(text, cwd) {
    if (!text) return '';

    return text
      // Handle file paths - make them clickable
      .replace(this.getFilePathRegex(), (match, filePath) => {
        const cleanPath = this.cleanFilePath(filePath);
        if (this.isValidFilePath(cleanPath)) {
          // Resolve to absolute path if needed so the editor always receives a full path
          const absolutePath = this.toAbsolutePath(cleanPath, cwd);
          return `<span class="file-path-link" data-file-path="${this.escapeHTML(absolutePath)}" title="Click to open ${this.escapeHTML(absolutePath)}">${this.escapeHTML(match.trim())}</span>`;
        }
        console.log('Rejected file path:', cleanPath); // Debug logging
        return match; // Return original if not a valid file path
      })
      // Handle code blocks first (to avoid detecting file paths inside code blocks)
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
        const language = lang || '';
        return `<pre class="code-block" data-language="${language}"><code>${this.escapeHTML(code.trim())}</code></pre>`;
      })
      // Handle inline code (to avoid detecting file paths inside inline code)
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

  // File path detection utilities
  static getFilePathRegex() {
    // Improved regex that matches various file path formats Claude Code commonly outputs
    // Handles: absolute paths, relative paths, paths with line numbers, quoted paths
    // More flexible matching while avoiding URLs and obvious false positives
    return /(?:^|\s|["'`>\\(|\\[:])([.~]?[/\\]?[^\s"'`<>()\[\]]+[/\\][^\s"'`<>()\[\]]*(?:\.[a-zA-Z0-9]{1,8})(?::[0-9]+)?|[^\s"'`<>()\[\]/\\]+\.[a-zA-Z0-9]{1,8}(?::[0-9]+)?)(?=\s|$|[,.;!?"'`)]|\])/g;
  }

  // Clean and normalize file paths
  static cleanFilePath(filePath) {
    if (!filePath) return '';

    // Remove leading/trailing whitespace
    let cleaned = filePath.trim();

    // Remove leading quotes, backticks, or brackets that might be from markdown context
    cleaned = cleaned.replace(/^["'`()\[\]]+/, '').replace(/["'`()\[\]]+$/, '');

    // Remove trailing punctuation that might be from sentence context
    cleaned = cleaned.replace(/[,.;!?]+$/, '');

    // Handle different path formats
    if (cleaned.startsWith('./') || cleaned.startsWith('../')) {
      // Relative paths - keep as is
      return cleaned;
    } else if (cleaned.startsWith('/') || cleaned.startsWith('~')) {
      // Absolute paths or home directory paths - keep as is
      return cleaned;
    } else if (cleaned.includes('/') || cleaned.includes('\\')) {
      // Working directory paths - treat as relative to current directory
      return cleaned;
    } else if (cleaned.includes('.')) {
      // Simple filename with extension
      return cleaned;
    }

    return cleaned;
  }

  // Validate if a string is likely a file path
  static isValidFilePath(path) {
    if (!path || typeof path !== 'string') return false;

    // Remove line number suffix if present (e.g., "file.js:123")
    const pathWithoutLineNum = path.replace(/:([0-9]+)$/, '');

    // Must contain a file extension (more permissive)
    const hasExtension = /\.[a-zA-Z0-9]{1,8}$/.test(pathWithoutLineNum);
    if (!hasExtension) return false;

    // For paths with directories, must contain at least one separator
    // For simple filenames, allow if they have an extension
    const hasDirectory = pathWithoutLineNum.includes('/') || pathWithoutLineNum.includes('\\');
    const isSimpleFilename = !hasDirectory && pathWithoutLineNum.length > 0;

    if (!hasDirectory && !isSimpleFilename) return false;

    // Exclude obvious non-file patterns
    const excludePatterns = [
      /^https?:\/\//, // URLs
      /^mailto:/, // Email links
      /^ftp:\/\//, // FTP links
      /^www\./, // Web addresses
      /^[0-9]+\.[0-9]+\.[0-9]/, // Version numbers like 1.2.3
    ];

    for (const pattern of excludePatterns) {
      if (pattern.test(pathWithoutLineNum)) return false;
    }

    // Additional validation: shouldn't be too long (probably not a file path)
    if (pathWithoutLineNum.length > 250) return false;

    // Allow spaces in file paths (common and legitimate)
    // But reject if it looks like a sentence (multiple words with common sentence patterns)
    if (pathWithoutLineNum.includes(' ')) {
      const words = pathWithoutLineNum.split(' ');
      if (words.length > 3) return false; // Too many words, probably not a file path

      // Check for common sentence indicators
      const sentenceIndicators = /\b(the|and|or|in|on|at|to|for|of|with|by)\b/i;
      if (sentenceIndicators.test(pathWithoutLineNum)) return false;
    }

    return true;
  }

  // Handle file path click events
  static handleFilePathClick(filePath, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    // Try to open the file through the existing file browser/editor system
    if (window.app && window.app.getComponent) {
      const fileBrowser = window.app.getComponent('fileBrowser');
      const fileEditor = window.app.getComponent('fileEditor');

      if (filePath && (fileBrowser || fileEditor)) {
        // Determine if this is a viewable file (image, PDF) or editable file
        const viewableExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'pdf'];
        const extension = filePath.split('.').pop()?.toLowerCase();
        const isViewable = viewableExtensions.includes(extension);

        if (isViewable) {
          // Try to open in file viewer
          const fileViewer = window.app.getComponent('fileViewer');
          if (fileViewer) {
            fileViewer.openFile(filePath, { autoNavigateToDirectory: false });
          }
        } else {
          // Open in file editor
          if (fileEditor) {
            fileEditor.openFile(filePath, { autoNavigateToDirectory: false });
          }
        }
      }
    }
  }

  // Create thinking section HTML
  static createThinkingSection(thinking, isCollapsed = true) {
    if (!thinking || !thinking.thinking) return '';

    const thinkingId = 'thinking_' + Math.random().toString(36).substring(2, 11);
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
    const toolId = 'tool_' + Math.random().toString(36).substring(2, 11);
    // Always expand Edit, MultiEdit, and Write tools by default
    const isCollapsed = !['Edit', 'MultiEdit', 'Write'].includes(toolCall.name);
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
    const toolId = 'inline_tool_' + Math.random().toString(36).substring(2, 11);
    // Expand Edit, MultiEdit, Write tools by default, or any tool that has failed.
    const isCollapsed = !(['Edit', 'MultiEdit', 'Write'].includes(toolCall.name) || toolCall.status === 'failed');
    const contentStyle = isCollapsed ? 'display: none;' : '';

    const toolIcon = this.getToolIcon(toolCall.name);
    const toolSummary = this.getToolSummary(toolCall, cwd);
    const finalStatus = toolCall.status || (toolCall.output ? 'completed' : status);

    let statusIndicator = '';
    if (finalStatus === 'in_progress') statusIndicator = '⏳';
    else if (finalStatus === 'failed') statusIndicator = '❌';

    return `
      <div class="inline-tool-call ${finalStatus}">
        <div class="inline-tool-header" onclick="MessageUtils.toggleTool('${toolId}')" data-collapsed="${isCollapsed}">
          <span class="tool-icon codicon ${toolIcon}"></span>
          <span class="tool-name">${toolCall.name}</span>
          <span class="tool-summary">${toolSummary}</span>
          <span class="tool-status ${finalStatus}">${statusIndicator}</span>
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

    const createClickableFilePath = (filePath) => {
      if (!filePath) return 'unknown';
      const absolutePath = this.toAbsolutePath(filePath, cwd);
      const relativePath = createRelativePath(absolutePath);
      return `<span class="file-path-link" data-file-path="${this.escapeHTML(absolutePath)}" title="Click to open ${this.escapeHTML(relativePath)}">${this.escapeHTML(relativePath)}</span>`;
    };

    switch (toolCall.name) {
      case 'Edit':
        const editFilePath = toolCall.input.file_path;
        const editFileName = editFilePath ? editFilePath.split('/').pop() : 'unknown';
        return editFileName.includes('/') ? createClickableFilePath(editFilePath) : editFileName;
      case 'MultiEdit':
        return `Making ${toolCall.input.edits?.length || 0} edits to: ${createClickableFilePath(toolCall.input.file_path)}`;
      case 'Write':
        return `Writing file: ${createClickableFilePath(toolCall.input.file_path)}`;
      case 'Read':
        const filePath = toolCall.input.file_path;
        const fileName = filePath ? filePath.split('/').pop() : 'unknown';
        const offset = toolCall.input.offset || 1;
        const limit = toolCall.input.limit || 'all';
        const lineRange = limit === 'all' ? `${offset}+` : `${offset}-${offset + limit - 1}`;
        const fileDisplay = filePath ? createClickableFilePath(filePath) : fileName;
        return `${fileDisplay}:${lineRange}`;
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
    let details = '';
    // For Edit, MultiEdit and Write tools, show a professional diff view
    if (toolCall.name === 'Edit' || toolCall.name === 'MultiEdit' || toolCall.name === 'Write') {
        details += this.createDiffView(toolCall, cwd);
    } else {
        // For other tools, show the traditional input/output view
        let inputDisplay = this.escapeHTML(JSON.stringify(toolCall.input, null, 2));

        // Make file paths clickable in input JSON
        if (toolCall.input && toolCall.input.file_path) {
          const absolutePathForInput = this.toAbsolutePath(toolCall.input.file_path, cwd);
          const relativePath = this.getRelativePath(absolutePathForInput, cwd);
          const escapedFilePath = this.escapeHTML(absolutePathForInput);
          const clickableFilePath = `<span class="file-path-link" data-file-path="${escapedFilePath}" title="Click to open ${this.escapeHTML(relativePath)}">${escapedFilePath}</span>`;
          inputDisplay = inputDisplay.replace(
            new RegExp(escapedFilePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
            clickableFilePath
          );
        }

        details += '<div class="tool-input"><strong>Input:</strong><pre>' + inputDisplay + '</pre></div>';
    }

    if (toolCall.output) {
      let outputContent = this.escapeHTML(toolCall.output);

      // Apply file path formatting to output content
      outputContent = this.formatTextContent(outputContent, cwd);

      details += `<div class="tool-output ${toolCall.status === 'failed' ? 'error' : ''}"><strong>Output:</strong><div class="tool-output-content">` +
                  outputContent +
                  '</div></div>';
    }

    return details;
  }

  // Create professional diff view for Edit and MultiEdit tools
  static createDiffView(toolCall, cwd) {
    const relativePath = this.getRelativePath(toolCall.input.file_path, cwd);
    const absolutePath = this.toAbsolutePath(toolCall.input.file_path, cwd);
    const diffViewId = 'diff_' + Math.random().toString(36).substring(2, 11);

    let diffContent = '';

    if (toolCall.name === 'Edit') {
      // Single edit – guard against undefined strings
      const { old_string = '', new_string = '' } = toolCall.input || {};
      diffContent = this.createSingleDiff(old_string, new_string, diffViewId + '_0');
    } else if (toolCall.name === 'MultiEdit') {
      // Multiple edits –   edits can sometimes arrive as a JSON string, so attempt to parse
      let edits = toolCall.input?.edits;
      if (typeof edits === 'string') {
        try {
          edits = JSON.parse(edits);
        } catch (err) {
          console.warn('Failed to JSON.parse edits string – falling back to raw display', err);
        }
      }

      if (Array.isArray(edits)) {
        diffContent = edits.map((edit, index) => {
          const oldStr = edit?.old_string || '';
          const newStr = edit?.new_string || '';
          return this.createSingleDiff(oldStr, newStr, `${diffViewId}_${index}`, index + 1, edits.length);
        }).join('');
      } else {
        // Unknown / malformed edits – display raw for debugging instead of crashing
        const rawContent = typeof edits === 'string' ? edits : JSON.stringify(edits, null, 2);
        diffContent = `
          <div class="multi-edit-raw">${this.escapeHTML(rawContent || 'Unable to display diff – unsupported edits format')}</div>
        `;
      }
    } else if (toolCall.name === 'Write') {
      const old_string = toolCall.input.old_content_for_diff || '';
      const new_string = toolCall.input.content || '';
      diffContent = this.createSingleDiff(old_string, new_string, diffViewId + '_0');
    }

    return `
      <div class="diff-viewer">
        <div class="diff-header">
          <div class="diff-file-info">
            <span class="codicon codicon-file-code"></span>
            <span class="file-path-link diff-file-path" data-file-path="${this.escapeHTML(absolutePath)}" title="Click to open ${this.escapeHTML(relativePath)}">${this.escapeHTML(relativePath)}</span>
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

    // Compress large unchanged blocks to a single skipped marker for better readability
    const SKIP_THRESHOLD = 20; // min consecutive unchanged lines before collapsing
    const CONTEXT = 3; // number of context lines to keep around skipped region

    const compressed = [];
    let i = 0;
    while (i < diffLines.length) {
      if (diffLines[i].type !== 'unchanged') {
        compressed.push(diffLines[i]);
        i++;
        continue;
      }

      // Accumulate consecutive unchanged lines
      let j = i;
      while (j < diffLines.length && diffLines[j].type === 'unchanged') {
        j++;
      }
      const count = j - i;

      if (count > SKIP_THRESHOLD) {
        // Keep leading and trailing context lines and insert a skipped marker
        compressed.push(...diffLines.slice(i, i + CONTEXT));
        compressed.push({
          type: 'skipped',
          oldLineNum: null,
          newLineNum: null,
          content: `… ${count - CONTEXT * 2} unchanged lines …`
        });
        compressed.push(...diffLines.slice(j - CONTEXT, j));
      } else {
        compressed.push(...diffLines.slice(i, j));
      }
      i = j;
    }

    return compressed;
  }

  // Render one side of the side-by-side diff
  static renderDiffSide(diffLines, side) {
    return diffLines.map(line => {
      let content = '';
      let lineClass = '';
      let lineNumber = '';

      if (line.type === 'skipped') {
        content = line.content || '…';
        lineClass = 'diff-line-skipped';
        // For skipped lines we omit line numbers on both sides
      } else if (side === 'old') {
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
      } else if (line.type === 'skipped') {
        prefix = '…';
        lineClass = 'diff-line-skipped';
      }

      const lineNumbers = line.type === 'skipped' ? '' : `${line.oldLineNum || ''}${line.oldLineNum && line.newLineNum ? ',' : ''}${line.newLineNum || ''}`;

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

    const logsId = 'logs_' + Math.random().toString(36).substring(2, 11);
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
      html += `<div class="assistant-response primary-response">${this.formatTextContent(textContent, cwd)}</div>`;
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
          html += `<div class="response-text">${this.formatTextContent(block.text, cwd)}</div>`;
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