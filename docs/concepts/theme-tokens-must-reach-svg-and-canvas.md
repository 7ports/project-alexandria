---
id: theme-tokens-must-reach-svg-and-canvas
type: concept
title: A light/dark theme is only as complete as the places its tokens can reach
summary: "CSS custom-property themes miss external SVGs, favicons, canvas/WebGL charts and script colour constants. Inline the logo coloured from tokens, give standalone SVGs a prefers-color-scheme block, read tokens at chart render time and re-render on a themechange event."
tags:
  - theming
  - dark-mode
  - css-custom-properties
  - svg
  - plotly
  - canvas
  - design-tokens
embedding_version: 1
---

# A light/dark theme is only as complete as the places its tokens can reach

## The idea in one paragraph

A site theme built on CSS custom properties (`--surface`, `--primary`, …) switches instantly for anything styled with CSS, and silently misses everything that isn't. Three places are easy to miss: SVG loaded as an image (logos, favicons), canvas/WebGL charts that take colours as JavaScript values, and colours hard-coded in scripts. Each needs its own route to the tokens, or the toggle leaves a dark logo on a light page or a black chart in light mode. Generating the tokens from one source (for example Material 3 roles from a seed colour) only helps if every consumer reads them.

## The failure shape

- **`<img src="logo.svg">` cannot see page CSS variables.** It is a separate document. It can follow `prefers-color-scheme` (via a `<style>` media query inside the SVG), but not a site's own toggle stored in `localStorage`.
- **Favicons** are the same, but worse: they only ever follow the OS scheme.
- **Charts (Plotly, Chart.js, three.js, canvas)** take colours as JS strings at render time. They keep whatever they rendered with until told to re-render, so a theme switch leaves the old background, grid and font colours.
- **Script constants** (`var BG = "#0d1117"`) survive a palette change unnoticed. A rebrand can update every CSS file and still ship the old palette inside a chart module.

All of these look fine in the theme you developed in and only break in the other one, so they slip through review.

## Why it works this way

CSS custom properties cascade through the DOM of one document. Inline `<svg>` is part of that DOM, so it inherits them; an external SVG, a favicon or a canvas bitmap is not part of it. JS libraries don't participate in the cascade at all. They receive concrete values once and keep them.

## The rule

- **Inline the logo** where it must follow the toggle, and colour it from tokens: `<stop style="stop-color:var(--logo-top)"/>`, `style="stroke:var(--logo-beam)"`. Give each inline copy unique gradient `id`s.
- **Standalone SVG files** (README, favicon, social cards) should carry their own `@media (prefers-color-scheme: light)` block, accepting that they follow the OS rather than the toggle.
- **Charts:** read tokens at render time (`getComputedStyle(document.documentElement).getPropertyValue('--md-on-surface')`). Make the chart's own background transparent so it sits on the themed container. Re-render on a `themechange` event that the toggle dispatches.
- **Set the theme before first paint:** use a small blocking script in `<head>` that applies the stored or OS theme as a `data-theme` attribute, so there is no flash of the wrong theme.
- **Enforce it:** grep page CSS and scripts for hex/rgba literals. Anything left should be data colours (categorical chart palettes) or documented fallbacks.

## When it does not apply

Dark-only or light-only sites don't need any of this; one palette is enough. Categorical data palettes (cluster colours) can reasonably stay fixed across themes if they keep enough contrast on both backgrounds.

## Related

- `material-color-utilities-esm-import-and-scheme-generation`: generating the tokens from one seed colour.
- `headless-chrome-screenshots-color-scheme-webgl-narrow-viewports`: verifying both themes visually.
