const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs').promises;
const os = require('os');
const { v4: uuidv4 } = require('uuid');

// Enable live reload for development
const isDev = process.argv.includes('--dev');

// Global references
let mainWindow;
let claudeProcesses = new Map(); // Track running Claude processes
let sessions = new Map(); // Track conversation sessions

// Session storage paths
const sessionStoragePath = path.join(os.homedir(), '.claude-code-chat', 'sessions.json');
const recoveryStatePath = path.join(os.homedir(), '.claude-code-chat', 'recovery.json');

const ALL_TOOLS = [
    "Task", "Bash", "Glob", "Grep", "LS", "exit_plan_mode", "Read", "Edit",
    "MultiEdit", "Write", "NotebookRead", "NotebookEdit", "WebFetch",
    "TodoRead", "TodoWrite", "WebSearch"
];

async function createWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false // Needed for file operations
    },
    titleBarStyle: 'hiddenInset',
    show: false // Don't show until ready
  });

  // Load the app
  try {
    await mainWindow.loadFile('renderer/index.html');
    console.log('HTML file loaded successfully');
  } catch (error) {
    console.error('Failed to load HTML file:', error);
    mainWindow.show(); // Show anyway for debugging
    return;
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show');
    mainWindow.show();

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Add error handling for renderer process
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load page:', errorCode, errorDescription);
    mainWindow.show(); // Show anyway for debugging
  });

  // Debug: Show window after a timeout if ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Window not visible after timeout, forcing show');
      mainWindow.show();
      if (isDev) {
        mainWindow.webContents.openDevTools();
      }
    }
  }, 3000);

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
    // Clean up any running processes
    claudeProcesses.forEach(process => {
      if (process && !process.killed) {
        process.kill();
      }
    });
    claudeProcesses.clear();
  });
}

// App event handlers
app.whenReady().then(async () => {
  await createWindow();
  await loadSessions();
  await recoverInterruptedSessions();

  // Send initial data to renderer
  if (mainWindow) {
    mainWindow.webContents.send('sessions-loaded', Array.from(sessions.values()));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

// Session management
async function loadSessions() {
  try {
    const dir = path.dirname(sessionStoragePath);
    await fs.mkdir(dir, { recursive: true });

    const data = await fs.readFile(sessionStoragePath, 'utf8');
    const sessionData = JSON.parse(data);

    sessions.clear();
    sessionData.forEach(session => {
      // Ensure sessions have all required fields
      const normalizedSession = {
        id: session.id,
        title: session.title || 'Untitled Conversation',
        messages: session.messages || [],
        createdAt: session.createdAt || new Date().toISOString(),
        updatedAt: session.updatedAt || new Date().toISOString(),
        claudeSessionId: session.claudeSessionId || null,
        lastActivity: session.lastActivity || session.updatedAt || new Date().toISOString(),
        status: session.status || 'active', // active, historical, archived
        lastUserMessage: session.lastUserMessage || null,
        lastAssistantMessage: session.lastAssistantMessage || null
      };
      sessions.set(session.id, normalizedSession);
    });

    console.log(`Loaded ${sessions.size} sessions from storage`);
  } catch (error) {
    // File doesn't exist or is invalid, start with empty sessions
    console.log('No existing sessions found, starting fresh');
  }
}

// Atomic session save with backup
async function saveSessions() {
  try {
    const dir = path.dirname(sessionStoragePath);
    await fs.mkdir(dir, { recursive: true });

    const sessionData = Array.from(sessions.values());
    const tempPath = sessionStoragePath + '.tmp';
    const backupPath = sessionStoragePath + '.backup';

    // Write to temporary file first
    await fs.writeFile(tempPath, JSON.stringify(sessionData, null, 2));

    // Create backup of existing file if it exists
    try {
      await fs.access(sessionStoragePath);
      await fs.copyFile(sessionStoragePath, backupPath);
    } catch (err) {
      // Original file doesn't exist, that's fine
    }

    // Atomically move temp file to final location
    await fs.rename(tempPath, sessionStoragePath);

    console.log(`Saved ${sessionData.length} sessions to storage`);
  } catch (error) {
    console.error('Failed to save sessions:', error);
    throw error; // Re-throw to allow callers to handle
  }
}

// Save individual session immediately
async function saveSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Update last activity timestamp
  session.lastActivity = new Date().toISOString();
  session.updatedAt = new Date().toISOString();

  // Save all sessions (could be optimized to save just this session in the future)
  await saveSessions();

  // Notify frontend of session update
  if (mainWindow) {
    mainWindow.webContents.send('session-updated', session);
  }

  return session;
}

// Add message to session and save immediately
async function addMessageToSession(sessionId, message) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Ensure message has required fields
  const normalizedMessage = {
    id: message.id || uuidv4(),
    type: message.type || 'user',
    content: message.content || '',
    timestamp: message.timestamp || new Date().toISOString(),
    ...message // Allow additional fields
  };

  session.messages.push(normalizedMessage);
  await saveSession(sessionId);

  return normalizedMessage;
}

// Update message in session and save immediately
async function updateMessageInSession(sessionId, messageId, updates) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  const messageIndex = session.messages.findIndex(m => m.id === messageId);
  if (messageIndex === -1) {
    throw new Error('Message not found');
  }

  // Update message
  session.messages[messageIndex] = {
    ...session.messages[messageIndex],
    ...updates,
    updatedAt: new Date().toISOString()
  };

  await saveSession(sessionId);

  return session.messages[messageIndex];
}

// Recovery state management
async function saveRecoveryState(sessionId, state) {
  try {
    const dir = path.dirname(recoveryStatePath);
    await fs.mkdir(dir, { recursive: true });

    let recoveryData = {};
    try {
      const existing = await fs.readFile(recoveryStatePath, 'utf8');
      recoveryData = JSON.parse(existing);
    } catch (err) {
      // File doesn't exist, start fresh
    }

    recoveryData[sessionId] = {
      ...state,
      timestamp: new Date().toISOString()
    };

    await fs.writeFile(recoveryStatePath, JSON.stringify(recoveryData, null, 2));
    console.log('Recovery state saved for session:', sessionId);
  } catch (error) {
    console.error('Failed to save recovery state:', error);
  }
}

async function clearRecoveryState(sessionId) {
  try {
    const data = await fs.readFile(recoveryStatePath, 'utf8');
    const recoveryData = JSON.parse(data);

    delete recoveryData[sessionId];

    await fs.writeFile(recoveryStatePath, JSON.stringify(recoveryData, null, 2));
    console.log('Recovery state cleared for session:', sessionId);
  } catch (error) {
    // File doesn't exist or other error, which is fine
    console.log('No recovery state to clear for session:', sessionId);
  }
}

async function recoverInterruptedSessions() {
  try {
    const data = await fs.readFile(recoveryStatePath, 'utf8');
    const recoveryData = JSON.parse(data);

    const now = new Date();
    const recoveredSessions = [];

    for (const [sessionId, state] of Object.entries(recoveryData)) {
      const stateTime = new Date(state.timestamp);
      const timeDiff = now - stateTime;

      // Only recover sessions from the last 30 minutes
      if (timeDiff < 30 * 60 * 1000) {
        const session = sessions.get(sessionId);
        if (session && state.lastUserMessage) {
          console.log('Found interrupted session to recover:', sessionId);

          // Check if the last user message exists in the session
          const lastMessage = session.messages[session.messages.length - 1];
          if (lastMessage && lastMessage.type === 'user' && lastMessage.content === state.lastUserMessage) {
            console.log('Session appears to be interrupted during Claude response');

            // Add recovery indicator to session
            session.needsRecovery = true;
            session.recoveryInfo = {
              lastUserMessage: state.lastUserMessage,
              interruptedAt: state.timestamp
            };

            recoveredSessions.push(sessionId);
          }
        }
      }
    }

    if (recoveredSessions.length > 0) {
      console.log(`Recovered ${recoveredSessions.length} interrupted sessions:`, recoveredSessions);
      await saveSessions();
    }

    // Clear old recovery data
    const cleanedData = {};
    for (const [sessionId, state] of Object.entries(recoveryData)) {
      const stateTime = new Date(state.timestamp);
      const timeDiff = now - stateTime;

      // Keep recovery data for the last hour
      if (timeDiff < 60 * 60 * 1000) {
        cleanedData[sessionId] = state;
      }
    }

    await fs.writeFile(recoveryStatePath, JSON.stringify(cleanedData, null, 2));

  } catch (error) {
    console.log('No recovery data found or failed to read recovery state');
  }
}

// Check if Claude Code CLI is available
async function checkClaudeCliAvailable() {
  return new Promise((resolve) => {
    const claude = spawn('claude', ['--version'], { stdio: 'pipe' });

    claude.on('close', (code) => {
      resolve(code === 0);
    });

    claude.on('error', () => {
      resolve(false);
    });
  });
}

// Check if API key is set
function checkApiKey() {
  return !!process.env.ANTHROPIC_API_KEY;
}

// Helper function to determine if a session can be resumed
function canResumeSession(session) {
  return session.claudeSessionId && 
         (session.status === 'active' || session.status === 'historical') &&
         session.messages && session.messages.length > 0;
}

// Helper function to get session status info
function getSessionStatusInfo(session) {
  return {
    canResume: canResumeSession(session),
    status: session.status || 'active',
    lastUserMessage: session.lastUserMessage,
    lastAssistantMessage: session.lastAssistantMessage,
    messageCount: session.messages ? session.messages.length : 0,
    lastActivity: session.lastActivity || session.updatedAt
  };
}

// IPC handlers
ipcMain.handle('check-setup', async () => {
  const cliAvailable = await checkClaudeCliAvailable();
  const apiKeySet = checkApiKey();

  return {
    cliAvailable,
    apiKeySet,
    canUseClaudeCode: cliAvailable && apiKeySet
  };
});

ipcMain.handle('set-api-key', async (event, apiKey) => {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new Error('Invalid API key');
  }

  // Set environment variable for current process
  process.env.ANTHROPIC_API_KEY = apiKey;

  // Verify the key works by making a simple call
  try {
    const testProcess = spawn('claude', ['-p', 'Hello'], {
      stdio: 'pipe',
      env: { ...process.env, ANTHROPIC_API_KEY: apiKey }
    });

    return new Promise((resolve, reject) => {
      let output = '';
      let errorOutput = '';

      testProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      testProcess.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          resolve({ success: true, message: 'API key verified successfully' });
        } else {
          reject(new Error(`API key verification failed: ${errorOutput}`));
        }
      });

      testProcess.on('error', (error) => {
        reject(new Error(`Failed to test API key: ${error.message}`));
      });
    });
  } catch (error) {
    throw new Error(`Failed to verify API key: ${error.message}`);
  }
});

ipcMain.handle('get-sessions', async () => {
  const sessionList = Array.from(sessions.values());
  // Add status information to each session
  return sessionList.map(session => ({
    ...session,
    statusInfo: getSessionStatusInfo(session)
  }));
});

ipcMain.handle('create-session', async (event, title) => {
  const sessionId = uuidv4();
  const now = new Date().toISOString();
  const session = {
    id: sessionId,
    title: title || 'New Conversation',
    messages: [],
    createdAt: now,
    updatedAt: now,
    lastActivity: now,
    claudeSessionId: null, // Will be set when first message is sent
    status: 'active',
    lastUserMessage: null,
    lastAssistantMessage: null
  };

  sessions.set(sessionId, session);
  await saveSession(sessionId);

  // Notify frontend of new session
  if (mainWindow) {
    mainWindow.webContents.send('session-created', session);
  }

  return session;
});

ipcMain.handle('delete-session', async (event, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Clean up any running Claude process for this session
  const process = claudeProcesses.get(sessionId);
  if (process && !process.killed) {
    console.log('Killing Claude process for deleted session:', sessionId);
    process.kill();
    claudeProcesses.delete(sessionId);
  }

  sessions.delete(sessionId);
  await saveSessions();

  // Notify frontend
  if (mainWindow) {
    mainWindow.webContents.send('session-deleted', sessionId);
  }

  return true;
});

ipcMain.handle('update-session-title', async (event, sessionId, newTitle) => {
  const session = sessions.get(sessionId);
  if (session) {
    session.title = newTitle;
    await saveSession(sessionId);
    return session;
  }
  throw new Error('Session not found');
});

ipcMain.handle('get-session-context', async (event, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  
  return {
    ...session,
    statusInfo: getSessionStatusInfo(session),
    conversationPreview: {
      lastUserMessage: session.lastUserMessage,
      lastAssistantMessage: session.lastAssistantMessage ? 
        session.lastAssistantMessage.substring(0, 200) + (session.lastAssistantMessage.length > 200 ? '...' : '') : 
        null
    }
  };
});

ipcMain.handle('resume-session', async (event, sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }
  
  if (!canResumeSession(session)) {
    throw new Error('Session cannot be resumed');
  }
  
  // Mark session as active when resuming
  session.status = 'active';
  await saveSession(sessionId);
  
  return {
    ...session,
    statusInfo: getSessionStatusInfo(session)
  };
});

ipcMain.handle('send-message', async (event, sessionId, message) => {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error('Session not found');
  }

  // Add user message to session and save immediately
  const userMessage = await addMessageToSession(sessionId, {
    id: uuidv4(),
    type: 'user',
    content: message,
    timestamp: new Date().toISOString()
  });

  // Update session's last user message and ensure status is active
  session.lastUserMessage = message;
  session.status = 'active';

  console.log('User message saved to session:', userMessage.id);

  // Save recovery state before starting Claude process
  await saveRecoveryState(sessionId, {
    lastUserMessage: message,
    claudeSessionId: session.claudeSessionId,
    status: 'waiting_for_response'
  });

  // Create Claude process - follow SDK best practices
  const claudeArgs = [];

  // Add session resume FIRST if we have a Claude session ID (before other flags)
  if (session.claudeSessionId) {
    console.log('Resuming Claude session:', session.claudeSessionId);
    claudeArgs.push('--resume', session.claudeSessionId);
  } else {
    console.log('Starting new Claude session for:', sessionId);
  }

  // Add non-interactive mode with the user's message
  claudeArgs.push('-p', message);

  // Add output format for streaming JSON
  claudeArgs.push('--output-format', 'stream-json');

  // Add verbose flag for detailed logging
  claudeArgs.push('--verbose');

  // Allow all tools by default
  claudeArgs.push('--allowedTools', ALL_TOOLS.join(','));


  console.log('Spawning Claude process with command:', ['claude', ...claudeArgs]);
  console.log('Environment has ANTHROPIC_API_KEY:', !!process.env.ANTHROPIC_API_KEY);

  const claudeProcess = spawn('claude', claudeArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd: process.cwd(),
    detached: false,
    shell: false
  });

  console.log('Claude process spawned with PID:', claudeProcess.pid);
  claudeProcesses.set(sessionId, claudeProcess);

  // Close stdin immediately - Claude doesn't need stdin input in -p mode
  try {
    claudeProcess.stdin.end();
    console.log('Stdin closed successfully');
  } catch (error) {
    console.log('Error closing stdin:', error);
  }

  // Add immediate process event logging
  claudeProcess.on('spawn', () => {
    console.log('Claude process spawned successfully');
  });

  claudeProcess.on('disconnect', () => {
    console.log('Claude process disconnected');
  });

  claudeProcess.on('exit', (code, signal) => {
    console.log('Claude process exited with code:', code, 'signal:', signal);
  });

  return new Promise((resolve, reject) => {
    let output = '';
    let errorOutput = '';
    let assistantMessage = {
      id: uuidv4(),
      type: 'assistant',
      content: [], // Initialize as empty array
      timestamp: new Date().toISOString()
    };
    let jsonBuffer = ''; // Buffer for partial JSON lines

    // Add stdout event listener setup logging
    console.log('Setting up stdout event listener...');

    claudeProcess.stdout.on('data', async (data) => {
      const chunk = data.toString();
      output += chunk;

      // Log raw chunk for debugging
      console.log('Raw Claude stdout chunk received:', JSON.stringify(chunk));
      console.log('Chunk length:', chunk.length, 'bytes');

      // Add chunk to buffer
      jsonBuffer += chunk;

      // Split on newlines and process complete lines
      const lines = jsonBuffer.split('\n');

      // Keep the last line in buffer (might be incomplete)
      jsonBuffer = lines.pop() || '';

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (!trimmedLine) continue;

        console.log('Processing line:', JSON.stringify(trimmedLine));

        try {
          const parsed = JSON.parse(trimmedLine);
          console.log('Parsed JSON:', JSON.stringify(parsed, null, 2));

          // Update recovery state with successful parsing
          if (parsed.type === 'assistant' || parsed.type === 'message') {
            saveRecoveryState(sessionId, {
              lastUserMessage: session.messages[session.messages.length - 1]?.content,
              claudeSessionId: session.claudeSessionId,
              status: 'receiving_response',
              lastResponseTime: new Date().toISOString()
            }).catch(err => console.error('Failed to update recovery state:', err));
          }

          // Handle Claude session init (supports multiple schemas)
          if (
            (parsed.type === 'system' && parsed.subtype === 'init' && (parsed.session_id || parsed.sessionId)) ||
            (parsed.type === 'init' && parsed.sessionId) ||
            (parsed.type === 'init' && parsed.session_id)
          ) {
            const newClaudeSessionId = parsed.session_id || parsed.sessionId;
            console.log('Captured Claude session ID:', newClaudeSessionId);

            if (newClaudeSessionId && newClaudeSessionId !== session.claudeSessionId) {
              session.claudeSessionId = newClaudeSessionId;
              console.log('Updated session with Claude session ID:', newClaudeSessionId);

              // Save session immediately with new Claude session ID
              try {
                await saveSession(sessionId);
                console.log('Claude session ID saved to persistent storage');
              } catch (error) {
                console.error('Failed to save Claude session ID:', error);
              }
            }

          // Handle assistant messages (supports new and old schemas)
          } else if (
            (parsed.type === 'assistant' && parsed.message && parsed.message.role === 'assistant') ||
            (parsed.type === 'message' && parsed.role === 'assistant')
          ) {
            let assistantPayload = null;
            if (parsed.type === 'assistant' && parsed.message && parsed.message.role === 'assistant') {
              assistantPayload = parsed.message;
            } else if (parsed.type === 'message' && parsed.role === 'assistant') {
              assistantPayload = parsed;
            }

            if (assistantPayload) {
              let thinkingContent = null;

              // Extract thinking content separately
              if (assistantPayload.content && Array.isArray(assistantPayload.content)) {
                for (const block of assistantPayload.content) {
                  if (block.type === 'thinking') {
                    thinkingContent = block.thinking || '';
                    break; // Only take first thinking block
                  }
                }
              }

              // Update assistant message with structured content by accumulating blocks
              assistantMessage.id = assistantPayload.id || assistantMessage.id;
              if (assistantPayload.content && Array.isArray(assistantPayload.content)) {
                  assistantMessage.content = assistantPayload.content.filter(b => b.type !== 'thinking');
              }

              // Send streaming update to renderer with structured data
              mainWindow.webContents.send('message-stream', {
                sessionId,
                message: assistantMessage,
                isComplete: false,
                thinkingContent: thinkingContent
              });
            }
          } else if (parsed.type === 'message' && parsed.role === 'user') {
            console.log('Received user message echo:', parsed);
          } else if (parsed.type === 'result') {
            console.log('Received result message:', parsed);
          } else {
            console.log('Unhandled message type:', parsed.type, 'with role:', parsed.role);
          }
        } catch (e) {
          console.log('JSON parse error for line:', JSON.stringify(trimmedLine), 'Error:', e.message);

          // Try to recover from malformed JSON by looking for partial objects
          if (trimmedLine.includes('{') && !trimmedLine.includes('}')) {
            console.log('Possible incomplete JSON object, adding back to buffer');
            jsonBuffer = trimmedLine + '\n' + jsonBuffer;
          } else if (trimmedLine.includes('\"type\"')) {
            console.log('Line contains type field but failed to parse, logging for investigation');
            console.error('Malformed JSON with type field:', trimmedLine);
          }
        }
      }
    });

    // Add stderr event listener setup logging
    console.log('Setting up stderr event listener...');

    claudeProcess.stderr.on('data', (data) => {
      const errorChunk = data.toString();
      errorOutput += errorChunk;
      console.log('Claude stderr received:', JSON.stringify(errorChunk));
      console.log('Error chunk length:', errorChunk.length, 'bytes');
    });

    claudeProcess.on('close', async (code) => {
      claudeProcesses.delete(sessionId);
      clearTimeout(timeout); // Clear the timeout
      clearTimeout(initialTimeout); // Clear the initial timeout

      console.log('Claude process closed with code:', code);
      console.log('Final stdout output:', JSON.stringify(output));
      console.log('Final stderr output:', JSON.stringify(errorOutput));
      console.log('Final assistant message:', JSON.stringify(assistantMessage));

      // Process any remaining buffer content
      if (jsonBuffer.trim()) {
        console.log('Processing remaining buffer:', JSON.stringify(jsonBuffer));
        try {
          const parsed = JSON.parse(jsonBuffer.trim());
          console.log('Parsed remaining JSON:', JSON.stringify(parsed, null, 2));

          let assistantPayload = null;
          if (parsed.type === 'assistant' && parsed.message && parsed.message.role === 'assistant') {
            assistantPayload = parsed.message;
          } else if (parsed.type === 'message' && parsed.role === 'assistant') {
            assistantPayload = parsed;
          }

          if (assistantPayload) {
            // Update assistant message with structured content
            assistantMessage.content = assistantPayload.content;
            assistantMessage.id = assistantPayload.id || assistantMessage.id;
          }
        } catch (e) {
          console.log('Failed to parse remaining buffer:', e.message);
        }
      }

      if (code === 0) {
        // Add final assistant message to session and save
        try {
          const savedMessage = await addMessageToSession(sessionId, assistantMessage);
          console.log('Assistant message saved to session:', savedMessage.id);

          // Update session's last assistant message and mark as historical if conversation seems complete
          const session = sessions.get(sessionId);
          if (session) {
            // Extract text content from assistant message for storage
            let assistantText = '';
            if (assistantMessage.content && Array.isArray(assistantMessage.content)) {
              const textBlocks = assistantMessage.content.filter(block => block.type === 'text');
              assistantText = textBlocks.map(block => block.text || '').join('\n');
            }
            session.lastAssistantMessage = assistantText;
            
            // Mark as historical after successful completion (can still be resumed)
            session.status = 'historical';
            await saveSession(sessionId);
          }

          // Send final message to renderer
          mainWindow.webContents.send('message-stream', {
            sessionId,
            message: assistantMessage,
            isComplete: true
          });

          // Clear recovery state on successful completion
          await clearRecoveryState(sessionId);

          resolve(assistantMessage);
        } catch (saveError) {
          console.error('Failed to save assistant message:', saveError);
          // Still resolve but log the error
          resolve(assistantMessage);
        }
      } else {
        console.error('Claude process failed:', { code, errorOutput, sessionId });

        // Keep recovery state on failure for potential retry
        await saveRecoveryState(sessionId, {
          lastUserMessage: session.messages[session.messages.length - 1]?.content,
          claudeSessionId: session.claudeSessionId,
          status: 'failed',
          error: errorOutput,
          failedAt: new Date().toISOString()
        });

        reject(new Error(`Claude process failed with code ${code}: ${errorOutput}`));
      }
    });

    claudeProcess.on('error', async (error) => {
      claudeProcesses.delete(sessionId);
      clearTimeout(timeout); // Clear the timeout
      clearTimeout(initialTimeout); // Clear the initial timeout
      console.log('Claude process error:', error);

      // Save recovery state on process error
      await saveRecoveryState(sessionId, {
        lastUserMessage: session.messages[session.messages.length - 1]?.content,
        claudeSessionId: session.claudeSessionId,
        status: 'process_error',
        error: error.message,
        failedAt: new Date().toISOString()
      });

      reject(new Error(`Failed to start Claude process: ${error.message}`));
    });

    // Add timeout handling (5 minutes)
    const timeout = setTimeout(async () => {
      if (!claudeProcess.killed) {
        console.log('Claude process timed out, killing...');
        claudeProcess.kill('SIGTERM');
        claudeProcesses.delete(sessionId);

        // Save recovery state on timeout
        await saveRecoveryState(sessionId, {
          lastUserMessage: session.messages[session.messages.length - 1]?.content,
          claudeSessionId: session.claudeSessionId,
          status: 'timeout',
          timedOutAt: new Date().toISOString()
        });

        reject(new Error('Claude process timed out after 5 minutes'));
      }
    }, 5 * 60 * 1000);

    // Add shorter timeout to detect early hanging (30 seconds for initial response)
    const initialTimeout = setTimeout(() => {
      if (output.length === 0 && errorOutput.length === 0) {
        console.log('⚠️  No output received after 30 seconds - process may be hanging');
        console.log('⚠️  Checking if process is still alive...');
        console.log('⚠️  Process killed:', claudeProcess.killed);
        console.log('⚠️  Process exit code:', claudeProcess.exitCode);
        console.log('⚠️  Process signal code:', claudeProcess.signalCode);

        // Send a gentle ping to check if process is responsive
        if (!claudeProcess.killed) {
          console.log('⚠️  Process appears to be hanging, but keeping it alive for now');

          // Update recovery state with hanging status
          saveRecoveryState(sessionId, {
            lastUserMessage: session.messages[session.messages.length - 1]?.content,
            claudeSessionId: session.claudeSessionId,
            status: 'hanging',
            hangingDetectedAt: new Date().toISOString()
          }).catch(err => console.error('Failed to save hanging state:', err));
        }
      }
    }, 30000);
  });
});

ipcMain.handle('stop-message', async (event, sessionId) => {
  const process = claudeProcesses.get(sessionId);
  if (process && !process.killed) {
    console.log('Stopping Claude process for session:', sessionId);
    process.kill();
    claudeProcesses.delete(sessionId);
    return true;
  }
  return false;
});

// Handle app closing
app.on('before-quit', async () => {
  console.log('App closing, saving sessions and cleaning up...');

  // Save all pending recovery states for running processes
  for (const [sessionId, process] of claudeProcesses) {
    if (!process.killed) {
      const session = sessions.get(sessionId);
      if (session) {
        await saveRecoveryState(sessionId, {
          lastUserMessage: session.messages[session.messages.length - 1]?.content,
          claudeSessionId: session.claudeSessionId,
          status: 'app_closing',
          closingAt: new Date().toISOString()
        });
      }

      // Gracefully terminate the process
      console.log('Terminating Claude process for session:', sessionId);
      process.kill('SIGTERM');
    }
  }

  await saveSessions();
  console.log('Cleanup completed');
});