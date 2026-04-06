# Prometheus + Grafana on Docker Compose

## Overview
Running a full observability stack (Prometheus, Grafana, exporters) via Docker Compose on a Linux host (tested on Amazon Linux 2023 on EC2 t3.small).

## Quick Reference

### Minimum docker-compose.yml structure
```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:9090:9090"  # Bind to localhost only — don't expose publicly
    volumes:
      - ./prometheus/prometheus.yml:/etc/prometheus/prometheus.yml:ro
      - ./prometheus/rules:/etc/prometheus/rules:ro
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.retention.time=30d'
      - '--web.enable-lifecycle'  # Enables POST /-/reload for config reloads

  grafana:
    image: grafana/grafana:latest
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}
      - GF_USERS_ALLOW_SIGN_UP=false
    volumes:
      - grafana_data:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
      - ./grafana/dashboards:/var/lib/grafana/dashboards:ro

  node-exporter:
    image: prom/node-exporter:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:9100:9100"
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/rootfs:ro
    command:
      - '--path.procfs=/host/proc'
      - '--path.rootfs=/rootfs'
      - '--path.sysfs=/host/sys'
      - '--collector.filesystem.mount-points-exclude=^/(sys|proc|dev|host|etc)($$|/)'

  blackbox-exporter:
    image: prom/blackbox-exporter:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:9115:9115"
    volumes:
      - ./exporters/blackbox.yml:/etc/blackbox_exporter/config.yml:ro

  cloudwatch-exporter:
    image: prom/cloudwatch-exporter:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:9106:9106"
    environment:
      - AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
      - AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
      - AWS_DEFAULT_REGION=${AWS_REGION:-us-east-1}
    volumes:
      - ./exporters/cloudwatch-exporter.yml:/config/config.yml:ro

volumes:
  prometheus_data:
  grafana_data:

networks:
  monitoring:
    driver: bridge
```

### Reload Prometheus config without restart
```bash
curl -X POST http://localhost:9090/-/reload
```

### Grafana dashboard auto-provisioning
Create `grafana/provisioning/dashboards/dashboard.yml`:
```yaml
apiVersion: 1
providers:
  - name: 'my-project'
    type: file
    allowUiUpdates: true
    options:
      path: /var/lib/grafana/dashboards
```

Create `grafana/provisioning/datasources/prometheus.yml`:
```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    jsonData:
      timeInterval: 15s
      httpMethod: POST
```

## Gotchas

### Prometheus port binding
- Bind Prometheus to `127.0.0.1:9090` not `0.0.0.0:9090` — it has no auth and should never be public-facing
- Access remotely via SSH tunnel: `ssh -L 9090:localhost:9090 user@host`

### CloudWatch Exporter scrape interval
- CloudWatch metrics have 1-minute resolution — set `scrape_interval: 60s` for the cloudwatch job in prometheus.yml to avoid redundant API calls

### Node Exporter filesystem exclusion
- The `$$` in `--collector.filesystem.mount-points-exclude` is Docker Compose escaping for a literal `$` in shell — required in compose files

### Grafana dashboard JSON UIDs
- Each provisioned dashboard JSON must have a unique `"uid"` field, otherwise Grafana will error on load

### Docker Compose v2 syntax
- Use `services:` at the top level without `version:` — the `version` key is deprecated in Compose v2

## Testing

```bash
# Validate compose file
docker compose -f monitoring/docker-compose.yml config

# Check Prometheus config
docker run --rm -v $(pwd)/monitoring/prometheus:/etc/prometheus \
  prom/prometheus --config.file=/etc/prometheus/prometheus.yml --check-config

# Start stack
cd monitoring && docker compose up -d

# View logs
docker compose logs -f prometheus grafana
```
