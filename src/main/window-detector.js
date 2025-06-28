const si = require('systeminformation');
const { systemPreferences } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { URL } = require('url');

/**
 * Window Detection Service
 * Detects running applications and extracts open file information from VS Code, Cursor, and Excel
 */
class WindowDetector {
  constructor(modelConfig = null) {
    this.modelConfig = modelConfig;
    this.supportedApps = {
      'Visual Studio Code': {
        bundleId: 'com.microsoft.VSCode',
        processName: 'Code',
        processNames: ['Code', 'Visual Studio Code'],
        displayName: 'VS Code',
        icon: '🔷',
        applescriptName: 'Visual Studio Code'
      },
      'Cursor': {
        bundleId: 'com.todesktop.230313mzl4w4u92',
        processName: 'Cursor',
        processNames: ['Cursor', 'Cursor Helper', 'cursor'],
        displayName: 'Cursor',
        icon: '⚡',
        applescriptName: 'Cursor'
      },
      'Microsoft Excel': {
        bundleId: 'com.microsoft.Excel',
        processName: 'Microsoft Excel',
        processNames: ['Microsoft Excel', 'Excel'],
        displayName: 'Excel',
        icon: '📊',
        applescriptName: 'Microsoft Excel'
      },
      'Adobe Photoshop': {
        bundleId: 'com.adobe.Photoshop',
        processName: 'Adobe Photoshop',
        processNames: ['Adobe Photoshop', 'Adobe Photoshop 2024', 'Adobe Photoshop 2023', 'Adobe Photoshop 2022'],
        displayName: 'Photoshop',
        icon: '🎨',
        applescriptName: 'Adobe Photoshop'
      }
    };

    // Cache for performance (longer TTL since detection is now triggered manually)
    this.cache = {
      runningApps: null,
      openFiles: new Map(),
      lastUpdate: null,
      ttl: 30000 // 30 second cache (increased since manual triggers are less frequent)
    };

    // Cache for run-applescript dynamic import
    this._runAppleScriptCache = null;

    // Debug mode for detailed logging
    this.debugMode = process.env.NODE_ENV === 'development' || process.env.DEBUG_WINDOW_DETECTION === 'true';
    
    // Permission request control
    this.permissionRequestAttempted = false; // Prevent multiple requests in same session
    this.userConsentForPermissions = false; // User must explicitly consent
  }

  /**
   * Get window detection settings from model config
   */
  getWindowDetectionSettings() {
    if (this.modelConfig) {
      return this.modelConfig.getWindowDetectionSettings();
    }
    // Default settings if no model config
    return {
      vscode: true,
      cursor: true,
      excel: false,
      photoshop: false
    };
  }

  /**
   * Get run-applescript module using dynamic import with enhanced debugging
   */
  async getRunAppleScript() {
    if (this._runAppleScriptCache) {
      return this._runAppleScriptCache;
    }

    console.log('Attempting to import run-applescript module...');

    // Try multiple import strategies
    const importStrategies = [
      // Strategy 1: Import runAppleScript function directly
      async () => {
        console.log('Trying ES6 dynamic import with runAppleScript property...');
        const module = await import('run-applescript');
        return module.runAppleScript || module.default?.runAppleScript;
      },

      // Strategy 2: Import with destructuring
      async () => {
        console.log('Trying destructured import...');
        const { runAppleScript } = await import('run-applescript');
        return runAppleScript;
      },

      // Strategy 3: Direct module import fallback
      async () => {
        console.log('Trying direct module import...');
        const module = await import('run-applescript');
        return module.default || module;
      },

      // Strategy 4: CommonJS require (fallback)
      async () => {
        console.log('Trying CommonJS require fallback...');
        // This should work in Node.js environments
        return require('run-applescript');
      }
    ];

    for (let i = 0; i < importStrategies.length; i++) {
      try {
        console.log(`Attempting import strategy ${i + 1}...`);
        const runAppleScript = await importStrategies[i]();

        // Validate that we got a function
        if (typeof runAppleScript === 'function') {
          console.log(`✅ Successfully imported run-applescript using strategy ${i + 1}`);
          this._runAppleScriptCache = runAppleScript;
          return runAppleScript;
        } else {
          console.warn(`Strategy ${i + 1} returned non-function:`, typeof runAppleScript, runAppleScript);
        }
      } catch (error) {
        console.warn(`Strategy ${i + 1} failed:`, error.message);
        if (error.stack) {
          console.debug('Error stack:', error.stack);
        }
      }
    }

    // All strategies failed
    console.error('❌ All import strategies failed for run-applescript module');
    console.error('This may be due to:');
    console.error('1. Module not properly installed');
    console.error('2. Electron/Node.js compatibility issues');
    console.error('3. ESM/CommonJS module resolution problems');

    // Try to provide more diagnostic info
    try {
      const packageInfo = require('../../package.json');
      console.log('Package.json type:', packageInfo.type || 'commonjs');
      console.log('Node.js version:', process.version);
      console.log('Electron version:', process.versions.electron);
    } catch (e) {
      console.warn('Could not read package.json for diagnostics');
    }

    return null;
  }

  /**
   * Check if accessibility permissions are granted
   */
  async checkAccessibilityPermissions() {
    try {
      return systemPreferences.isTrustedAccessibilityClient(false);
    } catch (error) {
      console.error('Error checking accessibility permissions:', error);
      return false;
    }
  }

  /**
   * Request accessibility permissions (user must grant manually)
   * Only requests if user has explicitly consented and not already attempted
   */
  async requestAccessibilityPermissions(userConsent = false) {
    try {
      // Only request permissions if user explicitly consents and we haven't already tried
      if (!userConsent || this.permissionRequestAttempted) {
        if (this.debugMode) {
          console.log('Skipping permission request - userConsent:', userConsent, 'already attempted:', this.permissionRequestAttempted);
        }
        return await this.checkAccessibilityPermissions();
      }

      if (this.debugMode) {
        console.log('User consented to accessibility permission request');
      }

      this.permissionRequestAttempted = true;
      this.userConsentForPermissions = true;
      return systemPreferences.isTrustedAccessibilityClient(true);
    } catch (error) {
      console.error('Error requesting accessibility permissions:', error);
      return false;
    }
  }

  /**
   * Enable window detection with user consent
   * This method should be called when user explicitly wants to enable window detection
   */
  async enableWindowDetectionWithPermissions() {
    try {
      const hasPermissions = await this.checkAccessibilityPermissions();
      if (hasPermissions) {
        this.userConsentForPermissions = true;
        return {
          success: true,
          hasPermissions: true,
          message: 'Window detection enabled - accessibility permissions already granted'
        };
      }

      // Request permissions with user consent
      const permissionGranted = await this.requestAccessibilityPermissions(true);
      
      return {
        success: permissionGranted,
        hasPermissions: permissionGranted,
        message: permissionGranted 
          ? 'Window detection enabled successfully'
          : 'Accessibility permissions required for window detection. Please grant permissions in System Preferences > Security & Privacy > Accessibility'
      };
    } catch (error) {
      console.error('Error enabling window detection:', error);
      return {
        success: false,
        hasPermissions: false,
        message: `Failed to enable window detection: ${error.message}`
      };
    }
  }

  /**
   * Get the current permission and consent status
   */
  async getPermissionStatus() {
    try {
      const hasPermissions = await this.checkAccessibilityPermissions();
      return {
        hasAccessibilityPermissions: hasPermissions,
        userConsentForPermissions: this.userConsentForPermissions,
        permissionRequestAttempted: this.permissionRequestAttempted,
        windowDetectionEnabled: hasPermissions && this.userConsentForPermissions
      };
    } catch (error) {
      console.error('Error getting permission status:', error);
      return {
        hasAccessibilityPermissions: false,
        userConsentForPermissions: false,
        permissionRequestAttempted: false,
        windowDetectionEnabled: false
      };
    }
  }

  /**
   * Get running applications using systeminformation
   */
  async getRunningApplications() {
    try {
      // Check cache first
      if (this.cache.runningApps &&
          this.cache.lastUpdate &&
          Date.now() - this.cache.lastUpdate < this.cache.ttl) {
        if (this.debugMode) {
          console.log('Returning cached running applications:', this.cache.runningApps);
        }
        return this.cache.runningApps;
      }

      const processes = await si.processes();
      const runningApps = [];

      if (this.debugMode) {
        console.log(`\n=== WINDOW DETECTION DEBUG ===`);
        console.log(`Total processes found: ${processes.list.length}`);

        // Log all processes that might be related to our apps
        const relevantProcesses = processes.list.filter(p => {
          const name = (p.name || '').toLowerCase();
          const command = (p.command || '').toLowerCase();
          return name.includes('code') || name.includes('cursor') || name.includes('excel') ||
                 command.includes('code') || command.includes('cursor') || command.includes('excel') ||
                 name.includes('electron') || command.includes('electron') ||
                 name.includes('microsoft excel') || command.includes('microsoft excel');
        });

        console.log('\nPotentially relevant processes:');
        relevantProcesses.forEach(p => {
          console.log(`  - Name: "${p.name}", Command: "${p.command}", PID: ${p.pid}`);
        });
      }

      // Filter for our supported applications
      for (const [appName, appConfig] of Object.entries(this.supportedApps)) {
        if (this.debugMode) {
          console.log(`\nSearching for ${appName}:`);
          console.log(`  - Primary process name: "${appConfig.processName}"`);
          console.log(`  - Alternative names: [${appConfig.processNames.map(n => `"${n}"`).join(', ')}]`);
          console.log(`  - Bundle ID: "${appConfig.bundleId}"`);
        }

        // Enhanced process matching
        const matchingProcesses = processes.list.filter(p => {
          // Check exact match with primary process name
          if (p.name === appConfig.processName) return true;

          // Check all alternative process names
          if (appConfig.processNames && appConfig.processNames.some(name =>
            p.name === name || p.name.toLowerCase() === name.toLowerCase()
          )) return true;

          // Check if command includes process name
          if (p.command && appConfig.processNames.some(name =>
            p.command.includes(name) || p.command.toLowerCase().includes(name.toLowerCase())
          )) return true;

          // For Cursor, also check for ToDesktop patterns
          if (appName === 'Cursor') {
            if (p.name && p.name.toLowerCase().includes('cursor')) return true;
            if (p.command && (
              p.command.includes('todesktop') ||
              p.command.includes('230313mzl4w4u92') ||
              p.command.toLowerCase().includes('cursor')
            )) return true;
          }

          // For Excel, also check for Microsoft Office patterns
          if (appName === 'Microsoft Excel') {
            if (p.name && p.name.toLowerCase().includes('excel')) return true;
            if (p.command && (
              p.command.includes('Microsoft Excel') ||
              p.command.includes('Excel.app') ||
              p.command.toLowerCase().includes('excel')
            )) return true;
          }

          // For Photoshop, also check for Adobe patterns
          if (appName === 'Adobe Photoshop') {
            if (p.name && p.name.toLowerCase().includes('photoshop')) return true;
            if (p.command && (
              p.command.includes('Adobe Photoshop') ||
              p.command.includes('Photoshop.app') ||
              p.command.toLowerCase().includes('photoshop') ||
              p.command.includes('Adobe') && p.command.includes('Photoshop')
            )) return true;
          }

          return false;
        });

        if (this.debugMode) {
          console.log(`  - Found ${matchingProcesses.length} matching processes:`);
          matchingProcesses.forEach(p => {
            console.log(`    * Name: "${p.name}", Command: "${p.command}", PID: ${p.pid}`);
          });
        }

        // Use the first matching process (usually the main process)
        const process = matchingProcesses[0];

        if (process) {
          const appInfo = {
            name: appName,
            displayName: appConfig.displayName,
            bundleId: appConfig.bundleId,
            processName: appConfig.processName,
            actualProcessName: process.name,
            applescriptName: appConfig.applescriptName,
            icon: appConfig.icon,
            pid: process.pid,
            cpu: process.cpu,
            memory: process.mem_rss,
            command: process.command,
            matchingProcessCount: matchingProcesses.length
          };

          runningApps.push(appInfo);

          if (this.debugMode) {
            console.log(`  ✅ Added ${appName} to running apps list`);
          }
        } else {
          if (this.debugMode) {
            console.log(`  ❌ No matching process found for ${appName}`);
          }
        }
      }

      if (this.debugMode) {
        console.log(`\nFinal running apps: ${runningApps.length}`);
        runningApps.forEach(app => {
          console.log(`  - ${app.displayName} (${app.actualProcessName}, PID: ${app.pid})`);
        });
        console.log('=== END DEBUG ===\n');
      }

      // Update cache
      this.cache.runningApps = runningApps;
      this.cache.lastUpdate = Date.now();

      return runningApps;
    } catch (error) {
      console.error('Error getting running applications:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
      return [];
    }
  }

  /**
   * Get a list of known workspace paths from the editor's storage.
   */
  async getWorkspacesFromStorage(appName) {
    const appSupportPath = path.join(os.homedir(), 'Library', 'Application Support');
    let appDataPath;

    if (appName === 'Visual Studio Code') {
      appDataPath = path.join(appSupportPath, 'Code');
    } else if (appName === 'Cursor') {
      appDataPath = path.join(appSupportPath, 'Cursor');
    } else {
      return [];
    }

    const workspaceStoragePath = path.join(appDataPath, 'User', 'workspaceStorage');
    const workspaces = new Set();

    if (this.debugMode) {
      console.log(`Searching for workspaces in: ${workspaceStoragePath}`);
    }

    try {
      if (!fs.existsSync(workspaceStoragePath)) {
        if (this.debugMode) console.log('Workspace storage path does not exist.');
        return [];
      }

      const workspaceDirs = fs.readdirSync(workspaceStoragePath);
      for (const dir of workspaceDirs) {
        const workspaceJsonPath = path.join(workspaceStoragePath, dir, 'workspace.json');
        if (fs.existsSync(workspaceJsonPath)) {
          try {
            const content = fs.readFileSync(workspaceJsonPath, 'utf-8');
            const json = JSON.parse(content);
            if (json.folder) {
              const folderUri = json.folder;
              if (folderUri.startsWith('file://')) {
                let folderPath = decodeURIComponent(new URL(folderUri).pathname);
                if (process.platform === 'win32' && folderPath.startsWith('/')) {
                  folderPath = folderPath.substring(1);
                }
                workspaces.add(folderPath);
              }
            }
          } catch (e) {
            if (this.debugMode) {
              console.warn(`Could not parse ${workspaceJsonPath}:`, e.message);
            }
          }
        }
      }
    } catch (e) {
      console.error(`Error reading workspace storage for ${appName}:`, e);
    }

    const result = Array.from(workspaces);
    if (this.debugMode) {
      console.log(`Found ${result.length} unique workspace paths for ${appName}.`);
    }
    return result;
  }

  /**
   * Get open files from VS Code using AppleScript
   */
  async getVSCodeOpenFiles(knownWorkspaces) {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        console.warn('AppleScript runner not available');
        return [];
      }

      if (this.debugMode) {
        console.log('\n=== VS CODE APPLESCRIPT DEBUG ===');
      }

      const script = `
        tell application "System Events"
          if exists (processes whose name is "Code") then
            tell application "Visual Studio Code"
              set openDocs to {}
              try
                repeat with theWindow in windows
                  if exists theWindow then
                    try
                      set windowTitle to name of theWindow
                      if windowTitle is not "" and windowTitle is not "Visual Studio Code" then
                        set end of openDocs to windowTitle
                      end if
                    end try
                  end if
                end repeat
              end try
              return openDocs
            end tell
          else
            return {}
          end if
        end tell
      `;

      if (this.debugMode) {
        console.log('Executing VS Code AppleScript...');
      }

      const result = await runAppleScript(script);

      if (this.debugMode) {
        console.log('VS Code AppleScript result:', result);
      }

      const parsedFiles = this.parseAppleScriptResult(result, 'VS Code', knownWorkspaces);

      if (this.debugMode) {
        console.log(`✅ VS Code parsing complete, found ${parsedFiles.length} files`);
        console.log('=== END VS CODE DEBUG ===\n');
      }

      return parsedFiles;
    } catch (error) {
      console.error('Error getting VS Code open files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
        console.log('=== END VS CODE DEBUG ===\n');
      }
      return [];
    }
  }

  /**
   * Get open files from Cursor using AppleScript
   */
  async getCursorOpenFiles(knownWorkspaces) {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        console.warn('AppleScript runner not available');
        return [];
      }

      if (this.debugMode) {
        console.log('\n=== CURSOR APPLESCRIPT DEBUG ===');
      }

      // Try multiple approaches for Cursor since it's built with ToDesktop
      const approaches = [
        // Approach 1: Direct application name
        {
          name: 'Direct application name',
          script: `
            tell application "System Events"
              if exists (processes whose name is "Cursor") then
                tell application "Cursor"
                  set openDocs to {}
                  try
                    repeat with theWindow in windows
                      if exists theWindow then
                        try
                          set windowTitle to name of theWindow
                          if windowTitle is not "" and windowTitle is not "Cursor" then
                            set end of openDocs to windowTitle
                          end if
                        end try
                      end if
                    end repeat
                  end try
                  return openDocs
                end tell
              else
                return {}
              end if
            end tell
          `
        },
        // Approach 2: System Events with process detection
        {
          name: 'System Events process windows',
          script: `
            tell application "System Events"
              set cursorProcesses to (processes whose name contains "Cursor" or name contains "cursor")
              set openDocs to {}
              repeat with proc in cursorProcesses
                try
                  repeat with win in (windows of proc)
                    try
                      set windowTitle to title of win
                      if windowTitle is not "" and windowTitle does not contain "Cursor —" and windowTitle is not "Cursor" then
                        set end of openDocs to windowTitle
                      end if
                    end try
                  end repeat
                end try
              end repeat
              return openDocs
            end tell
          `
        },
        // Approach 3: Bundle ID approach
        {
          name: 'Bundle ID approach',
          script: `
            tell application "System Events"
              if exists (processes whose bundle identifier is "com.todesktop.230313mzl4w4u92") then
                set targetProcess to first process whose bundle identifier is "com.todesktop.230313mzl4w4u92"
                set openDocs to {}
                try
                  repeat with win in (windows of targetProcess)
                    try
                      set windowTitle to title of win
                      if windowTitle is not "" and windowTitle does not contain "Cursor —" and windowTitle is not "Cursor" then
                        set end of openDocs to windowTitle
                      end if
                    end try
                  end repeat
                end try
                return openDocs
              else
                return {}
              end if
            end tell
          `
        }
      ];

      for (const approach of approaches) {
        try {
          if (this.debugMode) {
            console.log(`Trying approach: ${approach.name}`);
          }

          const result = await runAppleScript(approach.script);

          if (this.debugMode) {
            console.log(`Result from ${approach.name}:`, result);
          }

          if (result && result.trim() !== '') {
            const parsedFiles = this.parseAppleScriptResult(result, 'Cursor', knownWorkspaces);
            if (parsedFiles.length > 0) {
              if (this.debugMode) {
                console.log(`✅ Success with ${approach.name}, found ${parsedFiles.length} files`);
                console.log('=== END CURSOR DEBUG ===\n');
              }
              return parsedFiles;
            }
          }
        } catch (error) {
          if (this.debugMode) {
            console.log(`❌ Failed with ${approach.name}:`, error.message);
          }
          // Continue to next approach
        }
      }

      if (this.debugMode) {
        console.log('❌ All AppleScript approaches failed for Cursor');
        console.log('=== END CURSOR DEBUG ===\n');
      }

      return [];
    } catch (error) {
      console.error('Error getting Cursor open files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
      return [];
    }
  }

  /**
   * Get open files from Excel using AppleScript
   */
  async getExcelOpenFiles(knownWorkspaces) {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        console.warn('AppleScript runner not available');
        return [];
      }

      if (this.debugMode) {
        console.log('\n=== EXCEL APPLESCRIPT DEBUG ===');
      }

      // Try multiple approaches for Excel
      const approaches = [
        // Approach 1: Direct workbook enumeration
        {
          name: 'Direct workbook enumeration',
          script: `
            tell application "System Events"
              if exists (processes whose name is "Microsoft Excel") then
                tell application "Microsoft Excel"
                  set openDocs to {}
                  try
                    repeat with wb in workbooks
                      if exists wb then
                        try
                          set workbookName to name of wb
                          set workbookPath to ""
                          try
                            set workbookPath to full name of wb
                          end try
                          if workbookName is not "" then
                            if workbookPath is not "" then
                              set end of openDocs to (workbookPath & "|" & workbookName)
                            else
                              set end of openDocs to workbookName
                            end if
                          end if
                        end try
                      end if
                    end repeat
                  end try
                  return openDocs
                end tell
              else
                return {}
              end if
            end tell
          `
        },
        // Approach 2: Window-based approach (fallback)
        {
          name: 'Window-based approach',
          script: `
            tell application "System Events"
              if exists (processes whose name is "Microsoft Excel") then
                tell application "Microsoft Excel"
                  set openDocs to {}
                  try
                    repeat with theWindow in windows
                      if exists theWindow then
                        try
                          set windowTitle to name of theWindow
                          if windowTitle is not "" and windowTitle is not "Microsoft Excel" then
                            set end of openDocs to windowTitle
                          end if
                        end try
                      end if
                    end repeat
                  end try
                  return openDocs
                end tell
              else
                return {}
              end if
            end tell
          `
        }
      ];

      for (const approach of approaches) {
        try {
          if (this.debugMode) {
            console.log(`Trying approach: ${approach.name}`);
          }

          const result = await runAppleScript(approach.script);

          if (this.debugMode) {
            console.log(`Result from ${approach.name}:`, result);
          }

          if (result && result.trim() !== '') {
            const parsedFiles = this.parseExcelResult(result, 'Excel', knownWorkspaces);
            if (parsedFiles.length > 0) {
              if (this.debugMode) {
                console.log(`✅ Success with ${approach.name}, found ${parsedFiles.length} files`);
                console.log('=== END EXCEL DEBUG ===\n');
              }
              return parsedFiles;
            }
          }
        } catch (error) {
          if (this.debugMode) {
            console.log(`❌ Failed with ${approach.name}:`, error.message);
          }
          // Continue to next approach
        }
      }

      if (this.debugMode) {
        console.log('❌ All AppleScript approaches failed for Excel');
        console.log('=== END EXCEL DEBUG ===\n');
      }

      return [];
    } catch (error) {
      console.error('Error getting Excel open files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
      return [];
    }
  }

  /**
   * Get open files from Photoshop using AppleScript
   */
  async getPhotoshopOpenFiles(knownWorkspaces) {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        console.warn('AppleScript runner not available');
        return [];
      }

      if (this.debugMode) {
        console.log('\n=== PHOTOSHOP APPLESCRIPT DEBUG ===');
      }

      // Try multiple approaches for Photoshop since version names vary
      const approaches = [
        // Approach 1: Adobe Photoshop 2024
        {
          name: 'Adobe Photoshop 2024',
          script: `
            tell application "System Events"
              if exists (processes whose name is "Adobe Photoshop" or name contains "Photoshop") then
                tell application "Adobe Photoshop 2024"
                  set openDocs to {}
                  try
                    repeat with theDoc in documents
                      if exists theDoc then
                        try
                          set docName to name of theDoc
                          set docPath to ""
                          try
                            set docPath to file path of theDoc as string
                          end try
                          if docName is not "" then
                            if docPath is not "" then
                              set end of openDocs to (docPath & "|" & docName)
                            else
                              set end of openDocs to docName
                            end if
                          end if
                        end try
                      end if
                    end repeat
                  end try
                  return openDocs
                end tell
              else
                return {}
              end if
            end tell
          `
        },
        // Approach 2: Adobe Photoshop 2023
        {
          name: 'Adobe Photoshop 2023',
          script: `
            tell application "System Events"
              if exists (processes whose name is "Adobe Photoshop" or name contains "Photoshop") then
                tell application "Adobe Photoshop 2023"
                  set openDocs to {}
                  try
                    repeat with theDoc in documents
                      if exists theDoc then
                        try
                          set docName to name of theDoc
                          set docPath to ""
                          try
                            set docPath to file path of theDoc as string
                          end try
                          if docName is not "" then
                            if docPath is not "" then
                              set end of openDocs to (docPath & "|" & docName)
                            else
                              set end of openDocs to docName
                            end if
                          end if
                        end try
                      end if
                    end repeat
                  end try
                  return openDocs
                end tell
              else
                return {}
              end if
            end tell
          `
        },
        // Approach 3: Generic Adobe Photoshop
        {
          name: 'Generic Adobe Photoshop',
          script: `
            tell application "System Events"
              if exists (processes whose name is "Adobe Photoshop" or name contains "Photoshop") then
                tell application "Adobe Photoshop"
                  set openDocs to {}
                  try
                    repeat with theDoc in documents
                      if exists theDoc then
                        try
                          set docName to name of theDoc
                          set docPath to ""
                          try
                            set docPath to file path of theDoc as string
                          end try
                          if docName is not "" then
                            if docPath is not "" then
                              set end of openDocs to (docPath & "|" & docName)
                            else
                              set end of openDocs to docName
                            end if
                          end if
                        end try
                      end if
                    end repeat
                  end try
                  return openDocs
                end tell
              else
                return {}
              end if
            end tell
          `
        }
      ];

      for (const approach of approaches) {
        try {
          if (this.debugMode) {
            console.log(`Trying approach: ${approach.name}`);
          }

          const result = await runAppleScript(approach.script);

          if (this.debugMode) {
            console.log(`Result from ${approach.name}:`, result);
          }

          if (result && result.trim() !== '') {
            const parsedFiles = this.parsePhotoshopResult(result, 'Photoshop', knownWorkspaces);
            if (parsedFiles.length > 0) {
              if (this.debugMode) {
                console.log(`✅ Success with ${approach.name}, found ${parsedFiles.length} files`);
                console.log('=== END PHOTOSHOP DEBUG ===\n');
              }
              return parsedFiles;
            }
          }
        } catch (error) {
          if (this.debugMode) {
            console.log(`❌ Failed with ${approach.name}:`, error.message);
          }
          // Continue to next approach
        }
      }

      if (this.debugMode) {
        console.log('❌ All AppleScript approaches failed for Photoshop');
        console.log('=== END PHOTOSHOP DEBUG ===\n');
      }

      return [];
    } catch (error) {
      console.error('Error getting Photoshop open files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
      return [];
    }
  }

  /**
   * Get recently opened Excel files from macOS Recent Items
   */
  async getRecentExcelFiles() {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        console.warn('AppleScript runner not available for recent Excel files');
        return [];
      }

      if (this.debugMode) {
        console.log('\n=== RECENT EXCEL FILES DEBUG ===');
      }

      // AppleScript to get recent documents from Excel
      const script = `
        tell application "System Events"
          try
            set recentDocs to {}
            -- Try to get recent documents from Excel's recent items
            set excelApp to application "Microsoft Excel"
            if exists excelApp then
              tell excelApp
                try
                  -- Excel doesn't expose recent documents via AppleScript directly
                  -- So we'll use System Events to get recent documents
                end try
              end tell
            end if
            
            -- Alternative approach: check recent documents in System Events
            tell application "System Events"
              try
                set recentItems to {}
                -- Get recent applications and their documents
                -- This is a fallback approach since Excel's AppleScript support for recent docs is limited
                return {}
              end try
            end tell
            
            return recentDocs
          on error errMsg
            return {}
          end try
        end tell
      `;

      const result = await runAppleScript(script);

      if (this.debugMode) {
        console.log('Recent Excel files result:', result);
      }

      // For now, we'll focus on open files since recent files via AppleScript
      // has limitations with Excel. We'll enhance this with file system checks.
      const recentFiles = await this.getRecentExcelFilesFromSystem();

      if (this.debugMode) {
        console.log(`✅ Found ${recentFiles.length} recent Excel files`);
        console.log('=== END RECENT EXCEL DEBUG ===\n');
      }

      return recentFiles;
    } catch (error) {
      console.error('Error getting recent Excel files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
      return [];
    }
  }

  /**
   * Get recently opened Photoshop files from file system and common locations
   */
  async getRecentPhotoshopFiles() {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        console.warn('AppleScript runner not available for recent Photoshop files');
        return [];
      }

      if (this.debugMode) {
        console.log('\n=== RECENT PHOTOSHOP FILES DEBUG ===');
      }

      // For now, focus on file system search since Photoshop's AppleScript
      // doesn't expose recent files as easily as other apps
      const recentFiles = await this.getRecentPhotoshopFilesFromSystem();

      if (this.debugMode) {
        console.log(`✅ Found ${recentFiles.length} recent Photoshop files`);
        console.log('=== END RECENT PHOTOSHOP DEBUG ===\n');
      }

      return recentFiles;
    } catch (error) {
      console.error('Error getting recent Photoshop files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
      return [];
    }
  }

  /**
   * Get recent Photoshop files from file system (common locations)
   */
  async getRecentPhotoshopFilesFromSystem() {
    const recentFiles = [];
    
    try {
      // Common locations for image files with error handling
      const searchPaths = [
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Downloads'),
        path.join(os.homedir(), 'Pictures'),
        path.join(os.homedir(), 'iCloud Drive (Archive)', 'Desktop'),
        path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'Adobe Photoshop 2024', 'Recent Files'),
        path.join(os.homedir(), 'Library', 'Application Support', 'Adobe', 'Adobe Photoshop 2023', 'Recent Files')
      ];

      const imageExtensions = [
        '.psd', '.psb',  // Photoshop native
        '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.tif', '.bmp', '.webp',  // Common formats
        '.cr2', '.nef', '.arw', '.dng', '.raw',  // RAW formats
        '.svg', '.ai', '.eps'  // Vector formats
      ];
      const foundFiles = [];
      let searchErrors = 0;

      if (this.debugMode) {
        console.log(`Searching for image files in ${searchPaths.length} locations...`);
      }

      // Search for image files in common locations
      for (const searchPath of searchPaths) {
        try {
          if (!fs.existsSync(searchPath)) {
            if (this.debugMode) {
              console.log(`Path does not exist: ${searchPath}`);
            }
            continue;
          }
          
          const entries = fs.readdirSync(searchPath, { withFileTypes: true });
          let filesInDir = 0;
          
          for (const entry of entries) {
            if (entry.isFile() && imageExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
              const filePath = path.join(searchPath, entry.name);
              try {
                const stats = fs.statSync(filePath);
                foundFiles.push({
                  name: entry.name,
                  path: filePath,
                  directory: searchPath,
                  app: 'Photoshop',
                  icon: this.getFileIcon(entry.name),
                  isDirectory: false,
                  exists: true,
                  isWorkspaceFile: false,
                  isRecent: true,
                  lastModified: stats.mtime,
                  size: stats.size
                });
                filesInDir++;
              } catch (statError) {
                if (this.debugMode) {
                  console.warn(`Could not stat file ${filePath}: ${statError.message}`);
                }
                searchErrors++;
                continue;
              }
            }
          }

          if (this.debugMode && filesInDir > 0) {
            console.log(`Found ${filesInDir} image files in ${searchPath}`);
          }
        } catch (dirError) {
          if (this.debugMode) {
            console.warn(`Could not read directory ${searchPath}: ${dirError.message}`);
          }
          searchErrors++;
          continue;
        }
      }

      // Sort by last modified (most recent first) and limit
      foundFiles.sort((a, b) => b.lastModified - a.lastModified);
      recentFiles.push(...foundFiles);

      if (this.debugMode) {
        console.log(`Search complete: ${recentFiles.length} image files found (${searchErrors} errors)`);
      }

      // Log warning if too many errors
      if (searchErrors > searchPaths.length / 2) {
        console.warn(`Image file search encountered ${searchErrors} errors - may have permission issues`);
      }

    } catch (error) {
      console.error('Critical error searching for recent image files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
    }

    return recentFiles;
  }

  /**
   * Get recent Excel files from file system (macOS Recent Items and common locations)
   */
  async getRecentExcelFilesFromSystem() {
    const recentFiles = [];
    
    try {
      // Common locations for Excel files with error handling
      const searchPaths = [
        path.join(os.homedir(), 'Desktop'),
        path.join(os.homedir(), 'Documents'),
        path.join(os.homedir(), 'Downloads'),
        path.join(os.homedir(), 'iCloud Drive (Archive)', 'Desktop'),
        path.join(os.homedir(), 'Library', 'Containers', 'com.microsoft.Excel', 'Data', 'Documents')
      ];

      const excelExtensions = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.xltx', '.xltm'];
      const foundFiles = [];
      let searchErrors = 0;

      if (this.debugMode) {
        console.log(`Searching for Excel files in ${searchPaths.length} locations...`);
      }

      // Search for Excel files in common locations
      for (const searchPath of searchPaths) {
        try {
          if (!fs.existsSync(searchPath)) {
            if (this.debugMode) {
              console.log(`Path does not exist: ${searchPath}`);
            }
            continue;
          }
          
          const entries = fs.readdirSync(searchPath, { withFileTypes: true });
          let filesInDir = 0;
          
          for (const entry of entries) {
            if (entry.isFile() && excelExtensions.some(ext => entry.name.toLowerCase().endsWith(ext))) {
              const filePath = path.join(searchPath, entry.name);
              try {
                const stats = fs.statSync(filePath);
                foundFiles.push({
                  name: entry.name,
                  path: filePath,
                  directory: searchPath,
                  app: 'Excel',
                  icon: this.getFileIcon(entry.name),
                  isDirectory: false,
                  exists: true,
                  isWorkspaceFile: false,
                  isRecent: true,
                  lastModified: stats.mtime,
                  size: stats.size
                });
                filesInDir++;
              } catch (statError) {
                if (this.debugMode) {
                  console.warn(`Could not stat file ${filePath}: ${statError.message}`);
                }
                searchErrors++;
                continue;
              }
            }
          }

          if (this.debugMode && filesInDir > 0) {
            console.log(`Found ${filesInDir} Excel files in ${searchPath}`);
          }
        } catch (dirError) {
          if (this.debugMode) {
            console.warn(`Could not read directory ${searchPath}: ${dirError.message}`);
          }
          searchErrors++;
          continue;
        }
      }

      // Sort by last modified (most recent first) and limit
      foundFiles.sort((a, b) => b.lastModified - a.lastModified);
      recentFiles.push(...foundFiles);

      if (this.debugMode) {
        console.log(`Search complete: ${recentFiles.length} Excel files found (${searchErrors} errors)`);
      }

      // Log warning if too many errors
      if (searchErrors > searchPaths.length / 2) {
        console.warn(`Excel file search encountered ${searchErrors} errors - may have permission issues`);
      }

    } catch (error) {
      console.error('Critical error searching for recent Excel files:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
    }

    return recentFiles;
  }

  /**
   * Check if Excel detection is properly configured and accessible
   */
  async checkExcelDetectionCapability() {
    const result = {
      excelInstalled: false,
      applescriptAvailable: false,
      accessibilityPermissions: false,
      canDetectOpenFiles: false,
      canDetectRecentFiles: false,
      errors: []
    };

    try {
      // Check if Excel is installed
      const excelPath = '/Applications/Microsoft Excel.app';
      if (fs.existsSync(excelPath)) {
        result.excelInstalled = true;
      } else {
        result.errors.push('Microsoft Excel not found in Applications folder');
      }

      // Check AppleScript availability
      const runAppleScript = await this.getRunAppleScript();
      if (runAppleScript) {
        result.applescriptAvailable = true;
      } else {
        result.errors.push('AppleScript runner not available');
      }

      // Check accessibility permissions
      result.accessibilityPermissions = await this.checkAccessibilityPermissions();
      if (!result.accessibilityPermissions) {
        result.errors.push('Accessibility permissions required for Excel detection');
      }

      // Test if we can detect open files
      if (result.applescriptAvailable && result.accessibilityPermissions) {
        try {
          await this.getExcelOpenFiles([]);
          result.canDetectOpenFiles = true;
        } catch (error) {
          result.errors.push(`Cannot detect open Excel files: ${error.message}`);
        }
      }

      // Test if we can detect recent files
      try {
        const recentFiles = await this.getRecentExcelFilesFromSystem();
        result.canDetectRecentFiles = Array.isArray(recentFiles);
      } catch (error) {
        result.errors.push(`Cannot detect recent Excel files: ${error.message}`);
      }

      if (this.debugMode) {
        console.log('Excel detection capability check:', result);
      }

    } catch (error) {
      result.errors.push(`Excel capability check failed: ${error.message}`);
      console.error('Error checking Excel detection capability:', error);
    }

    return result;
  }

  /**
   * Parse Excel AppleScript result and extract file information
   */
  parseExcelResult(result, appName, knownWorkspaces = []) {
    if (this.debugMode) {
      console.log(`\n=== PARSING EXCEL RESULT ===`);
      console.log('Raw result:', JSON.stringify(result));
    }

    if (!result || result.trim() === '') {
      if (this.debugMode) {
        console.log('❌ Empty or null result');
        console.log('=== END EXCEL PARSING ===\n');
      }
      return [];
    }

    const files = [];
    const workbookEntries = result.split(',').map(entry => entry.trim());

    if (this.debugMode) {
      console.log(`Found ${workbookEntries.length} workbook entries:`, workbookEntries);
    }

    for (const entry of workbookEntries) {
      if (!entry || entry === '') continue;

      if (this.debugMode) {
        console.log(`Processing entry: "${entry}"`);
      }

      let fileName, filePath;

      // Check if entry contains path separator (format: "path|name")
      if (entry.includes('|')) {
        const parts = entry.split('|');
        filePath = parts[0].trim();
        fileName = parts[1].trim();
      } else {
        // Just the filename (for unsaved workbooks or when path unavailable)
        fileName = entry;
        filePath = null;
      }

      // Skip if filename is empty
      if (!fileName) continue;

      // Check if this is an Excel file extension
      const ext = path.extname(fileName).toLowerCase();
      const isExcelFile = ['.xlsx', '.xls', '.xlsm', '.xlsb', '.xltx', '.xltm'].includes(ext);

      // For files without extensions (like "Book1"), assume it's Excel
      const isUnsavedWorkbook = !ext && /^(Book|Workbook)\d*$/i.test(fileName);

      if (!isExcelFile && !isUnsavedWorkbook) {
        if (this.debugMode) {
          console.log(`  ❌ Skipping non-Excel file: ${fileName}`);
        }
        continue;
      }

      // Check if file exists (for saved workbooks) and get metadata
      let exists = false;
      let lastModified = null;
      let fileSize = null;

      if (filePath) {
        try {
          const stats = fs.statSync(filePath);
          exists = true;
          lastModified = stats.mtime;
          fileSize = stats.size;
        } catch (error) {
          // File doesn't exist or can't be accessed
          exists = false;
        }
      }

      const fileInfo = {
        name: fileName,
        path: filePath || fileName,
        directory: filePath ? path.dirname(filePath) : null,
        app: appName,
        icon: isUnsavedWorkbook ? 'codicon-file' : this.getFileIcon(fileName),
        isDirectory: false,
        exists: exists,
        isWorkspaceFile: false,
        isUnsaved: isUnsavedWorkbook || !filePath,
        isOpen: true, // Currently open files are marked as open
        lastModified: lastModified,
        size: fileSize,
        fileType: ext || 'workbook'
      };

      files.push(fileInfo);

      if (this.debugMode) {
        console.log(`  ✅ Added Excel file:`, fileInfo);
      }
    }

    if (this.debugMode) {
      console.log(`Final result: ${files.length} Excel files extracted`);
      console.log('=== END EXCEL PARSING ===\n');
    }

    return files;
  }

  /**
   * Parse Photoshop AppleScript result and extract image file information
   */
  parsePhotoshopResult(result, appName, knownWorkspaces = []) {
    if (this.debugMode) {
      console.log(`\n=== PARSING PHOTOSHOP RESULT ===`);
      console.log('Raw result:', JSON.stringify(result));
    }

    if (!result || result.trim() === '') {
      if (this.debugMode) {
        console.log('❌ Empty or null result');
        console.log('=== END PHOTOSHOP PARSING ===\n');
      }
      return [];
    }

    const files = [];
    const documentEntries = result.split(',').map(entry => entry.trim());

    if (this.debugMode) {
      console.log(`Found ${documentEntries.length} document entries:`, documentEntries);
    }

    for (const entry of documentEntries) {
      if (!entry || entry === '') continue;

      if (this.debugMode) {
        console.log(`Processing entry: "${entry}"`);
      }

      let fileName, filePath;

      // Check if entry contains path separator (format: "path|name")
      if (entry.includes('|')) {
        const parts = entry.split('|');
        filePath = parts[0].trim();
        fileName = parts[1].trim();
      } else {
        // Just the filename (for unsaved documents or when path unavailable)
        fileName = entry;
        filePath = null;
      }

      // Skip if filename is empty
      if (!fileName) continue;

      // Check if this is an image file extension
      const ext = path.extname(fileName).toLowerCase();
      const isImageFile = [
        '.psd', '.psb',  // Photoshop native
        '.jpg', '.jpeg', '.png', '.gif', '.tiff', '.tif', '.bmp', '.webp',  // Common formats
        '.cr2', '.nef', '.arw', '.dng', '.raw',  // RAW formats
        '.svg', '.ai', '.eps'  // Vector formats that Photoshop can open
      ].includes(ext);

      // For files without extensions (like "Untitled-1"), assume it's Photoshop
      const isUnsavedDocument = !ext && /^(Untitled|New Document)(-\d+)?$/i.test(fileName);

      if (!isImageFile && !isUnsavedDocument) {
        if (this.debugMode) {
          console.log(`  ❌ Skipping non-image file: ${fileName}`);
        }
        continue;
      }

      // Check if file exists (for saved documents) and get metadata
      let exists = false;
      let lastModified = null;
      let fileSize = null;

      if (filePath) {
        try {
          const stats = fs.statSync(filePath);
          exists = true;
          lastModified = stats.mtime;
          fileSize = stats.size;
        } catch (error) {
          // File doesn't exist or can't be accessed
          exists = false;
        }
      }

      const fileInfo = {
        name: fileName,
        path: filePath || fileName,
        directory: filePath ? path.dirname(filePath) : null,
        app: appName,
        icon: isUnsavedDocument ? 'codicon-file' : this.getFileIcon(fileName),
        isDirectory: false,
        exists: exists,
        isWorkspaceFile: false,
        isUnsaved: isUnsavedDocument || !filePath,
        isOpen: true, // Currently open files are marked as open
        lastModified: lastModified,
        size: fileSize,
        fileType: ext || 'image'
      };

      files.push(fileInfo);

      if (this.debugMode) {
        console.log(`  ✅ Added Photoshop file:`, fileInfo);
      }
    }

    if (this.debugMode) {
      console.log(`Final result: ${files.length} Photoshop files extracted`);
      console.log('=== END PHOTOSHOP PARSING ===\n');
    }

    return files;
  }

  /**
   * Parse AppleScript result and extract file information
   */
  parseAppleScriptResult(result, appName, knownWorkspaces = []) {
    if (this.debugMode) {
      console.log(`\n=== PARSING APPLESCRIPT RESULT FOR ${appName.toUpperCase()} ===`);
      console.log('Raw result:', JSON.stringify(result));
    }

    if (!result || result.trim() === '') {
      if (this.debugMode) {
        console.log('❌ Empty or null result');
        console.log('=== END PARSING ===\n');
      }
      return [];
    }

    const files = [];
    // AppleScript returns comma-separated values
    const windowTitles = result.split(',').map(title => title.trim());

    if (this.debugMode) {
      console.log(`Found ${windowTitles.length} window titles:`, windowTitles);
    }

    for (const title of windowTitles) {
      if (!title || title === '') continue;

      if (this.debugMode) {
        console.log(`Processing title: "${title}"`);
      }

      // Try to extract file path from window title
      const fileInfo = this.extractFileInfoFromTitle(title, appName, knownWorkspaces);
      if (fileInfo) {
        files.push(fileInfo);
        if (this.debugMode) {
          console.log(`  ✅ Extracted file info:`, fileInfo);
        }
      } else {
        if (this.debugMode) {
          console.log(`  ❌ Could not extract file info from title`);
        }
      }
    }

    if (this.debugMode) {
      console.log(`Final result: ${files.length} files extracted`);
      console.log('=== END PARSING ===\n');
    }

    return files;
  }

  /**
   * Extract workspace and file information from window title
   */
  extractFileInfoFromTitle(title, appName, knownWorkspaces = []) {
    try {
      if (this.debugMode) {
        console.log(`    Extracting from title: "${title}"`);
      }

      // Common patterns in VS Code/Cursor window titles:
      // "filename.ext - foldername - Visual Studio Code"
      // "filename.ext - path/to/folder"
      // "● filename.ext - foldername" (unsaved changes)
      // Cursor specific patterns:
      // "filename.ext - Cursor"
      // "filename.ext — /full/path/to/folder"
      // "● filename.ext - /full/path/to/folder"
      // Excel specific patterns:
      // "filename.xlsx - Excel"
      // "Book1 - Excel" (unsaved workbook)
      // "filename.xlsx - Microsoft Excel"

      // Remove app name from title and clean up
      let cleanTitle = title
        .replace(/\s*[-—]\s*(Visual Studio Code|Cursor|Microsoft Excel|Excel)\s*$/, '')
        .replace(/^●\s*/, '') // Remove unsaved indicator
        .replace(/^[•◦▪▫]\s*/, '') // Remove other bullet indicators
        .trim();

      if (this.debugMode) {
        console.log(`    Clean title: "${cleanTitle}"`);
      }

      // Split by various separators (both hyphen and em-dash)
      const separators = [' — ', ' - '];
      let parts = [cleanTitle];

      for (const sep of separators) {
        if (cleanTitle.includes(sep)) {
          parts = cleanTitle.split(sep);
          break;
        }
      }

      if (this.debugMode) {
        console.log(`    Title parts:`, parts);
      }

      if (parts.length < 1) return null;

      const fileName = parts[0].trim();
      if (!fileName) return null;

      // Try to determine workspace directory
      let workspaceDirectory = null;
      let filePath = null;
      let directory = null;

      if (parts.length > 1) {
        directory = parts[parts.length - 1].trim();

        // Check if directory looks like a full path
        if (directory.startsWith('/')) {
          // Full path directory - this is our workspace
          workspaceDirectory = directory;
          filePath = path.join(directory, fileName);
        } else {
          // Relative directory name. Prioritize matching against known workspace paths.
          let foundPath = null;
          if (knownWorkspaces && knownWorkspaces.length > 0) {
            for (const wsPath of knownWorkspaces) {
              if (path.basename(wsPath).toLowerCase() === directory.toLowerCase()) {
                foundPath = wsPath;
                break;
              }
            }
          }

          if (foundPath) {
            workspaceDirectory = foundPath;
            directory = foundPath;
            filePath = path.join(foundPath, fileName);
          } else {
            // Fallback if not found in known workspaces. This is less reliable.
            const commonPaths = [
              path.join(process.env.HOME || os.homedir(), 'Desktop', directory),
              path.join(process.env.HOME || os.homedir(), 'Documents', directory),
              path.join(process.env.HOME || os.homedir(), directory),
              directory // Try as-is
            ];

            for (const testPath of commonPaths) {
              const fullPath = path.join(testPath, fileName);
              if (fs.existsSync(fullPath)) {
                filePath = fullPath;
                workspaceDirectory = testPath;
                directory = testPath;
                break;
              }
            }

            // If not found, try to construct absolute paths in common locations
            if (!filePath) {
              // Try to construct absolute paths for common locations
              const homeDir = os.homedir();
              const possiblePaths = [
                path.join(homeDir, 'Desktop', directory),
                path.join(homeDir, 'Documents', directory),
                path.join(homeDir, directory)
              ];

              // Check if any of these directories exist
              for (const possiblePath of possiblePaths) {
                if (fs.existsSync(possiblePath)) {
                  workspaceDirectory = possiblePath;
                  filePath = path.join(possiblePath, fileName);
                  directory = possiblePath;
                  break;
                }
              }

              // If still not found, keep relative path but mark it as such
              if (!filePath) {
                filePath = path.join(directory, fileName);
                workspaceDirectory = directory;
              }
            }
          }
        }
      }

      // Check if we found a valid file
      const exists = filePath ? fs.existsSync(filePath) : false;
      const workspaceExists = workspaceDirectory ? fs.existsSync(workspaceDirectory) : false;

      if (this.debugMode) {
        console.log(`    File path: "${filePath}"`);
        console.log(`    Workspace directory: "${workspaceDirectory}"`);
        console.log(`    File exists: ${exists}`);
        console.log(`    Workspace exists: ${workspaceExists}`);
      }

      // Prioritize workspace information for better project navigation
      if (workspaceDirectory && workspaceExists) {
        const workspaceInfo = {
          name: fileName,
          path: filePath || path.join(workspaceDirectory, fileName),
          directory: directory || path.dirname(filePath),
          workspaceDirectory: workspaceDirectory,
          workspaceName: path.basename(workspaceDirectory),
          app: appName,
          icon: this.getFileIcon(fileName),
          isDirectory: false,
          exists: exists,
          workspaceExists: workspaceExists,
          // Add workspace-specific metadata for better UI
          isWorkspaceFile: true
        };

        if (this.debugMode) {
          console.log(`    ✅ Workspace file found:`, workspaceInfo);
        }

        return workspaceInfo;
      }

      // Fallback to basic file info if no workspace detected
      const basicInfo = {
        name: fileName,
        path: filePath || fileName,
        directory: directory,
        app: appName,
        icon: this.getFileIcon(fileName),
        isDirectory: false,
        exists: exists,
        isWorkspaceFile: false
      };

      if (this.debugMode) {
        console.log(`    ⚠️ Basic info (no workspace detected):`, basicInfo);
      }

      return basicInfo;
    } catch (error) {
      console.error('Error extracting file info from title:', error);
      if (this.debugMode) {
        console.error('Stack trace:', error.stack);
      }
      return null;
    }
  }

  /**
   * Get appropriate icon for file type
   */
  getFileIcon(fileName) {
    const ext = path.extname(fileName).toLowerCase();

    const iconMap = {
      '.js': 'codicon-symbol-variable',
      '.jsx': 'codicon-symbol-variable',
      '.ts': 'codicon-symbol-variable',
      '.tsx': 'codicon-symbol-variable',
      '.json': 'codicon-json',
      '.html': 'codicon-html',
      '.css': 'codicon-symbol-color',
      '.scss': 'codicon-symbol-color',
      '.md': 'codicon-markdown',
      '.py': 'codicon-symbol-method',
      '.java': 'codicon-symbol-class',
      '.cpp': 'codicon-symbol-structure',
      '.c': 'codicon-symbol-structure',
      '.h': 'codicon-symbol-structure',
      '.php': 'codicon-symbol-method',
      '.rb': 'codicon-ruby',
      '.go': 'codicon-symbol-method',
      '.rs': 'codicon-symbol-structure',
      '.xml': 'codicon-symbol-structure',
      '.yaml': 'codicon-symbol-structure',
      '.yml': 'codicon-symbol-structure',
      '.xlsx': 'codicon-table',
      '.xls': 'codicon-table',
      '.xlsm': 'codicon-table',
      '.xlsb': 'codicon-table',
      '.xltx': 'codicon-table',
      '.xltm': 'codicon-table',
      // Image file types
      '.psd': 'codicon-file-media',
      '.psb': 'codicon-file-media',
      '.jpg': 'codicon-file-media',
      '.jpeg': 'codicon-file-media',
      '.png': 'codicon-file-media',
      '.gif': 'codicon-file-media',
      '.tiff': 'codicon-file-media',
      '.tif': 'codicon-file-media',
      '.bmp': 'codicon-file-media',
      '.webp': 'codicon-file-media',
      '.svg': 'codicon-file-media',
      '.ai': 'codicon-file-media',
      '.eps': 'codicon-file-media',
      '.cr2': 'codicon-file-media',
      '.nef': 'codicon-file-media',
      '.arw': 'codicon-file-media',
      '.dng': 'codicon-file-media',
      '.raw': 'codicon-file-media'
    };

    return iconMap[ext] || 'codicon-file';
  }

  /**
   * Group files by workspace for better organization
   */
  groupFilesByWorkspace(files) {
    const workspaces = new Map();
    const filesWithoutWorkspace = [];

    files.forEach(file => {
      if (file.isWorkspaceFile && file.workspaceDirectory) {
        const workspaceKey = file.workspaceDirectory;

        if (!workspaces.has(workspaceKey)) {
          workspaces.set(workspaceKey, {
            path: file.workspaceDirectory,
            name: file.workspaceName,
            app: file.app,
            appDisplayName: file.appDisplayName,
            appIcon: file.appIcon,
            files: [],
            isDirectory: true,
            isWorkspace: true,
            icon: 'codicon-folder'
          });
        }

        workspaces.get(workspaceKey).files.push(file);
      } else {
        filesWithoutWorkspace.push(file);
      }
    });

    return {
      workspaces: Array.from(workspaces.values()),
      individualFiles: filesWithoutWorkspace
    };
  }

  /**
   * Get all open files from supported applications
   */
  async getOpenFiles() {
    try {
      // Get window detection settings
      const detectionSettings = this.getWindowDetectionSettings();

      const runningApps = await this.getRunningApplications();
      const allOpenFiles = [];

      // Filter running apps based on detection settings
      const enabledApps = runningApps.filter(app => {
        if (app.applescriptName === 'Visual Studio Code') {
          return detectionSettings.vscode;
        } else if (app.applescriptName === 'Cursor') {
          return detectionSettings.cursor;
        } else if (app.applescriptName === 'Microsoft Excel') {
          return detectionSettings.excel;
        } else if (app.applescriptName === 'Adobe Photoshop') {
          return detectionSettings.photoshop;
        }
        return false;
      });

      if (this.debugMode) {
        console.log('Window detection settings:', detectionSettings);
        console.log(`Filtered ${runningApps.length} running apps to ${enabledApps.length} enabled apps`);
      }

      // Check if we have accessibility permissions and user consent
      const hasPermissions = await this.checkAccessibilityPermissions();
      const windowDetectionEnabled = hasPermissions && this.userConsentForPermissions;
      
      if (!windowDetectionEnabled) {
        if (this.debugMode) {
          console.log('Window detection disabled - hasPermissions:', hasPermissions, 'userConsent:', this.userConsentForPermissions);
        }
        
        // Return graceful response instead of error
        return {
          success: true, // Changed to true since this is expected behavior
          windowDetectionAvailable: false,
          hasAccessibilityPermissions: hasPermissions,
          userConsentForPermissions: this.userConsentForPermissions,
          message: !hasPermissions 
            ? 'Accessibility permissions required for window detection'
            : 'Window detection not enabled. Enable in settings to detect open files.',
          files: [],
          workspaces: [],
          runningApps: []
        };
      }

      // Get open files from each enabled app
      for (const app of enabledApps) {
        let files = [];
        const knownWorkspaces = await this.getWorkspacesFromStorage(app.name);

        try {
          if (app.applescriptName === 'Visual Studio Code') {
            files = await this.getVSCodeOpenFiles(knownWorkspaces);
          } else if (app.applescriptName === 'Cursor') {
            files = await this.getCursorOpenFiles(knownWorkspaces);
          } else if (app.applescriptName === 'Microsoft Excel') {
            files = await this.getExcelOpenFiles(knownWorkspaces);
          } else if (app.applescriptName === 'Adobe Photoshop') {
            files = await this.getPhotoshopOpenFiles(knownWorkspaces);
          }

          // Add app metadata to each file
          files.forEach(file => {
            file.appDisplayName = app.displayName;
            file.appIcon = app.icon;
            file.isOpen = true; // Mark as currently open
          });

          allOpenFiles.push(...files);
        } catch (error) {
          console.error(`Error getting files from ${app.displayName}:`, error);
        }
      }

      // Also get recent Excel files (even if Excel is not currently running), but only if Excel detection is enabled
      if (detectionSettings.excel) {
        try {
          const recentExcelFiles = await this.getRecentExcelFiles();
          if (Array.isArray(recentExcelFiles) && recentExcelFiles.length > 0) {
            recentExcelFiles.forEach(file => {
              file.appDisplayName = 'Excel';
              file.appIcon = '📊';
              file.isOpen = false; // Mark as recent, not currently open
            });
            allOpenFiles.push(...recentExcelFiles);
            
            if (this.debugMode) {
              console.log(`Added ${recentExcelFiles.length} recent Excel files to results`);
            }
          } else if (this.debugMode) {
            console.log('No recent Excel files found');
          }
        } catch (error) {
          console.error('Error getting recent Excel files:', error);
          if (this.debugMode) {
            console.error('Recent Excel files error stack:', error.stack);
          }
        }
      } else if (this.debugMode) {
        console.log('Excel detection disabled, skipping recent Excel files');
      }

      // Also get recent Photoshop files (even if Photoshop is not currently running), but only if Photoshop detection is enabled
      if (detectionSettings.photoshop) {
        try {
          const recentPhotoshopFiles = await this.getRecentPhotoshopFiles();
          if (Array.isArray(recentPhotoshopFiles) && recentPhotoshopFiles.length > 0) {
            recentPhotoshopFiles.forEach(file => {
              file.appDisplayName = 'Photoshop';
              file.appIcon = '🎨';
              file.isOpen = false; // Mark as recent, not currently open
            });
            allOpenFiles.push(...recentPhotoshopFiles);
            
            if (this.debugMode) {
              console.log(`Added ${recentPhotoshopFiles.length} recent Photoshop files to results`);
            }
          } else if (this.debugMode) {
            console.log('No recent Photoshop files found');
          }
        } catch (error) {
          console.error('Error getting recent Photoshop files:', error);
          if (this.debugMode) {
            console.error('Recent Photoshop files error stack:', error.stack);
          }
        }
      } else if (this.debugMode) {
        console.log('Photoshop detection disabled, skipping recent Photoshop files');
      }

      // Remove duplicates and sort
      const uniqueFiles = this.removeDuplicateFiles(allOpenFiles);

      // Group files by workspace
      const grouped = this.groupFilesByWorkspace(uniqueFiles);

      // Sort workspaces and individual files
      grouped.workspaces.sort((a, b) => {
        // Sort by app first, then by workspace name
        if (a.app !== b.app) {
          return a.app.localeCompare(b.app);
        }
        return a.name.localeCompare(b.name);
      });

      grouped.individualFiles.sort((a, b) => {
        // Sort by app first, then by file name
        if (a.app !== b.app) {
          return a.app.localeCompare(b.app);
        }
        return a.name.localeCompare(b.name);
      });

      // Combine workspaces and individual files for backward compatibility
      const combinedFiles = [
        ...grouped.workspaces,
        ...grouped.individualFiles
      ];

      return {
        success: true,
        windowDetectionAvailable: true,
        hasAccessibilityPermissions: true,
        userConsentForPermissions: this.userConsentForPermissions,
        files: combinedFiles,
        workspaces: grouped.workspaces,
        individualFiles: grouped.individualFiles,
        runningApps: runningApps.map(app => ({
          name: app.displayName,
          icon: app.icon
        }))
      };
    } catch (error) {
      console.error('Error getting open files:', error);
      return {
        success: false,
        error: error.message,
        files: [],
        workspaces: []
      };
    }
  }

  /**
   * Remove duplicate files (same path from different sources)
   */
  removeDuplicateFiles(files) {
    const seen = new Set();
    return files.filter(file => {
      const key = `${file.path}|${file.app}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache() {
    this.cache.runningApps = null;
    this.cache.openFiles.clear();
    this.cache.lastUpdate = null;
  }

  /**
   * Enable or disable debug mode
   */
  setDebugMode(enabled) {
    this.debugMode = enabled;
    console.log(`Window Detection debug mode ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get comprehensive diagnostic information
   */
  async getDiagnosticInfo() {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      debugMode: this.debugMode,
      supportedApps: this.supportedApps,
      accessibility: {
        hasPermissions: await this.checkAccessibilityPermissions(),
        canRequest: true
      },
      processes: {
        total: 0,
        relevant: [],
        matching: []
      },
      applescript: {
        available: false,
        error: null
      },
      cache: {
        hasRunningApps: !!this.cache.runningApps,
        lastUpdate: this.cache.lastUpdate,
        ttl: this.cache.ttl
      }
    };

    try {
      // Check AppleScript availability
      const runAppleScript = await this.getRunAppleScript();
      diagnostics.applescript.available = !!runAppleScript;
    } catch (error) {
      diagnostics.applescript.error = error.message;
    }

    try {
      // Get process information
      const processes = await si.processes();
      diagnostics.processes.total = processes.list.length;

      // Find relevant processes
      const relevantProcesses = processes.list.filter(p => {
        const name = (p.name || '').toLowerCase();
        const command = (p.command || '').toLowerCase();
        return name.includes('code') || name.includes('cursor') || name.includes('excel') ||
               command.includes('code') || command.includes('cursor') || command.includes('excel') ||
               name.includes('electron') || command.includes('electron') ||
               command.includes('todesktop') || name.includes('microsoft excel') || 
               command.includes('microsoft excel');
      });

      diagnostics.processes.relevant = relevantProcesses.map(p => ({
        name: p.name,
        command: p.command,
        pid: p.pid,
        cpu: p.cpu,
        memory: p.mem_rss
      }));

      // Find matching processes for each app
      for (const [appName, appConfig] of Object.entries(this.supportedApps)) {
        const matchingProcesses = processes.list.filter(p => {
          if (p.name === appConfig.processName) return true;
          if (appConfig.processNames && appConfig.processNames.some(name =>
            p.name === name || p.name.toLowerCase() === name.toLowerCase()
          )) return true;
          if (p.command && appConfig.processNames.some(name =>
            p.command.includes(name) || p.command.toLowerCase().includes(name.toLowerCase())
          )) return true;
          if (appName === 'Cursor') {
            if (p.name && p.name.toLowerCase().includes('cursor')) return true;
            if (p.command && (
              p.command.includes('todesktop') ||
              p.command.includes('230313mzl4w4u92') ||
              p.command.toLowerCase().includes('cursor')
            )) return true;
          }
          return false;
        });

        if (matchingProcesses.length > 0) {
          diagnostics.processes.matching.push({
            appName,
            appConfig,
            processes: matchingProcesses.map(p => ({
              name: p.name,
              command: p.command,
              pid: p.pid
            }))
          });
        }
      }
    } catch (error) {
      diagnostics.processes.error = error.message;
    }

    return diagnostics;
  }

  /**
   * Test AppleScript execution with a simple script
   */
  async testAppleScript() {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        return { success: false, error: 'AppleScript runner not available' };
      }

      const testScript = `
        tell application "System Events"
          return name of processes
        end tell
      `;

      const result = await runAppleScript(testScript);
      return {
        success: true,
        processCount: result ? result.split(',').length : 0,
        result: result
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Alternative approach: Use System Events to detect windows directly
   */
  async getCursorWindowsViaSystemEvents() {
    try {
      const runAppleScript = await this.getRunAppleScript();
      if (!runAppleScript) {
        return { success: false, error: 'AppleScript runner not available' };
      }

      if (this.debugMode) {
        console.log('\n=== TRYING SYSTEM EVENTS ALTERNATIVE ===');
      }

      // Script to get all windows from all processes and filter for Cursor-like windows
      const script = `
        tell application "System Events"
          set windowList to {}
          set processList to every process

          repeat with proc in processList
            try
              set procName to name of proc
              if procName contains "Cursor" or procName contains "cursor" then
                set procWindows to windows of proc
                repeat with win in procWindows
                  try
                    set winTitle to title of win
                    if winTitle is not "" and winTitle is not "Cursor" then
                      set end of windowList to ("CURSOR:" & winTitle)
                    end if
                  end try
                end repeat
              else if procName contains "Code" then
                set procWindows to windows of proc
                repeat with win in procWindows
                  try
                    set winTitle to title of win
                    if winTitle is not "" and winTitle is not "Visual Studio Code" then
                      set end of windowList to ("VSCODE:" & winTitle)
                    end if
                  end try
                end repeat
              end if
            end try
          end repeat

          return windowList
        end tell
      `;

      const result = await runAppleScript(script);

      if (this.debugMode) {
        console.log('System Events result:', result);
      }

      if (result && result.trim() !== '') {
        const windows = result.split(',').map(w => w.trim());
        const files = [];

        windows.forEach(window => {
          if (window.startsWith('CURSOR:')) {
            const title = window.substring(7); // Remove "CURSOR:" prefix
            const fileInfo = this.extractFileInfoFromTitle(title, 'Cursor');
            if (fileInfo) {
              files.push(fileInfo);
            }
          } else if (window.startsWith('VSCODE:')) {
            const title = window.substring(7); // Remove "VSCODE:" prefix
            const fileInfo = this.extractFileInfoFromTitle(title, 'VS Code');
            if (fileInfo) {
              files.push(fileInfo);
            }
          }
        });

        if (this.debugMode) {
          console.log(`✅ System Events found ${files.length} files`);
          console.log('=== END SYSTEM EVENTS ===\n');
        }

        return { success: true, files };
      }

      if (this.debugMode) {
        console.log('❌ System Events returned no results');
        console.log('=== END SYSTEM EVENTS ===\n');
      }

      return { success: false, error: 'No windows found' };
    } catch (error) {
      if (this.debugMode) {
        console.error('❌ System Events approach failed:', error.message);
        console.log('=== END SYSTEM EVENTS ===\n');
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Enhanced getOpenFiles that tries multiple approaches
   */
  async getOpenFilesWithFallback() {
    const results = {
      timestamp: new Date().toISOString(),
      approaches: [],
      finalFiles: [],
      runningApps: [],
      success: false
    };

    try {
      // Get running apps first
      const runningApps = await this.getRunningApplications();
      results.runningApps = runningApps;

      if (runningApps.length === 0) {
        return {
          ...results,
          error: 'No supported applications are running'
        };
      }

      // Check accessibility permissions
      const hasPermissions = await this.checkAccessibilityPermissions();
      if (!hasPermissions) {
        return {
          ...results,
          error: 'Accessibility permissions required',
          requiresPermissions: true
        };
      }

      // Try multiple approaches in order of preference
      const approaches = [
        {
          name: 'Standard AppleScript',
          method: async () => {
            const allFiles = [];
            const knownWorkspacesByApp = new Map();

            for (const app of runningApps) {
              if (!knownWorkspacesByApp.has(app.name)) {
                knownWorkspacesByApp.set(app.name, await this.getWorkspacesFromStorage(app.name));
              }
              const knownWorkspaces = knownWorkspacesByApp.get(app.name);

              let files = [];
              if (app.applescriptName === 'Visual Studio Code') {
                files = await this.getVSCodeOpenFiles(knownWorkspaces);
              } else if (app.applescriptName === 'Cursor') {
                files = await this.getCursorOpenFiles(knownWorkspaces);
              } else if (app.applescriptName === 'Microsoft Excel') {
                files = await this.getExcelOpenFiles(knownWorkspaces);
              }
              allFiles.push(...files);
            }
            return allFiles;
          }
        },
        {
          name: 'System Events Alternative',
          method: async () => {
            const result = await this.getCursorWindowsViaSystemEvents();
            return result.success ? result.files : [];
          }
        }
      ];

      for (const approach of approaches) {
        try {
          if (this.debugMode) {
            console.log(`\n🔄 Trying approach: ${approach.name}`);
          }

          const files = await approach.method();

          results.approaches.push({
            name: approach.name,
            success: true,
            fileCount: files.length,
            files: files
          });

          if (files.length > 0) {
            // Add app metadata to each file
            files.forEach(file => {
              const app = runningApps.find(a => a.applescriptName === file.app || a.displayName === file.app);
              if (app) {
                file.appDisplayName = app.displayName;
                file.appIcon = app.icon;
              }
            });

            results.finalFiles.push(...files);

            if (this.debugMode) {
              console.log(`✅ ${approach.name} succeeded with ${files.length} files`);
            }
            break; // Use first successful approach
          } else {
            if (this.debugMode) {
              console.log(`⚠️ ${approach.name} succeeded but found no files`);
            }
          }
        } catch (error) {
          results.approaches.push({
            name: approach.name,
            success: false,
            error: error.message
          });

          if (this.debugMode) {
            console.log(`❌ ${approach.name} failed:`, error.message);
          }
        }
      }

      // Remove duplicates and sort
      const uniqueFiles = this.removeDuplicateFiles(results.finalFiles);
      uniqueFiles.sort((a, b) => {
        if (a.app !== b.app) {
          return a.app.localeCompare(b.app);
        }
        return a.name.localeCompare(b.name);
      });

      results.finalFiles = uniqueFiles;
      results.success = true;

      return {
        ...results,
        files: uniqueFiles,
        runningApps: runningApps.map(app => ({
          name: app.displayName,
          icon: app.icon
        }))
      };

    } catch (error) {
      console.error('Error in getOpenFilesWithFallback:', error);
      return {
        ...results,
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = WindowDetector;