# GitHub Actions — Deploy to EC2 via SSH

## Overview
Auto-deploy a Docker Compose stack to an EC2 instance on push to main, using the `appleboy/ssh-action` action.

## Quick Reference

### Workflow
```yaml
name: Deploy to EC2

on:
  push:
    branches: [main]
    paths:
      - 'monitoring/**'
      - 'infrastructure/**'
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ${{ secrets.EC2_USER }}
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            set -euo pipefail
            cd /opt/project-sauron
            git fetch origin main
            git reset --hard origin/main
            cd monitoring
            docker compose pull
            docker compose up -d --remove-orphans
```

### Required GitHub Secrets
| Secret | Value |
|---|---|
| `EC2_HOST` | Elastic IP of the EC2 instance |
| `EC2_SSH_KEY` | Full contents of the private SSH key (PEM format) |
| `EC2_USER` | `ec2-user` (Amazon Linux) or `ubuntu` (Ubuntu) |

## Gotchas

### SSH key format in GitHub secrets
- Paste the entire private key including `-----BEGIN ... KEY-----` and `-----END ... KEY-----` lines
- The `appleboy/ssh-action` handles multi-line secret values correctly

### `git reset --hard` vs `git pull`
- Use `git reset --hard origin/main` (not `git pull`) to avoid merge conflicts from local changes on the EC2 instance

### `--remove-orphans` flag
- Always use `docker compose up -d --remove-orphans` to clean up containers from removed services

### Path filters reduce unnecessary deploys
- Use `paths:` filter so the workflow only runs when relevant files change — avoids deploying on README or docs changes

### `workflow_dispatch`
- Always add `workflow_dispatch` trigger to allow manual deploys without a code push
