---
id: jsdom-test-static-site-fetch-routing
type: reference
title: "jsdom: test a static site's client-side fetch + routing against a local server"
summary: "jsdom has no window.fetch; inject Node's fetch resolving relative URLs against window.location, stub CDN libraries, and load pages with JSDOM.fromURL + runScripts to verify list/filter/deep-link behaviour without a browser."
tags:
  - jsdom
  - testing
  - static-site
  - github-pages
  - fetch
  - node
status: active
embedding_version: 1
---

## Symptom

You want to check that a static site's client-side JavaScript works (it fetches a JSON manifest, renders cards, filters them, and deep-links to `?doc=...` pages that fetch markdown). Under jsdom the page scripts either throw or render nothing:

```
ReferenceError: fetch is not defined
```

Or the page renders but external `<script src="https://cdn...">` libraries (markdown renderers etc.) are missing, because jsdom does not load subresources by default.

## Cause

jsdom implements the DOM, not the full browser platform. `window.fetch` does not exist, `window.scrollTo` is a "not implemented" stub, and external scripts are only loaded with `resources: 'usable'`, which would also hit the network.

## Fix

Serve the site locally (any static server that maps `/dir/` to `dir/index.html`), then load each page with `JSDOM.fromURL` and patch the window in `beforeParse`:

```js
const { JSDOM } = require('jsdom'); // npm i jsdom (in a scratch dir, not the project)

const load = (url) => JSDOM.fromURL(url, {
  runScripts: 'dangerously',          // run the page's inline scripts
  pretendToBeVisual: true,
  beforeParse(window) {
    // Node 18+ global fetch; resolve relative URLs the way a browser would.
    window.fetch = (u, o) => fetch(new URL(u, window.location.href), o);
    window.scrollTo = () => {};
    // Stand-in for a CDN library the page expects (e.g. a markdown renderer).
    window.marked = { parse: (md) => `<div class="md">${md.length}</div>` };
  },
});

const dom = await load('http://localhost:8000/guides/?type=reference&guide=<slug>');
await new Promise((r) => setTimeout(r, 800));      // let the fetches settle
console.log(dom.window.document.querySelector('#content').innerHTML);
dom.window.close();
```

Assert against the real DOM: card counts per type, `button.click()` on filter chips followed by `style.display` checks, `window.location.search` after `history.replaceState`, `document.title` once the manifest lands. Then, separately with plain `fetch`, check that every manifest entry and every link target returns HTTP 200.

## Notes

- `runScripts: 'dangerously'` executes page JS with Node privileges. Only point it at your own site.
- A fixed `setTimeout` is simplest. For flakier pages, poll for a selector instead.
- This catches routing/fetch-path bugs (wrong relative path for a new content dir, a missing query parameter, an unescaped title) that a string-match test on the HTML source cannot.
