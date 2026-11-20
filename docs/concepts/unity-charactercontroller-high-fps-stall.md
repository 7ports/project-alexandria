---
id: unity-charactercontroller-high-fps-stall
type: concept
title: "Unity CharacterController: easing speed from controller.velocity stalls at high frame rates"
summary: "The Starter Assets pattern Lerp(controller.velocity, target, dt*rate) can leave the player unable to walk from a standstill above a few hundred fps (uncapped builds); ease from the last commanded speed when accelerating, and test with Time.captureDeltaTime"
tags:
  - unity
  - charactercontroller
  - frame-rate
  - starter-assets
  - movement
  - testing
status: verified
embedding_version: 1
---

# CharacterController: easing from `controller.velocity` stalls at high frame rates

**Symptom:** in a build with no frame cap (VSync off, no `Application.targetFrameRate`), some players
can't walk from a standstill. They only move once something else, such as a dash or a knockback, has
already given them speed. Telemetry shows ground speed near 0 for most of their time. It works fine
on your own machine, the Steam Deck, or any display-capped setup.

**Cause:** the Unity Starter Assets `ThirdPersonController` pattern:

```csharp
float current = new Vector3(_controller.velocity.x, 0, _controller.velocity.z).magnitude;
_speed = Mathf.Lerp(current, targetSpeed, Time.deltaTime * SpeedChangeRate);
_controller.Move(direction * _speed * Time.deltaTime + vertical);
```

From a standstill, the first frame's horizontal step is `target * rate * dt * dt`. It shrinks with
the **square** of the frame time.

- At a few hundred fps it is a fraction of a millimetre, combined with the downward "stay grounded"
  push.
- The controller can then report `velocity` as zero horizontally.
- The next frame eases from 0 again, so the player never gets going.
- With existing momentum, `velocity` is already large and the loop works, hence "only with momentum".
- In one project with run speed 6.6 and rate 10: 240 fps walked normally; 500 and 1000 fps moved 0.00 m.

**Fix:** when speeding up, ease from at least last frame's commanded speed. Keep easing from the
measured speed when slowing down, so momentum from other moves still decays naturally:

```csharp
if (desired > current) current = Mathf.Max(current, Mathf.Min(_speed, desired));
```

**Test it without a fast machine:** pin the frame time in a play-mode test.

- Set `Time.captureDeltaTime = 1f / fps`, so every frame advances exactly that much game time.
- Hold the move input for N frames and measure the distance.
- Restore `captureDeltaTime = 0` in a `finally`.
- Sweep 60, 144, 240, 500 and 1000 fps.

**Also consider** capping the frame rate in builds, which saves power too. But the movement code
should not depend on it.
