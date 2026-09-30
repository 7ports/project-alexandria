---
id: unity-ui-toolkit-editor-setup-gotchas
type: concept
title: "Unity UI Toolkit: pitfalls when building UI from editor scripts"
summary: Assets held across EditorSceneManager.OpenScene come back destroyed (PanelSettings saves as null); a UIDocument without PanelSettings keeps elements but never draws; UI alpha looks weaker in linear colour space; OnGUI draws over UI Toolkit.
tags:
  - unity
  - ui-toolkit
  - editor-scripting
  - gotcha
  - testing
embedding_version: 1
---

# UI Toolkit set up from editor scripts: pitfalls

- **An asset object held across `EditorSceneManager.OpenScene(..., Single)` comes back destroyed.**
  - Opening a scene unloads unreferenced assets. A `PanelSettings` you created with `CreateInstance` and `CreateAsset`, then assigned after opening the scene, therefore saves as `{fileID: 0}`.
  - Assigning a destroyed object stores null, silently. Reload the asset with `AssetDatabase.LoadAssetAtPath` *after* each `OpenScene`.
- **A `UIDocument` with no `PanelSettings` still has a `rootVisualElement`.** Elements added to it keep their text and inline styles, and `resolvedStyle` still answers, but nothing draws and no events dispatch.
  - Symptoms: `Slider.value = x` fires no `ChangeEvent`, and `SendEvent(NavigationSubmitEvent)` on a Button does nothing.
  - In tests, assert `element.panel != null` so "the UI exists" also means "the UI is on screen".
- **Building UI in code:** a theme `.tss` containing `@import url("unity-theme://default"); @import url("YourStyles.uss");` gives you default fonts and controls plus your own styles. Assign it as `PanelSettings.themeStyleSheet`.
- **Clicking a button from a play-mode test:** use `NavigationSubmitEvent.GetPooled()`, set `e.target = button`, call `button.SendEvent(e)`, then wait a frame for dispatch. This runs the button's real `clicked` handler.
- **Linear colour space:** UI Toolkit alpha blends in linear space, so translucency reads much weaker than the numbers suggest. A 55% black overlay only darkens about 30%, and a 0.92-alpha panel lets the scene show through. Use near-opaque panels and ~0.8 alpha dims.
- **IMGUI (`OnGUI`) draws on top of UI Toolkit.** Hide OnGUI overlays such as reticles or debug panels while a UI Toolkit menu is open.
- **`Cursor` is ambiguous** in a file that uses `UnityEngine.UIElements`, which has its own `Cursor` type. Write `UnityEngine.Cursor`.
- **Screenshots:** `ScreenCapture.CaptureScreenshot` includes overlay UI (UI Toolkit and OnGUI). `Camera.Render` into a RenderTexture does not.
