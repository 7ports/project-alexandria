---
id: pico-8-token-micro-savings
type: reference
title: PICO-8 token micro-savings that keep code readable (verified on 0.2.7)
summary: "Small, behaviour-neutral token savings verified on PICO-8 0.2.7, plus how to prove a token pass changed nothing (tests + pixel-identical screenshot diffs) and why test carts become the tighter budget."
tags:
  - pico-8
  - tokens
  - optimization
  - shrinko8
  - testing
status: verified
embedding_version: 1
---

# PICO-8 token micro-savings that keep code readable (verified on 0.2.7)

These were verified with `shrinko8 --count`, and each one left headless tests and framebuffer screenshots pixel-identical.

| Before | After | Saves | Note |
|---|---|---|---|
| `a,b,c=1,nil,nil` | `a,b,c=1` | 1 per nil | Missing values in a multiple assignment become nil. Put nil targets last. |
| `x>=0 and y>=0` | `x\|y>=0` | 2 | Comparison binds looser than `\|`, so it parses as `(x\|y)>=0`. True iff both are non-negative. |
| `{0,0,0}` | `split"0,0,0"` | 2 | `split` converts numbers by default. |
| `t={a={},b={},c={},…}` (many empty tables) | `for k in all(split"a,b,c,…") do t[k]={} end` | ~1 per field after 4 | Comment it. |
| `all({r,o})` | `all{r,o}` | 1 | A call with a single table literal needs no parens. |
| `if (c) print(s,x,y,col)` | `if (c) ?s,x,y,col` | 1 | `?` works after a shorthand `if` on 0.2.7. Also usable as its own statement line. |
| `t[d][1],t[d][2]` for direction tables | `dx[d],dy[d]` from `dx,dy=split"-1,1,0,0",split"0,0,-1,1"` | 4 per use | Keep the table-of-pairs version if `rnd(tbl)` picks from it, so RNG sequences don't change. |
| `local f=split(l,",",false)` + `tonum(f[3])` | `local f,n=split(l,",",false),split(l)` + `n[3]` | 2 per field | Keep the string split for 32-bit money fields: `tonum(s,2)`, because default `split` wraps above 32767. |
| `local lo=c and a or b; local off=c and p or q` | `local lo,off=b,q if (c) lo,off=a,p` | ~5 | |
| two identical loops over two lists | `for l in all{l1,l2} do for o in all(l) do … end end` | ~4 | |

Not worth it: `flr(rnd(n))` vs `rnd(n)\1` (same count), and turning `if c then … end` into the shorthand `if (c) …` (`then` and `(` both cost 1).

## Proving a token pass changed nothing

1. Before editing, run the headless tests and copy the screenshots to a baseline folder.
2. After each change, re-run and diff the screenshots pixel by pixel. Also compare logged sim totals (money, counts) against the baseline.
3. Keep RNG call order identical (`rnd(tbl)` consumes a `rnd`). Seeded generation, and every screenshot after it, depends on it.
4. On Windows, Python output has CRLF: `grep -v " same$"` needs `tr -d '\r'` first, or every line looks like a difference.

**Expectation:** an already-tidy ~5k-token cart yielded only ~1% from safe micro-edits. Big wins need structural changes (e.g. `_ENV`, which hurts readability and shrinko8 minify).

## Test carts are the tighter budget

If tests run as "game + helper lib + one test file" in one cart, each test cart must stay under 8192 tokens. Its overhead (≈1,000-1,400 tokens) is reached long before the game itself hits 8192. Track the largest test cart, and split test files early.
