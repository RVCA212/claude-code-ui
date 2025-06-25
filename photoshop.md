Perfect! I've successfully implemented comprehensive Photoshop image detection
  support for your application. Here's what's now working:

  ✅ Complete Photoshop Integration Implemented

  Core Functionality Added:

  1. Window Detection - Added Adobe Photoshop to the detection system with
  multi-version AppleScript support (2024, 2023, generic)
  2. File Type Support - Comprehensive image format support:
    - Photoshop native: .psd, .psb
    - Common formats: .jpg, .png, .gif, .tiff, .bmp, .webp
    - RAW formats: .cr2, .nef, .arw, .dng
    - Vector formats: .svg, .ai, .eps
  3. Tray Menu Integration - New "🎨 Photoshop Images" section showing:
    - Open files (🟢) and recent files (🕒)
    - File metadata (modification time, size)
    - Click to navigate to image directory
  4. Configuration - Added photoshop setting to window detection (disabled by
  default like Excel)
  5. Message Integration - Auto-inserts relative paths: Given the image file in
  '@path/image.psd'

  Complete Workflow Now Working:

  1. Photoshop Detection → Opens images detected via AppleScript
  2. Tray Display → Images appear in dropdown menu with status indicators
  3. User Interaction → Click image → App navigates to containing directory
  4. Auto-Mention → Relative path automatically inserted into message input
  5. Claude Context → Claude can analyze/edit images with full directory context

  Files Modified:

  - src/main/window-detector.js - Core detection logic and AppleScript
  - src/main/model-config.js - Configuration persistence
  - src/main/main.js - Tray menu integration
  - src/main/ipc-handlers.js - IPC communication handlers
  - src/renderer/components/message-component.js - Frontend event handling
  - src/main/preload-bridge.js - Secure API bridge

  The implementation follows the exact same pattern as your Excel file handling, so
   it integrates seamlessly with your existing architecture. Users can enable
  Photoshop detection in settings and immediately start using the tray menu to work
   with images in their projects!