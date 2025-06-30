Below is a pragmatic, “no-mystery-meat” checklist your developer can follow to bolt deterministic file-checkpointing onto the existing Electron + Claude Code workflow. The sequence is split into **core local flow (recommended)** and **optional cloud sync** so you can phase features in.

---

## 0. Guiding principles

| Principle                          | Why it matters in this app                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Immutable history**              | You never mutate prior checkpoints—only append.                                                           |
| **Atomic writes**                  | A half-written snapshot makes rollbacks dangerous; always write temp → rename.                            |
| **Out-of-band**                    | Keep checkpoints *adjacent* to the real project but outside the edit path so Claude doesn’t clobber them. |
| **Human-readable + diff-friendly** | If a user must debug a checkpoint by hand, plain text patches win.                                        |

---

## 1. Decide on format & location

1. **Create a hidden folder at project root**

   ```text
   .claude-checkpoints/
     ├─ metadata.db  (SQLite)
     └─ blobs/
         ├─ <uuid>.patch   (unified diff)
         └─ <uuid>.txt     (full file, rare fallback)
   ```
2. **Metadata schema (SQLite)**

   ```sql
   CREATE TABLE checkpoints (
       id TEXT PRIMARY KEY,          -- uuid
       session_id TEXT,
       message_id TEXT,
       file_path TEXT,               -- absolute on disk
       ts DATETIME DEFAULT CURRENT_TIMESTAMP,
       patch_path TEXT,              -- relative to .claude-checkpoints/blobs
       full_snapshot INTEGER         -- 0 = diff, 1 = whole file
   );
   ```

   *Rationale:* Weakly-structured JSON would work, but SQLite gives you indexes and queryable history for free.

---

## 2. Hook the “Edit” tool stream

Your log already shows the incoming JSON:

```json
{
  "type":"tool_use",
  "name":"Edit",
  "input": {
      "file_path": "...index.html",
      "old_string": "...",
      "new_string": "..."
  }
}
```

Add a **checkpoint handler** inside the `stdout` line-processing loop **before** you apply the actual file write:

```ts
if (parsed.type === 'tool_use' && parsed.name === 'Edit') {
   await checkpointEdit(parsed.input, sessionId, parsed.id /*tool_use id*/, messageId);
}
```

### `checkpointEdit` (pseudo-code)

```ts
async function checkpointEdit({file_path, old_string, new_string},
                              sessionId, toolUseId, messageId) {
  const patch = createUnifiedDiff(file_path, old_string, new_string); // use 'diff' or jsdiff
  const patchId = uuidv4();
  const patchFile = path.join(checkpointDir, 'blobs', `${patchId}.patch`);
  await fs.writeFile(patchFile + '.tmp', patch);
  await fs.rename(patchFile + '.tmp', patchFile);      // atomic

  await db.run(
     `INSERT INTO checkpoints
        (id, session_id, message_id, file_path, patch_path, full_snapshot)
      VALUES (?,?,?,?,?,0)`,
     patchId, sessionId, messageId, file_path, path.relative(checkpointDir, patchFile)
  );
}
```

> **Why diff over full copy?**
>
> 1. Blazing fast for large projects.
> 2. Human-inspectable.
> 3. Easy to generate inverse patch for rollback.

Fallback: whenever `old_string` is *empty* (e.g., create file) or file is binary, store the whole blob and set `full_snapshot = 1`.

---

## 3. Robust rollback API

Implement an IPC route:

```ts
ipcMain.handle('checkpoint-rollback', async (_e, checkpointId) => {
   const row = await db.get('SELECT * FROM checkpoints WHERE id=?', checkpointId);
   if (!row) throw new Error('Checkpoint not found');

   if (row.full_snapshot) {
       await fs.writeFile(row.file_path + '.bak', await fs.readFile(row.file_path));
       await fs.copyFile(path.join(checkpointDir, row.patch_path), row.file_path);
   } else {
       const patch = await fs.readFile(path.join(checkpointDir, row.patch_path), 'utf8');
       await applyReversePatch(row.file_path, patch); // use 'patch-package' or shell 'patch -R'
   }
});
```

> Keep a `.bak` one-shot copy before rollback so users can *undo the undo*.

---

## 4. Renderer-side UI

1. **History panel**

   * Show chronological list of checkpoints grouped by file.
   * “View diff” → opens Monaco diff viewer comparing current disk vs checkpoint.
   * “Restore” → triggers `checkpoint-rollback`.

2. **Session filter**

   * Default to “This conversation”. Other filters: “All”, “Today”, “Last 7 days”.

3. **Autosnap toggle**

   * Let power users disable snapshots for huge binary edits.

---

## 5. Auto-garbage collection

Run a daily timer (Electron main) to:

* Cull checkpoints older than *N* days (configurable).
* Or keep the latest *K* per file.

SQLite row delete → unlink patch file.

---

## 6. Safety nets

| Concern                             | Mitigation                                                      |
| ----------------------------------- | --------------------------------------------------------------- |
| Disk bloat                          | diff-first, GC job.                                             |
| Partially-written diff (power loss) | write temp → rename.                                            |
| Simultaneous edits                  | DB is single-process; wrap writes in `BEGIN IMMEDIATE` to lock. |
| Binary files                        | detect via `isTextOrBinary`; store full copy or skip.           |

---

## 7. Optional: Git-backed mode

If the user’s project **already** lives in a Git repo:

1. Initialize if `.git` absent: `git init && echo '.claude-checkpoints' >> .gitignore`.
2. Replace diff writing with simple `git add -p file && git commit -m "claude edit: <toolUseId>"`.
3. Map `checkpointId` → commit SHA in DB.

Pros: leverages Git diff engine + branch/merge; cons: slower on giant monorepos.

---

## 8. Optional: Cloud sync (S3/GCS/etc.)

* Run a background job that uploads **compressed** `.patch.gz` files and the SQLite DB every N minutes.
* Tag uploads with device ID so multiple machines don’t race.
* Use presigned URLs to avoid bundling long-lived keys in the client.

Simple tool: \[`rclone sync .claude-checkpoints remote:claude-backups/<user>/<machine>`].

---

## 9. Deliverables checklist

| Item                                        | Owner         | Status |
| ------------------------------------------- | ------------- | ------ |
| `.claude-checkpoints` folder creation logic | Dev           |        |
| SQLite setup helper                         | Dev           |        |
| `checkpointEdit` util                       | Dev           |        |
| IPC rollback route                          | Dev           |        |
| Renderer history UI                         | Front-end Dev |        |
| GC cron job                                 | Dev           |        |
| Unit tests for diff ↔ rollback              | QA            |        |
| Docs / README section                       | Tech Writer   |        |

---

## 10. Roll-out plan

1. **Dev branch** – integrate local checkpoints, behind “Enable Snapshots” toggle.
2. **QA** – stress-edit large files; power-kill app mid-write, ensure rollback.
3. **Beta release** – gather telemetry on disk use & performance.
4. **v1.1** – ship Git or cloud mode if demanded.

---

### TL;DR

*Intercept every `tool_use : Edit`, emit a unified diff (or full blob) into a hidden project-local store, index it in SQLite, expose history & rollback via IPC + diff viewer.*
That gives you deterministic, fast, offline checkpoints today—and paves the way for Git or cloud sync tomorrow.
