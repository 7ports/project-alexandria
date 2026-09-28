# Coplay MCP (Unity Editor) — Gotchas & Workarounds

Practical notes for driving the Unity Editor through the Coplay MCP tool server.

## `add_persistent_listener` cannot bind generic `UnityEvent<T>` events

**Symptom:** Calling `add_persistent_listener` for a Toggle's `onValueChanged`
returns `Error: Event onValueChanged not found on component Toggle` — and it
fails the same way for `m_OnValueChanged` and for the fully-qualified
`UnityEngine.UI.Toggle`.

**Cause:** The tool only discovers/binds **parameterless** `UnityEvent`s
(e.g. `Button.onClick`, which is a `ButtonClickedEvent : UnityEvent`). Events
typed as `UnityEvent<T>` — such as `Toggle.onValueChanged` (`UnityEvent<bool>`),
`Slider.onValueChanged` (`UnityEvent<float>`), `InputField.onValueChanged`,
`Dropdown.onValueChanged` — are not found by the tool.

**Workaround:** Wire it via the Editor API using an `execute_script` helper
(this is tool-input editor automation, not a project source edit). Use
`UnityEditor.Events.UnityEventTools`:

```csharp
using UnityEngine.UI;
using UnityEngine.Events;
using UnityEditor;
using UnityEditor.Events;
using UnityEditor.SceneManagement;

// Bind a parameterless method (PersistentListenerMode.Void) to a bool event:
UnityAction action = controller.SetSpeed1x; // void SetSpeed1x()
var ev = toggle.onValueChanged;             // UnityEvent<bool>
// idempotent: clear existing persistent calls first
for (int i = ev.GetPersistentEventCount() - 1; i >= 0; i--)
    UnityEventTools.RemovePersistentListener(ev, i);
UnityEventTools.AddVoidPersistentListener(ev, action);
EditorUtility.SetDirty(toggle);
EditorSceneManager.MarkSceneDirty(toggle.gameObject.scene);
```

- `AddVoidPersistentListener` → calls a `void()` method (ignores the bool).
- `AddBoolPersistentListener(ev, method, fixedValue)` → passes a fixed bool.
- `AddIntPersistentListener` / `AddFloatPersistentListener` / `AddStringPersistentListener`
  exist for a fixed argument of that type.
- Read back to verify: `ev.GetPersistentTarget(i)`, `ev.GetPersistentMethodName(i)`.

## Finding inactive GameObjects from a helper script

`GameObject.Find(path)` only finds objects on an **active** path. Pause menus,
game-over panels, etc. are usually inactive at edit time. Reliable options:
- `Resources.FindObjectsOfTypeAll<T>()` then filter `hideFlags == HideFlags.None`
  and `gameObject.scene.IsValid()` (skips prefab assets / editor-only objects),
  matching by a computed full transform path.
- `activeParent.transform.Find("ChildName")` — `Transform.Find` DOES locate
  inactive children (as long as the parent reference is reachable).

## `set_property` cannot clear a Sprite to null

`set_property ... property_name=sprite value=None` returns
`Error: Sprite asset 'None' not found.` There is no built-in "clear sprite" path.
If you need a solid-fill `Image` (e.g. a stretched Toggle checkmark used as a
selected-state fill), either accept the default sprite (tinted) or set
`image.sprite = null` via an `execute_script` helper.

## A newly written .cs file may not be imported yet (no .meta / no GUID)

If a script was created on disk out-of-band (e.g. by a container agent) the
Editor may not have imported it — there is **no `.meta`/GUID**, and its type is
not in any loaded assembly, so `add_component` for that type will fail. Force an
import first with an `execute_script` helper:
`AssetDatabase.Refresh(ImportAssetOptions.ForceUpdate);` then wait until
`hasCompilationErrors == false` and confirm the `.cs.meta` exists.

## Saving the active scene in place (avoid save-as)

The Coplay `save_scene` tool takes a scene name and can behave like save-as.
To save the current scene in place, use an `execute_script` helper:
`EditorSceneManager.SaveScene(EditorSceneManager.GetActiveScene())`.

## Building a radio-button row from Coplay-created Toggles

`create_ui_element type=toggle` yields `Toggle > Background > Checkmark` with
**no Label child** — add a `text` child yourself. For a clean radio group:
- Put all toggles under a parent with `HorizontalLayoutGroup` **and** a
  `ToggleGroup` (set `allowSwitchOff=false`); set each Toggle's `group` to that
  GameObject path.
- On the HorizontalLayoutGroup set `childControlWidth=true`/`childControlHeight=true`
  (Coplay's `set_ui_layout` leaves these **false**, so children keep their large
  default sizes and overflow the panel).
- Give each toggle a `LayoutElement` with `flexibleWidth=1` so they share width.
- Stretch `Background` and `Checkmark` (anchorMin 0,0 / anchorMax 1,1 / sizeDelta 0)
  so the whole box is the hit/paint area; tint `Checkmark` for the selected fill.
