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
| `--max-turns N` | Limit agentic iterations to prevent runaway cost |
| `--allowedTools "Read,Edit,Bash"` | Pre-approve specific tools |
| `--bare` | Skip CLAUDE.md, hooks, MCP auto-discovery (faster, reproducible) |
| `--output-format json` | Structured output for downstream parsing |

## Required secret
`ANTHROPIC_API_KEY` — set as a GitHub repository secret.

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
          claude --dangerously-skip-permissions --max-turns 40 -p "$(cat .github/prompts/my-prompt.md)"
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

- `--dangerously-skip-permissions` only safe in isolated containers (GitHub Actions runners are ephemeral/isolated — OK to use)
- Without `--allowedTools` or `--dangerously-skip-permissions`, agent may hang waiting for permission approval
- Without `--bare`, CLAUDE.md is auto-loaded — useful when you want project context; skip with `--bare` for speed
- `--max-turns` is critical for cost control — set based on expected task complexity
- Keep the prompt in a versioned file (`.github/prompts/`) rather than inline in the YAML

## Prompt file pattern

Store prompts in `.github/prompts/my-task.md` and reference with `$(cat .github/prompts/my-task.md)`. This makes prompts versioned, reviewable, and editable without touching workflow YAML.