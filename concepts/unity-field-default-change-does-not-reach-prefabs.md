---
id: unity-field-default-change-does-not-reach-prefabs
type: concept
title: "Unity: changing a field's default in code does not update existing prefabs or scene objects"
summary: Existing prefabs and scene objects keep their old serialized or in-memory values when a MonoBehaviour field's initializer changes; set the value on the prefab explicitly and verify the live value.
tags:
  - unity
  - serialization
  - prefabs
  - gotcha
  - testing
embedding_version: 1
---

# Changing a field's default in code does not reach existing objects

Editing `public float X = 0.25f;` to `= 0.5f` only affects **newly created** components.

- **Serialized objects keep their stored value.** Prefabs and scene objects that already store `X: 0.25` keep it.
- **In-memory objects keep it even when nothing is stored.** A field added to a component after the prefab was last saved has no line in the `.prefab` file. But the object loaded in the editor was constructed with the old default, and a domain reload preserves that in-memory value.
  - Result: play mode uses 0.25 while a text search of the prefab finds no `X:` line to explain it.
  - `LoadPrefabContents` (fresh from disk) and a newly added component both report 0.5, so edit-mode spot checks can look right while the running game is wrong.

**Fix:** set the value explicitly on the prefab: `PrefabUtility.LoadPrefabContents(path)`, then assign the field, then `SaveAsPrefabAsset`, then `UnloadPrefabContents`. The line is now on disk. Also check scene instances for overrides with `PrefabUtility.GetPropertyModifications`.

**In tests:** derive expectations from the live value (e.g. `controller.X + 0.2f`) rather than a hard-coded default, and print it in the check's message. A label showing the unexpected number is what exposes the stale value.
