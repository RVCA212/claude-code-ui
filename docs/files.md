# Feature Plan – Integrated Monaco File Editor View

## 1. Objective
Enable users to click **files** (not folders) in the existing File Browser and open them in a fully-featured, performant [Monaco Editor](https://microsoft.github.io/monaco-editor/) panel in the **center** of the application. The left File Browser sidebar remains, the Chat container becomes a **condensed right sidebar**, and the new middle panel provides live, editable access to the file's contents (read & save to disk).

---

## 2. High-Level Architecture
1. **Layout (renderer/index.html & renderer/style.css)**
   • Switch to a 3-column CSS grid or flex layout: `[sidebar-left] [editor-center] [chat-right]`.
   • Sidebar widths: `sidebar-left ≈ 260 px`, `chat-right ≈ 320 px`, `editor-center = auto`.
2. **EditorComponent (new file)**
   • Wrapper around Monaco Editor with props: `filePath`, `initialContent`, `language`.
   • Exposes `save()`, `isDirty()`, `setContent()`.
3. **IPC / File I/O**
   • **preload-bridge.js**: expose `readFile(path)` & `writeFile(path, content)` via `contextBridge` (reuse or extend FileOperations).
   • **main/ipc-handlers.js**: wire new IPC channels (`fs:read-file`, `fs:write-file`).
4. **AppComponent Orchestration**
   • Instantiate a singleton `editorComponent` and mount it into the center panel.
   • Listen for `file-open` events from File Browser.
5. **FileBrowser Update**
   • On file click, emit `window.dispatchEvent(new CustomEvent('open-file', {detail:{path}}))` (only for files).
6. **Chat Container Adaptation**
   • Wrap existing chat markup in a container that can grow/shrink via a CSS class (`.chat--condensed`).
   • When an editor opens, AppComponent toggles this class to reduce width.

---

## 3. Detailed Step-by-Step Implementation
### 3.1 Add Monaco Dependency
```
npm i monaco-editor --save
```
Or load via CDN for rapid prototyping (add `<script src="https://unpkg.com/monaco-editor@0.47.0/min/vs/loader.js"></script>` before renderer/app.js).

### 3.2 Extend Preload Bridge
• In `src/main/preload-bridge.js` add:
```js
contextBridge.exposeInMainWorld('electronAPI', {
  // …existing bridges
  readFile: (filePath) => ipcRenderer.invoke('fs:read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('fs:write-file', {filePath, data}),
});
```

### 3.3 IPC Handlers (main process)
```js
ipcMain.handle('fs:read-file', async (_, filePath) => {
  try { const data = await fs.promises.readFile(filePath, 'utf8'); return {success:true, data}; }
  catch (e) { return {success:false, error:e.message}; }
});
ipcMain.handle('fs:write-file', async (_, {filePath, data}) => { /* similar */ });
```

### 3.4 Layout Refactor
1. Wrap existing `.sidebar` & `.main-chat` in a new flex container `.workspace`.
2. Insert a new empty div `#editorContainer` between them.
3. Update CSS to:
```css
.workspace { display:flex; height:100vh; }
.sidebar { width:260px; }
#editorContainer { flex:1 1 auto; overflow:hidden; }
.main-chat { width:320px; transition:width 0.2s ease; }
.main-chat.chat--condensed { width:260px; }
```

### 3.5 Create `src/renderer/components/editor-component.js`
• Lazy-load Monaco:
```js
require(['vs/editor/editor.main'], () => { /* init */ });
```
• Detect language via file extension (`monaco.editor.createModel`).
• Handle resize events.
• Provide `save()` that calls `electronAPI.writeFile`.
• Hook `Ctrl/Cmd+S` shortcut.

### 3.6 Wire FileBrowser → Editor
```js
window.addEventListener('open-file', async (e) => app.openFileInEditor(e.detail.path));
```
• In AppComponent implement `openFileInEditor(path)`:
  1. If current editor already open for path → focus.
  2. Else read file via `electronAPI.readFile`.
  3. Pass content to `editorComponent`.
  4. Add `.chat--condensed` to chat container.

### 3.7 Handle Unsaved Changes
• Track dirty state via Monaco model.
• Warn user on close / session switch.
• Auto-save on blur after X seconds idle.

### 3.8 Performance Optimisations
• Use dynamic `import('monaco-editor')` so bundle size doesn't slow initial load.
• Debounce resize.
• Avoid re-creating models; reuse when reopening same file.

### 3.9 Accessibility & UX
• Give `role="code"` to editor container.
• Expose path breadcrumb above editor for context.
• Status bar showing "Saved" / "Unsaved".

### 3.10 Testing / QA Checklist
1. Open JavaScript, Python, Markdown files — syntax highlighting correct.
2. Edit → Ctrl+S writes to disk (`stat` mtime changes).
3. Switching to another directory keeps editor open until explicit close.
4. Chat still functional in condensed sidebar.
5. Opening large (>1 MB) files remains responsive (<150 ms).
6. Unsaved changes prompt when quitting app.

---

## 4. Files to Modify / Create
• `renderer/index.html` – add `editorContainer` div, update structure hierarchy.
• `renderer/style.css` – new grid/flex rules, `.chat--condensed`, editor sizing.
• `src/renderer/components/editor-component.js` (NEW).
• `src/renderer/components/app-component.js` – manage Editor instance & events.
• `src/renderer/components/file-browser.js` – emit `open-file` event on file click.
• `src/main/preload-bridge.js`, `src/main/ipc-handlers.js`, `src/main/file-operations.js` – read/write IPC channels (reuse utilities where possible).
• `package.json` – add `monaco-editor` dependency.

---

## 5. Roll-out Strategy
1. **Phase 1**: Skeleton editor loads with hard-coded sample file.
2. **Phase 2**: FileBrowser integration & dynamic language detection.
3. **Phase 3**: Save support + dirty-state prompts.
4. **Phase 4**: UI polish, accessibility, keyboard shortcuts.
5. **Phase 5**: Extensive manual QA (checklist above) & performance profiling.

---

*End of plan – update `todo.md` with actionable tasks as each section is implemented.*
