---
id: unity-character-controller-gotchas
type: reference
title: Unity — CharacterController & Editor-Automation Gotchas
summary: "A ground probe that detects the character's own collider (pinning Grounded true, breaking fall states and multi-jump budgets), CopySerialized blanking generated asset names, and how to observe frame-by-frame gameplay from editor tool calls that are seconds apart."
tags:
  - unity
  - charactercontroller
  - physics
  - jump
  - editor-automation
  - animation
status: active
embedding_version: 1
---

# Unity — CharacterController & Editor-Automation Gotchas

Companion to [[unity-humanoid-animation-gotchas]]. Verified on Unity 6.4.

## A ground probe will detect the character's own collider

The Starter-Assets-style ground check is everywhere:

```csharp
var spherePosition = new Vector3(p.x, p.y - GroundedOffset, p.z);
Grounded = Physics.CheckSphere(spherePosition, GroundedRadius, GroundLayers,
                               QueryTriggerInteraction.Ignore);
```

With `GroundLayers` set to everything (`~0`) and the probe sphere sitting *inside* the capsule, this
detects the character's **own CharacterController** and pins `Grounded` to true — measured still true
at 2m off the ground.

It fails quietly and the symptoms look unrelated to grounding:

- the fall/airborne state never fires, because its condition is `!Grounded`, so an airborne pose or
  falling animation simply never plays;
- a multi-jump budget refills mid-air, handing out unlimited jumps, because the refill is gated on
  `Grounded`;
- jump→land transitions fire immediately, as if the character never left the floor.

Fix without requiring a dedicated layer — overlap and skip your own colliders:

```csharp
int hits = Physics.OverlapSphereNonAlloc(spherePosition, GroundedRadius, _groundHits,
                                         GroundLayers, QueryTriggerInteraction.Ignore);
Grounded = false;
for (int i = 0; i < hits; i++)
{
    if (_groundHits[i] == null || _groundHits[i].transform.IsChildOf(transform)) continue;
    Grounded = true;
    break;
}
```

(A dedicated Player layer excluded from `GroundLayers` also works, but breaks the moment the ground and
the player share the Default layer, which is the common starting state.)

**Test for it by printing `Grounded` alongside `y` while airborne.** It is invisible otherwise: the
jump still launches and still lands, so everything looks fine until an airborne state fails to appear.

## Multi-jump: refill the budget on a delay, not on `Grounded`

The ground probe still reports grounded for a frame or two after take-off, so a budget refilled purely
on `Grounded` is handed straight back mid-launch. Gate it on the same cooldown that gates the jump:

```csharp
if (Grounded && _jumpTimeoutDelta <= 0f) _jumpsRemaining = MaxJumps;
```

Also clear the animator's `Jump` bool once airborne. Held true for the whole flight, a second press
cannot be seen as a new event by a `FreeFall -> Jump` transition.

## EditorUtility.CopySerialized blanks a generated asset's name

The usual "regenerate an asset in place so existing references survive" pattern:

```csharp
var clip = new AnimationClip();   // no name set
...
EditorUtility.CopySerialized(clip, existing);
```

`CopySerialized` copies `m_Name` too, so the unnamed source **blanks the name of the existing asset**.
The asset still works and references still resolve, but it shows as an empty name everywhere — animator
state motions read `motion=`, clip-info dumps show `(1.00)` with no name — which reads as a broken
reference during debugging. Set the name before copying:

```csharp
clip.name = "SwordSlash";
```

## Editor tool calls are far too coarse to observe gameplay

An external tool driving the editor issues calls seconds apart. A jump launches, peaks, lands and
resets its state long before the next call, so sampling between calls shows a character that never
moved and a budget that never decremented — easily misread as "the feature does not work".

Pump the component's own update through reflection to advance the simulation in controlled steps
within a single call:

```csharp
var update = controller.GetType().GetMethod("Update",
    BindingFlags.Instance | BindingFlags.NonPublic);
for (int i = 0; i < steps; i++) update.Invoke(controller, null);
```

`Time.deltaTime` holds the last real frame's value, so each invocation integrates one frame's worth —
enough to watch a jump arc, trigger a second jump mid-flight, and confirm a third press is refused, all
deterministically. Private state can be read the same way (`GetField(..., NonPublic | Instance)`).

## Default animator parameters hijack a forced state

`animator.Play("FreeFall")` does not hold that state: transitions still evaluate, and default parameter
values are usually the resting ones. `Grounded` defaulting to **true** sends a forced FreeFall straight
back to Locomotion, so a pose check reports the *idle* pose and it looks like the clip is broken.

Set the parameters that gate the state before forcing it:

```csharp
animator.SetBool("Grounded", false);
animator.SetBool("FreeFall", true);
animator.Play("FreeFall", 0, 0f);
for (int i = 0; i < 10; i++) animator.Update(0.05f);
```

The same trap makes several airborne states report identical numbers when probed, because they all fall
through to whatever the defaults allow.
