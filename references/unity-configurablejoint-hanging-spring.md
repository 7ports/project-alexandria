---
id: unity-configurablejoint-hanging-spring
type: reference
title: "Unity ConfigurableJoint: a hanging object that swings and springs back"
summary: Ball joint plus angular drives for a hanging object. Per-axis drives damp it; the slerp drive barely does. Size the spring against gravity's pull.
tags:
  - unity
  - physics
  - configurablejoint
  - joint-drive
  - gotcha
embedding_version: 1
---

# Unity ConfigurableJoint: a hanging object that swings and springs back

**Goal:** an object hung from a hook (a pan, a sign) that swings every way when hit, then settles back to how it was hung.

## Joint setup
- Use a `ConfigurableJoint` with `connectedBody = null`, so it hangs from the world.
- Set `anchor` to the hook point in local space, for example the highest vertex.
- Set `autoConfigureConnectedAnchor = true`.
- Lock x/y/z motion and leave the angular motions **Free**. That makes a ball joint.
- The return-to-rest spring is an angular drive. `targetRotation = Quaternion.identity` means "the orientation when the joint was created".

## Use per-axis drives, not the slerp drive
In a side-by-side edit-mode test on the same hanging body:
- **`RotationDriveMode.Slerp` + `slerpDrive`:** barely damped. It was still swinging 20–60° after 6 s, at the same spring and damper.
- **`RotationDriveMode.XYAndZ` + `angularXDrive` and `angularYZDrive` (the same JointDrive):** back within 3° in about 3 s.

Prefer per-axis drives when the drive has to damp a swing.

## Size the spring against gravity
- Gravity pulls a hung object toward wherever its centre of mass sits under the hook. That is usually not the authored orientation.
- If the spring is weaker than gravity's pull (`mass * g * |hook - centreOfMass|` per radian), the object settles at gravity's angle and sways for a long time.
- Use `spring = max(I * w^2, k * mass * g * drop)` with k ≈ 6, where `I` is the largest principal inertia (`rb.inertiaTensor`) and `w` is a target frequency of about 2.5 rad/s.
- Use `damper = 2 * zeta * sqrt(spring * I)` with zeta ≈ 0.35.
- Computing it at runtime from the body's own inertia makes heavy and light objects behave alike.

## Other notes
- **Iterating:** the fastest way to try variants is an edit-mode script. Set `Physics.simulationMode = SimulationMode.Script`, loop `Physics.Simulate(0.02f)`, and log the angle against the start rotation.
- **Test knocks:** an `AddForceAtPosition(..., VelocityChange)` at a far corner of a long body spins it at tens of rad/s about its thin axis. For repeatable checks, knock it through the middle.
- **Static batching:** if the object came from a static-batched level mesh, clear its static flags. Otherwise the batched mesh keeps drawing it where it hung.
