---
id: scryfall-bulk-data-and-tagger-tags
type: reference
title: Scryfall bulk data incl. Tagger art/oracle tags
summary: "Scryfall bulk files (oracle_cards, art_tags, oracle_tags) — structure, keys, gotchas (User-Agent required, tags are jsonl.gz)."
tags:
  - scryfall
  - mtg
  - magic-the-gathering
  - bulk-data
  - tagger
  - dataset
status: verified 2026-10
source_urls:
  - "https://api.scryfall.com/bulk-data"
  - "https://scryfall.com/docs/api/bulk-data"
embedding_version: 1
---

# Scryfall bulk data & Tagger tags

## Gotchas
- **Scryfall returns HTTP 403 without a `User-Agent` + `Accept` header.** Generic fetch tools (e.g. WebFetch-style page fetchers) get 403 on scryfall.com docs too. Use `curl -H "User-Agent: <your-app>/0.1" -H "Accept: application/json"`.
- `GET https://api.scryfall.com/bulk-data` lists files. Card files expose `download_uri`; the **tag files expose only `jsonl_download_uri`** (gzipped JSON Lines) — `d['download_uri']` raises KeyError for them, and some entries have no `size` field (use `.get`).

## Files (as of 2026-10)
- `oracle_cards` — one card object per oracle_id (good for "unique cards" datasets; includes `edhrec_rank`, `illustration_id`, `legalities`, `keywords`, `reserved`, etc.)
- `unique_artwork`, `default_cards`, `all_cards`, `rulings`
- `art_tags` — ~13MB gz, ~11.6k tags. Each line: `{label, slug, type:"illustration", parent_ids, child_ids, aliases, taggings:[{illustration_id, weight}]}`. Weights: `very_strong|strong|median|weak` (mostly median). ~53k illustrations tagged.
- `oracle_tags` — ~6MB gz, ~4.5k tags, `taggings:[{oracle_id, weight}]`. ~36k oracle_ids tagged.

## Notes for using tags
- Art tags are **per illustration**, not per card — join via the card's `illustration_id`; a card with reprints may have several arts.
- Tags form a hierarchy (`parent_ids`) — expand to ancestors if you want broad categories.
- Both sets contain lots of meta/noise tags ("digital painting", "artist signature", "alliteration", "dutch angle") — curate an allowlist before using them as features.
- Tagger is community-maintained: absence of a tag is weak evidence, not a negative.
- Search syntax equivalents: `art:`/`atag:` and `function:`/`otag:` work in `/cards/search?q=`.
