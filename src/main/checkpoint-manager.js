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

      // Run integrity checks at startup
      await this.performStartupIntegrityChecks();
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
      } else if (toolUse.name === 'Edit' || toolUse.name === 'MultiEdit' || toolUse.name === 'NotebookEdit') {
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
        // Delete the orphaned pending checkpoint
        this.checkpointDb.prepare('DELETE FROM checkpoints WHERE id = ?').run(checkpointId);
        console.warn(`Deleted orphaned pending checkpoint: ${checkpointId}`);
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
    console.log('=== GET CHECKPOINTS TO REVERT DEBUG START ===');
    console.log('Parameters - sessionId:', sessionId, 'messageId:', messageId);

    if (!this.checkpointDb) {
      console.log('Checkpoint database not initialized');
      console.log('=== GET CHECKPOINTS TO REVERT DEBUG END ===');
      return [];
    }

    // Validate input parameters
    if (!sessionId || !messageId) {
      console.error('Invalid parameters: sessionId and messageId are required');
      console.log('=== GET CHECKPOINTS TO REVERT DEBUG END ===');
      return [];
    }

    try {
      console.log('Searching for checkpoints with direct message ID match...');

      // First, try direct message ID lookup (more reliable than timestamp-based)
      const directMatchStmt = this.checkpointDb.prepare(`
        SELECT * FROM checkpoints
        WHERE session_id = ? AND message_id = ?
        ORDER BY ts DESC
      `);

      const directMatches = directMatchStmt.all(sessionId, messageId);
      console.log(`Direct message ID match found ${directMatches.length} checkpoints`);

      if (directMatches.length > 0) {
        console.log('Using direct message ID matches');
        console.log('=== GET CHECKPOINTS TO REVERT DEBUG END ===');
        return directMatches;
      }

      console.log('No direct matches found, trying timestamp-based fallback...');

      // Fallback: Get the timestamp of the target message (original approach)
      const messageStmt = this.checkpointDb.prepare(`
        SELECT MIN(ts) as target_ts FROM checkpoints
        WHERE message_id = ? AND session_id = ?
      `);
      const messageResult = messageStmt.get(messageId, sessionId);
      console.log('Message timestamp query result:', messageResult);

      if (!messageResult || !messageResult.target_ts) {
        console.log(`No checkpoints found for message ${messageId} in session ${sessionId}`);

        // Enhanced debugging: check for session and message separately
        await this.debugCheckpointLookup(sessionId, messageId);

        console.log('=== GET CHECKPOINTS TO REVERT DEBUG END ===');
        return [];
      }

      // Get all checkpoints from this message's timestamp onwards
      console.log('Querying for checkpoints from timestamp:', messageResult.target_ts);
      const stmt = this.checkpointDb.prepare(`
        SELECT * FROM checkpoints
        WHERE session_id = ? AND ts >= ?
        ORDER BY ts DESC
      `);

      const checkpoints = stmt.all(sessionId, messageResult.target_ts);
      console.log('Found', checkpoints.length, 'checkpoints from timestamp query');

      // Validate checkpoint integrity
      const validatedCheckpoints = await this.validateCheckpointIntegrity(checkpoints);
      console.log('After validation:', validatedCheckpoints.length, 'valid checkpoints');

      console.log('=== GET CHECKPOINTS TO REVERT DEBUG END ===');
      return validatedCheckpoints;
    } catch (error) {
      console.error('=== GET CHECKPOINTS TO REVERT DEBUG ERROR ===');
      console.error('Failed to get checkpoints:', error);
      console.error('=== GET CHECKPOINTS TO REVERT DEBUG END ===');
      return [];
    }
  }

  // Enhanced debugging for checkpoint lookup failures
  async debugCheckpointLookup(sessionId, messageId) {
    console.log('=== CHECKPOINT LOOKUP DEBUG ===');

    try {
      // Check if session exists at all in database
      const sessionCheckpoints = this.checkpointDb.prepare(`
        SELECT DISTINCT session_id FROM checkpoints WHERE session_id = ?
      `).all(sessionId);

      if (sessionCheckpoints.length === 0) {
        console.log(`  Session ${sessionId} has no checkpoints in database`);

        // Show available sessions for debugging
        const availableSessions = this.checkpointDb.prepare(`
          SELECT DISTINCT session_id FROM checkpoints ORDER BY ts DESC LIMIT 5
        `).all();
        console.log(`  Available sessions (last 5):`, availableSessions.map(s => s.session_id));

        // Check for similar session IDs (in case of UUID mismatch)
        const sessionPrefix = sessionId.substring(0, 8);
        const similarSessions = this.checkpointDb.prepare(`
          SELECT DISTINCT session_id FROM checkpoints WHERE session_id LIKE ?
        `).all(`%${sessionPrefix}%`);

        if (similarSessions.length > 0) {
          console.log(`  Similar session IDs found:`, similarSessions.map(s => s.session_id));
        }
      } else {
        console.log(`  Session ${sessionId} exists in database`);

        // Check if message exists in this session
        const messageCheckpoints = this.checkpointDb.prepare(`
          SELECT message_id FROM checkpoints WHERE session_id = ?
        `).all(sessionId);
        console.log(`  Available message IDs in this session:`, messageCheckpoints.map(m => m.message_id));

        // Check for similar message IDs (in case of message ID update issues)
        const messagePrefix = messageId.substring(0, 10);
        const similarMessages = this.checkpointDb.prepare(`
          SELECT DISTINCT message_id FROM checkpoints WHERE message_id LIKE ?
        `).all(`%${messagePrefix}%`);

        if (similarMessages.length > 0) {
          console.log(`  Similar message IDs found:`, similarMessages.map(m => m.message_id));
        }
      }
    } catch (debugError) {
      console.error('Error during checkpoint lookup debugging:', debugError);
    }

    console.log('=== CHECKPOINT LOOKUP DEBUG END ===');
  }

  // Validate checkpoint integrity
  async validateCheckpointIntegrity(checkpoints) {
    const validCheckpoints = [];

    for (const checkpoint of checkpoints) {
      let isValid = true;
      const validationErrors = [];

      // Check if file path still exists (optional - file might have been deleted legitimately)
      if (checkpoint.file_path) {
        try {
          await fs.access(checkpoint.file_path);
        } catch (error) {
          // File doesn't exist - this might be intentional (file was deleted)
          // Don't invalidate the checkpoint, but log it
          console.log(`Checkpoint ${checkpoint.id} references missing file: ${checkpoint.file_path}`);
        }
      }

      // Check if patch file exists and is readable
      if (checkpoint.patch_path) {
        const fullPatchPath = path.resolve(this.checkpointDir, checkpoint.patch_path);
        try {
          await fs.access(fullPatchPath);
        } catch (error) {
          console.error(`Checkpoint ${checkpoint.id} has missing patch file: ${fullPatchPath}`);
          validationErrors.push(`Missing patch file: ${checkpoint.patch_path}`);
          isValid = false;
        }
      }

      // Check for pending content that was never updated
      if (checkpoint.new_content === '...PENDING_POST_EDIT_CONTENT...') {
        console.warn(`Checkpoint ${checkpoint.id} has unresolved pending content`);
        validationErrors.push('Unresolved pending content');
        // Don't invalidate - this might be recoverable
      }

      // Check for required fields
      if (!checkpoint.id || !checkpoint.session_id || !checkpoint.message_id) {
        console.error(`Checkpoint ${checkpoint.id || 'UNKNOWN'} missing required fields`);
        validationErrors.push('Missing required fields');
        isValid = false;
      }

      if (isValid) {
        validCheckpoints.push(checkpoint);
      } else {
        console.error(`Checkpoint ${checkpoint.id} failed validation:`, validationErrors);
        // Consider marking as invalid in database for cleanup
        await this.markCheckpointAsInvalid(checkpoint.id, validationErrors);
      }
    }

    return validCheckpoints;
  }

  // Mark a checkpoint as invalid for potential cleanup
  async markCheckpointAsInvalid(checkpointId, errors) {
    try {
      const updateStmt = this.checkpointDb.prepare(`
        UPDATE checkpoints
        SET old_content = old_content || ' [INVALID: ' || ? || ']'
        WHERE id = ?
      `);

      updateStmt.run(errors.join(', '), checkpointId);
      console.log(`Marked checkpoint ${checkpointId} as invalid`);
    } catch (error) {
      console.error(`Failed to mark checkpoint ${checkpointId} as invalid:`, error);
    }
  }

  // Perform integrity checks at startup
  async performStartupIntegrityChecks() {
    if (!this.checkpointDb) {
      console.log('Checkpoint database not available for integrity checks');
      return;
    }

    console.log('=== CHECKPOINT STARTUP INTEGRITY CHECKS ===');

    try {
      // Get all checkpoints for integrity checking
      const allCheckpointsStmt = this.checkpointDb.prepare(`
        SELECT * FROM checkpoints ORDER BY ts DESC
      `);

      const allCheckpoints = allCheckpointsStmt.all();
      console.log(`Checking integrity of ${allCheckpoints.length} total checkpoints`);

      let validCount = 0;
      let invalidCount = 0;
      let pendingCount = 0;
      let orphanedCount = 0;

      // Check each checkpoint
      for (const checkpoint of allCheckpoints) {
        const issues = [];

        // Check for missing patch files
        if (checkpoint.patch_path) {
          const fullPatchPath = path.resolve(this.checkpointDir, checkpoint.patch_path);
          try {
            await fs.access(fullPatchPath);
          } catch (error) {
            issues.push('Missing patch file');
          }
        }

        // Check for pending content
        if (checkpoint.new_content === '...PENDING_POST_EDIT_CONTENT...') {
          pendingCount++;
          console.log(`Found pending checkpoint: ${checkpoint.id} for file: ${checkpoint.file_path}`);

          // Try to resolve pending content
          const resolved = await this.tryResolvePendingContent(checkpoint);
          if (!resolved) {
            issues.push('Unresolvable pending content');
          }
        }

        // Check for required fields
        if (!checkpoint.id || !checkpoint.session_id || !checkpoint.message_id) {
          issues.push('Missing required fields');
        }

        // Check if already marked as invalid
        if (checkpoint.old_content?.includes('[INVALID:')) {
          invalidCount++;
        } else if (issues.length > 0) {
          console.warn(`Checkpoint ${checkpoint.id} has issues:`, issues);
          await this.markCheckpointAsInvalid(checkpoint.id, issues);
          invalidCount++;
        } else {
          validCount++;
        }
      }

      console.log(`Integrity check results: ${validCount} valid, ${invalidCount} invalid, ${pendingCount} pending`);

      // Clean up very old invalid checkpoints (older than 30 days)
      await this.cleanupOldInvalidCheckpoints();

    } catch (error) {
      console.error('Failed to perform startup integrity checks:', error);
    }

    console.log('=== CHECKPOINT STARTUP INTEGRITY CHECKS COMPLETE ===');
  }

  // Try to resolve pending content for a checkpoint
  async tryResolvePendingContent(checkpoint) {
    if (!checkpoint.file_path) {
      return false;
    }

    try {
      // Check if the file exists and try to read its current content
      const currentContent = await fs.readFile(checkpoint.file_path, 'utf8');

      console.log(`Attempting to resolve pending content for checkpoint ${checkpoint.id}`);

      // Update the checkpoint with the current file content
      const success = await this.updateCheckpointWithPostEditContent(checkpoint.id, checkpoint.file_path);

      if (success) {
        console.log(`Successfully resolved pending content for checkpoint ${checkpoint.id}`);
        return true;
      } else {
        console.warn(`Failed to resolve pending content for checkpoint ${checkpoint.id}`);
        return false;
      }
    } catch (error) {
      console.log(`Cannot resolve pending content for checkpoint ${checkpoint.id}: file not accessible`);
      return false;
    }
  }

  // Clean up old invalid checkpoints
  async cleanupOldInvalidCheckpoints() {
    if (!this.checkpointDb) {
      return;
    }

    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const cleanupStmt = this.checkpointDb.prepare(`
        DELETE FROM checkpoints
        WHERE old_content LIKE '%[INVALID:%'
        AND ts < ?
      `);

      const result = cleanupStmt.run(thirtyDaysAgo.toISOString());

      if (result.changes > 0) {
        console.log(`Cleaned up ${result.changes} old invalid checkpoints`);
      }
    } catch (error) {
      console.error('Failed to clean up old invalid checkpoints:', error);
    }
  }

  // Enhanced session ID validation with detailed reporting
  validateSessionId(sessionId) {
    if (!this.checkpointDb || !sessionId) {
      return { valid: false, reason: 'Database not initialized or invalid session ID' };
    }

    try {
      const stmt = this.checkpointDb.prepare(`
        SELECT COUNT(*) as count,
               MIN(ts) as earliest_checkpoint,
               MAX(ts) as latest_checkpoint
        FROM checkpoints
        WHERE session_id = ?
      `);

      const result = stmt.get(sessionId);

      return {
        valid: result.count > 0,
        count: result.count,
        earliestCheckpoint: result.earliest_checkpoint,
        latestCheckpoint: result.latest_checkpoint,
        reason: result.count > 0 ? 'Session has checkpoints' : 'No checkpoints found for session'
      };
    } catch (error) {
      console.error('Failed to validate session ID in checkpoints:', error);
      return { valid: false, reason: `Validation error: ${error.message}` };
    }
  }

  // Get session statistics for debugging
  getSessionStatistics(sessionId) {
    if (!this.checkpointDb || !sessionId) {
      return null;
    }

    try {
      const stmt = this.checkpointDb.prepare(`
        SELECT
          COUNT(*) as total_checkpoints,
          COUNT(DISTINCT message_id) as unique_messages,
          COUNT(DISTINCT file_path) as unique_files,
          COUNT(CASE WHEN new_content = '...PENDING_POST_EDIT_CONTENT...' THEN 1 END) as pending_checkpoints,
          COUNT(CASE WHEN old_content LIKE '%[INVALID:%' THEN 1 END) as invalid_checkpoints,
          MIN(ts) as earliest_checkpoint,
          MAX(ts) as latest_checkpoint
        FROM checkpoints
        WHERE session_id = ?
      `);

      return stmt.get(sessionId);
    } catch (error) {
      console.error('Failed to get session statistics:', error);
      return null;
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

  // Get all checkpoints for a session (for broader searches)
  async getAllCheckpointsForSession(sessionId) {
    if (!this.checkpointDb) {
      console.warn('Checkpoint database not initialized');
      return [];
    }

    try {
      const stmt = this.checkpointDb.prepare(`
        SELECT * FROM checkpoints
        WHERE session_id = ?
        ORDER BY ts DESC
      `);

      const checkpoints = stmt.all(sessionId);
      console.log(`Found ${checkpoints.length} total checkpoints for session ${sessionId}`);
      return checkpoints;
    } catch (error) {
      console.error('Failed to get all checkpoints for session:', error);
      return [];
    }
  }

    // Check if there are file changes for a message
  async hasFileChanges(sessionId, messageId) {
    console.log('=== HAS FILE CHANGES DEBUG START ===');
    console.log('Parameters - sessionId:', sessionId, 'messageId:', messageId);

    if (!sessionId || !messageId) {
      console.warn('hasFileChanges called with invalid parameters:', { sessionId, messageId });
      console.log('=== HAS FILE CHANGES DEBUG END ===');
      return false;
    }

    if (!this.checkpointDb) {
      console.warn('Checkpoint database not initialized, returning false for hasFileChanges');
      console.log('=== HAS FILE CHANGES DEBUG END ===');
      return false;
    }

    try {
      console.log('Calling getCheckpointsToRevert with sessionId:', sessionId, 'messageId:', messageId);
      const checkpoints = await this.getCheckpointsToRevert(sessionId, messageId);
      console.log('getCheckpointsToRevert returned', checkpoints.length, 'checkpoints');

      if (checkpoints.length > 0) {
        console.log('Checkpoints found:', checkpoints.map(c => ({
          id: c.id,
          file_path: c.file_path,
          message_id: c.message_id,
          ts: c.ts,
          tool_type: c.tool_type,
          valid: !c.old_content?.includes('[INVALID:')
        })));

        // Filter out invalid checkpoints for the final count
        const validCheckpoints = checkpoints.filter(c => !c.old_content?.includes('[INVALID:'));
        const hasValidChanges = validCheckpoints.length > 0;

        if (validCheckpoints.length !== checkpoints.length) {
          console.warn(`Found ${checkpoints.length - validCheckpoints.length} invalid checkpoints, returning based on ${validCheckpoints.length} valid ones`);
        }

        console.log(`Session ${sessionId}, Message ${messageId}: ${hasValidChanges ? 'has' : 'no'} valid file changes (${validCheckpoints.length}/${checkpoints.length} checkpoints)`);
        console.log('=== HAS FILE CHANGES DEBUG END ===');
        return hasValidChanges;
      }

      // No checkpoints found - provide enhanced debugging
      console.log(`No checkpoints found for message ${messageId} in session ${sessionId}`);
      await this.debugCheckpointLookup(sessionId, messageId);

      console.log(`Session ${sessionId}, Message ${messageId}: no file changes (0 checkpoints)`);
      console.log('=== HAS FILE CHANGES DEBUG END ===');
      return false;
    } catch (error) {
      console.error('=== HAS FILE CHANGES DEBUG ERROR ===');
      console.error('Failed to check file changes for session', sessionId, 'message', messageId, ':', error);
      console.error('Stack trace:', error.stack);

      // In case of error, try a simple direct query as fallback
      try {
        console.log('Attempting fallback direct query...');
        const fallbackStmt = this.checkpointDb.prepare(`
          SELECT COUNT(*) as count FROM checkpoints
          WHERE session_id = ? AND message_id = ?
        `);
        const result = fallbackStmt.get(sessionId, messageId);
        const hasChanges = result.count > 0;
        console.log(`Fallback query result: ${hasChanges ? 'has' : 'no'} changes (${result.count} checkpoints)`);
        console.log('=== HAS FILE CHANGES DEBUG END ===');
        return hasChanges;
      } catch (fallbackError) {
        console.error('Fallback query also failed:', fallbackError);
        console.log('=== HAS FILE CHANGES DEBUG END ===');
        return false;
      }
    }
  }

    // Update checkpoint message IDs when Claude's real message ID becomes available
  async updateCheckpointMessageIds(sessionId, oldMessageId, newMessageId) {
    console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG START ===');
    console.log('Parameters:', { sessionId, oldMessageId, newMessageId });

    if (!this.checkpointDb) {
      console.warn('Checkpoint database not initialized, skipping message ID update');
      console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG END ===');
      return false;
    }

    // Validate parameters
    if (!sessionId || !oldMessageId || !newMessageId) {
      console.error('Invalid parameters for message ID update:', { sessionId, oldMessageId, newMessageId });
      console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG END ===');
      return false;
    }

    if (oldMessageId === newMessageId) {
      console.log('Old and new message IDs are identical, no update needed');
      console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG END ===');
      return true;
    }

    try {
      // First, check how many checkpoints need updating
      const countStmt = this.checkpointDb.prepare(`
        SELECT COUNT(*) as count FROM checkpoints
        WHERE session_id = ? AND message_id = ?
      `);

      const countResult = countStmt.get(sessionId, oldMessageId);
      console.log(`Found ${countResult.count} checkpoints to update`);

      if (countResult.count === 0) {
        console.warn('No checkpoints found with old message ID - they may have already been updated or never created');

        // Check if checkpoints exist with the new message ID (already updated)
        const newIdCheck = countStmt.get(sessionId, newMessageId);
        if (newIdCheck.count > 0) {
          console.log(`Found ${newIdCheck.count} checkpoints already using new message ID - assuming already updated`);
          console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG END ===');
          return true;
        }

        console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG END ===');
        return false;
      }

      // Perform the update in a transaction for atomicity
      const transaction = this.checkpointDb.transaction(() => {
        const updateStmt = this.checkpointDb.prepare(`
          UPDATE checkpoints
          SET message_id = ?
          WHERE session_id = ? AND message_id = ?
        `);

        const result = updateStmt.run(newMessageId, sessionId, oldMessageId);
        return result;
      });

      const result = transaction();
      console.log(`Successfully updated ${result.changes} checkpoint(s) from ${oldMessageId} to ${newMessageId}`);

      // Verify the update was successful
      const verifyStmt = this.checkpointDb.prepare(`
        SELECT COUNT(*) as count FROM checkpoints
        WHERE session_id = ? AND message_id = ?
      `);

      const verifyOld = verifyStmt.get(sessionId, oldMessageId);
      const verifyNew = verifyStmt.get(sessionId, newMessageId);

      console.log(`Verification: ${verifyOld.count} checkpoints with old ID, ${verifyNew.count} with new ID`);

      if (verifyOld.count > 0) {
        console.error(`WARNING: ${verifyOld.count} checkpoints still have old message ID after update`);
      }

      const success = result.changes > 0 && verifyOld.count === 0;
      console.log(`Message ID update ${success ? 'successful' : 'failed'}`);
      console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG END ===');

      return success;
    } catch (error) {
      console.error('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG ERROR ===');
      console.error('Failed to update checkpoint message IDs:', error);
      console.error('Stack trace:', error.stack);

      // Attempt to provide recovery information
      try {
        const recoveryStmt = this.checkpointDb.prepare(`
          SELECT id, file_path, message_id FROM checkpoints
          WHERE session_id = ? AND (message_id = ? OR message_id = ?)
        `);

        const recoveryCheckpoints = recoveryStmt.all(sessionId, oldMessageId, newMessageId);
        console.error('Checkpoints that may need manual recovery:', recoveryCheckpoints);
      } catch (recoveryError) {
        console.error('Could not gather recovery information:', recoveryError);
      }

      console.log('=== UPDATE CHECKPOINT MESSAGE IDS DEBUG END ===');
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