# Loki + Grafana Stack (LGTM)

Setup guide for running Grafana + Prometheus + Loki via Docker Compose, including provisioning, dashboards, and Alloy self-monitoring.

---

## Datasource Provisioning — Critical UID Gotcha

**Always include an explicit `uid` field in datasource provisioning files from the very first deploy.**

If you omit `uid`, Grafana auto-generates a random hash UID (e.g. `PBFA97CFB590B2093`). If you later add `uid: prometheus` to the provisioning file, Grafana may **create a second datasource** instead of updating the existing one — leaving dashboards that reference `uid: prometheus` broken while the live datasource still has the old hash UID.

### Safe pattern — include uid AND deleteDatasources

```yaml
# monitoring/grafana/provisioning/datasources/prometheus.yml
apiVersion: 1

deleteDatasources:
  - name: Prometheus
    orgId: 1

datasources:
  - name: Prometheus
    uid: prometheus          # <-- always set this explicitly
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: 15s
      httpMethod: POST
    version: 1
    editable: false
```

```yaml
# monitoring/grafana/provisioning/datasources/loki.yml
apiVersion: 1

deleteDatasources:
  - name: Loki
    orgId: 1

datasources:
  - name: Loki
    uid: loki                # <-- always set this explicitly
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    editable: true
    jsonData:
      maxLines: 1000
```

`deleteDatasources` fires on every Grafana startup — it deletes the stale datasource (whatever UID it accumulated) before re-creating it with the correct UID. This is idempotent and safe.

### Dashboard JSON must match the provisioned uid

```json
"datasource": { "type": "prometheus", "uid": "prometheus" }
```

If the provisioning file sets `uid: prometheus`, dashboards must use `"uid": "prometheus"` — not a hash. The Grafana API will show the current live UID; if you see a hash there after setting an explicit uid in provisioning, the stale datasource is still alive and `deleteDatasources` hasn't fired yet.

---

## Grafana Admin Password Initialization

`GF_SECURITY_ADMIN_PASSWORD` in `.env` only applies on the **first database init**. If the container was started before `.env` was symlinked or before the variable was set, the password defaults to `admin`.

**Reset after-the-fact:**
```bash
docker exec grafana grafana cli admin reset-admin-password <new-password>
```

---

## Querying Prometheus When Port 9090 Is Not Exposed

Prometheus is internal-only (not exposed via nginx). To query it without SSH:

```bash
# Via Grafana datasource proxy (requires Grafana admin credentials)
curl -s -u "admin:<PASSWORD>" \
  "https://your-grafana-host/api/datasources/proxy/uid/prometheus/api/v1/query?query=probe_success"

# Check active targets
curl -s -u "admin:<PASSWORD>" \
  "https://your-grafana-host/api/datasources/proxy/uid/prometheus/api/v1/targets"

# Get list of all datasource UIDs (diagnostic)
curl -s -u "admin:<PASSWORD>" \
  "https://your-grafana-host/api/datasources" | python3 -c "import json,sys; [print(d['name'], d['uid']) for d in json.load(sys.stdin)]"
```

---

## Alloy River Config — Deprecation Warning

The `env()` function in Alloy River config is deprecated but still functional. You'll see warnings in logs like:

```
WARN component/prometheus.remote_write: env() is deprecated, use sys.env() instead
```

This is harmless. Replace `env("VAR")` with `sys.env("VAR")` to silence it.

---

## Blackbox Exporter — Remove Placeholder Targets

Initial scaffolded `prometheus.yml` often includes placeholder targets:

```yaml
- https://example.com
- https://api.example.com
```

**Remove these before production.** They generate continuous failed probe metrics (`probe_success=0`) which pollute dashboards and alert noise.

---

## Docker Compose .env Loading

Docker Compose looks for `.env` in the directory containing the compose file, **not** the current working directory.

If your compose file is at `monitoring/docker-compose.yml` but your `.env` is at the project root:

```bash
# Option 1: always run from project root with -f flag
docker compose -f monitoring/docker-compose.yml up -d

# Option 2: symlink
ln -sf /opt/project-sauron/.env /opt/project-sauron/monitoring/.env
```

The GitHub Actions deploy script must also use the project-root pattern consistently.

---

## Dashboard Provisioner Auto-Reload

Set `updateIntervalSeconds: 30` in the dashboard provisioner config to auto-pick up dashboard JSON changes without restarting Grafana:

```yaml
# monitoring/grafana/provisioning/dashboards/dashboard.yml
apiVersion: 1
providers:
  - name: 'project-sauron'
    type: file
    updateIntervalSeconds: 30
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
```

---

## Prometheus Config Reload (Without Restart)

Enable the lifecycle API in Prometheus:

```yaml
# docker-compose.yml
command:
  - '--web.enable-lifecycle'
  - '--web.enable-remote-write-receiver'
```

Then reload config without restarting:

```bash
curl -s -X POST http://localhost:9090/-/reload
```

Include this in deploy scripts after `git pull` + `docker compose up -d`.
