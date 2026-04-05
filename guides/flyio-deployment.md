# Fly.io Deployment — Node.js / TypeScript

> Based on real-world deployment of a Node.js/Express SSE server (project-hammer-api, April 2026).
> App region: yyz (Toronto). Deployed via flyctl from Windows (Git Bash).

---

## Quick Reference

```bash
# Install flyctl (Windows — official PowerShell installer)
powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
# Binary lands at: C:\Users\<user>\.fly\bin\flyctl.exe
# Add to PATH or use full path

# Authenticate via token (non-interactive — for CI or when browser not available)
export FLY_API_TOKEN="FlyV1 fm2_..."
flyctl auth whoami   # verify

# Create app (region is set in fly.toml, not on the CLI)
flyctl apps create my-app-name

# Set secrets
flyctl secrets set KEY=value --app my-app-name

# Deploy (run from server/ directory where fly.toml lives)
cd server/
flyctl deploy --remote-only

# Check status
flyctl status --app my-app-name
flyctl logs --app my-app-name
```

---

## Prerequisites

- Fly.io account **with a payment method added** — even free-tier apps require a credit card at `https://fly.io/dashboard/<org>/billing`
- `fly.toml` in the server directory (see template below)
- `Dockerfile` in the server directory

---

## fly.toml Template

```toml
app            = "my-app-name"
primary_region = "yyz"   # Toronto — change to nearest region for your users

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port       = 3001
  force_https         = true
  auto_stop_machines  = true
  auto_start_machines = true
  min_machines_running = 1   # keep 1 machine always warm (no cold start)

[[vm]]
  size   = "shared-cpu-1x"
  memory = "256mb"

[checks]
  [checks.health]
    port     = 3001
    type     = "http"
    path     = "/api/health"
    interval = "30s"
    timeout  = "5s"
```

---

## Dockerfile (Node.js multi-stage)

```dockerfile
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

---

## First-Time Setup

```bash
# 1. Create the app (region comes from fly.toml, NOT from CLI flag --region)
flyctl apps create my-app-name

# 2. Set required secrets (injected as env vars at runtime — not in fly.toml)
flyctl secrets set SOME_SECRET=value --app my-app-name
flyctl secrets set ANOTHER_SECRET=value --app my-app-name

# 3. Deploy from the directory containing fly.toml
cd server/
flyctl deploy --remote-only
```

---

## Subsequent Deploys

```bash
cd server/
flyctl deploy --remote-only   # Fly builds remotely — faster, no local Docker needed
# OR
flyctl deploy --local-only    # Build locally — useful for debugging Dockerfile issues
```

---

## GitHub Actions CI/CD

```yaml
- name: Deploy to Fly.io
  uses: superfly/flyctl-actions/setup-flyctl@master

- name: Deploy
  run: flyctl deploy --remote-only
  working-directory: server/
  env:
    FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

Store `FLY_API_TOKEN` as a GitHub repository secret.

---

## Verification

```bash
flyctl status --app my-app-name
curl https://my-app-name.fly.dev/api/health
# Expected: {"status":"ok","uptime":<seconds>,"timestamp":"<ISO>"}

flyctl logs --app my-app-name   # tail live logs
```

---

## Gotchas

| # | Gotcha | Fix |
|---|---|---|
| 1 | `--region` flag removed from `apps create` | Region is set only in `fly.toml` via `primary_region` |
| 2 | Account needs payment method even for free apps | Add credit card at `fly.io/dashboard/<org>/billing` before first `apps create` |
| 3 | `FLY_API_TOKEN` contains a space (`FlyV1 fm2_...`) | Must quote the value: `FLY_API_TOKEN="FlyV1 fm2_..."` — sourcing a `.env` file fails without quotes |
| 4 | flyctl not in PATH after Windows install | Binary at `C:\Users\<user>\.fly\bin\flyctl.exe` — use full path or restart shell |
| 5 | `fly auth login` requires browser | Use `FLY_API_TOKEN` env var instead for non-interactive/CI environments |
| 6 | Secrets not available on first deploy | Set secrets BEFORE running `flyctl deploy` — the app reads them at startup |

---

## Regions Reference

| Code | Location |
|---|---|
| `yyz` | Toronto, Canada |
| `ord` | Chicago, US |
| `iad` | Ashburn, VA, US |
| `lhr` | London, UK |

---

## Scaling

```bash
flyctl scale count 2 --app my-app-name          # Add a second machine
flyctl scale vm shared-cpu-2x --app my-app-name  # Upgrade machine size
```

---

## Rollback

```bash
flyctl releases --app my-app-name
flyctl deploy --image <image-id>
```

---

## Related Guides

- `terraform-aws-frontend-hosting` — frontend hosting (S3 + CloudFront)
- `aws-cli` — AWS credentials and IAM setup
- `claude-code-github-actions` — CI/CD with GitHub Actions

---

*Last updated: 2026-04-05*
*Verified on: flyctl v0.4.29, Windows 10 (Git Bash), Node.js 20*
