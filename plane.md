Implement inline file-mention autocompletion in the chat input so that users can quickly reference files that exist in the current working directory shown in the sidebar.

Files that will likely need changes or additions:

@renderer/index.html            – markup for the chat input and the dropdown container
@renderer/style.css             – visual styling for the autocomplete dropdown
@src/renderer/app.js            – renderer bootstrap (wire event listeners if necessary)
@src/renderer/components/app-component.js
@src/renderer/components/message-component.js – main chat input logic lives here
@src/renderer/components/file-browser.js      – already knows the current directory listing
@src/renderer/utils/dom-utils.js
@src/renderer/utils/message-utils.js          – (add helpers for caret / token parsing)
@src/renderer/components/session-manager.js   – ensure session switches close the dropdown

Main-process / preload glue (may not need edits but listed for context):

@src/main/preload-bridge.js      – exposes Electron APIs used to fetch directory contents
@src/main/main.js                – confirms preload is loaded and IPC handlers are registered

Feature requirements:
1. Detect when the user types an '@' character that begins a new token (i.e. either at the very start of the input or immediately after whitespace). Ignore the symbol if it is directly preceded by any non-whitespace character such as 'p@' or '_@'.
2. Capture subsequent keystrokes until the user types whitespace or moves the cursor; this substring becomes the search query. Example: typing "@re" creates the query "re".
3. While the query is non-empty, search the current directory for files/folders whose names start with (case-insensitive) the query. The FileBrowser component already caches directory contents that can be reused; otherwise fall back to `window.electronAPI.getDirectoryContents()`.
4. Show a dropdown menu that appears centred horizontally just above the chat input container. The dropdown should list up to eight matches, ordered alphabetically, with the first entry pre-selected.
5. Keyboard interactions:
   • Up / Down arrows change the highlighted entry.
   • Enter or Tab confirms the selection and inserts it into the textarea as "@relativePath " (note the trailing space).
   • Esc or typing whitespace closes the dropdown without inserting.
6. Automatically close the dropdown when:
   • the query becomes empty,
   • the caret leaves the mention token,
   • a selection is made,
   • the textarea loses focus, or
   • the user switches sessions.
7. Keep the implementation fully contained inside MessageComponent so that a session reload recreates the UI cleanly.

Implementation notes:
• Add a small state-machine inside `message-component.js` that tracks whether the user is currently composing a mention.
• Use helpers from `dom-utils.js` to build and manipulate DOM nodes safely.
• Add new CSS classes (e.g. `.mention-dropdown`, `.mention-item`, `.mention-item.active`) to `style.css`.
• Ensure accessibility: dropdown items should have `role="option"`, and the textarea should reference the dropdown via `aria-owns`.
• Provide a manual test checklist in `todo.md` once development is complete.

Think through each step, modify the above files as needed, and keep the code modular and well-documented.