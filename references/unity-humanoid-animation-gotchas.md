---
id: unity-humanoid-animation-gotchas
type: reference
title: Unity — Humanoid Animation & Prefab Gotchas (Mecanim)
summary: "Non-obvious Mecanim/prefab behaviours that present as character bugs: empty override-layer states snap to bind pose, root channels need different Bake Into Pose settings (and Based Upon Y is a three-way choice where both flags false means Centre of Mass), SampleAnimation and SetHumanPose are inert in edit mode, reparenting inside a model prefab instance reverts, and muscle names do not map to world directions."
tags:
  - unity
  - mecanim
  - animator
  - humanoid
  - prefab
  - animation
  - root-motion
  - avatar-mask
  - mixamo
status: active
embedding_version: 1
---

# Unity — Humanoid Animation & Prefab Gotchas (Mecanim)

Behaviours that present as bugs in the character rather than as errors. Verified on Unity 6.4 with a
scripted-movement CharacterController (`applyRootMotion = false`).

## An empty state on an Override layer snaps the masked bones to bind pose

The common upper-body-attack setup — an Override layer with an AvatarMask, an empty "None" default
state, and the attack state — does **not** let the base layer show through. At layer weight 1 a state
with no motion drives every bone in the mask to its **bind pose**, freezing the upper body mid-stride.
Symptoms: arms lock into a T-pose-ish stance, every attack/block "looks like a different animation".

Keep the layer at **weight 0** and raise it only while a combat state plays:

```csharp
int layer = animator.GetLayerIndex("Combat");
var state = animator.GetCurrentAnimatorStateInfo(layer);
bool active = animator.IsInTransition(layer) || !state.IsName("None");
_weight = Mathf.MoveTowards(_weight, active ? 1f : 0f, Time.deltaTime * fadeSpeed);
animator.SetLayerWeight(layer, _weight);
```

Set `defaultWeight = 0` when building the layer. (Layer 0 is the reverse: Unity forces it to weight 1
at runtime but serialises `defaultWeight = 0` on a fresh controller — set it to 1 so it reads sanely.)

## Root channels need DIFFERENT Bake Into Pose settings

"Bake Into Pose" moves a channel **out** of root motion and **into** the body pose, where
`applyRootMotion = false` can no longer discard it. That makes it the wrong choice for two channels and
mandatory for the third:

| Channel | Bake Into Pose | Why |
|---|---|---|
| Rotation | **off** | stays root motion, discarded, body keeps facing GameObject forward |
| Position XZ | **off** | stays root motion, discarded, body stays centred over the capsule |
| **Position Y** | **on** | `RootT.y` is not travel — it is what holds the hips at standing height |

Getting Y wrong is the classic "character sinks into the floor": leave it as root motion and the
vertical offset is discarded, collapsing the whole body onto the root. Measured hips at −0.007 while
walking against ~1.03 when correct — about one leg length of sink.

### "Based Upon" for Y is a three-way choice — both flags false is NOT the default you want

This is the part that looks like the setting did nothing:

```csharp
clip.lockRootHeightY = true;          // Bake Into Pose
clip.keepOriginalPositionY = false;   // rules out "Original" ...
clip.heightFromFeet = true;           // ... and THIS selects "Feet"
```

With `keepOriginalPositionY` and `heightFromFeet` both false it resolves to **Centre of Mass**, which
parks the root at hip height so the hips render down at ground level — still sunk, even with the bake
enabled. `heightFromFeet` is the flag that actually pins the feet to the root.

In the `.meta` the serialised names differ from the API: `loopBlendOrientation` = `lockRootRotation`,
`loopBlendPositionY` = `lockRootHeightY`, `loopBlendPositionXZ` = `lockRootPositionXZ`. Grep those to
confirm a setting really landed.

## SampleAnimation and SetHumanPose are inert in edit mode

Both need an initialised Animator to run the humanoid solver. In edit mode they **fail silently** —
no error, and every read returns the bind pose.

- `AnimationClip.SampleAnimation` on an FBX humanoid clip: no-op. A "capture the rest pose" routine
  built on it (sample, then `HumanPoseHandler.GetHumanPose`) returns a literal T-pose
  (`Forearm Stretch = 0.985`, every spine value 0). Read the source clip's curves directly instead —
  `AnimationUtility.GetEditorCurve(clip, binding).Evaluate(0f)` — which needs no Animator at all.
- `HumanPoseHandler.SetHumanPose`: also a no-op, including in play mode on a **freshly instantiated**
  prefab whose avatar solver has not started. A parameter sweep built on it returns byte-identical
  positions for every input, which reads as a broken harness rather than a broken API.
- It also cannot verify root import settings, since it bypasses Mecanim's root handling entirely.
  Drive the real Animator instead: `animator.Play(state, 0, 0f); animator.Update(dt);` and watch the
  **swing** (max − min) of a hip bone's yaw, not its absolute value.

## Muscle names describe joint rotations, not world directions

You cannot read "which value puts the hand up and to the left" off a muscle name. On a right arm,
`Right Arm Front-Back` **negative** carries the hand across the chest to the left and positive takes it
out to the right — not what the name suggests. Measure the end effector and build a small table rather
than reasoning from names.

Two further traps when shaping a swing:

- **Amplitude is not reach.** Pushing wind-up values toward their limits can make the arc *smaller* if
  the limb folds: over-bending `Right Forearm Stretch` at the apex dropped the hand apex from 0.58 to
  0.51. Opening the elbow raised it to 0.72.
- **Do not rotate all the way through.** A hand's lateral offset peaks when the arm is horizontal and
  shrinks again as it continues to hanging, so swinging to `Down-Up −0.72` curls the hand back to
  centre. Stop around `−0.25` to finish out at down-right.
- **Every channel must keep going through the follow-through.** A channel that reverses at the
  follow-through key makes the smoothed tangent overshoot just *before* the strike, bending the path.
  Recover to the ready pose on a later key instead.

Measure straightness rather than eyeballing: sample the cut, project each point onto the chord between
its endpoints, and report max perpendicular deviation. This took one swing from 74.5% of chord to 40.6%
with x and y both monotonic.

## Authoring a Humanoid clip from muscle curves in code

```csharp
var binding = EditorCurveBinding.FloatCurve("", typeof(Animator), "Right Arm Down-Up");
AnimationUtility.SetEditorCurve(clip, binding, curve);
```

`clip.isHumanMotion` turns true once muscle curves exist, and it retargets like an imported clip.

- Get exact spellings by dumping `AnimationUtility.GetCurveBindings()` on an imported humanoid clip.
- **`HumanTrait.MuscleName` does not match binding names for fingers** — `Left Index 1 Stretched` vs
  the binding `LeftHand.Index.1 Stretched`.
- A clip missing a muscle leaves that bone at **bind pose**, so a partial clip on an unmasked layer
  gives T-pose arms.
- **Keep `RootT.y`** on a full-body base-layer clip, for the reason above. Zero `RootT.x/z` and force
  `RootQ` to identity if you want no drift or turn. Masked upper-body clips need no root curves at all.
- `curve.SmoothTangents(i, 0f)` on every key; linear tangents look mechanical.

## Mixamo clip names oversell what the clip does

`Falling_Impact` is not a landing: it is a fall-from-height crumple that descends ~2m and turns the body
~250°. Used as the Land state after a small hop it reads as the character lurching sideways and sinking.
For a short jump, returning straight to locomotion usually beats a wrong landing clip.

A set may also have exactly one idle and it may be a *fidget* (`Idle_Bored`). Looping a fidget as the
resting pose is why "the idle plays too often" — generate a calm idle and demote the fidget to an
occasional break on a randomly re-rolled interval.

## Check ground fit with BakeMesh, not renderer bounds

`SkinnedMeshRenderer.bounds` is padded bind-pose bounds and lies in both directions: 2.11m reported
against a true skeleton height of 1.84m, and a lowest point of −0.078 where the real geometry was at
+0.020. Measure the skeleton for sizing; bake the posed skin in play mode for ground fit:

```csharp
var baked = new Mesh(); smr.BakeMesh(baked, true);
foreach (var v in baked.vertices) lowest = Mathf.Min(lowest, smr.transform.TransformPoint(v).y);
```

## Reparenting inside a model prefab instance is silently discarded

Moving a mesh under a hand bone inside an instantiated model (FBX) prefab is not a supported override.
It works in memory — logs and screenshots right after look correct — then is thrown away on save, and
the weapon reverts to the model root. Diagnose by printing the parent chain, not by looking. Fix:

```csharp
PrefabUtility.UnpackPrefabInstance(model, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
```

## Weapons in asset-pack FBXs are props laid out beside the character

Often metres away at the origin, so `SetParent(bone, worldPositionStays: true)` preserves the *wrong*
place, and the mesh pivot is unreliable (often mid-blade). Place by geometry: centroid of the sub-mesh
whose material names the grip, seated on the bone, then aim the blade by rotating the grip→blade axis
onto a chosen direction — and re-seat the position *after* rotating. Leaving `localRotation` at identity
inherits the bone's arbitrary axes, which is why a sword often ends up hanging straight down.

## Jump flags cleared one frame too early

`Grounded` stays true for a frame or two after take-off, so clearing the animator's `Jump` bool whenever
`Grounded` clears it immediately and a transition on `Grounded && !Jump` fires before the jump clip
plays. Gate the clear behind the jump cooldown and reset that cooldown *on take-off*, so it doubles as
a take-off window.
