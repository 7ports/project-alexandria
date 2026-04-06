# Project Voltron — Docker Agent Setup

## Overview

Project Voltron runs specialist Claude Code agents inside Docker containers via `run_agent_in_docker`. The container mounts the project workspace and Claude auth credentials, then invokes `claude --dangerously-skip-permissions` autonomously.

---

## Known Issues & Fixes

### 1. Git commits fail inside Docker ("Please tell me who you are")

**Root cause:** `node:20-slim` has no git user identity configured for the container user (`voltron`). Git requires `user.name` and `user.email` to commit.

**Fix A — Dockerfile (baked in, survives rebuilds):**
```dockerfile
USER voltron
RUN git config --global user.name "Voltron Agent" && \
    git config --global user.email "voltron@project-hammer.local" && \
    git config --global --add safe.directory /workspace
```

**Fix B — Runtime env vars in `project-voltron/src/index.js` (works immediately, no rebuild needed):**

In the `run_agent_in_docker` tool, add a `gitEnvArgs` array alongside `authEnvArgs`:
```javascript
const gitEnvArgs = [
  "-e", "GIT_AUTHOR_NAME=Voltron Agent",
  "-e", "GIT_AUTHOR_EMAIL=voltron@project-hammer.local",
  "-e", "GIT_COMMITTER_NAME=Voltron Agent",
  "-e", "GIT_COMMITTER_EMAIL=voltron@project-hammer.local",
];

const dockerArgs = [
  "run", "--rm",
  "--entrypoint", "bash",
  ...authEnvArgs,
  ...gitEnvArgs,   // <-- add this
  ...
]
```

`GIT_AUTHOR_*` / `GIT_COMMITTER_*` env vars override git config entirely — they work even on cached images that predate the Dockerfile fix.

**Apply both fixes** for belt-and-suspenders. The env var fix is immediate; the Dockerfile fix ensures new image builds are correct from scratch.

---

### 2. `git` not installed in `node:20-slim`

**Root cause:** `node:20-slim` is a minimal Debian image — git is not included.

**Fix:** Add to Dockerfile.voltron before the `useradd` step:
```dockerfile
RUN apt-get update && apt-get install -y git ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
```

After updating Dockerfile.voltron, rebuild:
```bash
docker build -f Dockerfile.voltron -t voltron-agent .
```

Verify:
```bash
docker run --rm --entrypoint bash voltron-agent -c "git config --global user.email && git config --global user.name"
# Should print: voltron@project-hammer.local / Voltron Agent
```

---

### 3. Claude OAuth token not passed to container

**Root cause:** `CLAUDE_CODE_OAUTH_TOKEN` lives in the host process environment (not a file), so simple `-v` mounts don't expose it.

**Fix:** Pass it explicitly via `-e` in the Docker run args (already implemented in Voltron v2.3.7+):
```javascript
if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  authEnvArgs.push("-e", `CLAUDE_CODE_OAUTH_TOKEN=${process.env.CLAUDE_CODE_OAUTH_TOKEN}`);
}
```

---

### 4. Agent hits max_turns before committing

**Symptom:** Agent writes files but runs out of turns before reaching the `git commit` step.

**Fixes:**
- Increase `max_turns` to 40–50 for complex tasks
- Scope the task prompt tightly — pre-read files for the agent so it doesn't spend turns doing that itself
- As a fallback, implement the task directly from the host (the scrum-master can write code directly when Docker agents are unreliable)

---

## Dockerfile.voltron — Correct Template

```dockerfile
FROM node:20-slim
RUN apt-get update && apt-get install -y git ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*
RUN npm install -g @anthropic-ai/claude-code
RUN useradd -m -s /bin/bash voltron
USER voltron
RUN git config --global user.name "Voltron Agent" && \
    git config --global user.email "voltron@project-hammer.local" && \
    git config --global --add safe.directory /workspace
WORKDIR /workspace
ENTRYPOINT ["claude"]
```

---

## Parallel Execution Strategy

When multiple independent tasks need to run in parallel:

1. Create separate git branches (one per parallel workstream)
2. Use the **Agent tool** (not `run_agent_in_docker`) for parallel execution — the Agent tool runs on the host with full filesystem access and reliable git
3. Assign each agent to a different branch to avoid commit conflicts
4. QA agent merges all branches at the end

`run_agent_in_docker` is inherently serial (one container at a time via `spawnSync`). For true parallelism, use the Agent tool.
