# Cursor Window Detection Debug Guide

This guide will help you debug why the window detection is returning 0 files when Cursor is running with open files.

## Quick Debug Commands

Open the Claude Code Chat application and press `F12` (or `Cmd+Option+I` on macOS) to open the developer console. Then run these commands:

### 1. Full Debug Session
```javascript
debugWindowDetection()
```
This runs a comprehensive debug session that will:
- Enable debug mode
- Get system diagnostics
- Test AppleScript execution
- Clear cache and reload window detection
- Show detailed information about all steps

### 2. Quick Tests
```javascript
// Test AppleScript functionality
testAppleScript()

// Get diagnostic information
getWindowDiagnostics()

// Get current file browser component
getAppComponent('fileBrowser')
```

## Manual Debugging Steps

### Step 1: Check if Cursor is Running
1. Open Activity Monitor (Applications > Utilities > Activity Monitor)
2. Search for "Cursor" in the search box
3. Verify that Cursor processes are running
4. Note the exact process names (e.g., "Cursor", "Cursor Helper", etc.)

### Step 2: Check Accessibility Permissions
1. Open System Preferences > Security & Privacy > Privacy
2. Click on "Accessibility" in the left sidebar
3. Look for "Claude Code Chat" in the list
4. Ensure it has a checkmark (enabled)
5. If not listed, click the "+" button and add Claude Code Chat

### Step 3: Test AppleScript Manually
Open Script Editor (Applications > Utilities > Script Editor) and test these scripts:

#### Test 1: Basic Process Detection
```applescript
tell application "System Events"
    return name of processes
end tell
```
This should return a list of all running processes. Look for Cursor in the results.

#### Test 2: Cursor Window Detection
```applescript
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
```

#### Test 3: Direct Application Approach
```applescript
tell application "System Events"
    if exists (processes whose name is "Cursor") then
        tell application "Cursor"
            try
                return name of windows
            on error
                return "Error accessing Cursor windows"
            end try
        end tell
    else
        return "Cursor process not found"
    end if
end tell
```

## Common Issues and Solutions

### Issue 1: Cursor Process Not Detected
**Symptoms:** `debugWindowDetection()` shows 0 matching app processes for Cursor

**Solutions:**
1. **Check actual process name:** The process might not be called "Cursor"
2. **Update process names:** Edit the supported apps configuration
3. **Restart Cursor:** Sometimes the process name changes after updates

### Issue 2: AppleScript Permission Denied
**Symptoms:** AppleScript tests fail with permission errors

**Solutions:**
1. **Grant accessibility permissions** (see Step 2 above)
2. **Restart Claude Code Chat** after granting permissions
3. **Check Apple Events permissions** in System Preferences

### Issue 3: Cursor Windows Not Accessible via AppleScript
**Symptoms:** Process detected but AppleScript can't access windows

**Solutions:**
1. **Try System Events approach:** Use the alternative detection method
2. **Check Cursor version:** Newer versions might have different AppleScript support
3. **Try bundle ID approach:** Use bundle identifier instead of application name

### Issue 4: Window Titles Not Parsed Correctly
**Symptoms:** Windows detected but file info extraction fails

**Solutions:**
1. **Check window title format:** Cursor might use different title patterns
2. **Update title parsing logic:** Add support for new patterns
3. **Enable debug mode** to see raw window titles

## Debug Output Interpretation

When you run `debugWindowDetection()`, look for these key indicators:

### ✅ Good Signs:
- `Total processes found: > 100` (should be many processes)
- `Relevant processes: > 0` (found Cursor/Code processes)
- `Matching app processes: > 0` (successfully matched to our config)
- `AppleScript available: true`
- `Accessibility permissions: true`

### ❌ Problem Signs:
- `Relevant processes: 0` → Cursor not running or process name mismatch
- `Matching app processes: 0` → Configuration problem
- `AppleScript available: false` → Installation issue
- `Accessibility permissions: false` → Permission issue

## Advanced Debugging

### Enable Persistent Debug Mode
```javascript
getAppComponent('fileBrowser').enableWindowDetectionDebug()
```

### Check Raw Process List
```javascript
getWindowDiagnostics().then(result => {
    console.log('All relevant processes:', result.diagnostics.processes.relevant);
})
```

### Test Alternative Detection Method
```javascript
// This will be available after the enhanced detection is implemented
getAppComponent('fileBrowser').windowDetector.getOpenFilesWithFallback()
```

## Cursor-Specific Considerations

1. **ToDesktop Framework:** Cursor is built using ToDesktop, which may affect process names and AppleScript compatibility
2. **Bundle ID:** The bundle ID `com.todesktop.230313mzl4w4u92` might be version-specific
3. **Window Titles:** Cursor may use different title formats than VS Code
4. **Permissions:** Cursor itself may need additional permissions to be automated

## Getting Help

If you're still having issues:

1. Run `debugWindowDetection()` and copy the full console output
2. Note your macOS version and Cursor version
3. Include the results of manual AppleScript tests
4. Provide screenshots of System Preferences > Accessibility settings

The debug output will show exactly where the detection process is failing and help identify the root cause.