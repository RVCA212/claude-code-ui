Claude Code Chat - Mac DMG Packaging & Deployment Plan

    Overview

    This plan details the complete process for packaging and deploying your Electron app as a
    DMG file for Mac users to download directly from your website.

    Critical Subprocess Requirements Analysis

    Your app spawns Claude CLI processes (src/main/claude-process-manager.js:170) using Node.js
     spawn() with specific requirements:
    - Requires Claude CLI binary (claude) to be available in user's PATH
    - Spawns with full environment access including ANTHROPIC_API_KEY
    - Uses subprocess piping for JSON communication
    - Must maintain working directory context

    Phase 1: Code Signing & Notarization Setup

    1.1 Apple Developer Requirements

    - Apple Developer Account ($99/year) required for distribution
    - Developer ID Application Certificate for code signing
    - Developer ID Installer Certificate for DMG signing

    1.2 Certificates Setup

    # Import certificates to Keychain
    # Update package.json build.mac section:
    "identity": "Developer ID Application: Your Name (TEAM_ID)"

    1.3 Notarization Configuration

    # Store credentials securely
    xcrun notarytool store-credentials "notarization-profile" \
      --apple-id "your-apple-id@email.com" \
      --team-id "YOUR_TEAM_ID" \
      --password "app-specific-password"

    Phase 2: Enhanced Build Configuration

    2.1 Update package.json Build Section

    {
      "build": {
        "appId": "com.cloudcode.app",
        "productName": "Cloud Code",
        "directories": { "output": "dist" },
        "files": [
          "main.js", "preload.js", "renderer/**/*", "src/**/*",
          "node_modules/**/*", "package.json"
        ],
        "mac": {
          "category": "public.app-category.developer-tools",
          "icon": "assets/icon.icns", // Convert PNG to ICNS
          "hardenedRuntime": true,
          "entitlements": "build/entitlements.mac.plist",
          "entitlementsInherit": "build/entitlements.mac.plist",
          "identity": "Developer ID Application: Your Name (TEAM_ID)",
          "gatekeeperAssess": false,
          "target": [
            { "target": "dmg", "arch": ["x64", "arm64"] },
            { "target": "zip", "arch": ["x64", "arm64"] }
          ]
        },
        "dmg": {
          "title": "Cloud Code",
          "background": "assets/dmg-background.png", // Optional
          "iconSize": 80,
          "contents": [
            { "x": 130, "y": 220 },
            { "x": 410, "y": 220, "type": "link", "path": "/Applications" }
          ]
        },
        "afterSign": "scripts/notarize.js" // Automated notarization
      }
    }

    2.2 Critical Entitlements Update

    Update build/entitlements.mac.plist to include subprocess permissions:
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
    <key>com.apple.security.automation.apple-events</key>
    <true/>

    Phase 3: Asset Preparation

    3.1 Icon Generation

    Convert existing PNG to proper ICNS format:
    # Create iconset directory structure
    mkdir icon.iconset
    # Generate all required sizes (16x16 to 1024x1024)
    # Convert to ICNS: iconutil -c icns icon.iconset

    3.2 Required Icon Sizes

    - 16x16, 32x32, 64x64, 128x128, 256x256, 512x512, 1024x1024
    - Both regular and @2x retina versions

    Phase 4: Automated Build Scripts

    4.1 Notarization Script (scripts/notarize.js)

    // Automated notarization after signing
    // Uploads to Apple, waits for approval, staples notarization

    4.2 Build Commands Update

    {
      "scripts": {
        "build": "electron-builder",
        "build:mac": "electron-builder --mac",
        "dist": "npm run build && npm run notarize",
        "pack": "electron-builder --dir"
      }
    }

    Phase 5: Claude CLI Dependency Strategy

    5.1 User Installation Requirement

    - App checks for Claude CLI on startup
    - Provides installation instructions if missing
    - Existing IPC handler install-claude-cli opens terminal for installation

    5.2 Enhanced Setup Flow

    - First-run wizard guides Claude CLI installation
    - API key configuration interface
    - Verify setup before enabling main features

    Phase 6: Distribution Pipeline

    6.1 Build Process

    # Clean build
    npm run clean
    npm install
    npm run build:mac

    6.2 DMG Output

    - Universal binary (Intel + Apple Silicon)
    - Signed and notarized DMG in dist/ folder
    - Filename: Cloud Code-1.0.0-universal.dmg

    6.3 Website Distribution

    <!-- Download page -->
    <a href="https://yoursite.com/downloads/Cloud Code-1.0.0-universal.dmg">
      Download for Mac (Universal)
    </a>

    Phase 7: Testing & Validation

    7.1 Pre-Distribution Testing

    - Test on clean Mac (no developer tools)
    - Verify Claude CLI installation flow
    - Test subprocess spawning functionality
    - Validate code signing: codesign -dv --verbose=4 "Cloud Code.app"
    - Check notarization: spctl -a -vvv -t install "Cloud Code.app"

    7.2 User Experience Flow

    1. Download DMG from website
    2. Mount DMG, drag to Applications
    3. Launch app, guided setup for Claude CLI
    4. Configure API key
    5. Full functionality available

    Implementation Priority

    1. Certificate setup (blocks everything else)
    2. Entitlements update (critical for subprocess functionality)
    3. Icon conversion (required for DMG)
    4. Build configuration (core packaging)
    5. Notarization automation (for distribution)
    6. Testing pipeline (quality assurance)

    Expected Outcome

    - Professional DMG installer with proper code signing
    - Seamless installation via drag-and-drop to Applications
    - No Gatekeeper warnings or security prompts
    - Full subprocess functionality preserved
    - Ready for website distribution