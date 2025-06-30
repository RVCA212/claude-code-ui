Plan: Add Expandable Folders with Arrow Icons

Overview

Add small, subtle downward arrow icons to the right side of folders in the file browser. When clicked, folders expand inline to show their contents without changing the current working directory.

Implementation Details

1. File Browser Component Updates (src/renderer/components/file-browser.js)

- Add expandedFolders Set to track which folders are expanded
- Add folderContents Map to cache loaded folder contents
- Add toggleFolderExpansion(folderPath) method
- Add loadFolderContents(folderPath) method that fetches contents via IPC
- Modify renderFileList() to include expand arrows and nested content containers
- Update handleFileClick() to differentiate between folder navigation and expanded folder file clicks

2. UI Structure Changes

- Modify file item HTML to include expand arrow button for directories
- Add nested container for expanded folder contents with proper indentation
- Position expand arrow on the right side of folder items
- Ensure arrow clicks don't trigger folder navigation

3. CSS Styling (renderer/style.css)

- Style expand arrow: small 2-line downward chevron (▼), subtle color, right-aligned
- Add hover states for expand arrows
- Style expanded folder content container with left indentation
- Add smooth transitions for expand/collapse animations
- Style nested file items with slightly different appearance

4. IPC Integration

- Add IPC method getFolderContents(folderPath) that returns folder contents without changing CWD
- Ensure proper error handling for inaccessible folders
- Maintain existing directory navigation functionality

5. Key Features

- ✅ Clicking arrow expands/collapses folder inline
- ✅ Clicking folder name still navigates (existing behavior preserved)
- ✅ Files within expanded folders can be clicked to open without changing CWD
- ✅ Subtle visual design that doesn't clutter the interface
- ✅ Smooth animations for expand/collapse
- ✅ Cached folder contents for performance

Files to Modify

1. src/renderer/components/file-browser.js - Core functionality
2. renderer/style.css - Styling for arrows and expanded content
3. src/main/ipc-handlers.js - Add IPC method for folder contents (if needed)

This implementation will provide an intuitive way for users to explore folder contents without losing their current working directory context.  ç