# Fly.io Deployment — Node.js / TypeScript

> Based on real-world deployment of an Express 5 + TypeScript server to Fly.io from a Windows machine.
> Covers account creation through live production deployment.

---

## What is Fly.io

Fly.io is a platform-as-a-service for running Docker containers close to your users. It handles provisioning, scaling, TLS, and routing — you just push a Docker image.

- **Pricing:** ~$2–5/month for a small Node.js server (shared CPU, 256 MB RAM) with `auto_stop_machines = true`
- **Why not AWS Lambda for SSE/WebSocket?** Lambda does not natively support SSE; API Gateway WebSocket requires DynamoDB for connection management. Fly.io is far simpler for persistent connections.
- **Region `yyz`** = Toronto — good for Canadian-user apps and Canadian data residency
- **Website:** https://fly.io

---

## Installation (Windows)

```powershell
# Option 1 — PowerShell installer
pwsh -Command "iwr https://fly.io/install.ps1 -useb | iex"

# Option 2 — winget
winget install Fly.io.flyctl
```

Restart your terminal after install, then verify:

```bash
flyctl version
```

---

## Authentication

```bash
flyctl auth login
# Opens your browser for OAuth login (GitHub or email)
```

---

## Project Setup

> **Do NOT use `fly launch` if you already have a Dockerfile.** It may overwrite your config and generate an unwanted `fly.toml`. Instead, write `fly.toml` manually and run `fly deploy`.

### First-time app creation

```bash
flyctl apps create your-app-name
```

Then write your own `fly.toml` (see below) and run:

```bash
flyctl deploy
```

---

## Dockerfile (Node.js 20 slim)

```dockerfile
FROM node:20-slim

# GOTCHA: node:20-slim does NOT include curl.
# Fly.io health checks that use curl will fail silently if you skip this.
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/

EXPOSE 3001
CMD ["node", "dist/index.js"]
```

> **Gotcha — curl missing in slim images:** `node:20-slim` omits curl. If your health check or any startup script calls curl, the build will succeed but health checks will never pass. Always install curl explicitly unless you are certain nothing needs it.

---

## fly.toml

```toml
app = 'your-app-name'
primary_region = 'yyz'

[build]

[http_service]
  internal_port = 3001        # Must match EXPOSE in Dockerfile and PORT env var
  force_https = true
  auto_stop_machines = true   # Stops machine when no traffic (saves cost)
  auto_start_machines = true  # Restarts machine on first incoming request
  min_machines_running = 0    # Set to 1 if cold-start latency is unacceptable

[[vm]]
  memory = '256mb'
  cpu_kind = 'shared'
  cpus = 1
```

> **Gotcha — auto_stop and persistent connections:** If your server maintains a persistent outbound WebSocket (e.g. to aisstream.io), the machine will NOT sleep while that connection is open. This is correct behaviour, but an aggressively reconnecting WebSocket may prevent the machine from ever entering the stopped state.

---

## Injecting Secrets

Never put API keys in `fly.toml` or checked-in `.env` files. Use Fly secrets — they are injected as environment variables at runtime and never appear in logs or image layers.

```bash
flyctl secrets set AISSTREAM_API_KEY=your-key-here
flyctl secrets set NODE_ENV=production

# Verify (values are always redacted in output):
flyctl secrets list
```

---

## Deploying

```bash
# From the directory containing fly.toml:
flyctl deploy
```

Fly.io will build the Docker image remotely, push it, and roll out the new version. Watch the output for health check results.

---

## .dockerignore

Place a `.dockerignore` in the same directory as your `Dockerfile` (e.g. `server/`):

```
node_modules
src
*.test.ts
tsconfig*.json
.env*
```

> **Gotcha — include dist, exclude src:** If you accidentally exclude `dist/` the image will fail to start (no compiled code). If you accidentally include `src/` after compiling, TypeScript source bloats the image. Double-check your `.dockerignore` before first deploy.

---

## Health Checks

Fly.io polls your app automatically. Add explicit checks to `fly.toml`:

```toml
[[services.tcp_checks]]
  interval = "15s"
  timeout = "2s"

[[services.http_checks]]
  interval = "15s"
  timeout = "2s"
  grace_period = "5s"
  method = "get"
  path = "/api/health"
```

Your Express server should expose:

```ts
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});
```

---

## Useful Commands

```bash
flyctl status                    # App status and machine state
flyctl logs                      # Tail live logs
flyctl logs --instance <id>      # Logs for a specific machine instance
flyctl ssh console               # SSH into the running machine
flyctl scale show                # Current VM size
flyctl regions list              # All available regions
flyctl secrets list              # Show secret names (values always redacted)
flyctl apps list                 # All apps in your org
```

---

## Region Codes

| Code | Location |
|------|----------|
| `yyz` | Toronto, Canada |
| `ord` | Chicago, USA |
| `iad` | Ashburn, Virginia, USA |
| `lhr` | London, UK |
| `cdg` | Paris, France |
| `nrt` | Tokyo, Japan |
| `syd` | Sydney, Australia |

---

## Cost Management

- With `auto_stop_machines = true` and `min_machines_running = 0` you only pay while the machine is actively running.
- A small Node.js server handling SSE connections to a handful of clients typically costs **~$2–5/month**.
- Check billing: https://fly.io/dashboard/billing
- Cold-start latency with `min_machines_running = 0` is typically a few seconds. If that is unacceptable for your use case, set `min_machines_running = 1`.

---

## Gotchas Summary

| # | Gotcha | Fix |
|---|--------|-----|
| 1 | `node:20-slim` has no curl | Add `apt-get install -y curl` in Dockerfile |
| 2 | `fly launch` overwrites existing config | Write `fly.toml` manually; run `fly deploy` instead |
| 3 | Persistent WebSocket prevents machine sleep | Expected — set `min_machines_running = 0` and accept it stays up |
| 4 | `.dockerignore` wrong — dist excluded or src included | Review `.dockerignore` carefully before first deploy |
| 5 | Secrets in `fly.toml` | Use `flyctl secrets set` — never hardcode keys |
| 6 | `internal_port` mismatch | Must match `EXPOSE` in Dockerfile and your `PORT` env var |

---

## Related Guides

- `docker-node` — general Docker best practices for Node.js
- `express-typescript` — Express 5 + TypeScript project setup
