# Loki + Grafana Stack

## Overview
Running Grafana Loki alongside Prometheus + Grafana on a single Docker Compose host (tested on EC2 t3.small). Loki handles log aggregation; Grafana provides unified metrics + logs dashboards.

## Quick Reference

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

### Client log shipper: Grafana Alloy (replaces deprecated Promtail)
```yaml
# alloy/config.alloy — runs on the client side
loki.source.file "app_logs" {
  targets    = [{ __path__ = "/var/log/app/*.log", job = "app" }]
  forward_to = [loki.write.sauron.receiver]
}

loki.write "sauron" {
  endpoint {
    url = "https://sauron.7ports.ca/loki/api/v1/push"
    bearer_token = env("SAURON_BEARER_TOKEN")
  }
  external_labels = {
    client  = env("CLIENT_NAME"),
    env     = env("CLIENT_ENV"),
  }
}
```

## Gotchas

### Promtail is EOL March 2026
- Use **Grafana Alloy** (`grafana/alloy`) for all new log shipping, not Promtail
- Alloy is a drop-in replacement with the same log shipping API, plus OpenTelemetry support
- Alloy also replaces Grafana Agent

### Memory cap is mandatory on t3.small
- Set `mem_limit: 400m` in docker-compose.yml — Loki's default is unbounded and will OOM the host
- If you see container restarts, check `docker stats` for memory pressure
- Monolithic mode supports up to ~20 GB/day ingestion — personal projects stay well under this

### auth_enabled: false for single-tenant
- `auth_enabled: false` means Loki uses a hardcoded org ID of "fake"
- For multi-tenant (multiple independent clients), set `auth_enabled: true` and have nginx inject `X-Scope-OrgID: <client_name>` per route
- For simple personal use, single-tenant with a shared push URL + bearer token is sufficient

### Filesystem storage is fine for personal use
- S3 backend is only needed for HA or retention > ~30-60 days
- Filesystem storage with the tsdb store (schema v13+) is stable and performant for small volumes
- Keep retention at 7-14 days to control disk usage on a 20 GiB EC2 root volume

### Schema version matters
- Use schema `v13` with `store: tsdb` (current as of 2026)
- Older schemas (v11, v12) still work but produce deprecation warnings

### Port binding
- Bind Loki to `127.0.0.1:3100` on the host — do not expose publicly
- Access from Grafana over the Docker network via `http://loki:3100`
- Remote clients push logs through nginx (HTTPS) which reverse-proxies to `http://loki:3100` internally

## Security for Remote Push

When accepting logs from remote clients over the internet:
```nginx
# nginx location for Loki push endpoint
location /loki/api/v1/push {
    auth_request /auth;
    proxy_pass http://loki:3100;
    proxy_set_header X-Scope-OrgID $arg_client;  # optional multi-tenant
}
location /auth {
    internal;
    if ($http_authorization != "Bearer YOUR_TOKEN") { return 401; }
    return 200;
}
```
Or use nginx `auth_basic` for simpler setup.

## Comparison vs Alternatives

| Tool | Pros | Cons | Verdict |
|---|---|---|---|
| **Loki** | Native Grafana integration, same ecosystem as Prometheus, lightweight | LogQL learning curve, not full-text search | **Recommended** |
| Graylog | Powerful search, web UI | Requires MongoDB + Elasticsearch — too heavy for t3.small | Rejected |
| OpenSearch | Full-text search, rich ecosystem | Very heavy, separate UI from Grafana | Rejected |
| VictoriaLogs | Very memory-efficient, compatible with Loki API | Newer, less community docs | Good alternative if Loki OOMs |

## Testing

```bash
# Verify Loki is healthy
curl http://localhost:3100/ready

# Send a test log entry
curl -H "Content-Type: application/json" \
     -X POST http://localhost:3100/loki/api/v1/push \
     --data-raw '{"streams": [{"stream": {"job": "test"}, "values": [["'"$(date +%s%N)"'", "hello loki"]]}]}'

# Query it back
curl http://localhost:3100/loki/api/v1/query_range \
     --data-urlencode 'query={job="test"}' \
     --data-urlencode 'start=1h'
```

## Useful Links
- [Loki Deployment Modes](https://grafana.com/docs/loki/latest/get-started/deployment-modes/)
- [Grafana Alloy — Send Logs to Loki](https://grafana.com/docs/alloy/latest/tutorials/send-logs-to-loki/)
- [Loki Install with Docker Compose](https://grafana.com/docs/loki/latest/setup/install/docker/)
- [Loki Authentication](https://grafana.com/docs/loki/latest/operations/authentication/)
- [Prometheus Remote Write Spec](https://prometheus.io/docs/specs/prw/remote_write_spec/)
