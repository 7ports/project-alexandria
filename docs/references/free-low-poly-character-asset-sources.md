---
id: free-low-poly-character-asset-sources
type: reference
title: Free / cheap low-poly rigged character & monster sources (Unity-compatible) — licensing gotchas
summary: "Where to get free CC0 low-poly rigged humanoids and monsters, which share rigs, and the licence traps (Quaternius QAL, Meshy CC BY, Tripo free non-commercial, Hunyuan territory)."
tags:
  - 3d-assets
  - unity
  - low-poly
  - characters
  - licensing
  - rigging
status: verified 2026-11
source_urls:
  - "https://quaternius.com/license.html"
  - "https://quaternius.com/packs/universalanimationlibrary2.html"
  - "https://quaternius.com/packs/bestiarydungeonmonsterskit.html"
  - "https://kaylousberg.itch.io/kaykit-adventurers"
  - "https://docs.meshy.ai/en/webapp/pricing"
embedding_version: 1
---

# Free / cheap low-poly rigged character & monster sources

## Shared-rig families (pick one so every humanoid reuses the same animations)
- **Quaternius "Universal" stack**: Universal Base Characters (6 bodies, 20 hairstyles, ~13k tris), Modular Character Outfits – Fantasy (62 parts), Universal Animation Library 1 (120+ clips) and 2 (130+ clips, Jan 2026, melee combos split into hit + recovery). All use one Humanoid rig that retargets in Unity, Godot and Unreal. All are CC0. ~60-70% of each pack is free; Source tiers (engine prefabs plus .blend) are paid or come through Patreon credits.
- **KayKit (Kay Lousberg)**: Adventurers, Skeletons and the Character Animations pack (133 clips for Rig_Medium plus 28 tool clips; Rig_Large has fewer). CC0, name-your-price, FBX + glTF, one shared 1024px gradient atlas. It uses its own rig, so import it as Generic in Unity unless you've checked that Humanoid mapping works.

## Monsters
- Quaternius Ultimate Monsters: 50 animated monsters, CC0, free.
- Quaternius Bestiary – Dungeon Monsters Kit (2026): humanoid-rig enemies with **no clips of their own**. They use the Universal Animation Library clips.
- Quaternius Easy Enemies / Animated Monsters: older, CC0.

## Licence gotchas
- **Quaternius isn't always CC0 any more.** Some newer packs (for example, Bestiary) use the *Quaternius Asset Licence (QAL v1.0)*. Commercial use is fine and no attribution is needed, but you **can't redistribute or resell the assets** as packs, templates or stock. Check the badge on each pack page.
- Meshy free tier output is **CC BY 4.0** (commercial use needs attribution). Paid plans get a private licence. Rigging, animation and remesh cost 0 credits.
- Tripo's free tier is reportedly non-commercial.
- Hunyuan3D community licence excludes the EU, UK and South Korea, and adds an MAU threshold.
- TRELLIS.2 is MIT but needs ~24 GB VRAM and Linux.
- Mixamo is free but unmaintained (it had outages in 2025) and humanoid-only. Mesh2Motion (free, open source, browser) also rigs quadrupeds, birds, spiders and snakes.
- Treat "fan" models of existing franchise characters on Sketchfab as unlicensed, whatever licence the uploader picks.
