# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this codebase.

## Project Overview

**Claude Code Chat** is an Electron desktop application that provides a GUI interface for interacting with Claude Code CLI. It features a modern chat interface, file browser, code editor, session management, and checkpoint system for conversation recovery.

### Key Features
- Real-time streaming chat interface with Claude
- Integrated file browser and Monaco code editor
- Session management with conversation history
- SQLite-based checkpoint system for crash recovery
- Secure subprocess integration with Claude CLI
- Modern CSS Grid/Flexbox responsive design

## Development Commands

### Getting Started

```bash
# Install dependencies
npm install

# Start the application in development mode (with DevTools)
npm run dev

# Start the application normally
npm start

# Build for distribution
npm run build

# Install Claude CLI dependency (required)
npm run install-claude

# Rebuild native dependencies (ARM64 optimized)
npm run rebuild
```

### Prerequisites

1. **Node.js v16+** - For Electron and build tools
2. **Claude CLI** - Install with `npm run install-claude` or `npm install -g @anthropic-ai/claude-code`
3. **Anthropic API Key** - Set as `ANTHROPIC_API_KEY` environment variable

### Environment Setup

```bash
# Set your API key
export ANTHROPIC_API_KEY="your-api-key-here"

# Verify Claude CLI installation
claude --version
claude -p "test message"
```

## Application Architecture

### File Structure

```
claude-code-chat/
├── main.js                 # Electron main process entry point
├── preload.js             # Secure IPC bridge to renderer
├── package.json           # Dependencies and build configuration
├── src/
│   ├── main/              # Main process modules
│   │   ├── main.js        # Application initialization and window management
│   │   ├── session-manager.js      # Session storage and recovery
│   │   ├── claude-process-manager.js # Claude CLI subprocess management
│   │   ├── checkpoint-manager.js    # SQLite-based conversation checkpoints
│   │   ├── file-operations.js      # File system operations
│   │   ├── ipc-handlers.js         # Inter-process communication
│   │   └── preload-bridge.js       # Secure API exposure
│   ├── renderer/          # Renderer process components
│   │   ├── app.js         # Main application initialization
│   │   ├── components/    # Modular UI components
│   │   │   ├── app-component.js    # Main app coordinator
│   │   │   ├── session-manager.js  # Session UI management
│   │   │   ├── file-browser.js     # Integrated file browser
│   │   │   ├── file-editor.js      # Monaco code editor
│   │   │   └── message-component.js # Chat interface
│   │   └── utils/         # Utility functions
│   └── shared/            # Shared API definitions
└── renderer/              # Static frontend assets
    ├── index.html         # Main HTML template
    ├── app.js            # Legacy renderer entry point
    └── styles/           # CSS modules
    @renderer/styles/README.md
```

### Multi-Process Architecture

**Main Process** (`src/main/main.js`):
- Manages Electron window lifecycle and app initialization
- Coordinates modular backend services (sessions, checkpoints, file ops)
- Handles Claude CLI subprocess spawning and management
- Provides secure IPC communication with renderer

**Preload Script** (`preload.js` → `src/main/preload-bridge.js`):
- Creates secure API bridge between main and renderer processes
- Exposes only necessary APIs to maintain security isolation
- Validates API availability in development mode

**Renderer Process** (`renderer/` + `src/renderer/`):
- Modern component-based UI architecture
- Real-time streaming message display with syntax highlighting
- Integrated Monaco editor for code editing
- File browser with directory navigation
- Session management UI with conversation history

### Key Integration Patterns

**Claude CLI Subprocess Management:**
```javascript
// Full tool access via subprocess (src/main/claude-process-manager.js)
const claudeProcess = spawn('claude', ['-p', '--output-format', 'stream-json', message], {
  stdio: 'pipe',
  env: { ...process.env, ANTHROPIC_API_KEY: apiKey }
});

// Session continuity
if (session.claudeSessionId) {
  claudeArgs.push('--resume', session.claudeSessionId);
}
```

**Secure IPC Communication:**
```javascript
// Main process exposes secure APIs (src/main/preload-bridge.js)
contextBridge.exposeInMainWorld('electronAPI', {
  sendMessage: (message) => ipcRenderer.invoke('send-message', message),
  loadSessions: () => ipcRenderer.invoke('load-sessions')
});
```

**Component Architecture:**
```javascript
// Modular component system (src/renderer/components/app-component.js)
class AppComponent {
  constructor() {
    this.components = {
      sessionManager: new SessionManager(),
      fileBrowser: new FileBrowser(),  
      fileEditor: new FileEditor(),
      messageComponent: new MessageComponent()
    };
  }
}
```

## Data Storage and Session Management

### Session Storage
- **Location**: `~/.claude-code-chat/sessions.json`
- **Format**: JSON with session metadata, conversation history, and Claude session IDs
- **Features**: Automatic saving, session recovery, conversation branching

### Checkpoint System
- **Database**: SQLite in `.claude-checkpoints/`
- **Purpose**: Crash recovery, conversation state preservation
- **Features**: File diff tracking, metadata storage, automatic cleanup

### File Operations
- **File Browser**: Integrated directory navigation with file type detection
- **Code Editor**: Monaco editor with syntax highlighting and IntelliSense
- **File Watching**: Real-time file change detection and synchronization

## Key Dependencies

### Core Electron Stack
- **electron**: Desktop application framework
- **better-sqlite3**: High-performance SQLite database
- **node-pty**: Terminal/pseudoterminal functionality
- **@anthropic-ai/sdk**: Direct API integration (supplementary)

### UI and Editor
- **monaco-editor**: VS Code editor component
- **@monaco-editor/loader**: Monaco integration
- **@vscode/codicons**: VS Code icon set
- **diff**: File comparison utilities

### Build and Development
- **electron-builder**: Application packaging and distribution
- **@electron/rebuild**: Native dependency rebuilding

## Security Model

### Process Isolation
- **Context Isolation**: Renderer process runs in sandboxed environment
- **Secure IPC**: API exposure limited to essential functions via preload bridge
- **No Node.js Access**: Renderer cannot directly access Node.js APIs
- **API Key Protection**: Credentials handled only in main process

### File System Security
- **Controlled Access**: File operations mediated through secure IPC
- **Path Validation**: Directory traversal protection
- **Permission Checks**: Respect system file permissions

## Development Workflow

### Testing and Debugging
- **Development Mode**: `npm run dev` enables DevTools and logging
- **Debug Console**: Access via `window.app` and `debugApp()` functions
- **Component Inspection**: Individual component access via `getAppComponent(name)`
- **Error Handling**: Global error catching with user-friendly notifications

### Code Style and Organization
- **Modular Architecture**: Components separated by concern
- **CSS Modules**: Component-specific styling with CSS custom properties
- **Event-Driven**: IPC-based communication between processes
- **Error Boundaries**: Graceful degradation with user feedback

### Building and Distribution
- **Multi-Platform**: Supports macOS, Windows, and Linux builds
- **Native Dependencies**: ARM64 optimization for Apple Silicon
- **Auto-Updates**: Electron builder configuration for distribution
- **Asset Optimization**: CSS and JavaScript bundling

This architecture prioritizes security, maintainability, and user experience while providing a robust platform for Claude Code interactions.