#!/usr/bin/env node
/**
 * build-theme.mjs — generate docs/assets/theme.css (the "Pharos" colour tokens).
 *
 * Every colour on the site comes from one seed, lamp gold #f3c969, through Material Design 3
 * (@material/material-color-utilities, the library behind Material Theme Builder):
 *
 *   - Scheme: Material 3 "Vibrant" variant, dark and light.
 *   - Dark-mode surfaces are moved down in tone (same neutral palette, same tier order) so text
 *     has more contrast than Material's defaults.
 *   - Content-type colours (guide/concept/reference/article) are Material "custom colours":
 *     harmonised toward the seed, then chroma raised 50%. Where a colour already sits at the
 *     sRGB gamut edge, its tone moves the least amount that makes room, under contrast limits
 *     (container vs its text >= 4.5:1, dot colour vs surface >= 3:1). Guides use the primary role.
 *   - Logo colours come from the seed's own tonal palette: pale golds in dark mode, deeper golds
 *     in light mode so the mark stays visible on a light ground.
 *
 * Output: CSS custom properties, `--md-*` (Material roles), `--t-<type>[-on|-ct|-onct]` and
 * `--logo-*`, under `:root, [data-theme="dark"]` and `[data-theme="light"]`.
 *
 * Usage: npm run theme      (re-run after changing anything below; commit theme.css)
 * Note: pinned to material-color-utilities 0.3.0 — 0.4.0's ESM build fails to import in Node.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  argbFromHex, hexFromArgb, Hct, SchemeVibrant, TonalPalette, MaterialDynamicColors as M,
  Blend, Contrast,
} from '@material/material-color-utilities';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'docs', 'assets', 'theme.css');

const SEED_HEX = '#f3c969';
const SEED = argbFromHex(SEED_HEX);
const TYPE_BOOST = 1.5;
// Design colours for the non-guide types, before harmonisation.
const TYPE_DESIGN = { concept: '#7fb3e6', reference: '#e58a6b', article: '#9fcf8f' };
// Darker dark-mode surfaces (Material defaults: 4, 6, 10, 12, 17, 22).
const DARK_SURFACE_TONES = {
  surfaceContainerLowest: 1, surface: 3, surfaceContainerLow: 5,
  surfaceContainer: 7, surfaceContainerHigh: 10, surfaceContainerHighest: 14,
};
// Logo tones from the seed palette: [dark, light].
const LOGO_TONES = {
  'tower-top': [83, 52], 'tower-bottom': [60, 34], beam: [83, 58], gallery: [83, 45],
  'lamp-core': [96, 80], 'lamp-edge': [83, 58],
};

const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'onSurfaceVariant',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest',
  'outline', 'outlineVariant', 'inverseSurface', 'inverseOnSurface', 'inversePrimary',
];
const kebab = (s) => s.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
const hex = (argb) => hexFromArgb(argb);
const tone = (argb) => Hct.fromInt(argb).tone;

function roleArgb(s, role, isDark) {
  if (isDark && role in DARK_SURFACE_TONES) return s.neutralPalette.tone(DARK_SURFACE_TONES[role]);
  return M[role].getArgb(s);
}

/** Raise chroma by `boost`, moving tone as little as possible, under a contrast floor. */
function boostChroma(argb, boost, otherTone, minRatio) {
  const h = Hct.fromInt(argb);
  const want = h.chroma * boost;
  let best = null;
  for (let d = 0; d <= 30; d++) {
    for (const t of [h.tone - d, h.tone + d]) {
      if (t < 0 || t > 100 || Contrast.ratioOfTones(t, otherTone) < minRatio) continue;
      const c = Hct.from(h.hue, want, t);
      if (c.chroma >= want - 0.5) return c.toInt();
      if (!best || c.chroma > best.chroma) best = c;
    }
  }
  return (best || h).toInt();
}

function typeRoles(s, isDark) {
  const surfaceTone = tone(roleArgb(s, 'surface', isDark));
  const out = {
    // Guides use the primary role itself, filled (approved in the mockups: easier to read).
    guide: { c: M.primary.getArgb(s), on: M.onPrimary.getArgb(s), ct: M.primary.getArgb(s), onct: M.onPrimary.getArgb(s) },
  };
  for (const [t, design] of Object.entries(TYPE_DESIGN)) {
    const h = Hct.fromInt(Blend.harmonize(argbFromHex(design), SEED));
    const p = TonalPalette.fromHueAndChroma(h.hue, Math.max(h.chroma, 56));
    const r = isDark ? { c: p.tone(80), on: p.tone(20), ct: p.tone(30), onct: p.tone(90) }
                     : { c: p.tone(40), on: p.tone(100), ct: p.tone(90), onct: p.tone(10) };
    r.ct = boostChroma(r.ct, TYPE_BOOST, tone(r.onct), 4.5);
    r.c = boostChroma(r.c, TYPE_BOOST, surfaceTone, 3);
    out[t] = r;
  }
  return out;
}

function block(isDark) {
  const s = new SchemeVibrant(Hct.fromInt(SEED), isDark, 0);
  const lines = ROLES.map((r) => `--md-${kebab(r)}: ${hex(roleArgb(s, r, isDark))};`);
  for (const [t, r] of Object.entries(typeRoles(s, isDark))) {
    lines.push(`--t-${t}: ${hex(r.c)}; --t-${t}-on: ${hex(r.on)}; --t-${t}-ct: ${hex(r.ct)}; --t-${t}-onct: ${hex(r.onct)};`);
  }
  const seedPalette = TonalPalette.fromInt(SEED);
  for (const [k, [d, l]] of Object.entries(LOGO_TONES)) lines.push(`--logo-${k}: ${hex(seedPalette.tone(isDark ? d : l))};`);
  lines.push(`color-scheme: ${isDark ? 'dark' : 'light'};`);
  return lines.map((l) => '  ' + l).join('\n');
}

const css = `/* GENERATED by scripts/build-theme.mjs — do not edit by hand; run \`npm run theme\`.
 * Pharos theme: Material 3 Vibrant scheme from seed ${SEED_HEX}. See the script header for the rules. */
:root,
[data-theme="dark"] {
${block(true)}
}

[data-theme="light"] {
${block(false)}
}
`;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (cur !== css) { console.error('theme.css is stale — run `npm run theme`.'); process.exit(1); }
  console.log('theme.css is up to date.');
} else {
  fs.writeFileSync(OUT, css);
  console.log('Wrote ' + path.relative(ROOT, OUT));
}
