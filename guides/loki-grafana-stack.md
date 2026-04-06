# Loki + Grafana Stack — Setup Guide

## Overview

Grafana Loki is a log aggregation system optimized for storing and querying logs from cloud-native environments. It integrates natively with Grafana and works well alongside Prometheus.

---

## Quick Setup

### Recommended mode: Monolithic (single-binary)

```yaml
services:
  loki:
    image: grafana/loki:latest
    container_name: loki
    restart: unless-stopped
    ports:
      - "127.0.0.1:3100:3100"
    volumes:
      - ./loki/loki.yml:/etc/loki/local-config.yaml:ro
      - loki_data:/loki
    command: -config.file=/etc/loki/local-config.yaml -target=all
    mem_limit: 400m  # Critical: cap memory or Loki will consume available RAM
    networks:
      - monitoring
```

### Minimal loki.yml for single-tenant, filesystem storage

```yaml
auth_enabled: false  # Single-tenant; no per-client auth needed

server:
  http_listen_port: 3100
  grpc_listen_port: 9096

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

query_range:
  results_cache:
    cache:
      embedded_cache:
        enabled: true
        max_size_mb: 100

schema_config:
  configs:
    - from: 2020-10-24
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 168h  # 7 days

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem
```

### Grafana datasource provisioning for Loki

```yaml
# grafana/provisioning/datasources/loki.yml
apiVersion: 1
datasources:
  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    isDefault: false
    jsonData:
      maxLines: 1000
```

---

## Client log shipper: Grafana Alloy (replaces deprecated Promtail)

**Note:** Promtail is EOL as of March 2026. Grafana Agent is EOL as of November 2025. Use Grafana Alloy for all new deployments.

Alloy version in production as of 2026-04-06: **v1.15.0**

### Complete Alloy River config for push-based client monitoring

The config below is the canonical pattern for clients that push metrics and logs to a central Sauron hub via HTTPS + Bearer token. All values are injected from environment variables — no secrets in the config file.

```river
// 1. Host metrics via built-in unix exporter
prometheus.exporter.unix "host" {
  filesystem {
    mount_points_exclude = "^/(sys|proc|dev|host|etc|run/secrets)($|/)"
    fs_types_exclude     = "^(autofs|binfmt_misc|bpf|cgroup2?|configfs|debugfs|devpts|devtmpfs|fusectl|hugetlbfs|iso9660|mqueue|nsfs|overlay|proc|procfs|pstore|rpc_pipefs|securityfs|selinuxfs|squashfs|sysfs|tracefs)$"
  }
}

// 2. Scrape host exporter + other local services
prometheus.scrape "local_exporters" {
  targets = concat(
    prometheus.exporter.unix.host.targets,
    [
      {"__address__" = "node-exporter:9100"},
    ],
  )
  scrape_interval = "60s"
  scrape_timeout  = "10s"
  forward_to = [prometheus.relabel.add_client_labels.receiver]
}

// 3. Add client/env labels via relabeling (correct River pattern — not external_labels)
prometheus.relabel "add_client_labels" {
  rule {
    target_label = "client"
    replacement  = env("CLIENT_NAME")
  }
  rule {
    target_label = "env"
    replacement  = env("CLIENT_ENV")
  }
  forward_to = [prometheus.remote_write.hub.receiver]
}

// 4. Remote-write to hub
prometheus.remote_write "hub" {
  endpoint {
    url          = env("SAURON_METRICS_URL")
    bearer_token = env("PUSH_BEARER_TOKEN")
    queue_config {
      capacity             = 10000
      max_samples_per_send = 2000
    }
  }
}

// 5. System log collection
loki.source.file "system_logs" {
  targets    = [{ __path__ = "/var/log/*.log", job = "system_logs" }]
  forward_to = [loki.relabel.add_log_labels.receiver]
}

// 6. Container log collection via Docker socket
discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

loki.source.docker "container_logs" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.docker.containers.targets
  forward_to = [loki.relabel.add_log_labels.receiver]
}

// 7. Add client/env labels to log streams
loki.relabel "add_log_labels" {
  rule {
    target_label = "client"
    replacement  = env("CLIENT_NAME")
  }
  rule {
    target_label = "env"
    replacement  = env("CLIENT_ENV")
  }
  forward_to = [loki.write.hub.receiver]
}

// 8. Push logs to Loki
loki.write "hub" {
  endpoint {
    url          = env("SAURON_LOKI_URL")
    bearer_token = env("PUSH_BEARER_TOKEN")
  }
  external_labels = {
    client = env("CLIENT_NAME"),
    env    = env("CLIENT_ENV"),
  }
}
```

### Alloy Docker Compose service definition (compose override pattern)

```yaml
# docker-compose.monitoring.yml
services:
  alloy:
    image: grafana/alloy:latest
    container_name: alloy
    restart: unless-stopped
    command: run --stability.level=generally-available /etc/alloy/config.alloy
    volumes:
      - ./alloy/config.alloy:/etc/alloy/config.alloy:ro
      - /var/log:/var/log:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    environment:
      - PUSH_BEARER_TOKEN=${PUSH_BEARER_TOKEN_SAURON}
      - SAURON_METRICS_URL=${SAURON_METRICS_URL}
      - SAURON_LOKI_URL=${SAURON_LOKI_URL}
      - CLIENT_NAME=${CLIENT_NAME}
      - CLIENT_ENV=${CLIENT_ENV}
    mem_limit: 256m
    networks:
      - monitoring

networks:
  monitoring:
    external: true
    name: monitoring_monitoring  # Correct network name: <project_dir>_<network_name>
```

---

## Known Issues and Gotchas

### Grafana admin password not updated on container recreate

`GF_SECURITY_ADMIN_PASSWORD` is only applied on **first initialization** of the Grafana database. If the container is first started with an empty or wrong value (e.g. before a `.env` symlink is in place), Grafana initializes with the default `admin` password. Recreating the container with the correct env var does **not** change the existing stored password.

**Fix:** Reset the admin password via the Grafana CLI after fixing the env:

```bash
docker exec grafana grafana cli admin reset-admin-password <new-password>
```

**Prevention:** Ensure the `.env` file is in place and readable by Docker Compose before the very first `docker compose up`. If running compose with `-f monitoring/docker-compose.yml` from the project root, the `.env` must be at the project root (not in the `monitoring/` subdirectory). Docker Compose V2 looks for `.env` in the directory of the compose file, not the CWD — use a symlink or `--env-file` flag to bridge them.

### env() deprecation in Alloy River config

As of Alloy v1.x+, the `env()` stdlib function is deprecated. Startup logs will show repeated warnings:

```
level=warn msg="this stdlib function is deprecated; please refer to the documentation for updated usage and alternatives" function=env
```

The config **still works** — these are warnings, not errors. Check the Alloy release notes for the replacement (`sys.env()` in newer versions). Safe to leave as-is until Alloy removes the function entirely.

### Loki "entry too far behind" errors on Alloy restart

When Alloy restarts after being stopped for hours, it replays its WAL (write-ahead log) and attempts to push old log entries to Loki. Loki rejects entries older than its `reject_old_samples_max_age` (default: ~1h). These errors appear in Alloy logs as:

```
level=error msg="final error sending batch, no retries left, dropping data"
status=400 error="entry too far behind, entry timestamp is: ..., oldest acceptable timestamp is: ..."
```

**This is expected and harmless.** The old entries are dropped and Alloy continues normally. Current log entries push without error. The errors self-clear within a few minutes.

### "No such container" errors in loki.source.docker after restart

After Alloy restarts, `loki.source.docker` may log errors for container IDs that existed during the previous run but no longer exist:

```
level=error msg="error inspecting Docker container" error="Error response from daemon: No such container: <id>"
```

**This is expected and harmless.** These are stale tailer references from the WAL. They self-clear as Alloy rediscovers the current container list.

### Prometheus external_labels vs relabeling for client labels

The correct River pattern for adding `client` and `env` labels to metrics is to use a `prometheus.relabel` component between the scrape and the remote_write — NOT `external_labels` on the remote_write endpoint. The `external_labels` block on `prometheus.remote_write` is not supported in River config; use `prometheus.relabel` instead.

For Loki logs, `external_labels` on `loki.write` IS supported and is the correct place.

### Docker network name in compose override

When using a compose override file that references an external network created by the main `docker-compose.yml`, the network name must match the Docker-created name exactly. Docker composes network names as `<project_name>_<network_name>`. When compose is run from a directory named `monitoring/`, the project name defaults to `monitoring`, so a network named `monitoring` in the compose file becomes `monitoring_monitoring` in Docker. Specify this explicitly in the override:

```yaml
networks:
  monitoring:
    external: true
    name: monitoring_monitoring
```

### Querying Loki when port 3100 is not exposed to the host

If Loki's port is internal-only (not exposed via `ports:` in compose), query it from within the Docker network using a temporary curl container:

```bash
# Use appropriate/curl (has curl) or alpine/curl
docker run --rm --network monitoring_monitoring appropriate/curl:latest \
  -s 'http://loki:3100/loki/api/v1/label/client/values'
```

Note: Most Grafana/Prometheus/Loki images do not have `curl` or `wget` installed — exec into a purpose-built curl container instead.

### Alloy stability level flag

As of Alloy v1.x, the `--stability.level` flag must be set to avoid warnings about experimental components. Use:

```
command: run --stability.level=generally-available /etc/alloy/config.alloy
```

---

## Verifying the full push pipeline

```bash
# 1. Check Alloy is running
docker ps | grep alloy

# 2. Check Prometheus has received metrics with client label
curl -s http://localhost:9090/api/v1/label/client/values

# 3. Check Loki has received logs with client label (internal network)
docker run --rm --network monitoring_monitoring appropriate/curl:latest \
  -s 'http://loki:3100/loki/api/v1/label/client/values'

# 4. Query recent logs for a specific client
NOW=$(date +%s)
START=$((NOW - 600))
docker run --rm --network monitoring_monitoring appropriate/curl:latest \
  -s -G 'http://loki:3100/loki/api/v1/query_range' \
  --data-urlencode 'query={client="sauron"}' \
  --data-urlencode 'limit=5' \
  --data-urlencode "start=${START}000000000"

# 5. List Grafana dashboards (when Grafana port is internal-only)
docker run --rm --network monitoring_monitoring appropriate/curl:latest \
  -s -u admin:<password> 'http://grafana:3000/api/search?type=dash-db'
```
