# Claude Code Chat - CSS Styles Documentation

This directory contains all stylesheets for the Claude Code Chat Electron application. The CSS architecture is organized into layers for maintainability and clear separation of concerns.

## 📁 Directory Structure

```
renderer/styles/
├── main.css                    # Main entry point - imports all other styles
├── variables.css               # CSS custom properties and design tokens
├── base.css                    # HTML element resets and typography
├── utilities.css               # Utility classes and common patterns
├── layout.css                  # Core three-panel layout system
├── themes/
│   └── dark.css               # Dark theme definitions
└── components/
    ├── global-header.css      # Application header bar
    ├── sidebar.css            # Left sidebar container
    ├── file-browser.css       # File navigation component
    ├── file-editor.css        # Monaco code editor integration
    ├── chat-sidebar.css       # Right panel chat interface
    ├── input-area.css         # Message input and controls
    ├── message.css            # Message display and tool outputs
    ├── session-manager.css    # Conversation history management
    ├── modals.css             # Dialog overlays and modals
    ├── settings.css           # Configuration interface
    └── notifications.css      # Toast notifications and status
```

## 🏗️ Architecture Layers

### Foundation Layer
These files establish the core design system and must be loaded first:

| File | Purpose | Dependencies |
|------|---------|-------------|
| `variables.css` | CSS custom properties, colors, spacing, typography | None - loaded first |
| `themes/dark.css` | Dark theme color overrides | variables.css |
| `base.css` | HTML element styles, typography, resets | variables.css |
| `utilities.css` | Utility classes, buttons, forms | variables.css |

### Layout Layer
Defines the application's structural layout:

| File | Purpose | Key Features |
|------|---------|-------------|
| `layout.css` | Three-panel layout system | File browser, editor, chat panels with responsive behavior |

### Component Layer
Individual UI component styles:

| Component | File | Related JS | Purpose |
|-----------|------|------------|---------|
| **Global Header** | `global-header.css` | `app-component.js` | Window drag region, navigation buttons, breadcrumbs |
| **Sidebar Container** | `sidebar.css` | `file-browser.js` | Left panel container with fixed width |
| **File Browser** | `file-browser.css` | `file-browser.js` | Directory navigation, file icons, search, breadcrumbs |
| **File Editor** | `file-editor.css` | `file-editor.js` | Monaco editor integration, file tabs, loading states |
| **Chat Sidebar** | `chat-sidebar.css` | `chat-sidebar.js` | Chat interface, conversation header, history dropdown |
| **Input Area** | `input-area.css` | `chat-sidebar.js` | Message input, send/stop buttons, model selection |
| **Messages** | `message.css` | `message-component.js` | User/assistant messages, tool outputs, thinking display |
| **Session Manager** | `session-manager.css` | `session-manager.js` | Conversation list, status indicators, delete actions |
| **Modals** | `modals.css` | Various components | Dialog overlays, settings modal, confirmations |
| **Settings** | `settings.css` | `settings-component.js` | Configuration tabs, MCP servers, status indicators |
| **Notifications** | `notifications.css` | `app-component.js` | Toast messages, working directory changes, badges |

## 🎨 Design System

### Color Palette
Defined in `variables.css` with semantic naming:
- **Primary**: Claude brand blue (`--color-primary`)
- **Surface**: Background colors for panels (`--color-surface`)
- **Text**: Hierarchical text colors (`--color-text`, `--color-text-secondary`)
- **Status**: Success, warning, error states
- **Interactive**: Hover and focus states

### Typography
- **Base Font**: FKGroteskNeue, Geist, Inter system stack
- **Monospace**: Berkeley Mono, Monaco, Consolas for code
- **Scale**: xs (11px) to 4xl (30px) with semantic naming

### Spacing System
Consistent spacing scale from 1px to 32px:
- `--space-4`, `--space-8`, `--space-12`, `--space-16`, `--space-24`, `--space-32`

### Layout Variables
- `--sidebar-width`: 280px (left panel)
- `--chat-sidebar-width`: 400px (right panel, resizable)
- `--editor-min-width`: 200px (minimum editor width)

## 🔄 Import Order

The import order in `main.css` is critical for proper CSS cascading:

1. **Foundation**: Variables → Themes → Base → Utilities
2. **Layout**: Core layout system
3. **Components**: Individual component styles

```css
/* Foundation Layer */
@import './variables.css';
@import './themes/dark.css';
@import './base.css';
@import './utilities.css';

/* Layout Layer */
@import './layout.css';

/* Component Layer */
@import './components/global-header.css';
@import './components/sidebar.css';
/* ... other components ... */
```

## 🎯 Component Integration

### HTML Structure Mapping
Each CSS component maps to specific HTML sections:

```html
<body>
  <!-- Global Header → global-header.css -->
  <div class="global-header">...</div>
  
  <div class="app">
    <div class="app-content">
      <!-- Left Panel → sidebar.css + file-browser.css -->
      <div class="sidebar">
        <div class="file-browser">...</div>
      </div>
      
      <!-- Center Panel → file-editor.css -->
      <div class="editor-container">...</div>
      
      <!-- Right Panel → chat-sidebar.css + input-area.css + message.css -->
      <div class="chat-sidebar">
        <div class="messages-container">...</div>
        <div class="input-area">...</div>
      </div>
    </div>
  </div>
  
  <!-- Modals → modals.css + settings.css -->
  <div class="modal-overlay">...</div>
</body>
```

### JavaScript Component Integration
Each CSS file corresponds to JavaScript components:

- **Layout Management**: `app-component.js` controls panel visibility
- **File Operations**: `file-browser.js` + `file-editor.js` for file management
- **Chat Interface**: `chat-sidebar.js` + `message-component.js` for messaging
- **Session Handling**: `session-manager.js` for conversation history
- **Configuration**: `settings-component.js` for app settings

## 🛠️ Development Guidelines

### Adding New Styles
1. **Component-specific styles**: Add to appropriate component file
2. **Reusable patterns**: Add to `utilities.css`
3. **Color/spacing changes**: Update `variables.css`
4. **Layout modifications**: Update `layout.css`

### Naming Conventions
- **BEM methodology**: `.component__element--modifier`
- **Utility classes**: `.btn`, `.form-control`, `.text-sm`
- **State classes**: `.active`, `.hidden`, `.loading`
- **CSS custom properties**: `--color-*`, `--space-*`, `--font-*`

### Theme Support
- Use CSS custom properties for colors
- Avoid hardcoded colors outside of `variables.css`
- Test in both light and dark modes
- Use semantic color names (`--color-primary` not `--color-blue`)

## 🔍 Key Features

### Responsive Layout
- **Three-panel layout** adapts between chat-only and split-view modes
- **Collapsible sidebars** with JavaScript toggle controls
- **Flexible center panel** that shows/hides based on file editor state

### Tool Integration
The `message.css` file contains specialized styling for Claude Code tools:
- **File operations**: Read, Write, Edit tool displays
- **Terminal output**: Bash command execution styling
- **Planning tools**: TodoWrite component with status indicators
- **Thinking display**: Collapsible AI reasoning sections

### Cross-Platform Compatibility
- **Window drag regions**: `-webkit-app-region` for native feel
- **Font stacks**: System font fallbacks for each platform
- **Scrollbar styling**: Custom scrollbars for consistent appearance

---

💡 **Tip**: When modifying styles, always check the component's corresponding CSS file first, then consider if the change should be in the foundation layer for reusability.