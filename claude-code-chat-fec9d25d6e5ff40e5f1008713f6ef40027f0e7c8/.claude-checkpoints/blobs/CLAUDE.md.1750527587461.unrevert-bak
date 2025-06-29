# Claude Code Chat - Architecture Documentation

## Overview

Claude Code Chat is an Electron application that provides a clean, modern interface for interacting with the Claude Code SDK. The app uses a subprocess approach to communicate with the Claude Code CLI, enabling session-based conversations with streaming responses and full tool access.

## File Structure

```
claude-code-chat/
├── package.json              # Dependencies and build configuration
├── main.js                   # Electron main process (Node.js backend)
├── preload.js               # Secure IPC bridge between main and renderer
├── README.md                # User documentation and setup instructions
├── ARCHITECTURE.md          # This file - technical documentation
├── renderer/                # Frontend application files
│   ├── index.html          # Main UI structure and layout
│   ├── app.js              # Frontend logic and UI interactions
│   └── style.css           # Styling and visual design
└── anthropic-sdk-typescript/ # TypeScript SDK examples (reference only)
```

## Core Components

### 1. Main Process (`main.js`)

**Purpose**: Manages the Electron application lifecycle, handles Claude Code CLI integration, and provides secure backend services.

**Key Responsibilities**:
- **Window Management**: Creates and manages the main application window
- **Claude CLI Integration**: Spawns and manages `claude` subprocess calls
- **Session Storage**: Persists conversation data locally in `~/.claude-code-chat/sessions.json`
- **API Key Management**: Securely handles Anthropic API key verification
- **IPC Communication**: Provides secure communication between frontend and backend

**Critical Functions**:
```javascript
// Claude process spawning with streaming JSON output
const claudeProcess = spawn('claude', ['-p', '--output-format', 'stream-json', message], {
  stdio: 'pipe',
  env: { ...process.env, ANTHROPIC_API_KEY: apiKey }
});

// Session resumption using Claude session IDs
if (session.claudeSessionId) {
  claudeArgs.push('--resume', session.claudeSessionId);
}
```

### 2. Preload Script (`preload.js`)

**Purpose**: Provides a secure bridge between the main process and renderer, exposing only necessary APIs.

**Security Features**:
- Context isolation enabled
- Node integration disabled in renderer
- Selective API exposure through `contextBridge`

**Exposed APIs**:
```javascript
window.electronAPI = {
  // Setup and configuration
  checkSetup: () => ipcRenderer.invoke('check-setup'),
  setApiKey: (apiKey) => ipcRenderer.invoke('set-api-key', apiKey),
  
  // Session management
  getSessions: () => ipcRenderer.invoke('get-sessions'),
  createSession: (title) => ipcRenderer.invoke('create-session', title),
  
  // Messaging with streaming support
  sendMessage: (sessionId, message) => ipcRenderer.invoke('send-message', sessionId, message),
  onMessageStream: (callback) => ipcRenderer.on('message-stream', callback)
};
```

### 3. Frontend Application (`renderer/`)

#### HTML Structure (`index.html`)
- **Settings Modal**: Optional API key configuration
- **Sidebar**: Navigation, new conversation, and settings
- **Main Chat Area**: Message display and input interface
- **Modals**: Settings and delete confirmations

#### Frontend Logic (`app.js`)
**Key Features**:
- **Session Management**: Local state management and UI updates
- **Real-time Streaming**: Handles streaming message updates from Claude
- **Event Handling**: User interactions and keyboard shortcuts
- **Status Management**: API key and CLI availability checking

**Core Data Flow**:
```javascript
// User sends message → Backend spawns Claude process → Streaming updates via IPC
await window.electronAPI.sendMessage(currentSessionId, content);

// Streaming handler updates UI in real-time
window.electronAPI.onMessageStream((event, data) => {
  const { sessionId, message, isComplete } = data;
  handleStreamingMessage(message, isComplete);
});
```

#### Styling (`style.css`)
- **Design System**: Consistent colors, typography, and spacing
- **Dark/Light Mode**: Automatic theme detection via CSS media queries
- **Responsive Layout**: Flexible sidebar and main content areas
- **Component Styling**: Buttons, modals, message bubbles, and forms

## Claude Code SDK Integration

### Integration Approach

The app uses a **subprocess approach** rather than direct API calls, providing several advantages:

1. **Full Tool Access**: Leverages Claude Code's complete tool ecosystem
2. **Session Management**: Automatic session handling via Claude CLI
3. **Streaming Support**: Real-time response streaming
4. **CLI Compatibility**: Works exactly like the command-line tool

### Communication Flow

```mermaid
sequenceDiagram
    participant User
    participant Renderer
    participant Main
    participant Claude CLI
    participant Anthropic API

    User->>Renderer: Types message
    Renderer->>Main: IPC: sendMessage(sessionId, message)
    Main->>Claude CLI: spawn('claude', args)
    Claude CLI->>Anthropic API: HTTP request with tools
    Anthropic API-->>Claude CLI: Streaming response
    Claude CLI-->>Main: stdout: stream-json
    Main-->>Renderer: IPC: message-stream event
    Renderer-->>User: Update UI with streaming text
```

### Session Management

**Local Session Storage**:
```javascript
// Session structure
{
  id: "uuid-v4",                    // App-generated session ID
  title: "Conversation Title",       // User-editable title
  messages: [...],                   // Message history
  claudeSessionId: "claude-session", // Claude CLI session ID for resumption
  createdAt: "ISO-timestamp",
  updatedAt: "ISO-timestamp"
}
```

**Claude Session Resumption**:
- Each conversation maintains a Claude session ID
- Resumption preserves context across app restarts
- Messages are stored locally for immediate UI rendering

### Command Construction

```javascript
// Base command for new conversations
['claude', '-p', '--output-format', 'stream-json', userMessage]

// Command for resuming existing conversations
['claude', '-p', '--output-format', 'stream-json', '--resume', claudeSessionId, userMessage]
```

### Stream Processing

The app parses Claude's streaming JSON output to provide real-time updates:

```javascript
// Parse streaming JSON lines
const lines = chunk.split('\n').filter(line => line.trim());
for (const line of lines) {
  const parsed = JSON.parse(line);
  
  if (parsed.type === 'init' && parsed.sessionId) {
    // Store Claude session ID for future resume
    session.claudeSessionId = parsed.sessionId;
  } else if (parsed.type === 'message' && parsed.role === 'assistant') {
    // Update UI with streaming content
    updateMessage(parsed.content);
  }
}
```

## Data Storage

### Session Persistence
- **Location**: `~/.claude-code-chat/sessions.json`
- **Format**: JSON array of session objects
- **Backup**: Automatic saving on changes
- **Privacy**: Local storage only, no cloud sync

### API Key Handling
- **Runtime Only**: Stored in process environment variables
- **Not Persisted**: Must be re-entered each app launch (unless using system env var)
- **Verification**: Tested with simple Claude CLI call before saving

## Security Model

### Electron Security Best Practices
1. **Context Isolation**: Renderer process isolated from Node.js
2. **No Node Integration**: Renderer cannot access Node.js APIs directly
3. **Secure IPC**: All communication via predefined, validated channels
4. **Sandboxed Renderer**: Limited system access in frontend
5. **API Key Protection**: Sensitive data handled only in main process

### Process Separation
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Main Process  │◄──►│  Preload Script  │◄──►│ Renderer Process│
│   (Node.js)     │    │   (Bridge)       │    │    (Web)        │
│                 │    │                  │    │                 │
│ • Claude CLI    │    │ • IPC Bridge     │    │ • UI Logic      │
│ • File System   │    │ • API Exposure   │    │ • Event Handling│
│ • Session Store │    │ • Security       │    │ • DOM Updates   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Error Handling

### Network and API Errors
- Claude CLI process failures are captured and displayed
- API key verification provides clear error messages
- Network connectivity issues show helpful guidance

### Recovery Mechanisms
- Automatic session restoration on app restart
- Graceful handling of interrupted conversations
- Process cleanup on app termination

### User Feedback
- Real-time status updates in UI
- Error alerts with actionable information
- Status indicators for CLI and API key availability

## Performance Considerations

### Memory Management
- Conversation history loaded on demand
- Process cleanup for terminated Claude calls
- Efficient message rendering for long conversations

### Streaming Optimization
- Incremental DOM updates during streaming
- Debounced UI updates for smooth performance
- Automatic scrolling to follow conversation

### Storage Efficiency
- JSON format for human-readable session storage
- Automatic cleanup of orphaned processes
- Minimal memory footprint in main process

## Development and Debugging

### Development Mode
```bash
npm run dev  # Launches with developer tools enabled
```

### Logging and Monitoring
- Console logging for IPC communication
- Process status tracking
- Error capture and reporting

### Testing Approach
- Manual testing via development mode
- Claude CLI integration verification
- UI responsiveness testing across platforms

This architecture provides a robust, secure, and user-friendly interface to Claude Code while maintaining the full power and flexibility of the underlying CLI tool.