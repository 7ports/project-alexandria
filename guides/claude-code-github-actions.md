# Claude Code in GitHub Actions

## Installation
```bash
npm install -g @anthropic-ai/claude-code
```
Requires Node.js 18+.

## Key CLI flags for CI/CD

| Flag | Purpose |
|---|---|
| `-p "prompt"` | Non-interactive mode — runs prompt and exits |
| `--dangerously-skip-permissions` | Bypass all permission prompts (use in isolated containers only) |
| `--model MODEL_ID` | Specify the model to use (e.g., `claude-sonnet-4-6`, `claude-opus-4-6`) |
| `--max-turns N` | Limit agentic iterations to prevent runaway cost |
| `--allowedTools "Read,Edit,Bash"` | Pre-approve specific tools |
| `--bare` | Skip CLAUDE.md, hooks, MCP auto-discovery (faster, reproducible) |
| `--output-format json` | Structured output for downstream parsing |

## Required secret
`ANTHROPIC_API_KEY` — set as a GitHub repository secret.

## Required repository setting
**Settings → Actions → General → Workflow permissions → "Allow GitHub Actions to create and approve pull requests"** must be enabled for `gh pr create` to work with `GITHUB_TOKEN`.

## Minimal workflow pattern (scheduled, commits changes, opens PR)

```yaml
on:
  schedule:
    - cron: '0 10 * * 1,3,5'
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g @anthropic-ai/claude-code
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      - env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
        run: |
          claude \
            --dangerously-skip-permissions \
            --model claude-sonnet-4-6 \
            --max-turns 40 \
            -p "$(cat .github/prompts/my-prompt.md)"
      - env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          if git log origin/main..HEAD --oneline | grep -q .; then
            git push origin HEAD:my-branch
            gh pr create --title "..." --body "..." --base main --head my-branch
          fi
```

## Official action (for PR/issue comment triggers)

```yaml
- uses: anthropics/claude-code-action@v1
  with:
    anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
    prompt: "Review this PR for security issues"
    claude_args: "--max-turns 5"
```
Best for: responding to @claude mentions in PRs/issues.

## Gotchas

### YAML heredoc inside `run:` blocks breaks parsing

**CRITICAL:** Never use shell heredocs (like `<<'EOF'`) with content at column 0 inside a YAML `run: |` block. YAML block scalars terminate at the first non-empty line with less indentation than the content level. Content at column 0 (like markdown headers `##` or heredoc delimiters) terminates the block early, causing a "workflow file issue" error.

**Broken:**
```yaml
run: |
  gh pr create --body "$(cat <<'EOF'
## This terminates the YAML block scalar
Content here...
EOF
)"
```

**Working — use ANSI-C quoting instead:**
```yaml
run: |
  gh pr create \
    --body $'## Title\n\nBody content here.\n\nTriggered by: ${{ github.event_name }}'
```

The `$'...'` syntax keeps everything on one properly-indented line while `\n` produces newlines at runtime.

### Other gotchas

- `--dangerously-skip-permissions` only safe in isolated containers (GitHub Actions runners are ephemeral/isolated — OK to use)
- Without `--allowedTools` or `--dangerously-skip-permissions`, agent may hang waiting for permission approval
- Without `--bare`, CLAUDE.md is auto-loaded — useful when you want project context; skip with `--bare` for speed
- `--max-turns` is critical for cost control — set based on expected task complexity
- Keep the prompt in a versioned file (`.github/prompts/`) rather than inline in the YAML
- `gh pr create` requires the repository setting "Allow GitHub Actions to create and approve pull requests" — without it, the `GITHUB_TOKEN` cannot create PRs (error: "GitHub Actions is not permitted to create or approve pull requests")
- The `ANTHROPIC_API_KEY` must have credit balance — "Credit balance is too low" means the API key's workspace has no credits. Credits are per-workspace, not per-key; verify you're topping up the same workspace the key belongs to

## Prompt file pattern

Store prompts in `.github/prompts/my-task.md` and reference with `$(cat .github/prompts/my-task.md)`. This makes prompts versioned, reviewable, and editable without touching workflow YAML.

---

*Last updated: 2026-04-05*
*Verified on: ubuntu-latest, Node.js 20, Claude Code CLI*
