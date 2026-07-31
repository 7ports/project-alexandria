# Unity URP — Particle System colors render magenta / ignore Start Color

## Symptom
A `ParticleSystem` renders **magenta/pink**, invisible, or ignores its Main-module **Start Color**.

## Root cause
The `ParticleSystemRenderer.material` is **null** (in the prefab/scene YAML: `m_Materials: - {fileID: 0}`).
- A null particle material renders as magenta (the "missing shader" fallback).
- Under **URP**, the legacy Built-in **`Default-ParticleSystem.mat`** also renders **magenta** because its shader is not URP-compatible. So even "assigning the default" via Built-in resources does NOT fix it under URP.

## Fix
Assign a URP-compatible material whose shader **multiplies by the particle vertex/Start Color**:
- **URP 2D (Renderer2D):** `Sprites/Default` is the simplest guaranteed-visible choice. Alpha-blended (render queue 3000), respects particle Start Color via vertex color. No texture => solid colored squares (fine for confetti); assign a soft round texture for round droplets.
- **URP 3D:** `Universal Render Pipeline/Particles/Unlit` (needs blend-mode/surface setup to be transparent).

Detect pipeline before choosing: check `Packages/manifest.json` for `com.unity.render-pipelines.universal` and `Assets/Settings/Renderer2D.asset`.

## Editing prefab assets safely from an editor script
```csharp
var root = PrefabUtility.LoadPrefabContents(path);
try {
    var r = root.GetComponent<ParticleSystemRenderer>();
    r.sharedMaterial  = mat;
    r.sharedMaterials = new Material[]{ mat };
    var main = root.GetComponent<ParticleSystem>().main;
    main.startColor = new ParticleSystem.MinMaxGradient(Color.red);           // constant
    // Random hue per particle from a gradient (confetti):
    main.startColor = new ParticleSystem.MinMaxGradient(rainbowGradient)
        { mode = ParticleSystemGradientMode.RandomColor };
    PrefabUtility.SaveAsPrefabAsset(root, path);
} finally { PrefabUtility.UnloadPrefabContents(root); }
```

## YAML verification cheatsheet
- Renderer fixed when `m_Materials: - {fileID: 2100000, guid: <mat>, type: 2}` (not `{fileID: 0}`).
- Main-module `startColor.minMaxState`: `0`=constant Color (value in `maxColor`), `1`=Gradient, `2`=RandomBetweenTwoColors, `3`=TwoGradients, `4`=RandomColor.

## Gotcha: execute_script entry point
Coplay MCP `execute_script` entry method must be **parameterless** (`public static string Execute()`). Passing a `string json` param throws "Number of parameters specified does not match".
