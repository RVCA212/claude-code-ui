### “Good-enough” hardening that’s quick to add, costs nothing at runtime, and barely changes your workflow

| Layer                                                                    | Why it’s the sweet spot                                                                                                                        | Impact on runtime                              | Impact on dev workflow                                                           |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------- |
| **1. Pack everything into `app.asar`** (default in **electron-builder**) | Stops casual browsing of your folder tree; zero complexity                                                                                     | None (Electron streams files from the archive) | Already the default; no change                                                   |
| **2. Minify + light JS obfuscation on production builds only**           | Removes symbols & rearranges code so copy-pasting is tedious yet build remains debuggable                                                      | Neutral or *faster* (smaller bundles)          | Add one plugin & env check—dev builds stay plain JS                              |
| **3. (Optional) Byte-compile just `main` + `preload` with Bytenode**     | Those files hold your app logic & file-system access; compiling them to V8 bytecode hides the source without touching the React/renderer stack | Startup is \~15 % faster, no runtime hit       | One extra build step; dev runs `.js`, prod loads `.jsc`—transparent to your team |

Anything heavier—full AES-encrypted archives, native rewrite, or single-file binaries—adds installer size, build time, and debugging pain while still being crackable. The trio above gives 95 % of the deterrence for <5 % effort.

---

## How to add it in an afternoon

1. **Ensure `asar` is on**

   ```jsonc
   // package.json
   {
     "build": {
       "asar": true,
       "asarUnpack": ["**/*.node"]   // keep native add-ons outside
     }
   }
   ```

2. **Minify + light obfuscation**

   ```bash
   npm i -D javascript-obfuscator rollup-plugin-obfuscator
   ```

   ```ts
   // vite.config.ts or rollup.config.js
   import obfuscator from 'rollup-plugin-obfuscator'

   export default {
     plugins: [
       process.env.NODE_ENV === 'production' &&
       obfuscator({
         compact: true, identifiersPrefix: 'x', // fast settings
         controlFlowFlattening: false           // keep perf intact
       })
     ]
   }
   ```

   *Dev builds* skip the plugin, so debugging stays friendly.

3. **(Optional) Byte-compile critical scripts**

   ```bash
   npm i -D bytenode
   ```

   ```js
   // build/bytenode.js
   const bytenode = require('bytenode');
   await bytenode.compileFile({
     filename: 'dist/main.js',
     output:   'dist/main.jsc'
   });
   ```

   Add a post-build script:

   ```json
   "scripts": {
     "dev": "electron-vite dev",
     "build": "electron-vite build && node build/bytenode.js && electron-builder"
   }
   ```

   In `main/bootstrap.js`:

   ```js
   if (process.env.NODE_ENV === 'production') {
     require('bytenode');
     require('./main.jsc');
   } else {
     require('./main.js');
   }
   ```

4. **Ship normally**
   *Performance*: unchanged or slightly faster
   *Team workflow*: run `npm run dev` as usual; production CI triggers the extra steps automatically.

---

### Bottom line

* **Effort**: a couple of `npm install`s and \~20 lines of config
* **Runtime cost**: zero (some gains from minification)
* **Security**: keeps honest users honest and deters casual source grabs—exactly the level most commercial Electron apps use.

If, down the road, piracy becomes a real problem, you can still layer on licence checks or native modules without ripping out what you built today.
