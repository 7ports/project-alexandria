---
id: unity-third-person-controller-mixamo
type: guide
title: "Unity — Third Person Controller with Mixamo Clips, Input System & Cinemachine 3"
summary: "Recipe for a camera-relative third person controller in Unity 6: Mixamo FBX import fixes (Generic→Humanoid), scripted movement instead of root motion, an Animator built from code, and driving a Cinemachine 3 OrbitalFollow rig from your own input component."
tags:
  - unity
  - cinemachine
  - input-system
  - mixamo
  - animation
  - character-controller
  - mecanim
  - retargeting
status: active
source_urls:
  - "https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/CinemachineOrbitalFollow.html"
  - "https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/api/Unity.Cinemachine.InputAxis.html"
embedding_version: 1
---

# Unity — Third Person Controller with Mixamo Clips, Input System & Cinemachine 3

Verified on Unity 6.4 (`6000.4.x`) + URP + `com.unity.inputsystem` 1.19 + `com.unity.cinemachine` 3.1.7.

## Mixamo FBX import: the three fixes that always apply

Raw Mixamo FBX files are wrong in three ways for a retargeting workflow:

1. **They import as Generic, not Humanoid.** In the `.meta` this is
   `ModelImporter.animationType: 2`. Mecanim **cannot retarget a Generic rig**, so the clips will
   only ever drive the exact skeleton they shipped with. Fix: `animationType: 3` (Humanoid) plus
   `avatarSetup: 1` (`CreateFromThisModel`) so each clip file carries its own source avatar.
   Enum values: `0` None, `1` Legacy, `2` Generic, `3` Humanoid.
   `avatarSetup`: `0` NoAvatar, `1` CreateFromThisModel, `2` CopyFromOther.
2. **Every clip is named `mixamo.com`**, which makes them indistinguishable in the Animator window.
   Rename each clip to its file name.
3. **Locomotion clips do not loop**, so walking visibly stutters back to frame 0.

Bulk-fixing the `.meta` files directly with a regex is reliable and does not need the Editor running:

```
animationType: \d+   ->  animationType: 3
avatarSetup: \d+     ->  avatarSetup: 1
```

For names and loop flags, prefer an `AssetPostprocessor` scoped to the animation folder:

```csharp
public class MixamoImport : AssetPostprocessor
{
    void OnPreprocessModel()   // rig settings
    {
        var importer = (ModelImporter)assetImporter;
        importer.animationType = ModelImporterAnimationType.Human;
        importer.avatarSetup = ModelImporterAvatarSetup.CreateFromThisModel;
        importer.materialImportMode = ModelImporterMaterialImportMode.None; // animation-only files
    }

    void OnPreprocessAnimation()  // clip settings; defaultClipAnimations is valid HERE
    {
        var importer = (ModelImporter)assetImporter;
        if (importer.clipAnimations.Length > 0) return;   // never clobber hand edits
        var clips = importer.defaultClipAnimations;
        clips[0].name = Path.GetFileNameWithoutExtension(assetPath);
        clips[0].loopTime = true;
        importer.clipAnimations = clips;
    }
}
```

Two gotchas:
- `defaultClipAnimations` is meaningful in `OnPreprocessAnimation`, not `OnPreprocessModel`.
- Adding an `AssetPostprocessor` does **not** reimport assets already in the project. Ship a menu
  item that clears `clipAnimations` and calls `SaveAndReimport()` on each file.
- Guard on `clipAnimations.Length > 0` or the postprocessor overwrites the user's Inspector edits on
  every reimport.

## Scripted movement, not root motion

Set `Animator.applyRootMotion = false` and move the `CharacterController` from script. The clips then
only have to *look* right at a given speed — they do not have to translate the character. This is what
lets one Mixamo clip set retarget onto any Humanoid model without the feet sliding, and it sidesteps
all the "Bake Into Pose / Root Transform Position" configuration.

The consequence: **blend tree thresholds must match the script speeds.** If the walk clip sits at
threshold 2.0 and the code moves at 5.3, the feet skate. Keep the numbers in one place or document the
pairing.

Standard shape for camera-relative movement:

```csharp
var inputDirection = new Vector3(move.x, 0, move.y).normalized;
_targetRotation = Mathf.Atan2(inputDirection.x, inputDirection.z) * Mathf.Rad2Deg
                  + cameraTransform.eulerAngles.y;      // interpret input in camera space
float yaw = Mathf.SmoothDampAngle(transform.eulerAngles.y, _targetRotation,
                                  ref _rotationVelocity, rotationSmoothTime);
transform.rotation = Quaternion.Euler(0, yaw, 0);
var dir = Quaternion.Euler(0, _targetRotation, 0) * Vector3.forward;
controller.Move(dir * (speed * Time.deltaTime) + Vector3.up * _verticalVelocity * Time.deltaTime);
```

Jump impulse that reaches exactly `jumpHeight` at the apex: `v = Mathf.Sqrt(h * -2f * gravity)`.
Keep a small downward bias (`_verticalVelocity = -2f`) while grounded so the controller stays seated.

## Cinemachine 3 — driving the orbit yourself

Cinemachine 3 API names (they changed from CM2):

| CM3 | Notes |
| --- | --- |
| `Unity.Cinemachine` | the namespace (was `Cinemachine`) |
| `CinemachineCamera` | was `CinemachineVirtualCamera`; `Follow` / `LookAt` are settable properties |
| `CinemachineOrbitalFollow` | Body stage; `OrbitStyle`, `Radius`, `TargetOffset`, `HorizontalAxis`, `VerticalAxis`, `RadialAxis` |
| `CinemachineRotationComposer` | Aim stage (was `CinemachineComposer`) |
| `CinemachineBrain` | still goes on the real Camera |
| `CinemachineOrbitalFollow.OrbitStyles` | members are exactly `Sphere` and `ThreeRing` |

`InputAxis.Value` is a **public float field explicitly documented as script-drivable**, so you can skip
`CinemachineInputAxisController` entirely and keep every input in one component:

```csharp
orbital.HorizontalAxis.Value += lookX * sensitivityX * scale;
var range = orbital.VerticalAxis.Range;                       // Vector2
orbital.VerticalAxis.Value = Mathf.Clamp(orbital.VerticalAxis.Value - lookY * sensY * scale,
                                         range.x, range.y);
```

`HorizontalAxis` / `VerticalAxis` are *fields* on a MonoBehaviour, so `orbital.VerticalAxis.Range = v`
mutates in place and compiles fine despite `InputAxis` being a struct.

Why do this: `CinemachineInputAxisController` needs its `Controllers` list bound to InputActions in the
Inspector, which is easy to leave half-configured, and it splits input across two systems.

**Mouse vs stick scaling.** A mouse reports a per-frame *delta*; a stick reports a held *position*.
Scale only the stick by `Time.deltaTime`, or mouse look becomes framerate dependent:

```csharp
float scale = isMouse ? 1f : gamepadMultiplier * Time.deltaTime;
```

Detect it with `PlayerInput.currentControlScheme == "Keyboard&Mouse"`.

## Input System without codegen

`PlayerInput` with **Behavior = Send Messages** needs no generated wrapper class and no asset reference
in your script — it calls `OnMove(InputValue)`, `OnLook`, `OnJump`, … on components of the same
GameObject. Set it from script with:

```csharp
playerInput.actions = asset;                 // InputActionAsset
playerInput.defaultActionMap = "Player";
playerInput.notificationBehavior = PlayerNotifications.SendMessages;
```

Unity 6's project template already ships `Assets/InputSystem_Actions.inputactions` with a Player map
(Move, Look, Attack, Interact, Crouch, Jump, Sprint, Previous, Next) and five control schemes — extend
it rather than authoring a new asset. It is plain JSON: adding an action means appending to `maps[].actions`
and `maps[].bindings` with fresh `uuid4` ids and a `groups` value matching a control scheme name.

Button messages fire on **both press and release**, so `value.isPressed` distinguishes them. Latch
one-shot actions (jump, attack) and consume them in the controller, so a press is never lost on a frame
where it could not be used:

```csharp
public bool ConsumeJump() { if (!Jump) return false; Jump = false; return true; }
// consume only when actionable, or the press is silently swallowed during a cooldown:
bool wantsJump = _jumpTimeoutDelta <= 0f && _input.ConsumeJump();
```

## Building the Animator from code

`AnimatorController` generation beats hand-authored YAML — the asset format has internal file IDs that
are painful to write by hand.

```csharp
var c = AnimatorController.CreateAnimatorControllerAtPath(path);
c.AddParameter("Speed", AnimatorControllerParameterType.Float);
var state = c.CreateBlendTreeInController("Locomotion", out BlendTree tree, 0);
tree.blendParameter = "Speed";
tree.blendType = BlendTreeType.Simple1D;
tree.useAutomaticThresholds = false;      // set BEFORE AddChild, or thresholds are overwritten
tree.AddChild(idle, 0f); tree.AddChild(walk, 2f); tree.AddChild(run, 5.3f);
```

- Reuse one clip at two thresholds and set `children[i].timeScale` to fake a sprint from a run clip
  (`timeScale = sprintSpeed / runSpeed`). `ChildMotion` is a struct: mutate the array then reassign
  `tree.children`.
- `controller.parameters` returns a fresh array each call; mutate elements then **reassign** to persist
  a `defaultBool`.
- Extra layers need their state machine added to the controller asset explicitly:
  `AssetDatabase.AddObjectToAsset(stateMachine, controller)` before `controller.AddLayer(layer)`.
- Upper-body attack layer: an `AvatarMask` with only `Body`, `Head`, `LeftArm`, `RightArm`,
  `LeftFingers`, `RightFingers` active, on an Override layer with an **empty default state** (no motion
  = base layer shows through). Iterate `AvatarMaskBodyPart` and skip `LastBodyPart`.
- Load a clip out of an FBX with
  `AssetDatabase.LoadAllAssetsAtPath(path).OfType<AnimationClip>().First(c => !c.name.StartsWith("__preview__"))`
  — the `__preview__` clip is an editor artefact you must filter out.

## Retargeting onto a character model

Any model rigged as Unity **Humanoid** accepts the clips. Checklist: rig set to Humanoid and
**Configure** verified, model parented at local zero under the controller GameObject, `Animator.Avatar`
set to the model's avatar, Apply Root Motion off, `CharacterController` height/radius matched to the
model, camera target moved to head height. Attach weapons by parenting to the hand bone
(`mixamorig:RightHand` on a Mixamo-derived rig).

Sourcing note: Mixamo is still free with an Adobe ID and is the easiest source of *animations*, but
Adobe **removed most of its character models** (Paladin, Knight, etc.), so it is no longer a reliable
source for the character itself. Look to the asset stores or itch.io, and prefer listings that state
"Unity Humanoid rig" or "Mixamo compatible" outright — many rigged models never say, and you find out
on import.
