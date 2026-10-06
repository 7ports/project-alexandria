---
id: unity-humanoid-root-yaw-discarded
type: article
title: "Unity Humanoid: static RootQ yaw is discarded in play mode unless baked into pose"
summary: A constant root yaw in a generated humanoid clip shows in edit-mode sampling but is stripped as root motion in game; set loopBlendOrientation + keepOriginalOrientation.
tags:
  - unity
  - animation
  - humanoid
  - root-motion
  - gotcha
embedding_version: 1
---

# Unity Humanoid: a static RootQ yaw is thrown away in game unless baked into the pose

## Symptom
A generated Humanoid clip with a constant `RootQ` turn about the vertical (yaw) looks right when sampled in edit mode (`clip.SampleAnimation`), but in play mode, with `applyRootMotion = false`, the body stays square to the GameObject's forward. If the rotation also had a tilt composed after the yaw, the tilt partly turns into a roll and the lean shrinks (measured: 15° lean became 8°, plus a sideways roll).

A pure pitch (lean) offset in `RootQ` *does* survive. That makes the yaw case easy to miss.

## Cause
Unity extracts the root's rotation about the vertical as root motion and keeps only the rest as the body's pose. With root motion off, that extracted yaw is discarded.

## Fix
Bake the root rotation into the pose, based on the clip's own orientation:

```csharp
var s = AnimationUtility.GetAnimationClipSettings(clip);
s.loopBlendOrientation = true;      // Root Transform Rotation: Bake Into Pose
s.keepOriginalOrientation = true;   // Based Upon: Original
AnimationUtility.SetAnimationClipSettings(clip, s);
```

In the `.anim` file, check for `m_LoopBlendOrientation: 1` and `m_KeepOriginalOrientation: 1`.

## Lesson
Edit-mode sampling does not apply root-motion extraction. Always measure a posed clip in play mode, with bone positions taken via `animator.GetBoneTransform`, before trusting it. `HumanPoseHandler.GetHumanPose` on a live animator can also return values that don't match the playing state, so measure bones, not muscles.
