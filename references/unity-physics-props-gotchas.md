---
id: unity-physics-props-gotchas
type: reference
title: "Unity physics props: silent failures and their causes"
summary: "Empty MeshCollider shapes after a model reimport, trigger colliders that props pass through, interpolated bodies ignoring transform moves, edit-mode settle explosions, RequireComponent blocking Destroy."
tags:
  - unity
  - physics
  - rigidbody
  - meshcollider
  - gotcha
embedding_version: 1
---

# Unity physics props: silent failures and their causes

Every item here is something that broke with no error message.

## A MeshCollider with an empty shape
- **Symptom:** dynamic props fall straight through everything, but raycasts against them still work. `collider.bounds.size` reads `(0,0,0)`.
- **Cause:** the model was reimported while the scene was open (for example, after turning on Read/Write), and the scene's colliders kept a stale, empty physics shape.
- **Fix:** set the mesh again: `c.sharedMesh = null; c.sharedMesh = mesh;`, then call `Physics.SyncTransforms()`. Do this before any edit-mode simulation.

## Props pass through a character that steers itself
- **Symptom:** a falling object goes straight through a self-steering character (an AI agent, a fly), and `OnCollisionEnter` never fires.
- **Cause:** such characters often use **trigger** colliders, because they avoid obstacles with their own casts.
- **Fix:** handle `OnTriggerEnter` / `OnTriggerStay` on the prop. There is no contact point, so use `other.ClosestPoint(...)`.
- Check `isTrigger` on the target before writing any collision logic.

## A new body ignores a transform move
- **Symptom:** an interpolated Rigidbody, moved by its transform right after `Instantiate`, snaps back to where it was spawned.
- **Fix:** instantiate at the final pose, or set `rigidbody.position`.

## A test object hangs in the air
- **Symptom:** a test object spawned high up sits motionless and asleep.
- **Cause:** it was spawned above the room's ceiling and is resting on the roof. Check the room height before dropping things from a height.

## Settling a scene with edit-mode physics
- **Pattern:** `Physics.simulationMode = SimulationMode.Script`, then loop `Physics.Simulate(0.02f)`. Make every other body kinematic for the duration.
- **Watch out:** hand-placed props usually overlap a little. At the default `maxDepenetrationVelocity` they explode apart. Set it to about 0.5 m/s during the settle, and restore it afterwards.

## Pushing a body at a contact point every frame
- **Symptom:** a body pushed with `AddForceAtPosition` each frame cartwheels away.
- **Cause:** it gathers spin without limit.
- **Fix:** push through the centre of mass, and top angular velocity up to a target separately.

## `Rigidbody.centerOfMass` space
It is relative to the transform's position and rotation, but **not** its scale. Compute it as `Inverse(rotation) * (worldPoint - position)`.

## Destroying components that depend on each other
- **Symptom:** you destroy several components at once and one survives.
- **Cause:** Unity refuses to `Destroy` a component while another component on the object `[RequireComponent]`s it, even when that one is also being destroyed this frame.
- **Fix:** remove dependents first, then the rest on later frames.
