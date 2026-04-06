# GitHub Pages — Jekyll via GitHub Actions

## Overview
Deploy a Jekyll site from a `docs/` subdirectory using GitHub Actions (not the legacy "Deploy from branch" method). Required when using `actions/deploy-pages`.

## Quick Reference

### Workflow (docs.yml)
```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v4
      - uses: actions/jekyll-build-pages@v1
        with:
          source: ./docs
          destination: ./_site
      - uses: actions/upload-pages-artifact@v3

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - uses: actions/deploy-pages@v4
        id: deployment
```

### Jekyll _config.yml for subdirectory site
```yaml
remote_theme: pages-themes/cayman@v0.2.0
plugins:
  - jekyll-remote-theme
  - jekyll-seo-tag

url: "https://<username>.github.io"
baseurl: "/<repo-name>"
```

### Enable Pages via GitHub API (gh CLI)
```bash
# Enable Pages with docs/ as source
gh api repos/OWNER/REPO/pages --method POST \
  --field source[branch]=main \
  --field source[path]=/docs

# Switch to GitHub Actions build type (required for actions/deploy-pages)
gh api repos/OWNER/REPO/pages --method PUT \
  --field build_type=workflow
```

## Gotchas

### `build_type=workflow` is required for actions/deploy-pages
- The GitHub Pages API creates pages with `build_type=legacy` by default
- `actions/deploy-pages` requires `build_type=workflow`
- Must issue a second `PUT` request to switch after creation, or the deployment will silently fail

### `--field source[branch]=main` not `-f source='{"branch":"main"}'`
- The gh CLI `--field` flag correctly handles nested objects; `-f` treats the value as a string and causes a 422 error

### Permissions block is mandatory
- The workflow must declare `pages: write` and `id-token: write` permissions
- Without these, `actions/deploy-pages` will fail with a permissions error

### `concurrency` group prevents race conditions
- Use `cancel-in-progress: false` (not `true`) for Pages — you want the most recent deploy to finish, not cancel mid-deploy

### baseurl must match repo name
- If `baseurl` is wrong, Jekyll will generate broken asset paths (CSS/JS 404s)
- For a repo at `github.com/user/repo`, set `baseurl: "/repo"`

### Path filter triggers docs rebuild only
- Add `paths: ['docs/**']` so the workflow only runs when doc files change
