# Unity — Editing the Physics2D Layer Collision Matrix from a Script (persisted)

How to programmatically toggle specific layer-collision pairs in the Physics 2D
matrix (`Edit ▸ Project Settings ▸ Physics 2D ▸ Layer Collision Matrix`) and have
the change persist to `ProjectSettings/Physics2DSettings.asset`.

## Do NOT hand-edit the hex

`Physics2DSettings.asset` stores the matrix as one long hex blob:

```yaml
m_LayerCollisionMatrix: ffffffff...fffbffff...dffff7ff7...
```

This is a packed 32×32 bitmask. It is frequently **already non-default** (some
pairs disabled by prior work), so hand-editing the hex risks silently clearing
bits you didn't mean to touch. Flip individual pairs via the API instead — it
preserves every other bit.

## Correct approach (Editor script via execute_script)

```csharp
using UnityEditor;
using UnityEngine;

public static class MatrixEdit
{
    public static void Execute()
    {
        // layer indices, not names
        const int Enemy = 9, EnemyBody = 10;

        // Disable a pair (ignore==true means "do NOT collide")
        Physics2D.IgnoreLayerCollision(EnemyBody, Enemy, true);
        Physics2D.IgnoreLayerCollision(EnemyBody, EnemyBody, true);

        // Explicitly (re-)enable a pair when needed: ignore==false
        // Physics2D.IgnoreLayerCollision(EnemyBody, 8 /*Walls*/, false);

        // Persist to disk. IgnoreLayerCollision updates the in-memory settings
        // singleton; forcing a project save flushes Physics2DSettings.asset.
        AssetDatabase.SaveAssets();
        EditorApplication.ExecuteMenuItem("File/Save Project");
    }
}
```

### Read / verify state
`Physics2D.GetIgnoreLayerCollision(a, b)` returns `true` when the pair is
IGNORED (does NOT collide). So `collide == !GetIgnoreLayerCollision(a, b)`.
Log a BEFORE/AFTER table to confirm you changed only the intended cells.

### Gotchas
- **Semantics are inverted:** `IgnoreLayerCollision(..., true)` = DISABLE
  collision; `false` = ENABLE. Easy to get backwards.
- **Verify persistence on disk**, not just in memory: re-read the asset's
  `m_LayerCollisionMatrix` line and confirm only the target nibbles changed.
- **`File/Save Project`** (via `ExecuteMenuItem`) is what actually writes
  `ProjectSettings/*.asset` to disk from a script; `AssetDatabase.SaveAssets()`
  alone does not cover ProjectSettings singletons.
- Layer collision also affects **trigger** overlap events, not just physical
  collisions — disabling a pair suppresses both for colliders on those layers.

## Related: reading a prefab's effective layers (incl. variants)

Prefab **variants** inherit `m_Layer` from their base and only store overrides,
so parsing the variant YAML by hand is unreliable. Get ground truth by loading
the composed asset and walking it:

```csharp
var go = AssetDatabase.LoadAssetAtPath<GameObject>(path);
// recurse go.transform; read t.gameObject.layer + LayerMask.LayerToName(layer)
// and Collider2D.isTrigger per component
```

To set a layer on a nested prefab object and persist (creates an override on a
variant): change `child.gameObject.layer` then `PrefabUtility.SavePrefabAsset(root)`,
or use the equivalent Editor tooling that saves the prefab.
