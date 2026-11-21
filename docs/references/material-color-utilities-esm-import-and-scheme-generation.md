---
id: material-color-utilities-esm-import-and-scheme-generation
type: reference
title: "material-color-utilities: 0.4.0 fails to import in Node; generating Material 3 schemes from a seed"
summary: "@material/material-color-utilities 0.4.0 throws ERR_MODULE_NOT_FOUND in Node ESM (extensionless import in color_spec_2025.js); pin 0.3.0. Plus how to build Material 3 dark/light roles, override neutral core colours, and harmonise custom colours."
tags:
  - material-design
  - material-3
  - color
  - theming
  - npm
  - esm
  - node
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
import { argbFromHex, hexFromArgb, Hct, SchemeTonalSpot, DynamicScheme, TonalPalette,
  MaterialDynamicColors as M, Blend } from '@material/material-color-utilities';

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

## Notes

- Neutral surfaces in a pure tonal-spot scheme are derived from the seed's hue. A warm seed (gold, orange) gives warm brown-black surfaces in dark mode. If you want a different ground colour, override `neutralPalette` / `neutralVariantPalette` as above instead of hand-editing hex values.
- The same scheme object with `isDark: false` gives a matching light theme. Emit both as CSS custom properties under `[data-theme=dark]` and `[data-theme=light]`.
- In 0.3.0, `DynamicScheme` takes `sourceColorArgb`. The 0.4.0 typings take `sourceColorHct` plus optional `platform` / `specVersion`, so check the `.d.ts` file when switching versions.
