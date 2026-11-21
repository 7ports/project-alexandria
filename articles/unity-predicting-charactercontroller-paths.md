---
id: unity-predicting-charactercontroller-paths
type: article
title: "Unity: predicting where a CharacterController-driven move will go (and matching it)"
summary: "Lessons from making a predicted dash/aim line match the real CharacterController movement: sweep the real capsule with skin, handle start-overlaps, hand decisions to the mover, and compare destroyed objects with ReferenceEquals."
tags:
  - unity
  - physics
  - charactercontroller
  - prediction
  - aim-line
  - gotcha
status: verified
embedding_version: 1
---

# Unity: predicting where a CharacterController-driven move will go

Context: a game draws a predicted path (an aim line with bounces) for a fast move that is really
carried out with `CharacterController.Move`, reflecting off whatever it hits. The prediction and the
real move drifted apart. These were the causes, found by measuring real moves against the drawn
path (a play-mode probe that records each predicted bounce/target and what actually happened).

## 1. Sweep the controller's real capsule, skin included, not a sphere

A `SphereCast` with roughly the controller's radius meets **walls** where the capsule does, but meets
**floors and ceilings** much later: the capsule's bottom/top is `height/2 + skinWidth` from its
centre, the sphere's only `radius`. Reflection doubles the error, so after each floor/ceiling (or
table-top) bounce the predicted path runs parallel but offset by about `2 * (height/2 - radius)`.

Use the controller's own capsule:

```csharp
float r = cc.radius + cc.skinWidth;                       // the controller keeps its skin off surfaces
float half = Mathf.Max(0f, cc.height * 0.5f - cc.radius); // segment half-length
int n = Physics.CapsuleCastNonAlloc(centre + Vector3.up * half, centre - Vector3.up * half, r,
                                    dir, hits, distance, mask, QueryTriggerInteraction.Ignore);
```

(The controller's capsule stays upright even if the model is pitched.) Measured effect: typical
bounce-point error went from ~1.6 m to ~0.3 m.

## 2. Casts ignore what they start inside: handle it

`*CastNonAlloc` reports colliders overlapping at the start with `distance == 0` and
`point == Vector3.zero`, and code usually skips them. But a controller already touching a surface
and moving into it bounces immediately. Detect it with `Physics.ComputePenetration` using a
stand-in `CapsuleCollider` (it can stay disabled; the pose is passed in), and treat it as a bounce
at distance 0 when `Vector3.Dot(dir, separationDirection) < 0`. Don't temporarily resize the
CharacterController itself for the test.

## 3. Don't let predictor and mover each make their own steering decisions

If both the prediction and the real move independently run an "assist" (steer onto the nearest
target within N degrees) at the same events, they diverge: the real mover decides a frame later and
a step further on, so near-ties and angle-limit edges go differently. Have the predictor record
its decisions (for each event: steer to target X, or go straight) and hand them to the mover, which
follows them while predicted targets remain, and only improvises afterwards. Allow a wider angle
when following a planned steer (the angle grows as the mover is further along than where the plan
was made).

## 4. A reference to a destroyed object compares equal to null

When the mover is told "you just killed X" and looks X up next frame, X has been `Destroy`ed and
Unity's overloaded `==` now says `X == null`, so `if (killed != null)` silently skips the lookup.
Compare with `ReferenceEquals(a, b)` / `ReferenceEquals(x, null)` when matching objects that may have
been destroyed in between.

## 5. Measure, don't guess

A play-mode probe that runs many real aimed moves (randomised placements, a few degrees of aim
error, the build's frame rate via `Application.targetFrameRate` with vSync off) and logs, per miss,
"distance off the drawn path, bounces predicted vs real, what happened after each event" found all
of the above in a few runs. Logging a reason string from the mover's decision code was what exposed #4.
