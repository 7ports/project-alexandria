---
id: unity-openfracture-runtime-mesh-slicing
type: guide
title: Unity — Runtime Mesh Slicing with OpenFracture
summary: "Installing OpenFracture on Unity 6, calling Fragmenter.Slice with your own fragment template, and preparing a model (closed, single sub-mesh, no nested duplicate shells) so cuts cap cleanly."
tags:
  - unity
  - mesh-slicing
  - openfracture
  - physics
  - blender
status: active
source_urls:
  - "https://github.com/dgreenheck/OpenFracture"
embedding_version: 1
---

# Unity — Runtime Mesh Slicing with OpenFracture

OpenFracture (MIT, dgreenheck) splits a mesh along a plane at runtime and **caps the cut**, including
concave shapes and cut outlines with holes. Verified on Unity 6000.4 with URP 17.

## Install

It is laid out as a UPM package at the repo root, so add it by git URL and **pin a commit**:

```json
"com.dgreenheck.openfracture": "https://github.com/dgreenheck/OpenFracture.git#<commit-sha>"
```

- Compiles cleanly on Unity 6, despite the sample components using pre-6 Rigidbody names
  (`velocity`, `drag`) — those are obsolete warnings, not errors.
- Its `package.json` pulls in `com.unity.testtools.codecoverage` (adds a `ProjectSettings/Packages/...`
  settings file and extra `.csproj` entries). Harmless; commit them.
- The runtime asmdef is `autoReferenced`, so plain Assembly-CSharp scripts can use `Fragmenter` and
  `SliceOptions` (global namespace) with no asmdef work.

## Call `Fragmenter.Slice`, not the `Slice` component

The bundled `Slice` component builds each fragment from a copy of the **source** object's Rigidbody and
collider settings. If the source is kinematic (anything that moves itself — an enemy, a flying
creature), the pieces come out kinematic too. Call the static API with your own template instead:

```csharp
Fragmenter.Slice(sourceGameObject,
                 transform.InverseTransformDirection(normalWorld),   // LOCAL space
                 transform.InverseTransformPoint(pointWorld),        // LOCAL space
                 new SliceOptions { insideMaterial = inside, detectFloatingFragments = false },
                 template,            // MeshFilter + MeshRenderer + MeshCollider + Rigidbody
                 fragmentRoot);       // fragments are created at this transform's local origin
```

- Fragments spawn at `localPosition = 0` under `fragmentRoot` with the **source's localScale**. Give the
  root the source's world pose and **unit scale**.
- Each fragment mesh has **two sub-meshes**: 0 = original surface, 1 = cap. Give the template renderer
  `[surfaceMaterial, insideMaterial]`.
- The source needs a `Rigidbody` — its **mass is divided between the pieces** by bounding-box volume.
- Build the template **inactive**: `Instantiate` of an inactive object yields inactive clones, so each
  piece can be fully configured before it simulates. Destroy the template afterwards.
- For pieces that must behave as walkable ground: dynamic Rigidbody, **convex** `MeshCollider` (required
  for a dynamic body; Unity caps the hull at 255 triangles), `ContinuousDynamic` so fast pieces do not
  tunnel, `Interpolate` for smooth rendering.
- It works in edit mode too (useful for automated checks) — use `DestroyImmediate` there.

## `detectFloatingFragments`: off for assembled models

It splits every disconnected island of each piece into its own object. A character/creature modelled
from separate overlapping parts (legs, eyes pushed into a body) is *already* many islands, so this
option scatters every limb as individual debris instead of giving two halves. Leave it off unless the
mesh is a single connected solid.

## Preparing the model

Requirements: **closed** geometry (no boundary edges — a hole cannot be capped), **one sub-mesh**,
**Read/Write enabled** on the importer (otherwise the CPU vertex copy is gone at runtime), and mesh
compression off (the cap is built from exact edge intersections).

Two things worth checking in Blender before blaming the slicer:

- **Nested duplicate shells.** Some models contain a slightly smaller copy of a part hidden inside the
  part itself (both outward-facing, invisible). A cut through them yields nested outlines and a
  **ring-shaped cap with a hollow behind it**. Detect by grouping shells (flood fill over shared
  vertices) and flagging pairs with near-identical centres; delete the smaller of each pair. Strict
  bounding-box containment misses pairs where the inner copy pokes out by a hair — match on centre.
- **Self-intersecting parts** (limbs sunk into a body) violate the library's stated requirements but
  in practice cap fine: expect a handful of unmatched edges inside the cap (e.g. ~10 of ~1,000), not
  visible from outside, and irrelevant to physics because the colliders are convex hulls. Test before
  rebuilding a mesh on spec.

Export an FBX from Blender instead of importing the `.blend` directly — otherwise every machine that
opens the project needs Blender installed. Keep the original `.blend` outside `Assets/`.

## Verifying a slice

Count **open edges** per piece after welding vertices by position (tight tolerance, relative to mesh
size): 0 means the cap sealed the cut. Then look — pull the halves apart along the cut normal and view
the caps, because a small non-zero count can be invisible interior overlap. Finally, in play mode, drop
the pieces and check their lowest collider point sits at floor height once asleep (no sinking or
tunnelling).
