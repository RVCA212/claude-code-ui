// DOM utility functions for the renderer
class DOMUtils {
  // Safe element selector with error handling
  static getElementById(id) {
    const element = document.getElementById(id);
    if (!element) {
      console.warn(`Element with id '${id}' not found`);
    }
    return element;
  }

  // Get multiple elements by ID
  static getElementsByIds(ids) {
    const elements = {};
    ids.forEach(id => {
      elements[id] = this.getElementById(id);
    });
    return elements;
  }

  // Set element text content safely
  static setTextContent(element, text) {
    if (element) {
      element.textContent = text;
    }
  }

  // Set element HTML safely
  static setHTML(element, html) {
    if (element) {
      element.innerHTML = html;
    }
  }

  // Add event listener with error handling
  static addEventListener(element, event, handler, options = {}) {
    if (element) {
      element.addEventListener(event, handler, options);
    } else {
      console.warn('Cannot add event listener to null element');
    }
  }

  // Remove event listener
  static removeEventListener(element, event, handler) {
    if (element) {
      element.removeEventListener(event, handler);
    }
  }

  // Toggle class
  static toggleClass(element, className, force) {
    if (element) {
      return element.classList.toggle(className, force);
    }
    return false;
  }

  // Add class
  static addClass(element, className) {
    if (element) {
      element.classList.add(className);
    }
  }

  // Remove class
  static removeClass(element, className) {
    if (element) {
      element.classList.remove(className);
    }
  }

  // Check if element has class
  static hasClass(element, className) {
    if (element) {
      return element.classList.contains(className);
    }
    return false;
  }

  // Show element
  static show(element, displayType = 'block') {
    if (element) {
      element.style.display = displayType;
    }
  }

  // Hide element
  static hide(element) {
    if (element) {
      element.style.display = 'none';
    }
  }

  // Check if element is visible
  static isVisible(element) {
    if (element) {
      return element.style.display !== 'none' && element.offsetParent !== null;
    }
    return false;
  }

  // Set element disabled state
  static setDisabled(element, disabled) {
    if (element) {
      element.disabled = disabled;
    }
  }

  // Clear element content
  static clear(element) {
    if (element) {
      element.innerHTML = '';
    }
  }

  // Scroll element into view
  static scrollIntoView(element, options = { behavior: 'smooth', block: 'nearest' }) {
    if (element) {
      element.scrollIntoView(options);
    }
  }

  // Focus element
  static focus(element) {
    if (element) {
      element.focus();
    }
  }

  // Create element with attributes and content
  static createElement(tag, attributes = {}, content = '') {
    const element = document.createElement(tag);
    
    Object.entries(attributes).forEach(([key, value]) => {
      if (key === 'className') {
        element.className = value;
      } else if (key === 'textContent') {
        element.textContent = value;
      } else if (key === 'innerHTML') {
        element.innerHTML = value;
      } else {
        element.setAttribute(key, value);
      }
    });

    if (content) {
      element.textContent = content;
    }

    return element;
  }

  // Append child elements
  static appendChild(parent, child) {
    if (parent && child) {
      parent.appendChild(child);
    }
  }

  // Remove element
  static removeElement(element) {
    if (element && element.parentNode) {
      element.parentNode.removeChild(element);
    }
  }

  // Get element's computed style
  static getComputedStyle(element, property) {
    if (element) {
      const styles = window.getComputedStyle(element);
      return property ? styles.getPropertyValue(property) : styles;
    }
    return null;
  }

  // Auto-resize textarea
  static autoResizeTextarea(textarea) {
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    }
  }

  // Escape HTML to prevent XSS
  static escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Format timestamp for display
  static formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  }

  // Format file size
  static formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  // Generate UUID for elements
  static generateId() {
    return 'el_' + Math.random().toString(36).substr(2, 9);
  }

  // Get current cursor position in textarea
  static getCursorPosition(textarea) {
    if (textarea && typeof textarea.selectionStart === 'number') {
      return textarea.selectionStart;
    }
    return 0;
  }

  // Set cursor position in textarea
  static setCursorPosition(textarea, position) {
    if (textarea && typeof textarea.setSelectionRange === 'function') {
      textarea.setSelectionRange(position, position);
      textarea.focus();
    }
  }

  // Get token at a specific position in text
  static getTokenAtPosition(text, position) {
    if (!text || position < 0 || position > text.length) {
      return { token: '', start: position, end: position };
    }

    // Find the start of the current token (non-whitespace before position)
    let start = position;
    while (start > 0 && !/\s/.test(text[start - 1])) {
      start--;
    }

    // Find the end of the current token (non-whitespace after position)
    let end = position;
    while (end < text.length && !/\s/.test(text[end])) {
      end++;
    }

    return {
      token: text.substring(start, end),
      start: start,
      end: end
    };
  }

  // Check if position is at start of input or after whitespace
  static isTokenStart(text, position) {
    if (position === 0) return true;
    if (position > 0 && /\s/.test(text[position - 1])) return true;
    return false;
  }

  // Extract mention query from text at position
  static extractMentionQuery(text, position) {
    const tokenInfo = this.getTokenAtPosition(text, position);
    
    if (tokenInfo.token.startsWith('@')) {
      return {
        query: tokenInfo.token.substring(1), // Remove '@' prefix
        start: tokenInfo.start,
        end: tokenInfo.end,
        fullMatch: tokenInfo.token
      };
    }
    
    return null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMUtils;
} else {
  window.DOMUtils = DOMUtils;
}