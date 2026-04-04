# GitHub MCP Server

## Overview

Provides GitHub API access via MCP, enabling AI assistants to interact with repositories, issues, pull requests, branches, releases, and more through structured tool calls. Supports both read and write operations.

## Prerequisites

- A GitHub account
- A GitHub personal access token (PAT) or GitHub Copilot authentication

## Installation

### Option A: GitHub Copilot HTTP Endpoint

Add to your `~/.claude.json` under `"mcpServers"`:

```json
{
  "github": {
    "type": "http",
    "url": "https://api.githubcopilot.com/mcp/",
    "headers": {
      "Authorization": "Bearer YOUR_GITHUB_TOKEN"
    }
  }
}
```

**Getting a token:**
1. Go to GitHub > Settings > Developer Settings > Personal Access Tokens
2. Generate a new token (classic) with appropriate scopes:
   - `repo` — Full repository access
   - `read:org` — Read org membership
   - `read:user` — Read user profile
   - `workflow` — Update GitHub Actions workflows (if needed)

### Option B: NPX-based Server

```json
{
  "github": {
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "YOUR_TOKEN"
    }
  }
}
```

## Key Capabilities

### Repository Operations
- `search_repositories` — Find repos by name/description/topics
- `get_file_contents` — Read files from any branch
- `create_or_update_file` — Create/edit files with commits
- `push_files` — Push multiple files in one commit
- `create_repository` — Create new repos
- `fork_repository` — Fork repos

### Issue Management
- `list_issues` / `search_issues` — Find issues
- `issue_read` — Get issue details, comments, labels, sub-issues
- `issue_write` — Create/update issues

### Pull Request Workflow
- `list_pull_requests` / `search_pull_requests` — Find PRs
- `pull_request_read` — Get PR details, diff, files, reviews, check runs
- `create_pull_request` — Open new PRs
- `update_pull_request` — Edit PRs, request reviewers
- `merge_pull_request` — Merge PRs (merge/squash/rebase)
- `pull_request_review_write` — Create/submit reviews

### Branch & Tag Management
- `list_branches` / `create_branch`
- `list_tags` / `get_tag`
- `list_commits` / `get_commit`

### Copilot Integration
- `create_pull_request_with_copilot` — Delegate tasks to Copilot agent
- `assign_copilot_to_issue` — Have Copilot work on issues
- `request_copilot_review` — Automated PR reviews

### Security
- `run_secret_scanning` — Scan files/diffs for exposed secrets

## Troubleshooting

| Issue | Solution |
|-------|----------|
| 401 Unauthorized | Token expired or lacks required scopes — regenerate |
| 403 Forbidden | Token doesn't have access to the resource — check org permissions |
| Rate limiting | GitHub API has rate limits; wait or use authenticated requests |
| Can't see private repos | Ensure token has `repo` scope |

## Security Notes

- **Never commit tokens to version control**
- Use environment variables or secure credential storage
- Rotate tokens periodically
- Use fine-grained tokens with minimal scopes when possible

## References

- [GitHub MCP Server](https://github.com/github/github-mcp-server)
- [GitHub REST API docs](https://docs.github.com/en/rest)
- [Creating a PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)

---

*Last updated: 2026-04-04*
*Setup verified on: Windows 10*
