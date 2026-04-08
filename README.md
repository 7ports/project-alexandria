# Project Alexandria

A collaboratively maintained knowledge base of tooling setup guides, designed to be shared across Claude instances via a built-in MCP server.

## What Is This?

Setting up development tools, MCP servers, and integrations is repetitive. Every time you configure a new tool, you (or your AI assistant) re-discovers the same installation steps, config quirks, and platform gotchas. Project Alexandria solves this by creating a persistent, queryable reference that Claude can consult and update automatically.

**Live Docs:** [https://7ports.github.io/project-alexandria/](https://7ports.github.io/project-alexandria/)

**The key idea:** every Claude instance that has Alexandria installed becomes both a consumer and a contributor. When one instance sets up a tool and documents the process, every other instance benefits. When an instance hits a setup problem and fixes it, the fix gets added to the guide for everyone.

## How It Works

```
                        ┌──────────────────────┐
                        │  Project Alexandria   │
                        │                       │
                        │  guides/              │
 Claude Instance A ────►│    coplay-mcp.md      │◄──── Claude Instance C
  (sets up CoPlay,      │    beads.md           │       (reads CoPlay guide,
   writes guide)        │    firebase-mcp.md    │        avoids known issues)
                        │    ...                │
 Claude Instance B ────►│                       │
  (hits a bug,          │  recommendations.json │
   adds to troubleshoot)│  onboarding.json      │
                        │  mcp-server/          │
                        └──────────────────────┘
```

1. **Alexandria MCP Server** runs as a stdio MCP server alongside Claude Code
2. Claude instances call tools like `search_guides`, `read_guide`, and `update_guide` to interact with the knowledge base
3. When setting up a new project, `get_project_setup_recommendations` surfaces required tools (e.g., beads for issue tracking)
4. When a new instance connects, `get_onboarding` provides the behavioral contract and memory templates for collaborative maintenance

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/7ports/project-alexandria /path/to/project-alexandria
cd project-alexandria/mcp-server
npm install
```

### 2. Add to Claude Code Config

Add to `~/.claude.json` under `"mcpServers"`:

```json
{
  "alexandria": {
    "type": "stdio",
    "command": "node",
    "args": ["/path/to/project-alexandria/mcp-server/index.js"],
    "env": {}
  }
}
```

### 3. Add Permissions

In `~/.claude/settings.json`, add to `permissions.allow`:

```json
"mcp__alexandria__*"
```

### 4. Restart Claude Code

The `alexandria` MCP server will now be available in all conversations.

### 5. Onboard Your Claude Instance

In your first conversation after installing, ask Claude to call `get_onboarding`. This returns the collaborative maintenance contract and memory templates. Claude should save these to its memory system so the maintenance behavior persists across conversations.

## Available Tools

| Tool | Description |
|------|-------------|
| `list_guides` | List all available setup guides with summaries |
| `quick_setup` | Extract actionable content only (commands, config, troubleshooting) — token-efficient |
| `read_guide` | Read the full content of a specific guide |
| `search_guides` | Search for keywords across all guides |
| `update_guide` | Create or update a guide |
| `get_guide_template` | Get the standard template for new guides |
| `get_project_setup_recommendations` | Get required/recommended tools for new project setup |
| `get_onboarding` | Get the collaborative maintenance contract for a new Claude instance |

## Guides

| Guide | Description |
|-------|-------------|
| [aisstream.io — Real-Time AIS WebSocket API](guides/aisstream-io.md) |  |
| [Alexandria MCP Server](guides/alexandria-mcp-server.md) | A custom MCP server that exposes Project Alexandria's tooling setup guides as searchable, queryable resources. This allows Claude to access documentat |
| [AWS CLI v2](guides/aws-cli.md) | AWS CLI v2 is the unified command-line tool for managing AWS services. Used in this ecosystem primarily for S3 static site deployments, CloudFront CDN |
| [Beads — Distributed Graph Issue Tracker for AI Agents](guides/beads.md) | Beads (`bd` CLI) is a distributed graph issue tracker designed for AI coding agents, powered by Dolt (a version-controlled SQL database). It provides  |
| [Claude Code in GitHub Actions](guides/claude-code-github-actions.md) |  |
| [Claude in Chrome (Browser Automation)](guides/claude-in-chrome.md) | Claude in Chrome is a browser extension that allows Claude Code to control a Chrome browser — taking screenshots, clicking elements, filling forms, re |
| [Claude Preview MCP Server](guides/claude-preview-mcp-server.md) | Claude Preview provides a built-in dev server launcher and browser preview for Claude Code. It can start local development servers, take screenshots,  |
| [CoPlay MCP Server (Unity Integration)](guides/coplay-mcp-server.md) | CoPlay MCP Server provides deep Unity Editor integration via the Model Context Protocol. It allows AI assistants to read/write scene hierarchies, crea |
| [Environment Canada Weather API (GeoMet OGC API)](guides/environment-canada-weather-api.md) | Environment Canada exposes real-time surface weather observations (SWOB) through the MSC GeoMet OGC API at `https://api.weather.gc.ca/`. No API key is |
| [Express 5 + Node.js 20 + TypeScript](guides/express-5-node-typescript.md) |  |
| [Fetch MCP Server](guides/fetch-mcp-server.md) | Provides web content fetching capabilities via MCP. Allows AI assistants to retrieve and process content from URLs, converting HTML to readable text.  |
| [Firebase MCP Server](guides/firebase-mcp-server.md) | Provides Firebase project management via MCP. Allows AI assistants to manage Firebase projects, apps, authentication, Firestore, Realtime Database, Ho |
| [Fly.io Deployment — Node.js / TypeScript](guides/flyio-deployment.md) |  |
| [Git MCP Server](guides/git-mcp-server.md) | Provides Git repository operations via MCP. Allows AI assistants to perform git status, diff, log, commit, branch management, and other git operations |
| [GitHub Actions — Deploy to EC2 via SSH](guides/github-actions-ec2-deploy.md) | Auto-deploy a Docker Compose stack to an EC2 instance on push to main, using the `appleboy/ssh-action` action. |
| [GitHub CLI (gh)](guides/github-cli.md) | The GitHub CLI (`gh`) provides GitHub functionality directly from the terminal — pull requests, issues, releases, gists, GitHub Actions, Pages deploym |
| [GitHub MCP Server](guides/github-mcp-server.md) | Provides GitHub API access via MCP, enabling AI assistants to interact with repositories, issues, pull requests, branches, releases, and more through  |
| [GitHub Pages — Jekyll via GitHub Actions](guides/github-pages-jekyll-actions.md) | Deploy a Jekyll site from a `docs/` subdirectory using GitHub Actions (not the legacy "Deploy from branch" method). Required when using `actions/deplo |
| [Loki + Grafana Stack (LGTM)](guides/loki-grafana-stack.md) |  |
| [MapLibre GL JS + react-map-gl Setup Guide](guides/maplibre-react-map-gl.md) | MapLibre GL JS is an open-source fork of Mapbox GL JS. `react-map-gl` v8 provides a React adapter that works with both MapLibre and Mapbox. Together t |
| [MapLibre Vessel Animation — lerp + requestAnimationFrame](guides/maplibre-vessel-animation.md) |  |
| [Memory MCP Server](guides/memory-mcp-server.md) | Provides a persistent knowledge graph for AI assistants via MCP. Stores entities, observations, and relations that persist across conversations. Usefu |
| [Project Voltron](guides/project-voltron.md) | Project Voltron is an MCP server that provides a team of specialized Claude Code subagents (`.claude/agents/`) along with CLAUDE.md project context te |
| [Project Voltron — Docker Agent Setup](guides/project-voltron-docker.md) | Project Voltron runs specialist Claude Code agents inside Docker containers via `run_agent_in_docker`. The container mounts the project workspace and  |
| [Prometheus + Grafana on Docker Compose](guides/prometheus-grafana-docker-compose.md) | Running a full observability stack (Prometheus, Grafana, exporters) via Docker Compose on a Linux host (tested on Amazon Linux 2023 on EC2 t3.small). |
| [Rancher Desktop on Windows (Colima equivalent)](guides/rancher-desktop-windows.md) |  |
| [Server-Sent Events (SSE)](guides/sse-server-sent-events.md) |  |
| [Supertest](guides/supertest.md) |  |
| [Terraform — AWS EC2 Setup](guides/terraform-aws-ec2.md) | Provisioning an EC2 instance with VPC, security groups, IAM role, and Elastic IP using Terraform >= 1.6 with the AWS provider ~> 5.0. |
| [Terraform — AWS Frontend Hosting (S3 + CloudFront OAC + ACM + Route53)](guides/terraform-aws-frontend-hosting.md) |  |
| [Toronto City Open Data — Ferry Service Status API](guides/toronto-city-open-data-ferry.md) | The City of Toronto publishes a live, no-auth JSON endpoint for ferry service status: |
| [Vite Dev Server Proxy](guides/vite-dev-proxy.md) |  |
| [vite-plugin-pwa — PWA Setup with Vite + Workbox](guides/vite-plugin-pwa.md) |  |
| [Vitest](guides/vitest.md) |  |

## What Belongs in Alexandria

Alexandria is strictly for **non-project-specific, reusable documentation**. A guide belongs here if it would be useful to any project using that tool — not just one specific project.

**Write guides about:**
- Tool setup and installation steps (platform-specific variants)
- Version compatibility notes and upgrade paths
- Known errors and their fixes (error → cause → solution)
- Configuration patterns and working command examples
- API patterns and integration approaches
- Platform quirks (e.g., Windows-specific workarounds, mobile threading constraints)

**Do NOT write guides about:**
- Project business logic or feature designs
- Project-specific architecture decisions
- Custom configurations tied to a single project
- Team workflows or conventions that only apply to one team
- Environment-specific values (API keys, URLs, credentials)

**The rule:** If the knowledge would be equally useful in any other project using the same tool, it belongs in Alexandria. If it only makes sense in the context of one specific project, it belongs in that project's `CLAUDE.md` or local documentation.

## Contributing

### For Claude Instances

Every Claude instance with Alexandria installed is automatically a contributor. The behavioral contract (served by `get_onboarding`) requires:

1. **Consult before setup** — Check if a guide exists before setting up any tool. This is mandatory — never skip it.
2. **Update after setup** — Document what you did after completing a setup
3. **Document troubleshooting** — Add error/fix pairs when you resolve issues
4. **Use the template** — Follow the standard format for new guides
5. **Recommend on project init** — Surface required tools when setting up new projects
6. **Commit changes** — Commit guide updates to the git repo
7. **Respect the content boundary** — Only record non-project-specific knowledge; project-specific content stays in `CLAUDE.md`

### For Humans

You can also contribute directly:

1. Create a new guide using the [template](templates/guide-template.md)
2. Add it to the `guides/` directory
3. Update this README's guide table
4. Commit and push

Guides should capture:
- What the tool does and why you'd use it
- Prerequisites
- Step-by-step installation (with platform-specific notes)
- Configuration snippets
- Troubleshooting table (error → fix)
- Integration with other tools

### Adding New Recommendations

Edit `recommendations.json` to add tools that should be recommended during project setup:

- **`always`** — Tools required for every project (e.g., beads)
- **`conditional`** — Tools recommended for specific project types (e.g., CoPlay for Unity)

## Architecture

```
project-alexandria/
├── README.md                  # This file
├── CLAUDE.md                  # Project conventions for Claude
├── docs/                      # GitHub Pages site
│   ├── index.html             # Landing page
│   └── guides/
│       └── index.html         # Interactive guide browser
├── guides/                    # Individual setup guides (one per tool)
├── templates/
│   └── guide-template.md      # Standard format for new guides
├── recommendations.json       # Project setup recommendations data
├── onboarding.json            # Collaborative maintenance contract + memory templates
└── mcp-server/
    ├── package.json
    └── index.js               # MCP server (Node.js, @modelcontextprotocol/sdk)
```

The MCP server is a lightweight Node.js process that reads from the filesystem. No database, no external dependencies beyond the MCP SDK. Guides are plain markdown files that can be read and edited by humans or Claude.

## License

MIT
