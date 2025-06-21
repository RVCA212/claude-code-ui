# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository contains multiple integrated components for Claude Code development:

1. **Claude Code Chat** (Electron App) - Desktop GUI application for Claude interactions
2. **Codesys SDK** (Python) - Programmatic interface for Claude Code CLI automation 
3. **Anthropic SDK TypeScript** - Reference implementation and examples

## Development Commands

### Electron App (Root Directory)

```bash
# Install dependencies
npm install

# Start the application in development mode
npm run dev

# Start the application normally
npm start

# Build for distribution
npm run build

# Install Claude CLI dependency
npm run install-claude

# Rebuild native dependencies
npm run rebuild
```

### Python SDK (codesys2/)

```bash
# Install in development mode
cd codesys2/
pip install -e .

# Install from PyPI
pip install codesys

# Run examples
python examples/example1_custom_tools.py
python examples/conversation.py
python plan_and_execute.py

# Run advanced workflows
python examples/06_complex_workflow.py
python examples/parallel/parallel_development_worktree.py
```

### TypeScript SDK (anthropic-sdk-typescript/)

```bash
cd anthropic-sdk-typescript/
yarn install

# Build the SDK
yarn build

# Run tests
yarn test

# Format code
yarn format

# Lint code
yarn lint
```

## Code Architecture

### Electron App Structure

**Multi-Process Architecture:**
- **Main Process** (`main.js`): Node.js backend managing Claude CLI integration, session storage, and IPC
- **Preload Script** (`preload.js`): Secure bridge exposing selective APIs to renderer
- **Renderer Process** (`renderer/`): Frontend UI handling user interactions and real-time streaming

**Key Integration Pattern:**
```javascript
// Subprocess approach for full tool access
const claudeProcess = spawn('claude', ['-p', '--output-format', 'stream-json', message], {
  stdio: 'pipe',
  env: { ...process.env, ANTHROPIC_API_KEY: apiKey }
});

// Session resumption for conversation continuity
if (session.claudeSessionId) {
  claudeArgs.push('--resume', session.claudeSessionId);
}
```

**Session Management:**
- Local storage: `~/.claude-code-chat/sessions.json`
- Claude session IDs maintained for context preservation
- Checkpoint system with SQLite database for recovery

### Python SDK (Codesys) Architecture

**Core Classes:**
- **`Agent`**: Main synchronous interface with tool management and streaming
- **`AsyncAgent`**: Fully asynchronous version for parallel execution
- **`ToolManager`**: Advanced tool filtering and security policies
- **`WorktreeManager`**: Git worktree isolation for parallel development

**Key Design Patterns:**

1. **Subprocess Integration:**
```python
# Spawns claude CLI with full tool access
agent = Agent(working_dir="./", allowed_tools=["Read", "Edit", "Bash"])
response = agent.run("Your prompt", stream=True)
```

2. **Plan-and-Execute Workflow:**
```python
# Multi-step planning with conversation continuity
agent.run("Create plan in plan.md", stream=True)
agent.run_convo("Execute the plan", stream=True)
```

3. **Session Management:**
```python
# Conversation continuity across interactions
session_id = agent.get_last_session_id()
agent.resume_convo(session_id, "Continue discussion")
```

## Prerequisites and Setup

### Required Dependencies

1. **Claude Code CLI** (required for both Electron and Python SDK):
```bash
npm install -g @anthropic-ai/claude-code
```

2. **Anthropic API Key** - Set as environment variable or provide through app/SDK
3. **Node.js v16+** (for Electron app)
4. **Python 3.8+** (for Python SDK)

### Environment Configuration

**API Key Setup:**
```bash
export ANTHROPIC_API_KEY="your-api-key-here"
```

**Claude CLI Verification:**
```bash
claude --version
claude -p "test message"  # Verify CLI works
```

## Component Integration Patterns

### Cross-Component Workflows

**Electron App + Python SDK Integration:**
The Electron app uses subprocess calls to Claude CLI, while the Python SDK provides programmatic automation. Both maintain session continuity through Claude's session system.

**Development Workflow:**
1. Use Electron app for interactive development and testing
2. Automate complex workflows with Python SDK
3. Reference TypeScript SDK for API patterns and advanced features

### Session and State Management

**Session Continuity Across Components:**
- Claude session IDs are portable between Electron app and Python SDK
- Both components can resume conversations started by the other
- Local storage formats are component-specific but Claude sessions are shared

**State Sharing Pattern:**
```javascript
// Electron: Extract session ID
session.claudeSessionId = parsed.sessionId;

// Python: Resume same session
agent.resume_convo(session_id, "Continue from Electron app")
```

## Security Model

### Electron Security
- Context isolation with sandboxed renderer
- Secure IPC communication via preload script
- API key handling only in main process
- No Node.js access in renderer process

### Python SDK Security
- Tool restriction policies for enterprise use
- API key filtering and sanitization
- Explicit allow/deny lists for tools
- Timeout and rate limiting controls

### Common Security Patterns
- Environment variable API key storage (not persisted)
- Local-only session storage
- Subprocess isolation for Claude CLI execution
- No network access for sensitive operations

## Advanced Features

### Parallel Development (Python SDK)
```python
# Git worktree isolation for concurrent tasks
from codesys import AsyncAgent

async def parallel_tasks():
    agent = AsyncAgent()
    tasks = [agent.run(prompt) for prompt in prompts]
    results = await asyncio.gather(*tasks)
```

### Checkpoint System (Electron App)
- SQLite-based checkpoint storage in `.claude-checkpoints/`
- Automatic conversation recovery after crashes
- File diff tracking for code changes
- Metadata storage with better-sqlite3

### Streaming Optimization
- Real-time JSON streaming parsing in Electron
- Async/await streaming in Python SDK
- Debounced UI updates for performance
- Automatic scrolling and message rendering

### Tool Management
- Comprehensive tool restriction system
- Group-based permissions (read-only, full-access, etc.)
- Runtime tool policy enforcement
- MCP (Model Context Protocol) server integration

### Error Handling and Recovery
- Graceful process cleanup on termination
- Automatic session restoration
- Retry logic with exponential backoff
- Comprehensive error classification and reporting

This multi-component architecture provides both interactive GUI access and programmatic automation capabilities while maintaining session continuity and security best practices across all components.