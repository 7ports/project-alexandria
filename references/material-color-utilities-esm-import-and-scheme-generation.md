---
id: material-color-utilities-esm-import-and-scheme-generation
type: reference
title: "material-color-utilities: 0.4.0 fails to import in Node; generating Material 3 schemes from a seed"
summary: "@material/material-color-utilities 0.4.0 throws ERR_MODULE_NOT_FOUND in Node ESM; pin 0.3.0. How to build Material 3 dark/light roles, override neutral core colours, harmonise custom colours, and raise saturation past the gamut ceiling by shifting tone under a contrast constraint."
tags:
  - material-design
  - material-3
  - color
  - theming
  - hct
  - npm
  - esm
  - node
  - google-fonts
source_urls:
  - "https://github.com/material-foundation/material-color-utilities"
  - "https://m3.material.io/styles/color/roles"
embedding_version: 1
---

# material-color-utilities: 0.4.0 fails to import in Node; generating Material 3 schemes from a seed

## Symptom

Importing `@material/material-color-utilities@0.4.0` in Node (ESM, tested on Node 24) fails:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../@material/material-color-utilities/dynamiccolor/dynamic_color'
imported from .../dynamiccolor/color_spec_2025.js
```

`require('@material/material-color-utilities/package.json')` also fails with `ERR_PACKAGE_PATH_NOT_EXPORTED` (the package has an `exports` map and is ESM-only).

## Cause

0.4.0 ships a compiled file (`color_spec_2025.js`) with an extensionless relative import. Node's ESM resolver requires full file extensions, so the import fails before any of your code runs. Bundlers (Vite, esbuild, webpack) resolve it and hide the problem.

## Fix

Pin the previous release for plain Node scripts:

```bash
npm i @material/material-color-utilities@0.3.0
```

Or bundle your script with esbuild first if you need 0.4.0 features (the 2025 colour spec).

## Generating a Material 3 scheme (works on 0.3.0)

```js
import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot, SchemeVibrant, DynamicScheme, TonalPalette,
  MaterialDynamicColors as M, Blend, Contrast } from '@material/material-color-utilities';

const seed = argbFromHex('#f3c969');
const dark = new SchemeTonalSpot(Hct.fromInt(seed), /*isDark*/ true, /*contrast*/ 0);
hexFromArgb(M.primary.getArgb(dark));               // also onPrimary, primaryContainer,
hexFromArgb(M.surfaceContainerHigh.getArgb(dark));  // surfaceContainerLowest..Highest, outlineVariant, ...

// Override a core colour (what Material Theme Builder's "neutral" picker does), e.g. tinted neutrals:
const hue = Hct.fromInt(argbFromHex('#0b1322')).hue;
const custom = new DynamicScheme({
  sourceColorArgb: seed, variant: dark.variant, contrastLevel: 0, isDark: true,
  primaryPalette: dark.primaryPalette, secondaryPalette: dark.secondaryPalette,
  tertiaryPalette: dark.tertiaryPalette,
  neutralPalette: TonalPalette.fromHueAndChroma(hue, 14),
  neutralVariantPalette: TonalPalette.fromHueAndChroma(hue, 18),
});

// "Custom colours" (e.g. category colours) the Material way: harmonise toward the seed,
// then take tones. Dark: colour 80 / on 20 / container 30 / on-container 90.
// Light: 40 / 100 / 90 / 10.
const p = TonalPalette.fromInt(Blend.harmonize(argbFromHex('#7fb3e6'), seed));
[p.tone(80), p.tone(20), p.tone(30), p.tone(90)].map(hexFromArgb);
```

## Making a scheme more saturated

- `SchemeVibrant` is Material's own "more colourful" variant. With a yellow or gold seed, it makes the primary much stronger, but secondary and tertiary drift toward the seed hue (gold-olive). The result is more monochrome, not more colourful.
- Raising chroma at a fixed tone often does nothing. `Hct.from(hue, chroma * 1.5, tone)` silently clamps to the sRGB gamut, and dark containers (tone 30) and pale tones (80–90) are usually already at the gamut edge. HSL saturation is often already 100% for those colours.
- To actually get more chroma, keep the hue and search nearby tones for the closest one that reaches the target chroma. Constrain the search by contrast: container vs on-container text `Contrast.ratioOfTones(a, b) >= 4.5`, and decorative dots vs surface `>= 3`. In practice, dark containers move from tone 30 to about 42, and gain roughly 25–50% chroma.

## Notes

- Neutral surfaces in a pure tonal-spot scheme are derived from the seed's hue. A warm seed (gold, orange) gives warm brown-black surfaces in dark mode. If you want a different ground colour, override `neutralPalette` / `neutralVariantPalette` as above instead of hand-editing hex values.
- The same scheme object with `isDark: false` gives a matching light theme. Emit both as CSS custom properties under `[data-theme=dark]` and `[data-theme=light]`.
- In 0.3.0, `DynamicScheme` takes `sourceColorArgb`. The 0.4.0 typings take `sourceColorHct` plus optional `platform` / `specVersion`, so check the `.d.ts` file when switching versions.
- Google Fonts italics: if a family's `ital` axis isn't requested in the css2 URL, `font-style: italic` falls back to a browser-synthesised slant of the roman face. Requesting `ital,...@1,...` switches to the true italic, which can have quite different letterforms (e.g. Fraunces). Pick one deliberately so the look doesn't change when you add the axis.
