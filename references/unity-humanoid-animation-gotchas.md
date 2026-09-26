---
id: unity-humanoid-animation-gotchas
type: reference
title: Unity — Humanoid Animation & Prefab Gotchas (Mecanim)
summary: "Non-obvious Mecanim/prefab behaviours that present as character bugs: empty states on override layers snap to bind pose, Bake Into Pose does the opposite of what scripted movement wants, SampleAnimation cannot verify root settings, reparenting inside a model prefab instance silently reverts, plus authoring humanoid clips from muscle curves and HumanPoseHandler."
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

Behaviours that present as bugs in the character rather than as errors. Verified on Unity 6.4.

## An empty state on an Override layer snaps the masked bones to bind pose

The common upper-body-attack setup is: an Override layer with an AvatarMask, an empty "None" default
state, and the attack state. The intuition is that an empty state contributes nothing and the base
layer shows through.

**It does not.** At layer weight 1 a state with no motion drives every bone in the mask to its **bind
pose**, freezing the upper body mid-stride. Symptoms: the arms lock into a T-pose-ish stance, and every
attack/block "looks like a different animation".

Fix: keep the layer at **weight 0** and raise it only while a combat state is playing.

```csharp
int layer = animator.GetLayerIndex("Combat");
var state = animator.GetCurrentAnimatorStateInfo(layer);
bool active = animator.IsInTransition(layer) || !state.IsName("None");
_weight = Mathf.MoveTowards(_weight, active ? 1f : 0f, Time.deltaTime * fadeSpeed);
animator.SetLayerWeight(layer, _weight);
```

Set `AnimatorControllerLayer.defaultWeight = 0` when building the controller. (Layer 0 is the opposite
case: Unity forces it to weight 1 at runtime, but a freshly created controller serialises
`defaultWeight = 0`, which reads as alarming in the Inspector — set it to 1.)

## "Bake Into Pose" is backwards from what scripted movement wants

With `applyRootMotion = false`, anything Mecanim classifies as **root motion is discarded** — which is
exactly what a script-driven CharacterController wants, because the body then stays centred and upright
over its capsule.

**Bake Into Pose moves a channel OUT of root motion and INTO the body pose**, where it can no longer be
discarded. So enabling it does not "lock the character in place"; it makes the authored drift visible.
Turning it on for Root Transform Position (Y) on a fall-from-height clip sank the rendered body two
metres through the floor.

For a scripted-movement controller, leave all three **off**:

```csharp
clip.lockRootRotation   = false;   // rotation   -> root motion -> discarded
clip.lockRootPositionXZ = false;   // horizontal -> root motion -> discarded
clip.lockRootHeightY    = false;   // vertical   -> root motion -> discarded
clip.keepOriginalOrientation = false;   // measure from the body, not the authored origin
clip.keepOriginalPositionXZ  = false;
clip.keepOriginalPositionY   = false;
```

Bake Into Pose is for the opposite case — root-motion-driven characters, where you want a channel
excluded from the motion applied to the Transform.

## SampleAnimation cannot verify any of that

`AnimationClip.SampleAnimation` applies the raw curves straight to the transforms and **bypasses
Mecanim's humanoid root handling entirely**. It returns byte-identical numbers before and after you
change the Root Transform import settings, which makes it look like the settings did nothing.

Verify by driving the real Animator in play mode and stepping it manually:

```csharp
animator.Play(stateName, 0, 0f);
animator.Update(0f);
for (int i = 0; i < steps; i++) {
    Vector3 fwd = root.InverseTransformDirection(hips.forward);
    float yaw = Mathf.Atan2(fwd.x, fwd.z) * Mathf.Rad2Deg;   // body yaw in character space
    animator.Update(0.15f);
}
```

Watch the **swing** (max − min) rather than absolute yaw: a bone's local axes are arbitrary, so the
absolute number is meaningless, but a 250° swing within one state is not.

When probing states this way, remember default parameter values still drive transitions — `Grounded`
defaulting to true sends Jump and FreeFall straight into the landing state, so all three report
identical numbers and it looks like a measurement bug.

## Mixamo clip names oversell what the clip does

`Falling_Impact` is not a landing: it is a fall-from-height crumple that descends ~2m and turns the
body ~250°. Used as the Land state after a small hop it reads as the character lurching sideways and
sinking. Check a clip's actual root travel before wiring it up; for a short jump, returning straight to
locomotion usually looks better than a wrong landing clip.

Similarly, a set may have exactly one idle and it may be a *fidget* (`Idle_Bored`). Looping a fidget as
the resting pose is why "the idle plays too often". Generate a calm idle and demote the fidget to an
occasional break on a random re-rolled interval.

## Capturing a rest pose with HumanPoseHandler

To build a neutral idle from an existing clip's first frame:

```csharp
source.SampleAnimation(instance, 0f);
var handler = new HumanPoseHandler(animator.avatar, instance.transform);
var pose = new HumanPose();
handler.GetHumanPose(ref pose);
float[] muscles = (float[])pose.muscles.Clone();   // indexed by HumanTrait.MuscleName
handler.Dispose();
```

Then write constant curves at those values, adding a slow sine on `Chest Front-Back`,
`Spine Front-Back` and the shoulder muscles for breathing.

## Authoring a Humanoid clip from muscle curves in code

Bind float curves to `typeof(Animator)` with an empty path and the **muscle name** as the property, in
normalised −1..1 muscle space:

```csharp
var binding = EditorCurveBinding.FloatCurve("", typeof(Animator), "Right Arm Down-Up");
AnimationUtility.SetEditorCurve(clip, binding, curve);
```

`clip.isHumanMotion` turns true once muscle curves exist, and it retargets like an imported clip.

- Get exact spellings by dumping `AnimationUtility.GetCurveBindings()` on an imported humanoid clip.
  They are space-separated (`Right Forearm Stretch`, `Spine Twist Left-Right`, `Head Nod Down-Up`).
- **`HumanTrait.MuscleName` does not match the binding names for fingers** — it reports
  `Left Index 1 Stretched` while the binding is `LeftHand.Index.1 Stretched`. Skip fingers or map them
  explicitly when iterating muscles.
- A clip missing a muscle leaves that bone at **bind pose**, so a partial clip on an unmasked layer
  gives T-pose arms. Write every body muscle for a full-body clip.
- Omit root/leg curves for a masked upper-body clip; `SampleAnimation` will then drop the model through
  the floor in preview — an artefact, not a defect. Lift the instance by its lowest renderer bound.
- `curve.SmoothTangents(i, 0f)` on every key; linear tangents look mechanical.

## Reparenting inside a model prefab instance is silently discarded

Moving a mesh under a hand bone **inside an instantiated model (FBX) prefab** is not a supported
override. It works in memory — logs and screenshots right after look correct — then is thrown away when
the prefab is saved. The weapon reverts to the model root and stops following the animation.

Diagnose by printing the actual parent chain, not by looking at the viewport. Fix:

```csharp
PrefabUtility.UnpackPrefabInstance(model, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
```

Trade-off: the instance stops tracking the FBX hierarchy, so re-run your setup step after reimporting.

## Weapons in asset-pack FBXs are props laid out beside the character

Do not assume a weapon is authored in the hand — it is often metres away at the origin, so
`SetParent(bone, worldPositionStays: true)` faithfully preserves the *wrong* place. The mesh pivot is
also unreliable (often mid-blade).

Place it by geometry: take the centroid of the sub-mesh whose material names the grip ("Handle"), seat
that on the bone, then aim the blade by rotating the grip→blade axis onto a chosen direction.

```csharp
weapon.SetParent(bone, false);
weapon.localRotation = Quaternion.identity;
Vector3 axis = (bladeCentroid - gripCentroid).normalized;
weapon.rotation = Quaternion.FromToRotation(weapon.TransformDirection(axis),
                                            model.TransformDirection(desiredDir)) * weapon.rotation;
weapon.position += bone.position - weapon.TransformPoint(gripCentroid);  // re-seat AFTER rotating
```

Verify by measuring blade-tip travel across sampled times — a weapon stuck at the origin still looks
plausible in a single screenshot.

## SkinnedMeshRenderer.bounds is inflated — never size a character from it

It reports padded bind-pose bounds: 2.11m reported against a true skeleton height of 1.84m, leaving a
CharacterController 20cm too tall. Measure lowest foot bone to top of the head chain instead.

## Jump flags cleared one frame too early

`Grounded` stays true for a frame or two after take-off, so clearing the animator's `Jump` bool whenever
`Grounded` clears it immediately, and a transition conditioned on `Grounded && !Jump` fires before the
jump clip plays. Gate the clear behind the jump cooldown, and reset that cooldown *on take-off* so it
doubles as a take-off window.
