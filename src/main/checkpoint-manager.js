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
          tool_type TEXT,
          pre_edit_content TEXT,
          post_edit_content TEXT,
          edit_summary TEXT
        )
      `);

      console.log('Checkpoint system initialized successfully');
    } catch (error) {
      console.error('Failed to initialize checkpoint system:', error);
      console.log('Checkpoint system failed to initialize, running without checkpointing:', error.message);
      // Set checkpointDb to null to indicate checkpoint system is disabled
      this.checkpointDb = null;
      // Don't throw the error - allow the app to continue without checkpointing
    }
  }

  // Create a checkpoint for a file edit
  async createCheckpoint(toolUse, sessionId, messageId) {
    if (!this.checkpointDb) {
      console.warn('Checkpoint database not initialized, skipping checkpoint');
      return null;
    }

    try {
      const { file_path } = toolUse.input;
      let fullContentBeforeEdit = '';
      try {
        fullContentBeforeEdit = await fs.readFile(file_path, 'utf8');
      } catch (err) {
        // File doesn't exist, which is fine for a Write operation.
      }

      // For any file modification, we create a single checkpoint with the full content.
      const checkpointId = uuidv4();
      const patchPath = path.join(this.checkpointBlobsDir, `${checkpointId}.patch`);
      let newContentForCheckpoint;
      let patch;

      if (toolUse.name === 'Write') {
        newContentForCheckpoint = toolUse.input.content || '';
        patch = diff.createPatch(path.basename(file_path), fullContentBeforeEdit, newContentForCheckpoint, 'before', 'after');
      } else if (toolUse.name === 'Edit' || toolUse.name === 'MultiEdit') {
        // For edits, we need to capture the actual content after the edit is applied
        // This is a placeholder that will be updated by updateCheckpointWithPostEditContent
        newContentForCheckpoint = '...PENDING_POST_EDIT_CONTENT...';
        patch = `--- before/${path.basename(file_path)}\n+++ after/${path.basename(file_path)}\n...edit applied...`;
      } else {
        // Not a tool we're checkpointing
        return null;
      }

      const tempPatchPath = patchPath + '.tmp';
      await fs.writeFile(tempPatchPath, patch);
      await fs.rename(tempPatchPath, patchPath);

      const stmt = this.checkpointDb.prepare(`
        INSERT INTO checkpoints
        (id, session_id, message_id, file_path, patch_path, full_snapshot, old_content, new_content, tool_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        checkpointId,
        sessionId,
        messageId,
        file_path,
        path.relative(this.checkpointDir, patchPath),
        1, // All checkpoints are now full snapshots for simplicity
        fullContentBeforeEdit,
        newContentForCheckpoint,
        toolUse.name
      );

      console.log('Checkpoint created:', checkpointId, 'for', file_path);
      return checkpointId;
    } catch (error) {
      console.error('Failed to create checkpoint:', error);
      return null;
    }
  }

  // Update checkpoint with actual post-edit content after edit operation completes
  async updateCheckpointWithPostEditContent(checkpointId, filePath) {
    if (!this.checkpointDb || !checkpointId) {
      console.warn('Checkpoint database not initialized or no checkpoint ID provided');
      return false;
    }

    try {
      // Read the actual file content after the edit
      let postEditContent = '';
      try {
        postEditContent = await fs.readFile(filePath, 'utf8');
      } catch (err) {
        console.error('Failed to read post-edit content for checkpoint update:', err);
        return false;
      }

      // Update the checkpoint with the actual new content
      const updateStmt = this.checkpointDb.prepare(`
        UPDATE checkpoints 
        SET new_content = ?, patch_path = ?
        WHERE id = ?
      `);

      // Create a proper patch with the actual content
      const checkpoint = this.checkpointDb.prepare('SELECT * FROM checkpoints WHERE id = ?').get(checkpointId);
      if (!checkpoint) {
        console.error('Checkpoint not found for update:', checkpointId);
        return false;
      }

      const patch = diff.createPatch(
        path.basename(filePath), 
        checkpoint.old_content, 
        postEditContent, 
        'before', 
        'after'
      );
      
      const patchPath = path.join(this.checkpointBlobsDir, `${checkpointId}.patch`);
      const tempPatchPath = patchPath + '.tmp';
      await fs.writeFile(tempPatchPath, patch);
      await fs.rename(tempPatchPath, patchPath);

      updateStmt.run(
        postEditContent,
        path.relative(this.checkpointDir, patchPath),
        checkpointId
      );

      console.log('Checkpoint updated with post-edit content:', checkpointId, 'for', filePath);
      return true;
    } catch (error) {
      console.error('Failed to update checkpoint with post-edit content:', error);
      return false;
    }
  }

  // Get pending checkpoints that need post-edit content updates
  async getPendingCheckpoints(sessionId, messageId) {
    if (!this.checkpointDb) {
      return [];
    }

    try {
      const stmt = this.checkpointDb.prepare(`
        SELECT * FROM checkpoints
        WHERE session_id = ? AND message_id = ? AND new_content = '...PENDING_POST_EDIT_CONTENT...'
        ORDER BY ts DESC
      `);

      return stmt.all(sessionId, messageId);
    } catch (error) {
      console.error('Failed to get pending checkpoints:', error);
      return [];
    }
  }

  async createSingleCheckpoint(toolUse, sessionId, messageId) {
    // This method is no longer the main entry point.
    // The logic has been consolidated into createCheckpoint.
    // We can deprecate or remove this later.
    return this.createCheckpoint(toolUse, sessionId, messageId);
  }

  // Get checkpoints for a session up to a specific message
  async getCheckpointsToRevert(sessionId, messageId) {
    if (!this.checkpointDb) {
      return [];
    }

    try {
      // First, get the timestamp of the target message
      const messageStmt = this.checkpointDb.prepare(`
        SELECT MIN(ts) as target_ts FROM checkpoints 
        WHERE message_id = ? AND session_id = ?
      `);
      const messageResult = messageStmt.get(messageId, sessionId);
      
      if (!messageResult || !messageResult.target_ts) {
        // No checkpoints found for this message
        console.log(`No checkpoints found for message ${messageId} in session ${sessionId}`);
        return [];
      }

      // Get all checkpoints from this message's timestamp onwards
      const stmt = this.checkpointDb.prepare(`
        SELECT * FROM checkpoints
        WHERE session_id = ? AND ts >= ?
        ORDER BY ts DESC
      `);

      return stmt.all(sessionId, messageResult.target_ts);
    } catch (error) {
      console.error('Failed to get checkpoints:', error);
      return [];
    }
  }

  // Revert files to a checkpoint
  async revertToCheckpoint(sessionId, messageId) {
    if (!this.checkpointDb) {
      throw new Error('Checkpoint database not initialized');
    }

    try {
      const checkpoints = await this.getCheckpointsToRevert(sessionId, messageId);
      const revertedFiles = [];
      const failedFiles = [];

      // Check if any checkpoints were found
      if (checkpoints.length === 0) {
        console.log(`No file changes to revert for message ${messageId} in session ${sessionId}`);
        return [];
      }

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
          failedFiles.push({ filePath, error: error.message });
        }
      }

      if (failedFiles.length > 0) {
        console.warn(`Some files failed to revert:`, failedFiles);
        // Still return successful files, but include failure information
        return { 
          revertedFiles, 
          failedFiles, 
          partialSuccess: revertedFiles.length > 0 
        };
      }

      return revertedFiles;
    } catch (error) {
      console.error('Failed to revert to checkpoint:', error);
      throw error;
    }
  }

  // Revert files back to their state before a checkpoint
  async unrevertFromCheckpoint(sessionId, messageId) {
    if (!this.checkpointDb) {
      throw new Error('Checkpoint database not initialized');
    }

    try {
      const checkpoints = await this.getCheckpointsToRevert(sessionId, messageId);
      const restoredFiles = [];
      const failedFiles = [];

      // Check if any checkpoints were found
      if (checkpoints.length === 0) {
        console.log(`No file changes to unrevert for message ${messageId} in session ${sessionId}`);
        return [];
      }

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
          if (latestCheckpoint.new_content === '...PENDING_POST_EDIT_CONTENT...') {
            // This checkpoint was created for an Edit/MultiEdit but never updated with actual content
            // We need to read the current file content as the "new" content
            try {
              const currentContent = await fs.readFile(filePath, 'utf8');
              console.log('Using current file content as post-edit state for unrevert:', filePath);
              // The file is already in the correct state, no action needed
            } catch (err) {
              console.error('Cannot read current file content for unrevert:', filePath, err);
              throw new Error(`Cannot unrevert ${filePath}: file not readable`);
            }
          } else if (latestCheckpoint.full_snapshot && latestCheckpoint.new_content !== '') {
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
          failedFiles.push({ filePath, error: error.message });
        }
      }

      if (failedFiles.length > 0) {
        console.warn(`Some files failed to unrevert:`, failedFiles);
        // Still return successful files, but include failure information
        return { 
          restoredFiles, 
          failedFiles, 
          partialSuccess: restoredFiles.length > 0 
        };
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
    if (!sessionId || !messageId) {
      console.warn('hasFileChanges called with invalid parameters:', { sessionId, messageId });
      return false;
    }

    if (!this.checkpointDb) {
      console.warn('Checkpoint database not initialized, returning false for hasFileChanges');
      return false;
    }

    try {
      const checkpoints = await this.getCheckpointsToRevert(sessionId, messageId);
      const hasChanges = checkpoints.length > 0;
      console.log(`Session ${sessionId}, Message ${messageId}: ${hasChanges ? 'has' : 'no'} file changes (${checkpoints.length} checkpoints)`);
      return hasChanges;
    } catch (error) {
      console.error('Failed to check file changes for session', sessionId, 'message', messageId, ':', error);
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