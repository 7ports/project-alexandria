---
id: headless-chrome-screenshots-color-scheme-webgl-narrow-viewports
type: reference
title: "Headless Chrome screenshots: forcing light/dark, getting WebGL, and true phone widths"
summary: "Headless Chrome follows the OS colour scheme (force with --force-dark-mode or --blink-settings=preferredColorScheme=1), needs --enable-unsafe-swiftshader --use-angle=swiftshader for WebGL, and clips --window-size below ~500px — use iframes on a harness page for phone widths."
tags:
  - chrome
  - headless
  - screenshots
  - testing
  - dark-mode
  - webgl
  - responsive
  - windows
embedding_version: 1
---

# Headless Chrome screenshots: forcing light/dark, getting WebGL, and true phone widths

## Symptom

Using `chrome --headless=new --screenshot` to check a site visually:

- A page that follows `prefers-color-scheme` renders in the same theme no matter what you expect. Headless Chrome inherits the OS setting, so on a dark-mode desktop every "light" screenshot comes out dark.
- WebGL content (Plotly `scatter3d`, three.js, map canvases) is blank, or the page shows its "WebGL unavailable" fallback.
- A `--window-size=390,...` screenshot looks horizontally clipped, as if the page overflows, even though it doesn't.
- Data the page fetches after load never appears in the screenshot.

## Cause

- Headless Chrome reports the host OS colour scheme to `prefers-color-scheme`.
- Headless Chrome has no GPU by default, and recent versions block the software (SwiftShader) WebGL fallback unless explicitly allowed.
- Chrome enforces a minimum window width (about 500px on Windows). Narrower `--window-size` values lay the page out at the minimum width and crop the capture, which looks like overflow.
- The screenshot is taken as soon as the page loads unless virtual time is extended.

## Fix

```bash
CH="/c/Program Files/Google/Chrome/Application/chrome.exe"   # or google-chrome / chromium

# Dark:
"$CH" --headless=new --force-dark-mode \
  --enable-unsafe-swiftshader --use-angle=swiftshader \
  --hide-scrollbars --virtual-time-budget=15000 \
  --window-size=1280,2400 --screenshot=dark.png http://localhost:8000/

# Light, regardless of the OS setting:
"$CH" --headless=new --blink-settings=preferredColorScheme=1 \
  --enable-unsafe-swiftshader --use-angle=swiftshader \
  --hide-scrollbars --virtual-time-budget=15000 \
  --window-size=1280,2400 --screenshot=light.png http://localhost:8000/
```

- `--force-dark-mode` makes `prefers-color-scheme: dark` match. `--blink-settings=preferredColorScheme=1` forces light (0 = dark).
- `--enable-unsafe-swiftshader --use-angle=swiftshader` gives software WebGL, which is slow but good enough for a screenshot.
- `--virtual-time-budget=<ms>` lets fetches and rendering settle before capture.

**Phone widths:** render the page inside fixed-width iframes on a wider harness page, and screenshot that instead:

```html
<!doctype html><body style="margin:0;display:flex;gap:16px;padding:16px;background:#888">
<iframe src="http://localhost:8000/" style="width:390px;height:1100px;border:0"></iframe>
<iframe src="http://localhost:8000/docs/" style="width:390px;height:1100px;border:0"></iframe>
</body>
```

The iframe's viewport really is 390px, so media queries and wrapping behave as on a phone. You can also put several pages side by side in one image.

## Notes

- Testing a site's own theme toggle (a stored choice in `localStorage`) is easier in jsdom: pre-seed storage there and assert on `data-theme`. Use screenshots for the visual check.
- Pages that read colours from CSS custom properties into canvas/WebGL charts (see the concept on theme tokens reaching SVG and canvas) render correctly in both forced schemes only if the chart reads the variables at render time.
- Serve the site over HTTP (any local static server). `file://` breaks `fetch()` of JSON and markdown.
