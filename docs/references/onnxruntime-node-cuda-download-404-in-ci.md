---
id: onnxruntime-node-cuda-download-404-in-ci
type: reference
title: "onnxruntime-node npm install fails in Linux CI: CUDA binary download 404"
summary: "onnxruntime-node's linux-x64 postinstall downloads CUDA GPU binaries from GitHub releases; when that asset 404s, npm install fails. Set ONNXRUNTIME_NODE_INSTALL_CUDA=skip for CPU-only use."
tags:
  - onnxruntime-node
  - npm
  - github-actions
  - ci
  - huggingface-transformers
  - cuda
status: verified
embedding_version: 1
---

# onnxruntime-node npm install fails in Linux CI: CUDA binary download 404

## Symptom
`npm install` (or `npm ci`) fails on `ubuntu-latest` GitHub Actions runners, often with no change to your repo:

```
npm error path .../node_modules/onnxruntime-node
npm error command sh -c node ./script/install
npm error Downloading "https://github.com/microsoft/onnxruntime/releases/download/v1.21.0/onnxruntime-linux-x64-gpu-1.21.0.tgz"...
npm error `nvcc` not found. Assuming CUDA 12.
npm error Error: Failed to download the binaries: 404 Not Found.
```

`onnxruntime-node` is often a transitive dependency, for example of `@huggingface/transformers` (transformers.js).

## Cause
On linux-x64, `onnxruntime-node`'s postinstall script (`script/install.js`) downloads the CUDA execution-provider binaries from the onnxruntime GitHub release, because they are too large for the npm registry. It does this even when no GPU is present: it just assumes CUDA 12. If that release asset is removed or unreachable, the whole install fails. Windows and macOS installs are not affected.

## Fix
CPU inference doesn't need the CUDA binaries, so skip the download:

```yaml
# GitHub Actions: workflow-level env
env:
  ONNXRUNTIME_NODE_INSTALL_CUDA: skip
```

Equivalent alternatives:
- `npm install --onnxruntime-node-install-cuda=skip`
- `npm_config_onnxruntime_node_install_cuda=skip` (env var)
- `.npmrc`: `onnxruntime-node-install-cuda=skip`

ONNX Runtime still works on CPU. Only the CUDA EP is unavailable.

## Notes
- The same applies to Docker builds on linux/amd64 images that run `npm install`.
- Other accepted values are `v11`, `v12`, or a bare flag that forces the install (autodetects CUDA via `nvcc`).
