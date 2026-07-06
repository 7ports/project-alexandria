# Unity URP 2D — ParticleSystem renders magenta / ignores color

## Symptom
A `ParticleSystem` you created programmatically (or via minimal Editor setup) renders **magenta/pink**, appears invisible, or ignores its **Start Color** — under a **URP (Universal Render Pipeline) 2D Renderer** project.

## Root cause
The `ParticleSystemRenderer` has **no material assigned** (in prefab/scene YAML: `m_Materials: - {fileID: 0}`). A null particle material renders magenta and does not multiply by the particle vertex/Start Color. Under URP, the legacy Built-in `Default-ParticleSystem.mat` ALSO renders magenta (Built-in shaders are incompatible with URP), so simply pointing at the built-in default does not fix it.

## Fix
Assign a **URP-compatible, color-respecting** material to the `ParticleSystemRenderer`:
- Simplest reliable choice for 2D: a material using the **`Sprites/Default`** shader — alpha-blended, render queue 3000, multiplies by the particle Start Color, always visible in the URP 2D renderer.
- Create it once and share it across all your particle prefabs (e.g. `Assets/Materials/ParticleColored.mat`), then assign to each renderer.
- With **no `_MainTex`** the particles are solid colored squares (reads fine as spatter/confetti). For soft round droplets, assign a soft-dot texture to `_MainTex` — the color logic is unaffected either way.

## Colors after the material is fixed
- Solid color: Main module → Start Color = Constant.
- Multicolor ("rainbow confetti"): Start Color = **Random Between Two Colors**, or **Random Color** with a multi-key gradient (red→orange→yellow→green→blue→violet). In YAML this shows as `minMaxState: 4` with N color keys.

## Gotchas
- Do NOT regress `simulationSpace` (World) or `useUnscaledTime` (needed if the effect must animate while `Time.timeScale = 0`, e.g. a level-up burst behind a pause menu) when editing the prefab.
- One-shot bursts (`playOnAwake = false`, short duration) can't be visually confirmed in Edit Mode — verify in Play Mode.
- Authoring `ParticleSystem` prefabs generally needs `create_game_object` / `add_component` / `execute_script`-class Editor tooling; inspect/material-only tool grants can't add the component.

## Verify
Enter Play Mode and trigger the effect; the particles should show the intended colors instead of magenta.

## References
- Applies to URP 2D Renderer (verified on URP 17.4.0, Unity 6.x).

---
*Last updated: 2026-07-06*
*Verified on: Windows, Unity 6.x + URP 17.4.0 (2D Renderer)*
