# Distributing "Claude Code Chat" for macOS (arm64)

This document is a practical, reproducible checklist for turning the existing Electron project into a signed, notarised DMG/ZIP that you can host on your own website.  It assumes you only want to ship the **arm64** build and **do not** plan to submit to the Mac App Store.

---

## 1  Prerequisites

1. **Apple Developer account** with the _Developer ID Application_ and _Developer ID Installer_ certificates.
2. Xcode ≥ 14 or the stand-alone `Xcode Command Line Tools` (for `codesign` & `notarytool`).
3. macOS 12.5 (21G72) or later on Apple Silicon (or Rosetta-2 for Intel).
4. **Environment variables / secrets** that electron-builder expects:
   ```bash
   # base64-encoded .p12 of your Developer ID Application certificate
   export CSC_LINK="file:///absolute/path/DeveloperID.p12"
   export CSC_KEY_PASSWORD="<p12-password>"

   # Notarisation credentials (App Store Connect API key is preferred)
   export APPLE_API_KEY="/absolute/path/api_key.p8"
   export APPLE_API_ISSUER="<issuer-id>"
   export APPLE_API_KEY_ID="<key-id>"
   ```
   If you still rely on the legacy Apple ID + app-specific password workflow, set `APPLE_ID`, `APPLE_ID_PASSWORD`, and `CSC_TeamId` instead.

## 2  Verify the electron-builder config

`package.json` already contains a minimal `build` block:
```json
"build": {
  "appId": "com.claudecode.chat",
  "productName": "Claude Code Chat",
  "directories": { "output": "dist" },
  "files": [
    "main.js", "preload.js", "renderer/**/*", "src/**/*", "node_modules/**/*", "package.json"
  ],
  "mac": {
    "category": "public.app-category.developer-tools"
  },
  "win": { "target": "nsis" },
  "linux": { "target": "AppImage" }
}
```
Add the following _mac_ tweaks to enable signing & notarisation:
```json5
"mac": {
  "target": [ "dmg", "zip" ],      // dmg for users, zip for auto-update
  "identity": "Developer ID Application",  // let electron-builder pick correct cert
  "hardenedRuntime": true,
  "entitlements": "build/entitlements.mac.plist"
},
"afterSign": "scripts/notarize.js"  // optional: custom notarisation step
```
> **Tip** Place your entitlements file under `build/entitlements.mac.plist`; keep it minimal (`com.apple.security.cs.allow-dyld-environment-variables = true`, etc.)

## 3  Build, sign, and notarise

1. Install deps & native modules for Apple Silicon:
   ```bash
   npm ci
   npm run rebuild    # ensures better-sqlite3, node-pty, etc. are arm64
   ```
2. Trigger the arm64 build (signing happens automatically):
   ```bash
   npm run build -- --mac --arm64
   # or: npx electron-builder --mac --arm64 --publish never
   ```
3. `electron-builder` will:
   * bundle the code in `renderer/` + `src/` into `Claude Code Chat.app`.
   * codesign the app with your Developer ID certificate.
   * create `Claude Code Chat-<version>.dmg` and `Claude Code Chat-<version>-mac.zip` under `dist/mac/`.
   * submit the DMG for notarisation via `notarytool`, poll status, and staple the ticket.

   Successful output ends with:
   ```text
   • notarize         succeeded
   • stapled          Claude Code Chat.app
   ```

## 4  Host the artefacts

Upload **both** of these files to your website:

* `Claude Code Chat-<version>.dmg` – what users download manually.
* `latest-mac.yml` – auto-update metadata consumed by `electron-updater` (already generated in `dist/`).

Put them in the same directory, e.g. `https://example.com/downloads/`, and keep the filenames intact. When you publish a new version, overwrite both files; Electron's auto-updater will compare the SHA-512 in `latest-mac.yml` with the user's current install.

### Sample Nginx snippet
```nginx
location /downloads/ {
  types { text/yaml yml; }
  add_header Access-Control-Allow-Origin *;
}
```

## 5  End-user install flow

1. User downloads the DMG.
2. macOS verifies the Developer ID signature and the stapled notarisation ticket.
3. User drags `Claude Code Chat.app` to `/Applications`.
4. On first-run, auto-update checks `https://example.com/downloads/latest-mac.yml`.

No "Gatekeeper" warnings appear because the app is both signed and notarised.

## 6  Troubleshooting

| Symptom | Fix |
|---------|-----|
| `codesign --verify --deep --strict` fails | Check entitlement keys & add `--entitlements` flag |
| Notarisation timeout | Increase `--timeout` in `notarytool` or use fastlane's `notarize` action |
| "Cannot download update" in app | Ensure `publish` block points to the same URL & both files are world-readable |

## 7  Future enhancements

* Create a **universal** binary (`--universal`) when Intel support is needed.
* Automate releases with GitHub Actions on new tags.
* Add Sparkle-style delta updates via `zip-differential` target.

---

> _Last updated: 2025-06-23_
