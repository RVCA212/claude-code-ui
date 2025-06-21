#!/usr/bin/env node

const { spawn } = require('child_process');

function testClaudeBasic() {
  console.log('Testing basic Claude CLI first...');
  
  const basicProcess = spawn('claude', ['-p', 'Say hi'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd: process.cwd(),
    detached: false,
    shell: false
  });

  // Close stdin immediately
  basicProcess.stdin.end();

  let output = '';
  let errorOutput = '';

  basicProcess.stdout.on('data', (data) => {
    output += data.toString();
  });

  basicProcess.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  basicProcess.on('close', (code) => {
    console.log('Basic test completed with code:', code);
    if (code === 0) {
      console.log('✅ Basic Claude CLI works');
      console.log('Output preview:', output.substring(0, 100) + '...');
      // Now test streaming
      testClaudeStreaming();
    } else {
      console.log('❌ Basic Claude CLI failed');
      console.log('Error:', errorOutput);
    }
  });

  basicProcess.on('error', (error) => {
    console.error('❌ Basic test process error:', error);
  });
}

function testClaudeStreaming() {
  console.log('\nTesting Claude CLI with stream-json output...');
  
  // Test the exact command pattern used by Electron app
  const claudeArgs = ['-p', '--output-format', 'stream-json', '--verbose', 'Hello, just say "hi" back'];
  console.log('Testing exact command:', ['claude', ...claudeArgs]);
  
  const claudeProcess = spawn('claude', claudeArgs, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
    cwd: process.cwd(),
    detached: false,
    shell: false
  });

  console.log('Process PID:', claudeProcess.pid);
  
  // Close stdin immediately - Claude doesn't need stdin input in -p mode
  claudeProcess.stdin.end();

  // Add process lifecycle events
  claudeProcess.on('spawn', () => {
    console.log('Process spawned successfully');
  });

  claudeProcess.on('exit', (code, signal) => {
    console.log('Process exited with code:', code, 'signal:', signal);
  });

  let output = '';
  let errorOutput = '';
  let jsonBuffer = '';

  claudeProcess.stdout.on('data', (data) => {
    const chunk = data.toString();
    output += chunk;
    
    console.log('Raw chunk:', JSON.stringify(chunk));

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
      } catch (e) {
        console.log('JSON parse error:', e.message);
      }
    }
  });

  claudeProcess.stderr.on('data', (data) => {
    const errorChunk = data.toString();
    errorOutput += errorChunk;
    console.log('Claude stderr:', JSON.stringify(errorChunk));
  });

  claudeProcess.on('close', (code) => {
    clearTimeout(timeout);
    console.log('Process closed with code:', code);
    console.log('Final output length:', output.length);
    console.log('Final error output:', errorOutput);
    
    // Process any remaining buffer
    if (jsonBuffer.trim()) {
      console.log('Processing remaining buffer:', JSON.stringify(jsonBuffer));
      try {
        const parsed = JSON.parse(jsonBuffer.trim());
        console.log('Parsed remaining JSON:', JSON.stringify(parsed, null, 2));
      } catch (e) {
        console.log('Failed to parse remaining buffer:', e.message);
      }
    }
  });

  claudeProcess.on('error', (error) => {
    console.error('Process error:', error);
  });

  // Add timeout to detect hanging
  const timeout = setTimeout(() => {
    console.log('⚠️  Process appears to be hanging, no data received after 10 seconds');
    console.log('⚠️  Killing process...');
    claudeProcess.kill();
  }, 10000);
}

// Check if API key is set
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY environment variable not set');
  process.exit(1);
}

testClaudeBasic();