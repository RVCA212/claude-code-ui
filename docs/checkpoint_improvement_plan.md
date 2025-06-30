# Plan for Enhancing the File Checkpoint and Restore System

## 1. Introduction & Analysis Summary

This document outlines a plan to enhance the file checkpoint system in Claude Code Chat. The primary goal is to improve accuracy and robustness, expand tool coverage to include `NotebookEdit`, and make the "Restore Checkpoint" feature more intuitive and reliable for users.

### Current State Analysis
Based on the provided documentation and source code, the current system has a solid foundation:

- **Strengths**:
    - It effectively supports `Edit`, `MultiEdit`, and `Write` tools.
    - The architecture, using a SQLite database for metadata and separate patch files, is sound.
    - The two-phase process for `Edit`/`MultiEdit` (create a pending checkpoint, then update it after the tool runs) correctly handles the asynchronous nature of tool execution.

- **Weaknesses to Address**:
    1.  **Tool Coverage**: `NotebookEdit` is a requested tool that modifies files but is not currently tracked by the checkpoint system.
    2.  **UX/Logic Mismatch**: The "Restore Checkpoint" button in the UI is misleading. It appears on every user message but always reverts the *most recent* file change in the session, not the changes that followed the specific message where the button was clicked.
    3.  **Complexity & Robustness**: The two-phase commit for edits, while necessary, can leave checkpoints in a "pending" state if the post-edit update fails. The system lacks a mechanism to handle or report these orphaned checkpoints.

## 2. Project Goals

1.  **Extend Tool Coverage**: Integrate the `NotebookEdit` tool into the checkpoint system.
2.  **Improve UX & Logic**: Ensure the "Restore Checkpoint" action is predictable. When a user clicks "Restore" on a message, it should revert the file changes made by the *subsequent* assistant response.
3.  **Increase Robustness**: Harden the checkpoint creation process to prevent or handle orphaned "pending" checkpoints.
4.  **Refine Data Model**: Clean up unused legacy fields from the `checkpoints` database table to simplify the schema.
5.  **Prioritize Core Functionality**: The main priority is to ensure the end-to-end flow of saving and accurately restoring file changes for all supported tools (`Write`, `Edit`, `MultiEdit`, and `NotebookEdit`).

## 3. Detailed Implementation Plan

### Part 1: Foundational - `NotebookEdit` Integration

We will start by adding support for the `NotebookEdit` tool, as it's a direct requirement.

1.  **Detect `NotebookEdit` Tool Use**:
    -   **File**: `src/main/claude-process-manager.js`
    -   **Action**: Modify the `stdout.on('data')` handler to recognize `NotebookEdit` as a file-modifying tool. Since `CheckpointManager` expects a `file_path` input, we must normalize `notebook_path` from the tool's input.
    -   **Implementation**:
        ```javascript
        // src/main/claude-process-manager.js, inside stdout.on('data') loop
        // ...
        if (block.type === 'tool_use') {
            // ... (existing Write/Edit/MultiEdit logic) ...
            const isFileModTool = ['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(block.name);

            if (isFileModTool) {
              console.log('Detected file modification tool, creating checkpoint:', block.name);

              // Normalize input for CheckpointManager
              const toolUseForCheckpoint = { ...block };
              if (block.name === 'NotebookEdit' && block.input.notebook_path) {
                  toolUseForCheckpoint.input.file_path = block.input.notebook_path;
              }

              await this.checkpointManager.createCheckpoint(toolUseForCheckpoint, sessionId, assistantMessage.id);
            }
        }
        // ...
        ```

2.  **Handle `NotebookEdit` in `CheckpointManager`**:
    -   **File**: `src/main/checkpoint-manager.js`
    -   **Action**: In the `createCheckpoint` method, treat `NotebookEdit` the same as `Edit` and `MultiEdit`. It requires a two-phase commit because the file's final state is only known after the tool executes.
    -   **Implementation**:
        ```javascript
        // src/main/checkpoint-manager.js -> createCheckpoint()
        // ...
        } else if (toolUse.name === 'Edit' || toolUse.name === 'MultiEdit' || toolUse.name === 'NotebookEdit') { // Add NotebookEdit
          // This is a placeholder that will be updated by updateCheckpointWithPostEditContent
          newContentForCheckpoint = '...PENDING_POST_EDIT_CONTENT...';
          patch = `--- before/${path.basename(file_path)}\n+++ after/${path.basename(file_path)}\n...edit applied...`;
        }
        // ...
        ```
    -   The existing `updateCheckpointWithPostEditContent` function will work for `NotebookEdit` without changes, as it operates on the normalized `file_path`.

### Part 2: Core UX Improvement - Fixing "Restore Checkpoint"

This section addresses the highest-priority requirement: making the restore functionality accurate and intuitive.

1.  **Refine UI Logic to Find the Correct Revert Point**:
    -   **File**: `src/renderer/components/message-component.js`
    -   **Action**: The current `revertToLatestChanges` method is incorrect. We need to replace it. When a user clicks "Restore" on their message, we should find the *next* assistant message in the conversation that resulted in file changes and use its ID as the revert target.
    -   **Implementation**:
        -   First, rename `revertToLatestChanges` to `revertChangesAfterMessage` to better reflect its new purpose, and modify it to accept the user's `messageId`.
        -   In `createMessageActions`, update the `onclick` handler to pass the user message's ID.
        -   The new `revertChangesAfterMessage` will search the message list *forward* from the user's message to find the first assistant message that `hasFileChanges`.

    -   **Code Sketch**:
        ```javascript
        // src/renderer/components/message-component.js

        // In createMessageActions(message, sessionId)
        onclick="window.messageComponent.revertChangesAfterMessage('${sessionId}', '${message.id}')"

        // New/refactored method
        async revertChangesAfterMessage(sessionId, userMessageId) {
          const session = this.sessionManager.getSession(sessionId);
          const messages = session.messages;
          const userMessageIndex = messages.findIndex(m => m.id === userMessageId);

          // Search forward from the user message for the next assistant message with changes
          let targetAssistantMessage = null;
          for (let i = userMessageIndex + 1; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.type === 'assistant') {
              const hasChanges = await window.electronAPI.hasFileChanges(sessionId, msg.id);
              if (hasChanges) {
                targetAssistantMessage = msg;
                break;
              }
            }
          }

          if (targetAssistantMessage) {
            await this.revertToMessage(sessionId, targetAssistantMessage.id);
          } else {
            this.showError('No subsequent file changes found to restore.');
          }
        }
        ```

2.  **Verify Backend Revert Logic**:
    -   **Files**: `src/main/ipc-handlers.js`, `src/main/checkpoint-manager.js`
    -   **Action**: No changes are likely needed here. The `revertToCheckpoint` function already correctly uses the provided `messageId` to find all checkpoints created at or after that message's timestamp and reverts them. The fix is primarily a client-side logic change.

### Part 3: Robustness and Cleanup

1.  **Database Schema Cleanup**:
    -   **File**: `src/main/checkpoint-manager.js`
    -   **Action**: In the `initialize` method, remove the unused legacy columns (`pre_edit_content`, `post_edit_content`, `edit_summary`) from the `CREATE TABLE` and `INSERT` statements. A migration path is not necessary for this stage.
    -   **Implementation**:
        ```sql
        -- In initialize()
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
          tool_type TEXT -- REMOVE LEGACY COLUMNS
        )
        ```

2.  **Handle Pending Checkpoint Failures**:
    -   **File**: `src/main/checkpoint-manager.js`
    -   **Action**: Enhance `updateCheckpointWithPostEditContent`. If reading the post-edit file fails, the checkpoint is currently left in a pending state. We should delete this orphaned checkpoint to prevent data integrity issues.
    -   **Implementation**:
        ```javascript
        // src/main/checkpoint-manager.js -> updateCheckpointWithPostEditContent()
        try {
          postEditContent = await fs.readFile(filePath, 'utf8');
        } catch (err) {
          console.error(`Failed to read post-edit content for checkpoint ${checkpointId}:`, err);
          // Delete the orphaned pending checkpoint
          this.checkpointDb.prepare('DELETE FROM checkpoints WHERE id = ?').run(checkpointId);
          console.warn(`Deleted orphaned pending checkpoint: ${checkpointId}`);
          return false;
        }
        // ... rest of the function
        ```

## 4. Testing and Validation Plan

After implementation, we must validate the changes with the following scenarios:

-   **`Write` Tool**: Create a new file, then restore. The file should be deleted.
-   **`Edit`/`MultiEdit` Tools**: Edit an existing file, then restore. The file should revert to its original content.
-   **`NotebookEdit` Tool**: Edit a notebook, then restore. The `.ipynb` file should revert to its original content.
-   **Multiple Changes**: Make several file modifications across different messages. Restore from an early message and verify that *all* subsequent changes are undone, and the correct user message becomes editable.
-   **No Changes**: Click "Restore" on a message that was not followed by any file modifications. An informative message should appear, and no action should be taken.
-   **Failure Case**: Manually corrupt a file path before the `updateCheckpointWithPostEditContent` step runs. Verify that the orphaned checkpoint is correctly deleted from the database.