---
id: unity-charactercontroller-bounce-reflection
type: concept
title: "Unity CharacterController: reflecting off contacts sticks to ceilings"
summary: "When bouncing a CharacterController by reflecting its direction in OnControllerColliderHit, ignore contacts it is moving away from; step-offset lift re-touches ceilings and flips the bounce every frame."
tags:
  - unity
  - charactercontroller
  - physics
  - gotcha
embedding_version: 1
---

# CharacterController bounce: filter contacts you are moving away from

**Symptom:** a scripted dash or bounce reflects its direction off whatever `OnControllerColliderHit` reports. It works off walls and floors, but against a ceiling the character sticks and slides along it instead of bouncing down.

**Cause:** `CharacterController.Move` lifts the capsule by `stepOffset` as part of every move that has a horizontal component. Just after reflecting downward off a ceiling, that lift touches the ceiling again and reports a hit with the same downward normal. Reflecting that contact flips the direction back up, so the controller alternates between up and down every frame and never leaves the ceiling.

**Fix:** only reflect off surfaces the motion is heading into:

```csharp
void OnControllerColliderHit(ControllerColliderHit hit)
{
    if (Vector3.Dot(direction, hit.normal) >= -0.01f) return;   // moving away from / along it
    // ...keep the most head-on contact of the frame, reflect after Move returns
}
```

**Related:** for ordinary jumps, check `(controller.Move(...) & CollisionFlags.Above) != 0` and zero any upward velocity. Otherwise the character presses into the ceiling until gravity has used up the jump.

**How to catch it:** write a play-mode test that dashes into the ceiling at several angles (shallow, 45°, steep). Assert that the direction turns downward *and* the height then drops by more than a metre. "Direction flipped once" alone passes even when the character is stuck.
