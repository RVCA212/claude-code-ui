const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const McpServerManager = require('./mcp-server-manager');

class ClaudeProcessManager {
  constructor(sessionManager, checkpointManager, fileOperations, mainWindow, modelConfig) {
    this.sessionManager = sessionManager;
    this.checkpointManager = checkpointManager;
    this.fileOperations = fileOperations;
    this.mainWindow = mainWindow;
    this.modelConfig = modelConfig;
    this.claudeProcesses = new Map(); // Track running Claude processes

    this.ALL_TOOLS = [
      "Task", "Bash", "Glob", "Grep", "LS", "exit_plan_mode", "Read", "Edit",
      "MultiEdit", "Write", "NotebookRead", "NotebookEdit", "WebFetch",
      "TodoRead", "TodoWrite", "WebSearch"
    ];
  }

  // Get running session IDs
  getRunningSessionIds() {
    return Array.from(this.claudeProcesses.keys());
  }

  // Check if Claude Code CLI is available
  async checkClaudeCliAvailable() {
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
  checkApiKey() {
    return !!process.env.ANTHROPIC_API_KEY;
  }

  // Verify API key by making a test call
  async verifyApiKey(apiKey) {
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
  }

  // Send message to Claude
  async sendMessage(sessionId, message) {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Capture working directory for the session if this is the first message
    if (!session.cwd && session.messages.length === 0) {
      const currentCwd = this.fileOperations.getCurrentWorkingDirectory();
      try {
        await this.sessionManager.setSessionCwd(sessionId, currentCwd);
        console.log(`Captured working directory for new session ${sessionId}: ${currentCwd}`);
      } catch (error) {
        console.error('Failed to capture working directory for session:', error);
        // Continue with message sending even if cwd capture fails
      }
    }

    // Add user message to session and save immediately
    const userMessage = await this.sessionManager.addMessageToSession(sessionId, {
      id: uuidv4(),
      type: 'user',
      content: message,
      timestamp: new Date().toISOString()
    });

    // Smart conversation state management
    session.lastUserMessage = message;
    session.status = 'active';

    // Determine conversation type for logging
    const conversationType = session.claudeSessionId ?
      (session.status === 'historical' ? 'resuming' : 'continuing') :
      'new';
    console.log(`Smart conversation detection: ${conversationType} conversation for session ${sessionId}`);

    console.log('User message saved to session:', userMessage.id);

    // Save recovery state before starting Claude process
    await this.sessionManager.saveRecoveryState(sessionId, {
      lastUserMessage: message,
      claudeSessionId: session.claudeSessionId,
      status: 'waiting_for_response'
    });

    // Before spawning, ensure enabled MCP servers are registered once per app run
    await this.ensureMcpServersRegistered();

    // Create Claude process - follow SDK best practices
    const claudeArgs = [];

    // Add system prompt if enabled
    const systemPromptConfig = this.modelConfig.getSystemPromptConfig();
    if (systemPromptConfig.enabled && systemPromptConfig.prompt) {
      if (systemPromptConfig.mode === 'override') {
        claudeArgs.push('--system-prompt', systemPromptConfig.prompt);
        console.log('Using override system prompt.');
      } else {
        claudeArgs.push('--append-system-prompt', systemPromptConfig.prompt);
        console.log('Using append system prompt.');
      }
    }

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
    claudeArgs.push('--allowedTools', this.ALL_TOOLS.join(','));

    console.log('Spawning Claude process with command:', ['claude', ...claudeArgs]);
    console.log('Environment has ANTHROPIC_API_KEY:', !!process.env.ANTHROPIC_API_KEY);

    const claudeProcess = spawn('claude', claudeArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
      cwd: this.fileOperations.getCurrentWorkingDirectory(), // Use the configurable working directory
      detached: false,
      shell: false
    });

    console.log('Claude process spawned with PID:', claudeProcess.pid);
    this.claudeProcesses.set(sessionId, claudeProcess);

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

    return this.handleClaudeProcess(claudeProcess, sessionId);
  }

  // Handle Claude process execution
  async handleClaudeProcess(claudeProcess, sessionId) {
    const session = this.sessionManager.getSession(sessionId);
    const cwd = this.fileOperations.getCurrentWorkingDirectory();

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
              this.sessionManager.saveRecoveryState(sessionId, {
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
                  await this.sessionManager.saveSession(sessionId);
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

                // Check for tool_use blocks and create checkpoints
                if (assistantPayload.content && Array.isArray(assistantPayload.content)) {
                  for (const block of assistantPayload.content) {
                    if (block.type === 'tool_use') {
                        if (block.name === 'Write') {
                            try {
                                // Read the file content before writing to show a diff.
                                const oldContent = await this.fileOperations.readFile(block.input.file_path);
                                block.input.old_content_for_diff = oldContent || '';
                            } catch (e) {
                                // If the file doesn't exist, old content is an empty string.
                                block.input.old_content_for_diff = '';
                            }
                        }

                        const isFileModTool = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(block.name);

                        if (isFileModTool) {
                          console.log('=== CHECKPOINT CREATION DEBUG ===');
                          console.log('Detected file modification tool, creating checkpoint:', block.name);
                          console.log('Session ID for checkpoint:', sessionId);
                          console.log('Assistant message ID for checkpoint:', assistantMessage.id);

                          // Normalize input for CheckpointManager
                          const toolUseForCheckpoint = { ...block };
                          if (block.name === 'NotebookEdit' && block.input.notebook_path) {
                              toolUseForCheckpoint.input.file_path = block.input.notebook_path;
                          }

                          try {
                            console.log('Calling createCheckpoint with:', { 
                              toolName: toolUseForCheckpoint.name,
                              sessionId: sessionId,
                              messageId: assistantMessage.id,
                              filePath: toolUseForCheckpoint.input?.file_path
                            });
                            await this.checkpointManager.createCheckpoint(toolUseForCheckpoint, sessionId, assistantMessage.id);
                            console.log('Checkpoint created successfully');
                          } catch (error) {
                            console.error('Failed to create checkpoint for tool use:', error);
                          }
                          console.log('=== CHECKPOINT CREATION DEBUG END ===');
                        }
                    }
                  }
                }

                // Update assistant message with structured content by accumulating blocks
                assistantMessage.id = assistantPayload.id || assistantMessage.id;
                if (assistantPayload.content && Array.isArray(assistantPayload.content)) {
                    const newContent = assistantPayload.content.filter(b => b.type !== 'thinking');
                    // Accumulate content instead of replacing it
                    assistantMessage.content = [...(assistantMessage.content || []), ...newContent];
                }

                // Send streaming update to renderer with structured data
                this.mainWindow.webContents.send('message-stream', {
                  sessionId,
                  message: assistantMessage,
                  isComplete: false,
                  thinkingContent: thinkingContent,
                  cwd: cwd
                });
              }
            } else if (parsed.type === 'user' && parsed.message?.content?.[0]?.type === 'tool_result') {
                const toolResult = parsed.message.content[0];
                const { tool_use_id, content, is_error } = toolResult;

                if (tool_use_id && assistantMessage.content) {
                    const toolCall = assistantMessage.content.find(
                        (block) => block.type === 'tool_use' && block.id === tool_use_id
                    );

                    if (toolCall) {
                        toolCall.output = content;
                        if (is_error) {
                            toolCall.status = 'failed';
                        }
                        console.log(`Updated tool_use ${tool_use_id} with result.`);

                        this.mainWindow.webContents.send('message-stream', {
                            sessionId,
                            message: assistantMessage,
                            isComplete: false,
                            cwd: cwd
                        });
                    }
                }
            } else if (parsed.type === 'message' && parsed.role === 'user') {
              console.log('Received user message echo:', parsed);
            } else if (parsed.type === 'result') {
              console.log('Received result message:', parsed);

              // Handle tool execution results and update checkpoints with post-edit content
              if (parsed.tool_call_id) {
                await this.handleToolResult(parsed, sessionId, assistantMessage.id);
              }
            } else {
              console.log('Unhandled message type:', parsed.type, 'with role:', parsed.role);
            }
          } catch (e) {
            console.log('JSON parse error for line:', JSON.stringify(trimmedLine), 'Error:', e.message);

            // Try to recover from malformed JSON by looking for partial objects
            if (trimmedLine.includes('{') && !trimmedLine.includes('}')) {
              console.log('Possible incomplete JSON object, adding back to buffer');
              jsonBuffer = trimmedLine + '\n' + jsonBuffer;
            } else if (trimmedLine.includes('"type"')) {
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
        this.claudeProcesses.delete(sessionId);
        clearTimeout(timeout); // Clear the timeout
        clearTimeout(initialTimeout); // Clear the initial timeout

        console.log('Claude process closed with code:', code);
        console.log('Final stdout output:', JSON.stringify(output));
        console.log('Final stderr output:', JSON.stringify(errorOutput));
        console.log('Final assistant message:', JSON.stringify(assistantMessage));

        // Process any remaining buffer content before finalizing
        this.processRemainingBuffer(jsonBuffer, assistantMessage);

        // Finalize the assistant message regardless of exit code
        const finalizeResult = await this.finalizeAssistantMessage(sessionId, assistantMessage, cwd, code, errorOutput);

        if (code === 0) {
          // Clear recovery state on successful completion
          await this.sessionManager.clearRecoveryState(sessionId);
          resolve(finalizeResult.savedMessage || assistantMessage);
        } else {
          console.error('Claude process failed:', { code, errorOutput, sessionId });

          // Keep recovery state on failure for potential retry, but include assistant message content
          await this.sessionManager.saveRecoveryState(sessionId, {
            lastUserMessage: session.messages[session.messages.length - 1]?.content,
            claudeSessionId: session.claudeSessionId,
            status: code === 143 ? 'interrupted' : 'failed',
            error: errorOutput,
            failedAt: new Date().toISOString(),
            // Include assistant message content for recovery
            partialAssistantMessage: finalizeResult.savedMessage ? {
              id: finalizeResult.savedMessage.id,
              content: finalizeResult.savedMessage.content
            } : null
          });

          // For SIGTERM (code 143), resolve with the saved message instead of rejecting
          // This allows the UI to show the partial response that was captured
          if (code === 143 && finalizeResult.savedMessage) {
            console.log('Process was interrupted (SIGTERM), but assistant message was saved:', finalizeResult.savedMessage.id);
            resolve(finalizeResult.savedMessage);
          } else {
            reject(new Error(`Claude process failed with code ${code}: ${errorOutput}`));
          }
        }
      });

      claudeProcess.on('error', async (error) => {
        this.claudeProcesses.delete(sessionId);
        clearTimeout(timeout); // Clear the timeout
        clearTimeout(initialTimeout); // Clear the initial timeout
        console.log('Claude process error:', error);

        // Save recovery state on process error
        await this.sessionManager.saveRecoveryState(sessionId, {
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
          this.claudeProcesses.delete(sessionId);

          // Save recovery state on timeout
          await this.sessionManager.saveRecoveryState(sessionId, {
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
            this.sessionManager.saveRecoveryState(sessionId, {
              lastUserMessage: session.messages[session.messages.length - 1]?.content,
              claudeSessionId: session.claudeSessionId,
              status: 'hanging',
              hangingDetectedAt: new Date().toISOString()
            }).catch(err => console.error('Failed to save hanging state:', err));
          }
        }
      }, 30000);
    });
  }

  // Stop message processing
  async stopMessage(sessionId) {
    const process = this.claudeProcesses.get(sessionId);
    if (process && !process.killed) {
      console.log('Stopping Claude process for session:', sessionId);
      process.kill();
      this.claudeProcesses.delete(sessionId);
      return true;
    }
    return false;
  }

  // Stop all running Claude processes
  async stopAllMessages() {
    console.log('Stopping all Claude processes...');
    let stoppedCount = 0;

    for (const [sessionId, process] of this.claudeProcesses.entries()) {
      if (!process.killed) {
        console.log('Stopping Claude process for session:', sessionId);
        process.kill();
        stoppedCount++;
      }
    }

    this.claudeProcesses.clear();
    console.log(`Stopped ${stoppedCount} Claude processes`);
    return stoppedCount;
  }

  // Set API key
  setApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid API key');
    }

    // Set environment variable for current process
    process.env.ANTHROPIC_API_KEY = apiKey;
  }

  // Cleanup all processes
  async cleanup() {
    console.log('Cleaning up Claude processes...');

    // Save all pending recovery states for running processes
    for (const [sessionId, process] of this.claudeProcesses) {
      if (!process.killed) {
        const session = this.sessionManager.getSession(sessionId);
        if (session) {
          await this.sessionManager.saveRecoveryState(sessionId, {
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

    this.claudeProcesses.clear();
  }

  /* MCP registration helpers */
  async ensureMcpServersRegistered() {
    if (this._mcpRegistered) return;
    try {
      const servers = McpServerManager.getServers().filter(s => s.enabled);
      for (const server of servers) {
        await this.registerSingleMcpServerCLI(server);
      }
      this._mcpRegistered = true;
    } catch (err) {
      console.error('Failed to register MCP servers:', err);
    }
  }

  registerSingleMcpServerCLI(server) {
    return new Promise((resolve) => {
      const args = ['mcp', 'add', '--transport', server.transport, server.name, server.url];
      if (server.headers) {
        for (const [key, value] of Object.entries(server.headers)) {
          args.push('--header', `${key}: ${value}`);
        }
      }
      const proc = spawn('claude', args, { stdio: 'ignore' });
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
  }

  // Handle tool execution results and update checkpoints with post-edit content
  async handleToolResult(resultMessage, sessionId, messageId) {
    try {
      console.log('Processing tool result for checkpoint update:', resultMessage.tool_call_id);

      // Look for file modification tool results that need checkpoint updates
      if (resultMessage.content && Array.isArray(resultMessage.content)) {
        for (const block of resultMessage.content) {
          if (block.type === 'text' && block.text) {
            // Parse the result text to see if it indicates successful file operations
            await this.updateCheckpointsFromToolResult(block.text, sessionId, messageId);
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle tool result for checkpoint update:', error);
    }
  }

  // Update checkpoints based on tool result information
  async updateCheckpointsFromToolResult(resultText, sessionId, messageId) {
    try {
      // Get all pending checkpoints for this session and message that need post-edit content
      const pendingCheckpoints = await this.checkpointManager.getPendingCheckpoints(sessionId, messageId);

      for (const checkpoint of pendingCheckpoints) {
        if (checkpoint.new_content === '...PENDING_POST_EDIT_CONTENT...') {
          console.log('Updating checkpoint with post-edit content:', checkpoint.id, 'for file:', checkpoint.file_path);

          // Update the checkpoint with actual post-edit content
          const updateSuccess = await this.checkpointManager.updateCheckpointWithPostEditContent(
            checkpoint.id,
            checkpoint.file_path
          );

          if (updateSuccess) {
            console.log('Successfully updated checkpoint:', checkpoint.id);
          } else {
            console.warn('Failed to update checkpoint:', checkpoint.id);
          }
        }
      }
    } catch (error) {
      console.error('Failed to update checkpoints from tool result:', error);
    }
  }
}

module.exports = ClaudeProcessManager;