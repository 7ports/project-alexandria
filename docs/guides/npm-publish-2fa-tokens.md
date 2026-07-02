---
id: npm-publish-2fa-tokens
type: guide
title: "Publishing to npm — 2FA / access token gotcha"
summary: ""
tags: [dev-tooling]
status: active
created: 2026-06-17
updated: 2026-06-17
embedding_version: 1
---

# Publishing to npm — 2FA / access token gotcha

How to publish a package to the public npm registry **non-interactively** (CI, agents, or a CLI session where you can't paste a live OTP).

## The core gotcha

npm's registry now requires every publish to be authenticated by **either**:
- an interactive **2FA OTP** (`npm publish --otp=123456`), **or**
- an **access token that carries the "bypass 2FA" capability**.

A plain `npm login` (username/password, no 2FA) produces a session the registry **rejects for publishing** with:

```
npm error code E403
npm error 403 Forbidden - PUT https://registry.npmjs.org/<pkg>
npm error 403 Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

This happens **even if 2FA is not enabled on the account at all** — you then can't produce an OTP either, so a token is the only path.

## Token types — which ones can publish

| Token | Publishes non-interactively? |
|---|---|
| Classic → **Automation** | ✅ yes — built for CI, bypasses 2FA |
| Classic → **Publish** | ❌ no — still demands an OTP (the trap) |
| Classic → Read-only | ❌ no |
| **Granular** access token **with "Allow this token to bypass 2FA" enabled** | ✅ yes |
| Granular token without the bypass toggle | ❌ no |

For the **first publish of a brand-new package**, use a **Classic → Automation** token (or a Granular token scoped to **All packages** — granular tokens scoped to "select packages" can't target a package that doesn't exist on the registry yet).

## Steps

1. Create the token: npmjs.com → **Access Tokens** → **Generate New Token** → **Classic Token** → **Automation**.
2. Configure it (writes to user `~/.npmrc`, not the repo — keep it out of version control):
   ```bash
   npm config set //registry.npmjs.org/:_authToken=npm_XXXXXXXX
   ```
   (Note: `npm config get //registry.npmjs.org/:_authToken` is **protected** and errors — that's expected, not a failure.)
3. Publish:
   ```bash
   npm publish
   ```
   Success prints `+ <pkg>@<version>`.
4. Verify (allow ~10s registry/CDN propagation — a 404 immediately after a first publish is normal):
   ```bash
   npm view <pkg> version dist.shasum
   ```

## Pre-publish hygiene
- `npm publish --dry-run` and `npm pack` are **auth-free** — use them to confirm the exact tarball contents (the `files` allowlist), version, and that no secrets/runtime dirs leak. A transient `bin ... invalid and removed` warning during a *failed* publish can be a red herring; confirm with `npm pack` whether `bin` actually survives into the tarball (it usually does).
- Unscoped packages publish as public by default (no `--access public` needed).

## Platform note
Verified on Windows (Git Bash / PowerShell), npm with account-level 2FA **off**. The Automation-token path is the reliable cross-platform way to publish from automation or an agent session that cannot supply a live OTP.
