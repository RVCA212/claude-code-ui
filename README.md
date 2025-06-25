# Claude Code Chat


task: ```
add a new 'tasks' tab component below our global header 
  of our app @renderer/styles/components/global-header.css
   or our session manager if present 
  @src/renderer/components/session-manager.js 
  @renderer/styles/components/session-manager.css 
  @renderer/index.html . this new component should show 
  thin hieghted 'tabs' showing the running task in our app
   @src/renderer/components/tasks-sidebar.js and only show
   them when running. it should be a small rounded corner 
  rectangle lock which appears below the global header or 
  session manager and it should be clickable to open that 
  session into our chat-sidebar view. note when no task is
   running, this shouldn't be shown at all and if we are 
  in the task runnning, it shouldn't be shown.
```


messages

## Overview

Claude Code Chat is an Electron-based desktop application for interacting with Claude Code, providing a user-friendly interface for AI-powered code assistance and development workflows.

## Features

- Interactive chat interface with Claude Code
- Native desktop application for macOS, Windows, and Linux
- Integrated session management
- Checkpoint system for conversation recovery
- Multi-process architecture with secure IPC

## Prerequisites

- Node.js v16+
- npm
- Anthropic API Key

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/claude-code-chat.git

# Install dependencies
npm install

# Install Claude Code CLI if not already installed
npm run install-claude
```

## Development

*quick start*
```bash
npm start
```

```bash
# Start in development mode
npm run dev

# Build for production
npm run build

# Rebuild native dependencies
npm run rebuild
```

## Supported Platforms

- macOS
- Windows
- Linux (AppImage)

## License

MIT License
