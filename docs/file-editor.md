# In-App Code Editor Feature — Product Requirements & Implementation Plan

## 1. Problem Statement
Developers using Claude Code Chat currently have to switch to an external editor when they want to inspect or modify project files.  This context-switch breaks flow, slows iteration, and limits the power of the AI assistant which is able to suggest but not directly apply code changes.

## 2. Objective
Embed a fully-featured file/code editor in the centre of the Electron app so that:
1. Selecting a **file** (not a folder) in the existing left-hand `FileBrowser` immediately opens that file for editing.
2. The existing **chat interface** (everything currently inside `.main-chat`) is moved into a new **right sidebar** and behaves identically to today (streaming, history, settings, etc.).
3. Users can edit, save, and create files directly inside the editor with syntax-highlighting for popular languages and a plain-text fallback for unknown types.
4. Unsaved changes are surfaced clearly and protected against accidental loss.

## 3. Success Metrics
* ≤ 300 ms to open a ≤ 1 MB file inside the editor on mid-range hardware.
* Zero critical JavaScript errors introduced (app remains stable after 30 minutes of active editing).
* 100 % of file types currently viewable via OS text editors are editable (binary files excluded).
* Unit tests for IPC read/write pathways reach ≥ 90 % coverage.

## 4. High-Level Architecture
```
┌─────────────────┐   file-select   ┌─────────────────────┐
│ FileBrowser     │ ─────────────▶ │ FileEditorComponent │
└─────────────────┘                └──────────┬──────────┘
                                              │ IPC
                                              ▼
                                    ┌─────────────────────┐
                                    │ file-operations.js  │
                                    └─────────────────────┘
```
* **Renderer (UI)**
  * `FileEditorComponent` — wraps Monaco/CodeMirror and exposes `openFile(path)` / `saveFile()`.
  * Refactored `AppComponent` layout: `Sidebar (left) | Editor (centre) | ChatSidebar (right)`.
* **Preload Bridge** — extend `contextBridge` API with `readFile`, `writeFile`, `watchFile`.
* **Main Process** — leverage existing `src/main/file-operations.js` for secure file IO.

## 5. Detailed Implementation Steps
1. **Select Editor Engine**
   * Add `monaco-editor` (best VS Code parity) to `package.json`.
   * Bundle via `webpack` or dynamic `import()` to avoid bloating startup.
2. **Create UI Shell**
   * Update `renderer/index.html` layout:
     ```html
     <div class="app">
       <div class="sidebar">…</div>
       <div class="editor-container" id="editorContainer"></div>
       <div class="chat-sidebar" id="chatSidebar">(moved .main-chat here)</div>
     </div>
     ```
   * Move existing chat markup into `chat-sidebar`; hide/show as flex child.
3. **New `FileEditor` Renderer Component** (`src/renderer/components/file-editor.js`)
   * Initialise Monaco instance once DOM ready.
   * Expose methods: `openFile(path)`, `setLanguage(lang)`, `markDirty()`, `save()`.
4. **IPC & Preload Enhancements**
   * `preload-bridge.js`: `window.electronAPI.readFile(path)`, `writeFile(path, data)`.
   * Secure filesystem access—reject directory traversal outside workspace.
5. **Wire FileBrowser → Editor**
   * In `file-browser.js → handleFileClick`, when `!isDirectory`, call `app.getComponent('fileEditor').openFile(path)` instead of console.log.
6. **Chat Sidebar Refactor**
   * Create `ChatSidebar` wrapper that hosts existing `MessageComponent` & controls show/hide.
   * Ensure CSS sets reasonable min-width (e.g., 340 px) & resizable splitter (optional stretch goal).
7. **Saving & Dirty State**
   * On change events from Monaco, mark tab dirty and display `●` in file name.
   * Add `Ctrl/Cmd + S` shortcut handler → IPC `writeFile`.
8. **Multi-file Tabs (Nice-to-Have)**
   * Maintain `openFiles[]` with active index.
   * Render file tabs inside `editor-header` for quick switching.
9. **Tests & QA**
   * Jest tests for IPC functions.
   * Cypress end-to-end: open + edit + save file flow.
10. **Documentation & Release Notes**
    * Update `README.md` with editor usage guidelines.

## 6. UI/UX Guidelines
* **Editor Default Theme**: Match current app dark/light variables; allow toggle.
* **Keyboard Shortcuts**
  * `Ctrl/Cmd + S` — save.
  * `Ctrl/Cmd + W` — close tab (if multi-tab implemented).
* **Error States**
  * Failed read: show inline toast with retry.
  * Failed save: keep buffer, mark file as conflicted.

## 7. Risks & Mitigations
| Risk | Mitigation |
|------|------------|
| Editor bundle size slows startup | Lazy-load editor only on first file open; show loading spinner |
| Unsaved data loss on app crash | Autosave temp buffers to `~/.claude-code-chat/drafts` every 30 s |
| File lock conflicts | Detect file mtime changes via `watchFile` and prompt user to reload |

## 8. Open Questions
1. Do we support binary files via hex-viewer or simply block them?
2. Should the chat sidebar be collapsible to reclaim space when coding?
3. Preferences for editor themes, font size, linting integrations?

## 9. Acceptance Criteria (Definition of Done)
* Feature behind a toggle flag (`Enable In-App Editor`) until stable.
* Selecting a text file opens it in the centre editor; editing & saving works.
* Existing chat functionality remains intact and relocated to right sidebar.
* No console errors, and end-to-end tests pass in CI.
