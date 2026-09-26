---
id: unity-humanoid-animation-gotchas
type: reference
title: Unity — Humanoid Animation & Prefab Gotchas (Mecanim)
summary: "Non-obvious Mecanim/prefab behaviours that present as character bugs: empty override-layer states snap to bind pose, Bake Into Pose is backwards for scripted movement, SampleAnimation silently no-ops in edit mode and cannot verify root settings, stripping RootT.y buries the character, reparenting inside a model prefab instance reverts, plus authoring humanoid clips from muscle curves."
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
what a script-driven CharacterController wants, because the body then stays centred and upright over
its capsule.

**Bake Into Pose moves a channel OUT of root motion and INTO the body pose**, where it can no longer be
discarded. Enabling it does not "lock the character in place"; it makes the authored drift visible.
Turning it on for Root Transform Position (Y) on a fall-from-height clip sank the rendered body two
metres through the floor.

For a scripted-movement controller, leave all three **off**:

```csharp
clip.lockRootRotation   = false;   // rotation   -> root motion -> discarded
clip.lockRootPositionXZ = false;   // horizontal -> root motion -> discarded
clip.lockRootHeightY    = false;   // vertical   -> root motion -> discarded
```

Bake Into Pose is for the opposite case — root-motion-driven characters, where you want a channel
excluded from the motion applied to the Transform.

## SampleAnimation silently does nothing in edit mode

`AnimationClip.SampleAnimation` on a **humanoid** clip needs an initialised Animator to retarget. In
edit mode the Animator is not initialised, so the call **no-ops without any error** and the bones stay
in bind pose.

This bites in two ways:

1. **It cannot verify root import settings.** It applies raw curves and bypasses Mecanim's humanoid
   root handling, returning byte-identical numbers before and after you change Root Transform settings,
   so the settings look inert. Verify by driving the real Animator in play mode instead:
   ```csharp
   animator.Play(stateName, 0, 0f);
   animator.Update(0f);
   // ... measure, then animator.Update(dt) to step
   ```
   Watch the **swing** (max − min) of a hip bone's yaw in character space, not the absolute value — bone
   axes are arbitrary, but a 250° swing within one state is not noise.
   Remember default parameter values still drive transitions while probing: `Grounded` defaulting to
   true sends Jump and FreeFall straight into the landing state, so all three report identical numbers
   and it looks like a measurement bug.

2. **It poisons any pose capture built on top of it.** Sampling a clip and then reading
   `HumanPoseHandler.GetHumanPose` returns the **bind pose**, not the clip's pose. Building a "neutral
   idle" that way yields a literal T-pose (`Forearm Stretch = 0.985`, every spine value 0) that looks
   plausible in code and obviously broken in game.

   Read the source clip's curves directly instead — no Animator needed, cannot fail this way:
   ```csharp
   foreach (var b in AnimationUtility.GetCurveBindings(source)) {
       float rest = AnimationUtility.GetEditorCurve(source, b).Evaluate(0f);
       AnimationUtility.SetEditorCurve(target, b, AnimationCurve.Constant(0, len, rest));
   }
   ```
   (Do the `HumanPoseHandler` capture in play mode if you genuinely need muscle-space values.)

## Stripping RootT.y buries the character

When generating a full-body humanoid clip, it is tempting to drop the `Root*` curves on the reasoning
that root motion is discarded anyway. **`RootT.y` is not optional** — it is what lifts the hips above
the virtual body root. Without it the pose collapses onto the root and the character sinks by roughly a
leg length (measured: feet at −0.86, lowest skinned vertex at −1.02, against a correct +0.02).

Keep `RootT.y`; neutralise the rest if you want no drift or turn:

```csharp
"RootT.x", "RootT.z"          -> 0     // stay centred over the capsule
"RootQ.x", "RootQ.y", "RootQ.z" -> 0   // identity rotation
"RootQ.w"                     -> 1
"RootT.y"                     -> keep the source value (standing height)
```

A clip played on a **masked** layer that excludes Root does not need root curves — the base layer
supplies them. It is full-body base-layer clips that must carry `RootT.y`.

## Check ground fit with BakeMesh, not renderer bounds

`SkinnedMeshRenderer.bounds` is padded bind-pose bounds and lies in both directions: it reported 2.11m
height against a true skeleton height of 1.84m (leaving a CharacterController 20cm too tall), and
reported a lowest point of −0.078 where the real geometry was at +0.020.

For sizing, measure the skeleton (lowest foot bone to top of the head chain). For ground fit, bake the
posed skin in play mode and find the lowest real vertex:

```csharp
var baked = new Mesh(); smr.BakeMesh(baked, true);
foreach (var v in baked.vertices) lowest = Mathf.Min(lowest, smr.transform.TransformPoint(v).y);
```

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
  `Left Index 1 Stretched` while the binding is `LeftHand.Index.1 Stretched`.
- A clip missing a muscle leaves that bone at **bind pose**, so a partial clip on an unmasked layer
  gives T-pose arms. Write every body muscle for a full-body clip.
- `curve.SmoothTangents(i, 0f)` on every key; linear tangents look mechanical.

**Amplitude is not reach.** Pushing wind-up muscle values toward their limits can make a swing *smaller*
if the limb folds: over-bending `Right Forearm Stretch` at the apex pulled the hand in toward the
shoulder and dropped the hand apex from 0.58 to 0.51. Keeping the elbow open raised it to 0.72. For a
wide, deliberate arc, keep the limb extended through the motion and drive the rotation from the shoulder
and torso. Measure the end effector's travel rather than trusting the muscle numbers.

## Mixamo clip names oversell what the clip does

`Falling_Impact` is not a landing: it is a fall-from-height crumple that descends ~2m and turns the body
~250°. Used as the Land state after a small hop it reads as the character lurching sideways and sinking.
For a short jump, returning straight to locomotion usually beats a wrong landing clip.

Similarly, a set may have exactly one idle and it may be a *fidget* (`Idle_Bored`). Looping a fidget as
the resting pose is why "the idle plays too often" — generate a calm idle and demote the fidget to an
occasional break on a randomly re-rolled interval.

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

Leaving `localRotation` at identity inherits the bone's arbitrary axes, which is why a sword often ends
up hanging straight down.

## Jump flags cleared one frame too early

`Grounded` stays true for a frame or two after take-off, so clearing the animator's `Jump` bool whenever
`Grounded` clears it immediately, and a transition conditioned on `Grounded && !Jump` fires before the
jump clip plays. Gate the clear behind the jump cooldown, and reset that cooldown *on take-off* so it
doubles as a take-off window.
