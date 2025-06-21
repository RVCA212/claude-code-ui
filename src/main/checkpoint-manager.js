const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Database = require('better-sqlite3');
const diff = require('diff');

class CheckpointManager {
  constructor() {
    this.checkpointDir = path.join(process.cwd(), '.claude-checkpoints');
    this.checkpointDbPath = path.join(this.checkpointDir, 'metadata.db');
    this.checkpointBlobsDir = path.join(this.checkpointDir, 'blobs');
    this.checkpointDb = null;
  }

  // Initialize checkpoint system
  async initialize() {
    try {
      // Create checkpoint directories
      await fs.mkdir(this.checkpointDir, { recursive: true });
      await fs.mkdir(this.checkpointBlobsDir, { recursive: true });

      // Initialize better-sqlite3 database
      this.checkpointDb = new Database(this.checkpointDbPath);

      // Create checkpoints table
      this.checkpointDb.exec(`
        CREATE TABLE IF NOT EXISTS checkpoints (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          message_id TEXT NOT NULL,
          file_path TEXT NOT NULL,
          ts DATETIME DEFAULT CURRENT_TIMESTAMP,
          patch_path TEXT,
          full_snapshot INTEGER DEFAULT 0,
          old_content TEXT,
          new_content TEXT,
          tool_type TEXT
        )
      `);

      console.log('Checkpoint system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize checkpoint system:', error);
      throw error;
    }
  }

  // Create a checkpoint for a file edit
  async createCheckpoint(toolUse, sessionId, messageId) {
    if (!this.checkpointDb) {
      console.warn('Checkpoint database not initialized, skipping checkpoint');
      return null;
    }

    try {
      // Handle different tool types
      if (toolUse.name === 'MultiEdit') {
        // MultiEdit has multiple edits in an array
        const { file_path, edits } = toolUse.input;
        const checkpointPromises = [];

        for (const edit of edits || []) {
          const singleEditToolUse = {
            name: 'Edit',
            input: {
              file_path,
              old_string: edit.old_string,
              new_string: edit.new_string,
              replace_all: edit.replace_all
            }
          };
          checkpointPromises.push(this.createSingleCheckpoint(singleEditToolUse, sessionId, messageId));
        }

        return Promise.all(checkpointPromises);
      } else if (toolUse.name === 'Write') {
        // Write tool creates or overwrites files
        const { file_path, content } = toolUse.input;

        // Read existing file content if it exists
        let existingContent = '';
        try {
          existingContent = await fs.readFile(file_path, 'utf8');
        } catch (err) {
          // File doesn't exist, that's fine
        }

        const writeToolUse = {
          name: 'Write',
          input: {
            file_path,
            old_string: existingContent,
            new_string: content || ''
          }
        };
        return this.createSingleCheckpoint(writeToolUse, sessionId, messageId);
      } else {
        // Single edit
        return this.createSingleCheckpoint(toolUse, sessionId, messageId);
      }
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return null;
    }
  }

  async createSingleCheckpoint(toolUse, sessionId, messageId) {
    try {
      const { file_path, old_string, new_string } = toolUse.input;
      const checkpointId = uuidv4();

      // Read current file content for backup
      let currentContent = '';
      try {
        currentContent = await fs.readFile(file_path, 'utf8');
      } catch (err) {
        console.log('File does not exist yet, treating as new file creation');
      }

      // Create unified diff
      const patch = diff.createPatch(
        path.basename(file_path),
        old_string || '',
        new_string || '',
        'before',
        'after'
      );

      // Write patch to blob storage
      const patchPath = path.join(this.checkpointBlobsDir, `${checkpointId}.patch`);
      const tempPatchPath = patchPath + '.tmp';

      await fs.writeFile(tempPatchPath, patch);
      await fs.rename(tempPatchPath, patchPath);

      // Store checkpoint in database
      const stmt = this.checkpointDb.prepare(`
        INSERT INTO checkpoints
        (id, session_id, message_id, file_path, patch_path, full_snapshot, old_content, new_content, tool_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run([
        checkpointId,
        sessionId,
        messageId,
        file_path,
        path.relative(this.checkpointDir, patchPath),
        old_string === '' ? 1 : 0, // Full snapshot for new files
        old_string || '',
        new_string || '',
        toolUse.name
      ]);

      console.log('Checkpoint created:', checkpointId, 'for', file_path);
      return checkpointId;
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return null;
    }
  }

  // Get checkpoints for a session up to a specific message
  async getCheckpointsToRevert(sessionId, messageId) {
    if (!this.checkpointDb) {
      return [];
    }

    try {
      const stmt = this.checkpointDb.prepare(`
        SELECT * FROM checkpoints
        WHERE session_id = ? AND message_id >= ?
        ORDER BY ts DESC
      `);

      return stmt.all([sessionId, messageId]);
    } catch (error) {
      console.error('Failed to get checkpoints:', error);
      return [];
    }
  }

  // Revert files to a checkpoint
  async revertToCheckpoint(sessionId, messageId) {
    try {
      const checkpoints = await this.getCheckpointsToRevert(sessionId, messageId);
      const revertedFiles = [];

      // Group checkpoints by file and revert in reverse chronological order
      const fileGroups = {};
      checkpoints.forEach(checkpoint => {
        if (!fileGroups[checkpoint.file_path]) {
          fileGroups[checkpoint.file_path] = [];
        }
        fileGroups[checkpoint.file_path].push(checkpoint);
      });

      for (const [filePath, checkpointList] of Object.entries(fileGroups)) {
        // Get the most recent checkpoint for this file
        const latestCheckpoint = checkpointList[0];

        try {
          // Create backup before reverting
          const backupPath = path.join(this.checkpointBlobsDir, path.basename(filePath) + '.' + Date.now() + '.bak');
          try {
            await fs.copyFile(filePath, backupPath);
          } catch (err) {
            console.log('Could not create backup, file may not exist:', filePath);
          }

          // Revert to the old content
          if (latestCheckpoint.full_snapshot) {
            // For new files, we simply delete them or restore to old content
            if (latestCheckpoint.old_content === '') {
              await fs.unlink(filePath);
              console.log('Deleted newly created file:', filePath);
            } else {
              await fs.writeFile(filePath, latestCheckpoint.old_content);
              console.log('Restored file from full snapshot:', filePath);
            }
          } else {
            // For edits, restore the old content
            await fs.writeFile(filePath, latestCheckpoint.old_content);
            console.log('Restored file content:', filePath);
          }

          revertedFiles.push(filePath);
        } catch (error) {
          console.error('Failed to revert file:', filePath, error);
        }
      }

      return revertedFiles;
    } catch (error) {
      console.error('Failed to revert to checkpoint:', error);
      throw error;
    }
  }

  // Revert files back to their state before a checkpoint
  async unrevertFromCheckpoint(sessionId, messageId) {
    try {
      const checkpoints = await this.getCheckpointsToRevert(sessionId, messageId);
      const restoredFiles = [];

      // Group checkpoints by file and restore to their "new content" state
      const fileGroups = {};
      checkpoints.forEach(checkpoint => {
        if (!fileGroups[checkpoint.file_path]) {
          fileGroups[checkpoint.file_path] = [];
        }
        fileGroups[checkpoint.file_path].push(checkpoint);
      });

      for (const [filePath, checkpointList] of Object.entries(fileGroups)) {
        // Get the most recent checkpoint for this file
        const latestCheckpoint = checkpointList[0];

        try {
          // Create backup before unreverting
          const backupPath = path.join(this.checkpointBlobsDir, path.basename(filePath) + '.' + Date.now() + '.unrevert-bak');
          try {
            await fs.copyFile(filePath, backupPath);
          } catch (err) {
            console.log('Could not create backup, file may not exist:', filePath);
          }

          // Restore to the new content (post-edit state)
          if (latestCheckpoint.full_snapshot && latestCheckpoint.new_content !== '') {
            // For new files, restore to the full new content
            await fs.writeFile(filePath, latestCheckpoint.new_content);
            console.log('Restored file from new content snapshot:', filePath);
          } else if (latestCheckpoint.new_content !== '') {
            // For edits, restore to the new content
            await fs.writeFile(filePath, latestCheckpoint.new_content);
            console.log('Restored file to post-edit state:', filePath);
          } else if (latestCheckpoint.full_snapshot && latestCheckpoint.new_content === '') {
            // Special case: new file that was created then reverted, recreate it
            await fs.writeFile(filePath, '');
            console.log('Recreated empty file:', filePath);
          }

          restoredFiles.push(filePath);
        } catch (error) {
          console.error('Failed to unrevert file:', filePath, error);
        }
      }

      return restoredFiles;
    } catch (error) {
      console.error('Failed to unrevert from checkpoint:', error);
      throw error;
    }
  }

  // Get message checkpoints
  async getMessageCheckpoints(sessionId, messageId) {
    try {
      return await this.getCheckpointsToRevert(sessionId, messageId);
    } catch (error) {
      console.error('Failed to get checkpoints:', error);
      return [];
    }
  }

  // Check if there are file changes for a message
  async hasFileChanges(sessionId, messageId) {
    try {
      const checkpoints = await this.getCheckpointsToRevert(sessionId, messageId);
      return checkpoints.length > 0;
    } catch (error) {
      console.error('Failed to check file changes:', error);
      return false;
    }
  }

  // Cleanup method
  close() {
    if (this.checkpointDb) {
      this.checkpointDb.close();
      this.checkpointDb = null;
    }
  }
}

module.exports = CheckpointManager;