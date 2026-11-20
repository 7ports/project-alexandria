---
id: pico-8-mobile-distribution
type: reference
title: "PICO-8 on phones: no native mobile export; ship the HTML export"
summary: "How to get a PICO-8 game onto Android/iOS without changing engine: built-in touch controls in the HTML export, PWA, WebView store wrappers, licence and store gotchas."
tags:
  - pico-8
  - mobile
  - android
  - ios
  - html5
  - capacitor
  - distribution
status: partially-verified
source_urls:
  - "https://www.lexaloffle.com/pico-8.php?page=faq"
  - "https://www.lexaloffle.com/dl/docs/pico-8_manual.html"
  - "https://github.com/NinjasCL/pico8-ios-wrapper"
  - "https://github.com/torch2424/picoDeploy"
  - "https://support.google.com/googleplay/android-developer/answer/14151465"
embedding_version: 1
---

# PICO-8 on phones: no native mobile export; ship the HTML export

**As of PICO-8 v0.2.7 (late 2026):** exports cover HTML5 and desktop binaries (Windows/Mac/Linux/Raspberry Pi) only. The Lexaloffle FAQ says stand-alone iOS/Android ports are "planned for after 1.0" with no date.

## What the default HTML export already handles [VERIFIED-LOCAL, 0.2.7 export]
- **Touch controls built in.** The default shell detects touch (`p8_touch_detected`), draws an on-screen d-pad + O/X buttons (`touch_controls_gfx`) and uses a portrait layout (screen on top, buttons below) when the page is taller than wide. A cart that only uses `btn`/`btnp` needs no code changes. Mouse/devkit input (`poke(0x5f2d,1)`) is not a substitute for touch.
- **Tap to start.** `p8_autoplay=false` (the default) shows the label + a play button, which also unlocks audio on mobile browsers.
- **Saves.** `cartdata` goes to IndexedDB through Emscripten IDBFS (`syncfs`). That works in a browser or WebView. On iOS, WKWebView storage has been reported wiped in some cases, so a store app that needs reliable saves should mirror them to native storage.
- `-p template.html` swaps in a custom shell to hide desktop chrome or restyle buttons. Keep the element ids the JS references (e.g. `p8b_pause1`).

## Routes to a phone, cheapest first
1. **Mobile web / itch.io** (turn on "Mobile Friendly"). Zero extra work.
2. **PWA** (manifest + service worker around the export) for home-screen install and offline play.
3. **Store app:** put the exported `index.html` + `index.js` into a WebView wrapper (Capacitor; older community tools: picoDeploy (Ionic/Cordova), pico8-ios-wrapper (Xcode)). On Android a Trusted Web Activity also works if the game is hosted.
   - Licence: exported carts can be distributed and sold, provided every contributing author agrees (manual + FAQ).
   - iOS: needs a Mac + Xcode and a paid Apple developer account. Bundle the files locally so the app doesn't read as a repackaged website (App Store guideline 4.2).
   - Google Play personal accounts created after Nov 2023 need a closed test with 12 opted-in testers for 14 days before production.
   - Older reports say the Android system WebView had trouble with Emscripten audio. Test sound on real devices.
4. Native PICO-8 player apps exist (Pixl8, Infinity, PicPic, pico-ios). These are for players running carts, not a way to ship your own game.
