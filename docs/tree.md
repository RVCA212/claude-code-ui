tree structure of our app

```
src/
├── main                            # Main process modules for core application functionality
│   ├── checkpoint-manager.js        # Advanced file modification tracking with SQLite-based metadata storage
│   ├── claude-process-manager.js    # Manages Claude CLI process lifecycle, streaming, and error recovery
│   ├── file-operations.js           # Comprehensive file system navigation and operations
│   ├── ipc-handlers.js              # Centralized, type-safe inter-process communication routing
│   ├── main.js                      # Main entry point and process coordinator
│   ├── model-config.js              # Manages model configuration and API settings
│   ├── preload-bridge.js            # Secure bridge with controlled API exposure between processes
│   └── session-manager.js           # Handles session storage, persistence, and state recovery

├── renderer                         # Renderer process for user interface and interactions
│   ├── app.js                       # Renderer entry point and component coordinator
│   ├── components                   # Modular, reusable UI components
│   │   ├── app-component.js         # Global UI coordinator with event handling
│   │   ├── file-browser.js          # Advanced directory navigation with search and filtering 
│   │   ├── message-component.js     # Streaming message display with revert functionality
│   │   ├── session-manager.js       # Session list management and interaction
│   │   └── settings-component.js    # Comprehensive configuration and API management
│   └── utils                        # Shared utility functions for UI operations
│       ├── dom-utils.js             # Safe and efficient DOM manipulation
│       └── message-utils.js         # Advanced message parsing and formatting

└── shared                           # Cross-process shared definitions and interfaces
    └── api-definitions.js           # Type-safe API contracts between main and renderer processes
```