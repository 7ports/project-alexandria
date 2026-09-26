---
id: unity-humanoid-animation-gotchas
type: reference
title: Unity — Humanoid Animation & Prefab Gotchas (Mecanim)
summary: "Five non-obvious Mecanim/prefab behaviours that look like bugs: empty states on override layers snap to bind pose, reparenting inside a model prefab instance silently reverts, SkinnedMeshRenderer.bounds is inflated, jump flags cleared a frame too early, and how to author a humanoid clip from muscle curves in code."
tags:
  - unity
  - mecanim
  - animator
  - humanoid
  - prefab
  - animation
  - avatar-mask
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
pose**, freezing the upper body mid-stride. Symptoms: the character's arms lock into a T-pose-ish
stance, and every attack/block looks wrong or "like a different animation".

Fix: keep the layer at **weight 0** and raise it only while a combat state is playing.

```csharp
int layer = animator.GetLayerIndex("Combat");
var state = animator.GetCurrentAnimatorStateInfo(layer);
bool active = animator.IsInTransition(layer) || !state.IsName("None");
_weight = Mathf.MoveTowards(_weight, active ? 1f : 0f, Time.deltaTime * fadeSpeed);
animator.SetLayerWeight(layer, _weight);
```

Set `AnimatorControllerLayer.defaultWeight = 0` when building the controller so it starts correct.
(Layer 0 is the opposite case: Unity forces it to weight 1 at runtime, but a freshly created
controller serialises `defaultWeight = 0`, which reads as alarming in the Inspector. Set it to 1.)

## Reparenting inside a model prefab instance is silently discarded

Attaching a weapon by moving a mesh under a hand bone **inside an instantiated model (FBX) prefab** is
not a supported prefab override. The move works in memory — the log and even a screenshot right after
will look correct — and is then thrown away when the prefab is saved or the model reimports. The
weapon ends up back at the model root and does not follow the animation.

Diagnose it by printing the actual parent chain, not by looking at the viewport:

```csharp
// Expect .../forearm.R/hand.R/Weapon — a path ending at the model root means it reverted.
```

Fix: unpack before restructuring.

```csharp
PrefabUtility.UnpackPrefabInstance(model, PrefabUnpackMode.Completely, InteractionMode.AutomatedAction);
```

Trade-off: the instance stops tracking the FBX hierarchy, so re-run your setup step after reimporting
the model.

## Weapons in asset-pack FBXs are props laid out beside the character

Do not assume a weapon mesh is authored in the hand — in many packs the katana/sword sits metres away
at the origin, so `SetParent(bone, worldPositionStays: true)` faithfully preserves the *wrong* place.
The mesh pivot is also unreliable (it is often mid-blade).

Robust placement: find the sub-mesh whose material names the grip ("Handle"), take the centroid of its
vertices, and offset the object so that point lands on the bone.

```csharp
int sub = Array.FindIndex(renderer.sharedMaterials, m => m.name.Contains("Handle"));
var verts = mesh.vertices;                  // readable in the Editor even when isReadable is off
var seen = new HashSet<int>(); var sum = Vector3.zero;
foreach (int i in mesh.GetTriangles(sub)) if (seen.Add(i)) sum += verts[i];
weapon.SetParent(bone, false);
weapon.localRotation = Quaternion.identity;
weapon.localPosition = -(sum / seen.Count);  // grip centroid onto the bone origin
```

Verify by measuring the blade tip's travel across sampled times, not by eye — a weapon stuck at the
origin still looks plausible in a single screenshot.

## SkinnedMeshRenderer.bounds is inflated — never size a character from it

It reports padded bind-pose bounds. One real case: 2.11m reported against a true skeleton height of
1.84m, which left the CharacterController 20cm taller than the character (it then fails to fit through
openings and lifts the ground probe off the floor). Whole-model bounds are worse still, since weapons
are separate renderers.

Measure the skeleton instead — lowest foot bone to top of the head chain — plus a small margin for
headgear.

## Jump flags cleared one frame too early

With a ground probe, `Grounded` stays true for a frame or two after take-off. Controllers that clear
the animator's `Jump` bool whenever `Grounded` is true therefore clear it immediately, and a
`Jump -> Land` transition conditioned on `Grounded && !Jump` fires at once — the jump clip never plays.

Fix: gate the clear behind the jump cooldown, and reset that cooldown *on take-off* so it doubles as a
take-off window.

```csharp
if (Grounded) {
    if (hasAnimator && _jumpTimeoutDelta <= 0f) { SetBool(Jump,false); SetBool(FreeFall,false); }
    if (wantsJump) { _verticalVelocity = Mathf.Sqrt(h * -2f * g);
                     _jumpTimeoutDelta = JumpTimeout;   // take-off window AND cooldown
                     SetBool(Jump, true); }
    if (_jumpTimeoutDelta >= 0f) _jumpTimeoutDelta -= Time.deltaTime;
}
```

## Authoring a Humanoid clip from muscle curves in code

You can generate a retargetable humanoid clip with no DCC tool. Bind float curves to `typeof(Animator)`
with an empty path and the **muscle name** as the property, in normalised −1..1 muscle space:

```csharp
var binding = EditorCurveBinding.FloatCurve("", typeof(Animator), "Right Arm Down-Up");
AnimationUtility.SetEditorCurve(clip, binding, curve);
```

`clip.isHumanMotion` turns true once muscle curves exist, and it then retargets like an imported clip.

Get the exact property spellings by dumping `AnimationUtility.GetCurveBindings()` on any imported
humanoid clip rather than guessing — they are space-separated names such as `Right Arm Down-Up`,
`Right Forearm Stretch`, `Spine Twist Left-Right`, `Chest Front-Back`, `Head Nod Down-Up`, alongside
`RootT.*` / `RootQ.*` and `RightHand.Index.1 Stretched` style finger bindings.

Two practical notes:
- Omit root and leg curves for a clip that will play on a masked upper-body layer. `SampleAnimation`
  in the Editor will then drop the model through the floor during preview — a preview artefact, not a
  clip defect; lift the instance by its lowest renderer bound to inspect it.
- `curve.SmoothTangents(i, 0f)` on every key; linear tangents on muscle values look mechanical.
