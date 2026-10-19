---
id: cloudflare-worker-custom-domain
type: guide
title: Cloudflare Worker on a custom domain (wrangler)
summary: "routes with custom_domain: true; workers_dev turns off by default once routes exist"
tags:
  - cloudflare
  - workers
  - wrangler
  - dns
  - custom-domain
source_urls:
  - "https://developers.cloudflare.com/workers/configuration/routing/custom-domains/"
  - "https://developers.cloudflare.com/workers/wrangler/configuration/"
embedding_version: 1
---

# Cloudflare Worker on a custom domain (wrangler)

Verified 2026-10 with wrangler 4.149 (Worker with static assets + D1, built through @cloudflare/vite-plugin).

## Config (wrangler.jsonc)
```jsonc
"routes": [
  { "pattern": "<your-domain>", "custom_domain": true },
  { "pattern": "www.<your-domain>", "custom_domain": true }
],
"workers_dev": true
```
- `wrangler deploy` creates the DNS records and certificate itself; the deploy output lists each `(custom domain)`. In testing, the domain answered over HTTPS within a minute.
- Requirements: the zone must be active on Cloudflare (domains bought through Cloudflare Registrar already are; check with `nslookup -type=NS <domain>` showing `*.ns.cloudflare.com`), and there must be no existing CNAME on that hostname.
- Custom domains match exact hostnames, so `www` needs its own entry (or a redirect rule plus a proxied DNS record).

## Gotchas
- **`workers_dev` defaults to `false` once `routes` is set.** If you omit it, the old `*.workers.dev` URL goes dark on the next deploy, which breaks shared links and installed PWAs. Set `workers_dev: true` to keep it.
- `preview_urls` follows `workers_dev` when unset.
- With the Vite plugin, the deployed config is the generated `dist/<worker>/wrangler.json`. Check that it carries `routes` and `workers_dev`, then run `npx wrangler deploy --dry-run -c dist/<worker>/wrangler.json`. A dry run doesn't validate the domain or zone.
- Storage (localStorage, service-worker caches) is per origin. Users moving from workers.dev to the new domain start fresh, and so do PWA installs.
