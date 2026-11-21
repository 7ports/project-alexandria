---
id: agent-installers-for-mcp-servers-pick-by-distribution
type: concept
title: "Agent installers for MCP servers: pick the pattern by how the server is distributed"
summary: "One-click deeplinks, add-mcp and .mcpb only work for servers published as a package or URL. A clone-based local server needs an agent-executable install file (install.md layout) plus a copy-prompt button instead."
tags:
  - mcp-server
  - onboarding
  - documentation
  - agents
  - install
status: active
source_urls:
  - "https://www.mintlify.com/blog/install-md-standard-for-llm-executable-installation"
  - "https://www.installmd.org"
  - "https://www.mintlify.com/blog/skill-md"
  - "https://neon.com/blog/add-mcp"
  - "https://cursor.com/docs/context/mcp/install-links"
  - "https://aws.amazon.com/blogs/compute/set-up-your-ai-coding-agent-to-build-with-aws-step-functions/"
  - "https://trigger.dev/changelog/ai-agent-setup"
  - "https://code.claude.com/docs/en/plugins-reference"
embedding_version: 1
---

# Agent installers for MCP servers: pick the pattern by how the server is distributed

## Summary

There are several ways to let a coding agent (or its user) install an MCP server "in one step". Which ones are available depends almost entirely on **how the server is distributed**. Deeplinks and installer CLIs need a stable command such as `npx -y <pkg>` or a URL. A server that has to run from a git clone, for example because it has native modules or writes back into its own repository, can't use them. Its best option is an agent-executable install file plus a "copy this prompt" button.

## The patterns (late 2026)

| Pattern | What the user does | Needs |
|---|---|---|
| **Remote MCP URL** + `claude mcp add --transport http …` | Run one command | A hosted HTTP server |
| **Cursor deeplink** `cursor://anysphere.cursor-deeplink/mcp/install?name=<n>&config=<base64 of the inner server object>` | Click a badge | A command that is identical on every machine (an `npx`/`uvx` package or a URL) |
| **VS Code link** `vscode:mcp/install?<url-encoded {"name",…}>`, or `code --add-mcp '<json>'` | Click a link or run one command | Same as above |
| **`npx add-mcp <url-or-pkg> -a claude-code -a cursor -g`** | Run one command; it detects installed agents and writes each one's config | A package or URL |
| **`.mcpb` / `.dxt` bundle** | Double-click it (Claude Desktop); Claude Code plugins can also point at one | A self-contained bundle (native deps per platform are hard) |
| **Claude Code plugin** (`.claude-plugin/plugin.json` + `.mcp.json` using `${CLAUDE_PLUGIN_ROOT}`) | `/plugin install` | Code that can run from a read-only, versioned cache dir; dependencies go in `${CLAUDE_PLUGIN_DATA}` via a hook |
| **Agent-executable install file** (`/install.md`) + **copy-prompt button** | Paste one sentence into any agent | Nothing beyond a static page |

## Why the clone-based case is different

If the server has to live in a git clone, every per-machine value breaks the one-click patterns:

- The absolute path to `index.js` differs on every machine, so a deeplink's `config` can't be precomputed.
- Native modules (sqlite, onnxruntime, and so on) must be installed on the machine that runs the agent. A bundle or a plugin cache built elsewhere won't load.
- If the server commits writes into its own repo, a plugin's versioned cache directory loses those writes on every update.

The steps involve decisions only the user can make: where to clone, and whether to fork so that writes can be pushed. An LLM is well suited to adapting steps like these to each machine.

## The install.md layout

Mintlify proposed `/install.md`; it was later deprecated in favour of `skill.md`, but the shape is still the clearest one for "install this for me":

1. A `# product-name` H1, and a one-line `>` description.
2. A direct instruction: "I want you to install X for me…", including the **guardrails**: show config diffs before editing, and ask before replacing an existing entry.
3. `OBJECTIVE:` and `DONE WHEN:`. The second should be a verifiable command, such as a doctor script that exits 0.
4. A `## TODO` checkbox list, then one section per step with code blocks.
5. Per-agent register commands, so a single file works for every client. The agent picks the section that matches itself:
   - `claude mcp add --scope user <n> -- node <abs>/index.js`
   - `codex mcp add <n> -- node …`
   - `gemini mcp add --scope user <n> node …` (Gemini's default scope is *project*)
   - `code --add-mcp '{"name":…}'`
   - a JSON merge into `~/.cursor/mcp.json`
6. Troubleshooting, then `EXECUTE NOW: complete the TODO list until DONE WHEN holds, then report what you changed.`

The button on the website copies a short prompt, not the whole file: *"Install X for me: read https://…/install.md and follow its steps."* This keeps the clipboard small, the agent always fetches the current version, and users can read the file first (link to it next to the button). For Claude Code, `claude "<prompt>"` starts an interactive session with that prompt. Prefer it over piping the file into `claude -p`, because print mode can't stop to ask the user anything.

Add an `llms.txt` at the site root that links to install.md, so agents that browse the site find it.

## Gotchas

- A Cursor deeplink's `config` must be the **inner** server object. If you wrap it as `{ "<name>": {…} }`, Cursor reports invalid JSON.
- If a copy button's snippet carries a `// path` comment inside JSON, the copied text is invalid JSON. Put the file path in the caption.
- Copy buttons that float over a code block hide the end of any line that scrolls horizontally. Reserve a top strip (`padding-top`) for the button and let copyable commands wrap (`white-space: pre-wrap; overflow-wrap: anywhere`). Copying uses `textContent`, so wrapping doesn't change what is copied.
- `navigator.clipboard` only exists in secure contexts (https or localhost). Fall back to a hidden textarea with `execCommand('copy')`, and failing that, select the text.
- Keep the instructions in one place, or list every copy (install.md, homepage, README) in the project's contributor notes. Otherwise they drift apart when requirements change, for example a Node version bump.
- Installing from an untrusted install.md is like running a stranger's shell script, with the extra risk of prompt injection. Say so, and offer "read it first".

## Related

- [[headless-chrome-screenshots-color-scheme-webgl-narrow-viewports]] covers verifying the result visually.
