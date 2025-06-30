# Claude Process Tracking Architecture

This document explains how the Claude Code Chat Electron application tracks and manages multiple concurrent Claude CLI processes.

## Overview

The Claude Code Chat application can run multiple Claude CLI subprocess instances simultaneously, with each process associated with a specific conversation session. This allows users to have multiple active conversations with Claude running in parallel.

## Core Architecture

### 1. Process Tracking System

The core process tracking is implemented in `ClaudeProcessManager` class:

**Location**: `src/main/claude-process-manager.js`

**Key Data Structure**:
```javascript
this.claudeProcesses = new Map(); // sessionId -> claudeProcess
```

**Core Principle**: Each Claude CLI subprocess is mapped to a unique `sessionId` rather than tracking by process ID (PID). This provides session-based process management where each conversation session can have its own dedicated Claude process.

### 2. Process Registration Flow

When a new message is sent to Claude:

1. **Process Creation** (`claude-process-manager.js:170-176`):
   ```javascript
   const claudeProcess = spawn('claude', claudeArgs, {
     stdio: ['pipe', 'pipe', 'pipe'],
     env: { ...process.env },
     cwd: this.fileOperations.getCurrentWorkingDirectory(),
     detached: false,
     shell: false
   });
   ```

2. **Process Registration** (`claude-process-manager.js:179`):
   ```javascript
   this.claudeProcesses.set(sessionId, claudeProcess);
   ```

3. **Process Monitoring**: Event listeners are attached for lifecycle management:
   - `spawn`: Confirms successful process creation
   - `close`: Handles normal process termination
   - `error`: Handles process errors
   - `exit`: Final cleanup

### 3. Process Lifecycle Management

#### Process Creation (`sendMessage` method)
- **File**: `src/main/claude-process-manager.js:84-203`
- **Trigger**: User sends a message in a session
- **Actions**:
  - Validates session exists
  - Captures working directory for new sessions
  - Builds Claude CLI arguments (includes resume flags for continuing conversations)
  - Spawns subprocess with `child_process.spawn()`
  - Registers process in tracking Map
  - Sets up stream processing for real-time communication

#### Process Monitoring (`handleClaudeProcess` method)
- **File**: `src/main/claude-process-manager.js:206-524`
- **Features**:
  - **Stream Processing**: Handles JSON streaming from Claude CLI
  - **Session Continuity**: Captures and stores Claude session IDs for resumption
  - **Real-time Updates**: Sends streaming updates to renderer process
  - **Timeout Handling**: 5-minute timeout with early hanging detection (30 seconds)
  - **Recovery State**: Saves state for crash recovery

#### Process Cleanup
Multiple cleanup mechanisms ensure proper resource management:

1. **Normal Completion** (`claude-process-manager.js:371-441`):
   ```javascript
   claudeProcess.on('close', async (code) => {
     this.claudeProcesses.delete(sessionId);
     // ... save final message and update session
   });
   ```

2. **Manual Stop** (`stopMessage` method):
   ```javascript
   async stopMessage(sessionId) {
     const process = this.claudeProcesses.get(sessionId);
     if (process && !process.killed) {
       process.kill();
       this.claudeProcesses.delete(sessionId);
     }
   }
   ```

3. **Global Cleanup** (`cleanup` method):
   - Called during app shutdown
   - Gracefully terminates all running processes
   - Saves recovery state for each active session

### 4. Integration Points

#### IPC Handler Integration
**File**: `src/main/ipc-handlers.js`

Key integration points:
- **Message Sending** (line 350): Routes to `claudeProcessManager.sendMessage()`
- **Process Stopping** (line 354): Routes to `claudeProcessManager.stopMessage()`
- **Session Deletion** (line 212): Automatically stops associated Claude processes
- **Global Session Clear** (line 327): Stops all processes before clearing sessions

#### Main Process Integration
**File**: `src/main/main.js`

Integration features:
- **Tray Menu** (lines 124-146): Displays running Claude tasks in system tray
- **Process References**: Updates main window references in process manager
- **Global Cleanup**: Coordinates shutdown cleanup across all managers

#### Session Manager Integration
**File**: `src/main/session-manager.js`

Coordination features:
- **Recovery State**: Tracks interrupted sessions for crash recovery
- **Session Context**: Provides session information for process management
- **Working Directory**: Manages per-session working directories

## Data Flow

### Process Startup Flow
```
User sends message
    ↓
IPC Handler receives request
    ↓
ClaudeProcessManager.sendMessage()
    ↓
Session validation & setup
    ↓
spawn('claude', args)
    ↓
claudeProcesses.set(sessionId, process)
    ↓
Stream processing setup
    ↓
Real-time communication begins
```

### Process Tracking Flow
```
Active Process Map
sessionId_1 → claudeProcess_1
sessionId_2 → claudeProcess_2
sessionId_3 → claudeProcess_3
    ↓
getRunningSessionIds() → [sessionId_1, sessionId_2, sessionId_3]
    ↓
Tray Menu displays running tasks
Main Process coordinates cleanup
IPC handlers route stop requests
```

### Process Cleanup Flow
```
Process termination trigger
    ↓
claudeProcesses.delete(sessionId)
    ↓
Final message saved to session
    ↓
Recovery state cleared
    ↓
UI notifications sent
```

## Key Methods & APIs

### ClaudeProcessManager Methods

#### Core Process Management
- `sendMessage(sessionId, message)` - Creates and manages Claude subprocess
- `stopMessage(sessionId)` - Stops specific session's process
- `stopAllMessages()` - Stops all running processes
- `getRunningSessionIds()` - Returns array of active session IDs

#### Process State
- `checkClaudeCliAvailable()` - Validates Claude CLI availability
- `checkApiKey()` - Verifies API key configuration
- `cleanup()` - Graceful shutdown of all processes

#### Process Communication
- `handleClaudeProcess(claudeProcess, sessionId)` - Manages process I/O and lifecycle
- Stream processing for JSON communication with Claude CLI
- Real-time message updates to renderer process

### IPC Handler Methods

#### Message Routing
- `send-message` - Routes to process manager for message sending
- `stop-message` - Routes to process manager for process stopping
- `delete-session` - Automatically stops associated processes

### Main Process Methods

#### Tray Integration
- `getRunningSessionIds()` - Used to populate running tasks in tray menu
- Dynamic tray menu updates showing active Claude conversations

## Concurrency Handling

### Multiple Process Management
The application supports multiple concurrent Claude processes through:

1. **Session-Based Isolation**: Each conversation session gets its own subprocess
2. **Independent Process Tracking**: Map-based tracking allows independent lifecycle management
3. **Resource Management**: Proper cleanup prevents resource leaks
4. **Stream Multiplexing**: Each process has independent I/O streams

### Process Coordination
- **No Shared State**: Each Claude process operates independently
- **Session Resume**: Processes can resume conversations using Claude session IDs
- **Working Directory**: Each session maintains its own working directory context
- **Recovery**: Interrupted sessions can be recovered and resumed

### Performance Considerations
- **Process Reuse**: Claude sessions can be resumed rather than creating new processes
- **Stream Processing**: Efficient JSON stream processing for real-time communication
- **Timeout Management**: Prevents hanging processes from consuming resources
- **Memory Management**: Proper cleanup of process references and event listeners

## Error Handling & Recovery

### Process Error Handling
1. **Spawn Errors**: Handled in process creation with fallback messaging
2. **Communication Errors**: Stream parsing errors with recovery attempts
3. **Timeout Handling**: Automatic process termination after 5 minutes
4. **Early Hanging Detection**: 30-second detection for unresponsive processes

### Recovery Mechanisms
1. **Recovery State**: Saves session state for crash recovery
2. **Session Resume**: Uses Claude session IDs to resume conversations
3. **Graceful Degradation**: App continues functioning even if individual processes fail
4. **Cleanup on Shutdown**: Ensures proper termination during app closing

## Code References

### Primary Files
- **`src/main/claude-process-manager.js`**: Core process tracking and management
- **`src/main/ipc-handlers.js`**: IPC routing and integration
- **`src/main/main.js`**: Main process coordination and tray integration
- **`src/main/session-manager.js`**: Session management and recovery
- **`src/main/preload-bridge.js`**: Secure API exposure to renderer

### Key Line References
- **Process Map Declaration**: `claude-process-manager.js:12`
- **Process Registration**: `claude-process-manager.js:179`
- **Process Spawning**: `claude-process-manager.js:170-176`
- **Running Sessions Query**: `claude-process-manager.js:22-24`
- **Tray Menu Integration**: `main.js:124-146`
- **IPC Message Routing**: `ipc-handlers.js:350-356`
- **Session Cleanup**: `ipc-handlers.js:211-222`

## Summary

The Claude Code Chat application uses a sophisticated session-based process tracking system that allows multiple concurrent Claude CLI processes to run simultaneously. The architecture provides:

- **Scalable Concurrency**: Multiple conversations can run in parallel
- **Robust Lifecycle Management**: Proper creation, monitoring, and cleanup
- **Session Continuity**: Conversations can be resumed across app restarts
- **Error Recovery**: Comprehensive error handling and recovery mechanisms
- **Resource Management**: Efficient memory and process resource management
- **User Experience**: Real-time updates and responsive UI integration

This design enables a smooth multi-conversation experience while maintaining system stability and resource efficiency.