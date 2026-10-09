---
id: cloudflare-workers-vite-d1
type: guide
title: cloudflare-workers-vite-d1
embedding_version: 1
---

# Cloudflare Workers + Vite + D1 (and Claude Code agent setup)

Verified 2026-10 on Windows 10, Node 24, wrangler 4.149, @cloudflare/vite-plugin 1.63, Vite 8.

## Claude Code: Cloudflare skills + MCP (official agent setup)
Source: https://developers.cloudflare.com/agent-setup/prompt.md
```bash
claude plugin marketplace add cloudflare/skills
claude plugin install cloudflare@cloudflare     # user scope
```
- Installs 16 skills (wrangler, workers-best-practices, durable-objects, agents-sdk, turnstile, web-perf, ...) + the `cloudflare` MCP server (https://mcp.cloudflare.com/mcp, OAuth on first use). ~1.2k always-on tokens per session.
- Then run `/reload-plugins` (or restart) inside Claude Code to activate.
- Optional beta `cf` CLI (`npm install -g cf`, `cf auth login`) covers the whole Cloudflare API; guide suggests the agent instruction "use the cf CLI unless the project has a Wrangler configuration file".

## New account checklist
- `npx wrangler login` (OAuth; scopes include d1/workers write). Check with `npx wrangler whoami`.
- **Register a workers.dev subdomain** (dashboard → Workers & Pages → onboarding, `https://dash.cloudflare.com/<account-id>/workers/onboarding`). Without it, *remote bindings in dev* fail with API error **10063** on `/workers/subdomain/edge-preview` ("You need to register a workers.dev subdomain before running the dev command in remote mode"). Local dev and `wrangler d1` commands work without it.

## Project setup (SPA + API Worker, no framework)
```bash
npm install -D wrangler @cloudflare/vite-plugin vite
```
`vite.config.ts`: `plugins: [cloudflare()]` — the plugin reads `wrangler.jsonc` from the root.
`wrangler.jsonc`:
```jsonc
{
  "main": "./worker/index.ts",
  "compatibility_date": "<recent date>",   // must not exceed the bundled workerd's date
  "assets": { "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "d1_databases": [{ "binding": "DB", "database_name": "<db>", "database_id": "<id>", "migrations_dir": "migrations" }],
  "triggers": { "crons": ["0 * * * *"] }
}
```
- Don't set `assets.directory` — the plugin uses Vite's client build output. `vite build` emits `dist/<worker>/wrangler.json` used by `wrangler deploy`.
- Local D1 works before `wrangler d1 create` — a placeholder `database_id` is fine for `--local`.
- `npx wrangler d1 create <db>` prints the id; in non-interactive shells it declines to edit config (use `--update-config --binding DB` or paste the id yourself — `--update-config` adds a *new* entry, so don't use it if a placeholder binding already exists).
- **Changing `database_id` switches the local SQLite file** (local state is keyed by id) — re-run `migrations apply --local` afterwards.
- `wrangler types worker/worker-configuration.d.ts` generates Env + runtime types; give the Worker its own tsconfig (`lib: ["ES2023"]`, no DOM) and exclude it from the client tsconfig.

## Dev tips
- `npx wrangler d1 migrations apply <db> --local` before `vite`; prompts auto-answer "yes" in non-interactive shells.
- Trigger a cron handler in `vite dev`: `POST http://localhost:5173/cdn-cgi/local/explorer/api/local/scheduled?worker=<name>` with body `{"cron":"0 * * * *"}`. The dev banner lists other explorer routes (D1 browser, observability SQL).
- **Remote bindings in dev without a second config:** the plugin's `config` customizer can flip bindings to remote by mode:
  ```ts
  export default defineConfig(({ mode }) => ({ plugins: [cloudflare({ config: (w) => {
    if (mode === "remote") w.d1_databases = w.d1_databases.map((db) => ({ ...db, remote: true }));
  } })] }));
  ```
  then `"dev:remote": "vite --mode remote"` (works under Windows cmd, unlike `VAR=1 vite`). Requires the workers.dev subdomain (see above).
- Read-only remote check: `npx wrangler d1 execute <db> --remote --json --command "SELECT name FROM sqlite_master WHERE type='table'"`.
- Editing `vite.config.ts` while dev runs can trigger "config must export or return an object" on the auto-restart (file read mid-write) — just restart.
- **Windows:** stopping a backgrounded `npx vite` shell can leave the node process holding the port. Find it with `netstat -ano | grep :5173` and `taskkill //PID <pid> //T //F`.
- Use a separate `vitest.config.ts` so tests don't load the Cloudflare plugin.

## D1 design notes (free plan: 5M rows read/day, 100k rows written/day, 5GB)
- Store a submission as one row with a JSON column, aggregate later in SQL with `json_each` — far fewer row writes than one row per item.
- `INSERT ... SELECT ... GROUP BY ... ON CONFLICT(...) DO UPDATE SET n = n + excluded.n` works for incremental rollups; keep a cursor (max id processed) in a meta table and run all statements in `db.batch([...])` (one transaction).
- Workers free plan CPU is 10ms/invocation: precompute expensive JSON in the cron job and store it as a single row, so the read endpoint just returns it.
