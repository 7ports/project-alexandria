---
id: pico-8-old-version-could-not-load
type: reference
title: "PICO-8: 'could not load <cart>' means the installed PICO-8 is older than the cart"
summary: "An old PICO-8 (e.g. v0.2.1b) prints only 'could not load' for a .p8 saved by a newer version; -accept_future doesn't help, and patching the header runs but behaves differently."
tags:
  - pico-8
  - version
  - headless
  - testing
  - troubleshooting
status: verified
embedding_version: 1
---

# PICO-8: "could not load <cart>" means the installed PICO-8 is older than the cart

## Symptom

A headless run prints only the following, and every test "fails" in about a second with no `printh` output:

```
RUNNING: <cart>.p8
could not load <cart>.p8
```

A test runner that parses `@pass/@done` just reports "no @done".

## Cause

The `.p8` header line `version N` is newer than the installed PICO-8 supports. For example, a cart saved by v0.2.7 has `version 43`, and v0.2.1b (2020) can't load it. Old builds give **no version message**, and `-accept_future 1` does not help on them.

**Check the installed version:** read the first lines of `pico-8.txt` (older installs) or `pico-8_manual.txt` next to `pico8.exe`. The exe's file date is a strong hint, too.

## Don't use an old PICO-8 as a test stand-in

If you change the header to an old version (e.g. `version 29`), the cart runs, but the API differs between versions (`rnd(table)`, `tonum`/`tostr` flags, `pal` tables, `split`, etc.). In one case the baseline then failed 10 generation checks and a UI test crashed with nil errors. Results from an older PICO-8 aren't valid evidence for a cart written for a newer one. That includes before/after screenshot diffs, because the baseline is already broken.

## Fix

Install the version the project targets on every machine that runs the tests: PICO-8 is paid, so get it from your Lexaloffle account downloads. Record the required version in the project docs, and have the test runner fail fast with a clear message when it sees "could not load".
