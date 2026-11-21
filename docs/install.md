# alexandria

> Alexandria is a shared tooling knowledge base for AI coding agents, served over MCP. It holds setup guides, concepts, references and articles, searches them semantically, and lets the agent record what it learns so the next project starts ahead.

I want you to install the Alexandria MCP server for me on this machine and connect it to the coding agent I'm using. Work through the steps below in order. Run commands yourself, show me what you're about to change before you edit any config file, and stop to ask me if something fails in a way these steps don't cover.

OBJECTIVE: Clone Alexandria, install its MCP server, register it with my coding agent, and confirm its tools work.

DONE WHEN: `npm run doctor` in `<clone>/mcp-server` exits 0, and my agent lists an `alexandria` MCP server (after a restart, if the agent needs one).

## TODO

- [ ] Check prerequisites (git, Node.js 22 or newer)
- [ ] Ask me where to put the clone, and whether to use a fork
- [ ] Clone the repository
- [ ] Install the server's dependencies
- [ ] Run the doctor check
- [ ] Register the server with my agent
- [ ] Allow its tools (Claude Code only)
- [ ] Tell me to restart, then onboard

## Step 1: Check prerequisites

```bash
git --version
node --version
```

- Node.js must be **22 or newer**. The server's native modules (`better-sqlite3`, `sqlite-vec`, `onnxruntime-node`) ship prebuilt binaries for Node 22+ only, so older versions fall back to compiling from source, which needs a C++ toolchain. If Node is older than 22, stop and ask me to upgrade (for example with nvm, fnm or the installer from nodejs.org) rather than installing build tools.
- On Windows, use Git Bash or PowerShell. Avoid running the install from inside WSL or a Docker container if the agent runs on the Windows host: native binaries are platform-specific, and a `node_modules` folder built for Linux will not load on Windows.

## Step 2: Choose where it lives

Ask me two things:

1. **Where to clone it.** Suggest `~/project-alexandria` (on Windows, `%USERPROFILE%\project-alexandria`). It must be a permanent location: the MCP config points at this folder, and the knowledge base is the clone itself.
2. **Fork or read-only.** When the agent records knowledge, the server writes a markdown file into the clone and commits it, then tries to push to `origin`. Cloning the upstream repository works fine for reading, and new docs stay as local commits because the push is refused. If I want my agent's write-ups to sync to GitHub, I should fork `7ports/project-alexandria` first and you should clone my fork.

If a clone already exists at the chosen path, don't clone again: run `git -C <clone> pull --ff-only` and continue.

## Step 3: Clone

```bash
git clone https://github.com/7ports/project-alexandria.git <clone>
```

Use the fork's URL instead if I chose a fork.

## Step 4: Install the server

```bash
cd <clone>/mcp-server
npm install
```

This takes a minute or two. It downloads prebuilt native binaries for this OS. It does not touch anything outside `<clone>/mcp-server`.

## Step 5: Run the doctor

```bash
cd <clone>/mcp-server
npm run doctor
```

The doctor loads every native module and builds one embedding. The first run downloads the embedding model (about 120 MB) into `<clone>/mcp-server/.models/`, so allow a few minutes.

- Exit code 0: healthy. Continue.
- `WARN` lines: the server works on a slower path. Tell me the remedy it prints and continue.
- `FAIL` lines: each one names its fix. Apply it (usually deleting `node_modules` and running `npm install` again on this machine), then rerun the doctor. If it still fails, stop and show me the output.

## Step 6: Register the server with my agent

You need the **absolute path** to `<clone>/mcp-server/index.js`. Use forward slashes on Windows too (`C:/Users/me/project-alexandria/mcp-server/index.js`). Register it under the name `alexandria`, at user (global) scope so every project gets it. If an `alexandria` server is already registered, show me the existing entry and ask before replacing it.

Use the section for the agent you are:

**Claude Code**

```bash
claude mcp add --scope user alexandria -- node <abs-path>/mcp-server/index.js
```

**OpenAI Codex CLI**

```bash
codex mcp add alexandria -- node <abs-path>/mcp-server/index.js
```

**Gemini CLI**

```bash
gemini mcp add --scope user alexandria node <abs-path>/mcp-server/index.js
```

**VS Code (GitHub Copilot agent mode)**

```bash
code --add-mcp '{"name":"alexandria","type":"stdio","command":"node","args":["<abs-path>/mcp-server/index.js"]}'
```

**Cursor**: merge this into `~/.cursor/mcp.json` (create the file if it doesn't exist, and keep any servers already in it):

```json
{
  "mcpServers": {
    "alexandria": {
      "command": "node",
      "args": ["<abs-path>/mcp-server/index.js"]
    }
  }
}
```

**Claude Desktop, Windsurf, or any other MCP client**: add the same `alexandria` entry to the client's `mcpServers` config.

Then check that the registration took. In Claude Code, `claude mcp list` should list `alexandria`; in Codex, `codex mcp list`.

## Step 7: Allow Alexandria's tools (Claude Code only)

So that I'm not asked to approve every lookup, add `"mcp__alexandria__*"` to the `permissions.allow` array in `~/.claude/settings.json`. Create the array if it doesn't exist, and keep everything else in the file unchanged. Show me the diff before saving. Skip this step for other agents.

## Step 8: Restart and onboard

Most agents only load MCP servers at startup. Tell me to restart my agent. After the restart, the first thing to do is call the `get_onboarding` tool: it returns the recall-before / record-after contract and memory templates, which you should save to your memory or instructions file so the habit persists across sessions.

Then try one lookup, for example `recall_context` with the topic `"git"`, and show me the result.

## Troubleshooting

- **Search results say `DEGRADED READ PATH`**: the semantic index isn't loading, so search falls back to substring matching. Run `npm run doctor` in `<clone>/mcp-server` and apply the fix it names.
- **`better_sqlite3.node is not a valid Win32 application`**: `node_modules` was installed by a different OS (often a container sharing the folder). Delete `<clone>/mcp-server/node_modules` and run `npm install` on the machine that runs the agent.
- **The agent doesn't list `alexandria` after a restart**: check that the path in the config is absolute and points at `index.js`, and that `node --version` in a fresh terminal is still 22+.

## Reference

- Full server guide (markdown): https://7ports.github.io/project-alexandria/guides/alexandria-mcp-server.md
- Repository: https://github.com/7ports/project-alexandria
- Index of everything in the knowledge base: https://7ports.github.io/project-alexandria/guides/manifest.json

EXECUTE NOW: Work through the TODO list above, starting with Step 1, until the DONE WHEN condition is met. Then tell me what you installed, where, and which config files you changed.
