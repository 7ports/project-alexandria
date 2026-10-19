---
id: transformers-js-windows-model-lock
type: reference
title: "Transformers.js on Windows: 'system error number 13' loading an ONNX model"
summary: "Why Transformers.js (Node) fails to load a freshly cached model on Windows with a sharing violation, and the buffer-loading fix that retries can't match."
tags:
  - transformers.js
  - onnxruntime-node
  - windows
  - file-locking
  - embeddings
  - node
status: verified
embedding_version: 1
---

# Transformers.js on Windows: "system error number 13" loading an ONNX model

## Symptom

On Windows, the first `pipeline(...)` call on a cold cache fails intermittently. CI runners are the usual place to see it:

```
Load model from <cacheDir>\<org>\<model>\onnx\model.onnx failed:system error number 13
```

Error 13 is a sharing violation, not a corrupt file.

## Cause

On Node with `env.useFSCache = true` (the default), Transformers.js (v3.x, `models.js` `getSession`) passes onnxruntime-node the model's **path**: `return_path = IS_NODE_ENV && env.useFSCache`. onnxruntime opens the file itself with a share mode that **denies writers**. Any other handle on the file with write access therefore fails the load. On Windows, two things hold such a handle:

- Transformers.js's own `FileCache.put`, which calls `fileStream.close()` without awaiting it, so the download "resolves" while the write handle is still open.
- Antivirus (Defender) scanning the freshly written file, which can take many seconds on a ~100+ MB model.

**Retry/backoff doesn't fix it**: 7.5 s of exponential backoff was observed still failing in CI.

## Fix: hand onnxruntime a buffer, never a path

Node's `fs` opens files sharing read/write/delete with everyone, so a read through Node coexists with the lock. Then onnxruntime gets a `Uint8Array`:

```js
const { pipeline, env } = await import('@huggingface/transformers');
env.localModelPath = MODELS_DIR;      // warm cache is read from <MODELS_DIR>/<model>/<file>
env.allowLocalModels = true;
env.allowRemoteModels = true;
env.useFSCache = false;               // => return_path false => buffer
env.useCustomCache = true;            // ...but still persist downloads:
env.customCache = {
  async match() { return undefined; },          // the local-path read already serves hits
  async put(key, response) {                    // key = <host>/<model>/resolve/<rev>/<file>
    const m = /^\/(.+?)\/resolve\/main\/(.+)$/.exec(new URL(key).pathname);
    if (!m) return;
    const dest = path.resolve(MODELS_DIR, decodeURIComponent(m[1]), decodeURIComponent(m[2]));
    if (!dest.startsWith(MODELS_DIR + path.sep)) return;
    const tmp = `${dest}.${process.pid}.tmp`;
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    try {
      await fs.promises.writeFile(tmp, Buffer.from(await response.arrayBuffer())); // awaited close
      await fs.promises.rename(tmp, dest);                                         // atomic
    } catch (e) { await fs.promises.rm(tmp, { force: true }); throw e; }
  },
};
```

Notes:

- With `useFSCache = false` and no custom cache, Transformers.js downloads on every cold start and **caches nothing**, which is why the custom `put` is needed. Transformers.js `.catch`es errors from that `put` and logs them, so a failed cache write never fails the load.
- Keep the same `<model>/<file>` layout as `FileCache` so existing caches stay warm.
- Set these **before the first `pipeline()` call** in the process. Flipping `useFSCache` after a failed load and retrying in the same process was observed to still pass the path.
- **Cost:** one transient JS copy of the model (≈ model size in peak RSS) while the session is built. After GC, steady-state RSS matches the path-based load.

## Deterministic repro / regression test (Windows)

Node can't choose a share mode, so hold the lock from PowerShell, the way a scanner would:

```powershell
$fs = [System.IO.File]::Open('<path>\model.onnx','Open','ReadWrite','Read'); Start-Sleep 30; $fs.Close()
```

While the lock is held, a path-based load fails with error 13 and a buffer-based load succeeds. In a test, spawn that PowerShell with `[Console]::In.ReadLine()` in place of the sleep. Wait for it to print a "locked" marker, embed in a **fresh** Node child process, then release the lock by writing a newline to its stdin.
