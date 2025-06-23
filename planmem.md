<!-- Product Requirement Document: Directory-Mismatch Warning Modal -->

### Goal
Prevent users from accidentally sending follow-up messages to an existing Claude conversation while their file-browser / working directory has moved outside the conversation's original directory.

### User Story
As a developer using Claude Code Chat, when I compose a message in an existing conversation from a different working directory, I want to be warned that the conversation context has changed so that I can either (1) cancel and stay in the current chat without sending, or (2) seamlessly start a new chat in the new directory with my drafted message ready to send.

### Functional Requirements
1. **Directory mismatch detection**
   • Before every call to Claude (i.e. **before** `sendMessage` is invoked), compare the conversation's saved `cwdInfo.path` with the renderer's current working directory.
   • Trigger the warning only when a mismatch exists **and** the saved directory still exists/ is valid.

2. **Warning modal**
   • Modal layout matches the attached mockup: ❗️ warning icon, title "Start new chat in this directory?", description _"Conversations can only be held within the same directory"_.
   • Controls:
     ‑ **Cancel** button → Close modal. Do **not** send the draft message. Keep the text intact in the input box of the current chat.
     ‑ **Create new chat** button →
       1. Close modal.
       2. Create a brand-new conversation bound to the **new** directory.
       3. Automatically populate the new chat's text-input with the draft message (do **not** auto-send).
   • "Don't show again" checkbox persists the preference (e.g. in localStorage or user settings).

3. **Edge cases**
   • If the original directory has been deleted or is inaccessible, fall back to existing "Directory Unavailable" toast instead of this modal.
   • When modal is suppressed (checkbox), still block the send and automatically create the new chat/path behaviour.

### Implementation Notes
• Add pre-send validation logic in **@session-manager.js** (renderer) to call a new IPC method `validate-send-directory` before `electronAPI.sendMessage`.
• Expose `validateSendDirectory` through **@preload-bridge.js** and handle it in **@ipc-handlers.js** by simply echoing back the saved session cwd for comparison (no main-process FS calls needed).
• Create a lightweight `DirectoryMismatchModal` component (plain JS / CSS in renderer) and reuse existing modal styling where possible.
• Update **@message-component.js** so the draft text remains untouched on cancel and is transferred when creating a new chat.
• Store the "don't show again" preference in **@memory.md** so it can be surfaced across sessions (or another persistent store).

### Acceptance Criteria
- Attempting to send from a mismatched directory always opens the modal unless "don't show again" is enabled.
- Cancel leaves chat state unchanged and draft message intact.
- Create new chat opens a new conversation with the draft pre-filled and focused.
- No Claude API calls are made until the user explicitly sends a message after resolving the modal.
- Automated tests or manual QA steps cover both Cancel and Create paths.