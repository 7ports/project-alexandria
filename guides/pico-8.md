---
id: pico-8
type: guide
title: pico-8
embedding_version: 1
---

---
id: pico-8
type: guide
title: pico-8
embedding_version: 1
---

# PICO-8 (Lexaloffle fantasy console): agent development guide

<!-- Researched against PICO-8 v0.2.7 (cart "version 43") on Windows 10. Items tagged [VERIFIED-LOCAL] were smoke-tested on a real install; [MANUAL] = official manual; [SRC] = read in tool source; [UNVERIFIED] = test before relying on it. -->

## Quick Reference

**Install:** PICO-8 is paid (lexaloffle.com). The Windows installer puts it in `C:\Program Files (x86)\PICO-8\` (`pico8.exe`, `pico8.dat`, `SDL2.dll`, `pico-8_manual.txt` — the full manual + changelog; read it locally). User data: `%APPDATA%\pico-8\` (carts/, backup/, cdata/, plates/, log.txt; `config.txt` only appears after the first *clean* exit).

**Companion tool (recommended)** [VERIFIED-LOCAL, shrinko8 v1.2.7d]:
```bash
python -m pip install --user shrinko   # PyPI name is "shrinko" (NOT shrinko8 -> 404). Gives `shrinko8` + `shrinkotron`; pulls pillow + lupaz8
# Windows --user install: the exes land in %APPDATA%\Python\Python3XX\Scripts\ (not on PATH) - call by full path
# the XX differs per machine (Python310 on one, Python312 on another): scripts should glob Python3*\Scripts, not hardcode
# or standalone exe: https://github.com/thisismypassport/shrinko8/releases (shrinko.zip)
```

**Every-edit gate:**
```bash
shrinko8 game.p8 --lint --no-lint-fail --count --error-format tabbed
# exit: 0 ok | 1 syntax/compile error | 2 lint warnings | 3 failure | 4 #include not found
# without --no-lint-fail, counts may not print when lint fails; it follows #include lines
# #include paths resolve relative to the cart: a generated temp cart must sit next to the real one,
# or --count prints nothing (exit 4)
```
Lint notes [VERIFIED-LOCAL]: globals first assigned outside `_init` are reported as undefined — declare them with a comment line `--lint: name1, name2` (this does **not** silence "only ever assigned, never used" warnings). Globals read via `_ENV["name"]` are invisible to the linter (they show as unused) — look them up from a plain table instead. Locals named `t` (or other builtins) warn because they shadow `t()`. **shrinko8 accepts some lines real PICO-8 rejects** (see gotchas 21-22) — a clean lint doesn't prove the cart parses; run it.

**Headless run with captured output (Git Bash)** [VERIFIED-LOCAL]:
```bash
P="/c/Program Files (x86)/PICO-8/pico8.exe"
timeout -k 2 30 "$P" -home "$(pwd)/.build/p8home" -root_path "$(pwd)" -volume 0 -x "$(cygpath -m test_run.p8)" 2>&1 | tee .build/run.log
# printh() lines arrive prefixed "INFO: " on STDERR (Windows) - always merge stderr (2>&1, or
# subprocess stderr=STDOUT in Python); grep for "runtime error"/"syntax error"
```

**Launch for a human playtest:**
```bash
cmd //c start "" "C:\Program Files (x86)\PICO-8\pico8.exe" -windowed 1 -run "$(cygpath -w game.p8)"
# human presses Ctrl+R after each external edit to reload
```

**Verify:** `"$P" -x hello.p8 2>&1 | cat` prints `INFO: <your printh text>`.

## Overview

PICO-8 is a fantasy console: 128x128 screen, 16 colours (+16 "secret" ones), 4-channel audio, Lua 5.2-derived dialect, carts saved as plain-text `.p8` (diff-friendly) or `.p8.png` images. An agent can do almost everything through files + CLI: write Lua, generate gfx/map/sfx data as hex, lint/count with shrinko8, run carts headlessly and capture `printh` output, dump the framebuffer to get screenshots. What it can't do: see/hear the live game — the human judges feel, art and sound.

Lessons from people who've used LLM agents on PICO-8: agents do logic, systems, data plumbing and refactors well; **AI-drawn pixel art and visual styling fails repeatedly** — keep the human (or a pre-made asset pack) on art, use agent-generated placeholders only.

## Hard limits

| Limit | Value | Notes |
|---|---|---|
| Tokens | **8192** | Usually the first wall. `#include`d code counts. |
| Characters | 65535 | P8SCII chars (a glyph emoji = 1). |
| Compressed code | **15360 B** (manual) / 15616 (code region, what tools report) | Only enforced for `.p8.png`/`.p8.rom`/exports — a `.p8` over 100% still loads and runs. shrinko8 compresses better than PICO-8 — leave margin. Export through `shrinko8 game.p8 game.p8.png --minify` when the plain cart is over: a well-commented ~7.7k-token cart went from 102% to 53% [VERIFIED-LOCAL]. |
| Lua RAM | 2 MB | `stat(0)` = KB used. |
| CPU | `stat(1)` 1.0 = 100% of frame | `_update60` halves per-frame budget. Over budget → 30→15 fps (or 60→30), `_update` called twice per `_draw`. |
| Sprites / map | 256 8x8 sprites; map 128x32 (128x64 using shared memory) | Sprites 128-255 **are** map rows 32-63 (0x1000-0x1fff). Use one or the other. |
| Audio | 64 SFX, 64 music patterns, 4 channels | |
| Save data | `cartdata(id)` → 64 numbers (256 B) via `dget/dset` | Up to 4 ids/session (0.2.7). Pack bits/shorts via `poke` at 0x5e00. |
| Extra RAM | 0x8000-0xffff (32 KB) | RAM only, not stored in cart. |

**Token rules** [SRC shrinko8 tokenizer]: free = `, . : ; :: ) ] } end local`, comments, whitespace, unary `-`/`~` on a literal. 1 token = each identifier, literal (any-length string = 1), opening bracket, keyword, operator, compound assignment (`+=` is 1). So `f"str"` = 2, `f("str")` = 3; `t.k` = 2, `t["k"]` = 3; `local` costs nothing. (A ~60-line regex counter following these rules landed within 0.5% of shrinko8 on a ~4800-token cart — fine as a fallback.)

## The .p8 text format

```
pico-8 cartridge // http://www.pico-8.com
version 43
__lua__
-- code (tabs separated by a line that is exactly -->8)
__gfx__
__label__
__gff__
__map__
__sfx__
__music__
```
Order is what PICO-8 writes; reader is header-driven. Omitted sections / trailing lines = defaults. Short lines are zero-padded. Always write the 2 header lines. LF endings, UTF-8 no BOM, lowercase hex.

| Section | Shape | Encoding |
|---|---|---|
| `__gfx__` | ≤128 lines × 128 hex | **1 digit per pixel, visual left→right** (RAM is nibble-swapped: low nibble = left pixel — the file is NOT). Sprite n top-left = x `(n%16)*8`, y `(n\16)*8`. Lines 64-127 = shared memory = map rows 32-63 (map byte written low nibble first there). |
| `__gff__` | 2 lines × 256 hex | 1 byte (2 hex, MSB first) of flags per sprite; flag 0 = bit value 1. |
| `__label__` | 128 × 128 | like gfx but `0-9a-v` = 32 colours (`g`-`v` = secret colours 128-143). |
| `__map__` | ≤32 lines × 256 hex | 1 byte per tile, rows 0-31. |
| `__sfx__` | 64 lines × 168 hex | 8 hex header = 4 bytes: editor mode/filters, **speed** (≈1/120 s per note per unit), loop start, loop end (end=0 → start acts as length). Then 32 notes × 5 hex `PPWVE`: pitch 00-3f (C0..D#5), waveform 0-7 (8-f = custom instrument sfx 0-7), volume 0-7 (0 = rest), effect 0-7 (none, slide, vibrato, drop, fade-in, fade-out, arp fast, arp slow). Waveforms: 0 triangle, 1 tilted saw, 2 saw, 3 square, 4 pulse, 5 organ, 6 noise, 7 phaser. Empty sfx 1-63 default speed 16: `00100000` + `00000`×32. |
| `__music__` | 64 lines `FF AABBCCDD` | flags bit0 loop-start, bit1 loop-end, bit2 stop. Channel byte = sfx id; **0x40 bit = channel off** (empty pattern `00 41424344`). |
| `__meta:name__` | free text | preserved by PICO-8; for tools. |

Generation pitfalls:
- **Lowercase code only.** Uppercase ASCII = "puny" glyphs and distinct identifiers (`PRINT` is undefined). Only exception: `_ENV`.
- Never start/end code with `-->8` or put two in a row.
- A line that starts and ends with `__` inside code (e.g. in a multiline string) is parsed as a section header.
- Button glyphs (`⬅️➡️⬆️⬇️🅾️❎`) are multi-codepoint UTF-8 — prefer `btn(0..5)`.
- Never hand-type large hex blobs; generate with a script.

## Recommended project layout & editing workflow

```
game.p8          # thin cart: header, __lua__ with only #include lines, + gfx/map/sfx/music data
src/*.lua        # all code (agent edits these)
tests/*.lua      # test drivers
tools/           # runner, framebuffer->png, png->gfx scripts
.build/ shots/   # gitignored
```
```
__lua__
#include src/util.lua
#include src/main.lua
```
- `#include` [MANUAL+VERIFIED-LOCAL]: path relative to the cart file; resolved at each run (Ctrl+R picks up `.lua` edits even if `.p8` unchanged); **not recursive**; also `#include other.p8:N` (one tab) / `other.p8` (all tabs). `.p8` saves keep the lines; `.p8.png`/rom/exports flatten them.
- **Reload rules:** no file watcher. Ctrl+R reloads the `.p8` only if PICO-8 has *no unsaved editor changes*; otherwise "DIDN'T RELOAD; UNSAVED CHANGES". If the human saves (Ctrl+S) in PICO-8, it rewrites the whole `.p8` and clobbers agent edits to data sections → agent edits `src/*.lua`; touches `game.p8` data only when the human has saved/closed.
- `.gitattributes`: `*.p8 text eol=lf`, `*.lua text eol=lf`, `*.p8.png binary`. `__gfx__` merge conflicts aren't hand-resolvable — pick a side.
- Inside PICO-8 (console `load/save/cd/ls`, `printh` files) paths are relative to **root_path**; `-export` paths are relative to the **OS cwd**.

## Command line (Windows)

`pico8.exe [switches] [cart]`. It's a 32-bit **GUI-subsystem** exe: `cmd` returns immediately; Git Bash/PowerShell `-Wait` block.

| Switch | Use |
|---|---|
| `-run cart` | load & run (window). Pause menu gains SHUTDOWN. |
| `-x cart` | headless run (see below). |
| `-export "args"` | headless EXPORT then exit, e.g. `pico8.exe game.p8 -export "-f game.html"` / `"game.p8.png"` / `"-i 32 -s 2 -c 12 game.bin"`. Args lowercase. |
| `-p "str"` | param readable via `stat(6)` (e.g. test mode flags). |
| `-home dir` | config/log/backup/cdata location — **sandbox test runs with this**. |
| `-root_path dir` | virtual drive root. |
| `-desktop dir` | where screenshots/GIFs/wavs go. |
| `-windowed 1 -width N -height N`, `-volume 0`, `-screenshot_scale N`, `-gif_len N`, `-accept_future 1`, `-global_api 1` | misc. No `-frames` switch exists. |

### Headless `-x` behaviour [VERIFIED-LOCAL, v0.2.7, Win10]
- **Output is capturable when piped, but `printh(s)` → `INFO: s` goes to stderr** on Windows; only the `RUNNING: <path>` banner is on stdout. Capturing stdout alone gets you nothing — merge the streams (`2>&1`; in Python `subprocess.run(..., stdout=PIPE, stderr=STDOUT)`). Top-level output comes before the `RUNNING:` line.
- **The game loop runs**: `_update`/`_draw` are called at real-time speed. Without a stop condition it runs forever → always end with `extcmd("shutdown")` (works under `-x`, exits within ~1 s) and wrap in `timeout`.
- **Runtime error → prints and exits** (exit code 0):
  ```
  runtime error line 2 tab 0
   return q.y
  attempt to index local 'q' (a nil value)
  src/mod.lua line 4          <- included file + real line are reported
  in boom line 2 (tab 0)
  at line 1 (tab 1)
  ```
  Line numbers are 1-based **within the tab** (or within the included file).
- **Syntax error → prints `syntax error` / `unclosed if at line 2 (tab 0)` then HANGS** until killed.
- **A cart over 8192 tokens also just hangs** under `-x` (no message) → count tokens before running.
- **Exit code is always 0 / meaningless** → parse output for `runtime error`, `syntax error`, your own `@fail` markers, and a final `@done` sentinel.
- `printh(s, "out.txt", true)` writes to **root_path** (not OS cwd). Allowed extensions include `.txt`; rate limit 10 MB / 64 files per minute.
- Kill by PID (Python `proc.kill()` / `timeout`), never `taskkill /IM pico8.exe` — that kills the human's playtest window too.
- Use `-home <project>/.build/p8home` so tests don't touch the user's config, cartdata or backups.

### Test-driver pattern (headless, deterministic)
Runner copies `game.p8` → `.test_run.p8` **next to it** (so `#include`s resolve), appends a tab, runs `-x`, parses stdout+stderr:
```lua
-->8
-- test driver
local held={}
function btn(i) return held[i]==true end   -- scripted input
function btnp(i) return held[i]==true end
local function ok(c,m) printh((c and "@pass " or "@fail ")..m) end
_init()
for f=1,300 do                 -- drive frames manually: runs as fast as host allows
 held[1]=f<60                  -- hold right 2 s
 _update()                     -- or _update60()
end
ok(player.x>40,"player moved right")
_draw()
-- framebuffer dump: 128 lines of 128 hex (screen RAM: low nibble = left pixel)
local hx="0123456789abcdef"
for y=0,127 do local s=""
 for i=0,63 do local b=peek(0x6000+y*64+i)
  s..=sub(hx,b%16+1,b%16+1)..sub(hx,b\16+1,b\16+1) end
 printh("@px "..s) end
for i=0,15 do printh("@pal "..i.." "..peek(0x5f10+i)) end  -- display palette (>=128 = secret colours)
printh("@done")
_init=nil _update=nil _update60=nil _draw=nil
extcmd("shutdown")
```
A ~50-line stdlib Python script maps `@px` lines through `@pal` + the RGB table below and writes a PNG (zlib+struct, scale ×4) the agent can view. Use `b\16` not `b>>4` (`>>` keeps fraction bits). Also run soak tests (thousands of frames, random input) to catch nil errors and 32767 overflow. Overriding `btn`/`btnp` as globals in the appended tab works: game code looks them up at call time.

**When game + test tab won't fit in 8192 tokens** [VERIFIED-LOCAL]: the test tab counts against the same limit, so a game near the limit leaves no room for tests. Let each test declare source files it never calls (e.g. a first line `--exclude: src/ui.lua`) and have the runner drop those `#include` lines from the temp cart. Globals resolve at call time, so missing functions only fail if actually called; stub the few that are still reached (`function say() end`). Split shared test helpers into a core file and an optional fixtures file so a tiny test can drop the fixtures too. Keep one small whole-game soak test with nothing excluded.

Alternative screenshot (window, `-run`): `-desktop <dir> -screenshot_scale 1`, then in a debug build `extcmd("set_filename","shot") extcmd("screen")` (no `%d` → overwrite). Keys: Ctrl+6 screenshot, Ctrl+7 label, Ctrl+8/9 GIF, Ctrl+P CPU meter.

## Palette

| 0 #000000 | 1 #1D2B53 | 2 #7E2553 | 3 #008751 | 4 #AB5236 | 5 #5F574F | 6 #C2C3C7 | 7 #FFF1E8 |
|---|---|---|---|---|---|---|---|
| **8 #FF004D** | **9 #FFA300** | **10 #FFEC27** | **11 #00E436** | **12 #29ADFF** | **13 #83769C** | **14 #FF77A8** | **15 #FFCCAA** |

Secret 128-143: #291814 #111D35 #422136 #125359 #742F29 #49333B #A28879 #F3EF7D #BE1250 #FF6C24 #A8E72E #00B543 #065AB5 #754665 #FF6E59 #FF9D81 — only via display palette `pal(c,128+k,1)`; still max 16 on screen.

**PNG → `__gfx__`:** quantize to the 16 colours first (nearest RGB, no dithering), then either PICO-8 console `import sheet.png`, or `shrinko8 game.p8 .build/out.p8 --merge sheet.png gfx spritesheet` — **shrinko8's .p8 output inlines `#include`s**, so splice only the `__gfx__` block back into the real cart; or a Pillow script emitting 128 lines × 128 hex. Reverse: `--extra-output sheet.png spritesheet`. No WAV→sfx importer exists; generate sfx rows by script (or MIDI converters: midi2pico, Denote).

## Converting existing asset-pack art (higher-res / more colours than PICO-8)

What worked, and what looked bad, converting a 16px, ~30-colour pack:
- **Downscale by one integer factor per pack** (e.g. 1/2 for 16px art → 8px). Non-integer factors silently crop or distort; mixing factors makes the set look inconsistent.
- **Per-block majority colour** (ties → darker) keeps lines crisper than nearest-neighbour or box-averaging; mark a block transparent when < half its pixels are opaque.
- **One fixed colour table per pack** (source hex → PICO-8 index), edited by hand so the pack's dark-to-light steps stay distinct (grey ramp 0 < 1 < 5 < 13 < 6 < 7) and materials keep meaning (water → 12). Nearest-colour matching collapses dark slate greys into one navy blob; an optimised "best 16 of 32" palette shifted greys brown. Both looked bad.
- **Watch rarely used dark tints** in the table: a dark blue-violet used only for the inside of a glass tank was mapped to the same grey as the floor, and the tank read as having a hole. Map such shades by material (liquid → dark blue 1), and when a player reports a "hole", check the colour table before suspecting transparency. To audit real holes: flood-fill transparent pixels from each sprite's border; any transparent pixel not reached is enclosed.
- 1-2 px details (small highlights, lights) vanish at 1/2 — pick different source sprites instead of hand-repairing.
- **Black art vs transparency:** colour 0 is transparent by default, so black pixels inside sprites become holes. Emit transparent pixels as an unused key colour and draw with `palt(0,false) palt(key,true)`.

## Runtime sprite tricks (saves cart space) [VERIFIED-LOCAL]

- `spr` can only flip, not rotate. Rotate at boot into free slots (128-255 are free if the map uses only rows 0-31):
  ```lua
  function rot90(src,dst) -- clockwise
   local sx,sy,dx,dy=src%16*8,src\16*8,dst%16*8,dst\16*8
   for y=0,7 do for x=0,7 do sset(dx+x,dy+y,sget(sx+y,sy+7-x)) end end
  end
  ```
- **Pipe/track join pieces from one straight piece:** build all 16 neighbour masks at boot. Thin pipes: take the half of the horizontal/vertical piece that reaches each joined edge (halves overlap the centre), then repeat with the outline colour skipped so bodies overwrite outlines at the joint. Full-width tracks/belts: mitre — each pixel comes from the piece of whichever joined direction has the nearest tile edge (picture-frame corners, clean T and cross).
- Close visual gaps where a conduit meets a sprite with transparent margins: measure the margin with `sget` along the conduit's centre line and `sspr` that many pixels of the straight piece into it.
- `pal(tbl)` recolours several at once (`pal({[12]=11,[1]=3})`); **`pal()` with no args also resets `palt`** — undo a recolour with `pal(k,k)` per entry if transparency is set.

## Language & API gotchas (top 22)

1. **16.16 fixed point, silent wrap at 32767** (`32767+1==-32768`, `200*200==-25536`, literal `40000` wraps). Frame counters overflow after ~18 min at 30 fps; `for i=1,36000` runs 0 times; `dx*dx+dy*dy` overflows for dx>181 → scale down before squaring. Keep long-running tick counters bounded (`t=(t+1)%period`, plus a separate slow counter) instead of letting them wrap. **Money/scores:** store as 32-bit int `v>>16` — make values from strings with `tonum("500000",2)` (flag 0x2 = read as shifted 32-bit int), print with `tostr(v,2)`; adding and multiplying by a plain small integer are fine; saves losslessly in one `dset` slot. (Don't multiply two shifted values.) When parsing data strings with big numbers use `split(s,",",false)` — default `split` converts to numbers and wraps them.
2. Lowercase source (see format section).
3. **Draw state persists across frames**: camera, clip, pal, palt, fillp, color. Call `camera()` before HUD; `pal()` resets palettes *and* transparency.
4. Sprites 128-255 = map rows 32-63.
5. Trig in **turns** (0..1), `sin` inverted (y down). `atan2(dx,dy)` → 0..1.
6. `sgn(0)==1`; `flr` toward −∞; `\` floor-div (`-7\2==-4`); `%` takes divisor's sign (`-1%10==9`).
7. Divide by zero → ±0x7fff.ffff, no error; `x%0==0`. Bugs show as huge numbers, not crashes.
8. `del(t,v)` removes first element **equal to v**; `deli(t,i)` by index. Deleting inside `for v in all(t)` is safe; in forward numeric loops iterate backwards.
9. `#t` undefined with nil holes; `pairs` order random → arrays for ordered update/draw.
10. **No stdlib**: no `string.*/table.*/math.*/require/os/io`; no `s:sub()`. Use `sub ord chr tostr tonum split add del deli count all foreach flr ceil mid rnd srand`, `s[i]` single char. Globals by name: `_ENV["s_"..name]` works at runtime but hides the use from shrinko8's linter/minifier — prefer a lookup table. `add(t,v,i)` inserts at index i (shuffle: `add(l,v,rnd(#l+1)\1+1)`); `add` returns v. `split"a,b,c"[j]` indexes the result directly.
11. `btnp` only meaningful in `_update` (state resets each update). Repeat = 15 frames then every 4; tune `poke(0x5f5c,delay) poke(0x5f5d,rate)` (255 = no repeat).
12. Game logic belongs in `_update` (may run 2× per draw when over budget). `time()` counts updates, not wall-clock; wraps ~9 h [UNVERIFIED].
13. **Mouse/keyboard are optional hardware** (`poke(0x5f2d,1)`; `stat(32/33)` x/y, `stat(34)` buttons, `stat(36)` wheel, `stat(30/31)` keys). Handhelds/phones lack them; "p"/Enter open pause (`poke(0x5f30,1)` suppresses one frame). Cursor-driven games (management sims): d-pad cursor primary, mouse optional.
14. Only colour 0 transparent by default (spr/map/tline). To draw black: `palt(0,false)` + another key colour.
15. Secret palette only through display palette (`pal(...,1)`).
16. `map()` skips tile 0; `mset` changes RAM only (`reload(0x2000,0x2000,0x1000)` restores); `mget` out of bounds → 0.
17. `cartdata("author_game")` once before `dget/dset`; version your save layout (magic number in slot 0).
18. **Coroutine errors are silent** → `assert(coresume(c))`.
19. `local _ENV=self` drops `self.` (saves tokens) but hides globals unless the object's metatable has `__index=_ENV`; never assign global `_ENV`. Breaks shrinko8 aggressive minify (use `--minify-safe-only`).
20. Dialect: `+= -= ..= \=` etc. must be whole single-line statements (`local x+=1` illegal); `if (c) stmt` needs parens & one line (use a full `if ... then ... else ... end` when you need `else`); `!=` ok; `?x` = print; `tonum("abc")` returns *nothing* (flag 0x4 → 0). `print` without x,y scrolls the console. `rnd(str)` no longer works (0.2.5c); `rnd(tbl)` picks an element.
21. **`?` print shorthand eats the rest of its line** [VERIFIED-LOCAL]: `for o in all(l) do if (o.off) ?"!",x,y,8 end` → PICO-8 `syntax error ... '>>>' expected near 'end'` (the `end` became part of the print). shrinko8 lint accepts it. Put a `?` statement on its own line, with nothing after its arguments.
22. **One-line `if (cond) stmt` with more code after it on the same line is fragile** [VERIFIED-LOCAL]: `for a in all(t) do if (f(a)) x=a end end end` → `<eof> expected near 'end'`, while similar lines with a non-call condition parse. When anything follows the statement on the line (an `end` closing an outer block), write `if c then ... end`.

Useful `stat()`: 0 mem KB, 1 CPU, 6 param, 7 fps, 46-49 sfx per channel, 54-57 music state, 80-95 date/time. Debug: `printh`, `stop(msg)` (then `resume`, `.` single-steps), `assert`, `trace()`.

## Idiomatic architecture snippets

```lua
-- state machine: swap callbacks (keep using the name you started with: _update or _update60)
function go_game() init_game() _update60=game_upd _draw=game_drw end

-- entity class
ent={} ent.__index=ent
function ent:new(o) return setmetatable(o or {},self) end

-- AABB
function hit(a,b) return a.x<b.x+b.w and b.x<a.x+a.w and a.y<b.y+b.h and b.y<a.y+a.h end

-- map-flag collision (flag 0 = solid)
function solid(px,py) return fget(mget(px\8,py\8),0) end

-- coroutine sequence
function wait(n) for i=1,n do yield() end end

-- pause menu (index 1-5, label <=16 chars)
menuitem(1,"save game",function() save() end)
```
Management sims: tick the simulation every N frames, draw static UI with one `map()` call, `print` with `\#c` background codes for panels, money as `>>16`. Tweening: `x+=(tx-x)*0.2`. Fades: per-colour darkening ramp applied with `pal(c,ramp[c],1)`.

**CPU opponents in a sim** (lessons from a builder/economy game): give them the player's own building/placement/pathing functions rather than a separate abstract model, and have each one take a single action every few ticks (stagger players across ticks to spread CPU cost). Before buying, test the result (can the new unit reach its target? can a conduit join it?) and undo for free if not, otherwise it re-buys the same broken thing forever. Keep a reserve that scales with its running costs, take on work only when it pays more than the upkeep it implies, and run a headless "CPUs alone for N cycles, several seeds" log — first versions went bankrupt in most seeds.

**Token savers** (manual): data as strings + `split"1,2,3"` (any-length string = 1 token), `a,b,c=1,2,3`, paren-less calls `f"x"`/`f{}`, `t.k` over `t["k"]`, `\` for `flr(a/b)`, `?` for print, shorthand `if`, `_ENV`, `foreach`/`all`. Generated constant files (sprite numbers etc.) should only emit names the code uses — each unused `name=value` still costs ~3 tokens. shrinko8 `--minify` handles renames/whitespace/const-folding (`--[[$const]] DEBUG=false` strips dead branches). Parens-8 compiler mode saves more but is AGPLv3 and slower.

## Recommended agent loop

1. Edit `src/*.lua` (data sections only via scripts, only when human has no unsaved PICO-8 edits).
2. `shrinko8 game.p8 --lint --no-lint-fail --count --error-format tabbed` — fail on exit 1/4; fix or annotate lint (declare non-`_init` globals with a `--lint: name1, name2` comment). Keep tokens < ~7800 for headroom.
3. Headless test: generate `.test_run.p8` with driver, `timeout 60 pico8.exe -home .build/p8home -x ...`, parse `@pass/@fail/@done` + error lines from stdout+stderr.
4. Framebuffer dump → PNG → view it.
5. Human playtest window (`-run`), Ctrl+R after each change; human judges feel/art/audio.
6. Commit with LF; art in its own commits.

## Tooling landscape (status as of late 2026)

| Tool | Verdict |
|---|---|
| **shrinko8** (thisismypassport) | Active, supports 0.2.7 (v1.2.7d verified). Lint, count, minify, convert p8/png/rom/lua/js, gfx merge, `.bin` export via `--pico8-dat`. Parses full dialect, follows `#include`. **Use it** — but it is more lenient than PICO-8's parser (gotchas 21-22). |
| **lupaz8** (`pip install lupaz8`) | z8lua (PICO-8 dialect + fixed point) in Python; good for logic unit tests outside PICO-8 with a hand-written API shim (sub/add/del/all/rnd/spr/btn… must be stubbed). |
| pico8-ls (VS Code `PollywogGames.pico8-ls`) | Active editor language server; no CLI. |
| pico-8-mcp (nutshot2000, Windows-first, Python/uv) | MCP server: validate, count, headless simulate w/ scripted inputs, window capture, set_sprite/set_sfx. Its SKILL.md "hard rules" are worth reading. smartfrog/pico8-mcp (Node) does lockstep stdin/stdout play, Linux-tested. |
| picotool (dansanderson) | **Avoid on 0.2.x** — misparses `?` and `f"x"`. |
| zepto8/z8tool, picolove, fake-08 | Emulators; experimental/outdated API — don't use for verification; real `pico8 -x` is better. |
| LuaLS + pico8-definitions | False errors on `?`, `\`, `if(c)`, `@` — editor hints only. |

## Troubleshooting

| Issue | Solution |
|---|---|
| `pip install shrinko8` → 404 | Package is `shrinko`. |
| `shrinko8: command not found` after `pip install --user` | Windows puts it in `%APPDATA%\Python\Python3XX\Scripts\`; use the full path or add it to PATH. Scripts that hardcode one Python version silently skip the check on another machine — glob it. |
| `shrinko8 --count` prints no count for a generated cart | The temp cart is in a different folder, so its `#include`s don't resolve (exit 4). Write it next to the real cart. |
| Lint: "Identifier 'x' not found" for a real global | It's first assigned outside `_init`; add `--lint: x` comment. |
| Lint: "only ever assigned to, never used" for something read via `_ENV[...]` | The linter can't see dynamic lookups; use a table. |
| Lint clean but PICO-8 says `syntax error` | A `?` print or one-line `if (...)` with more code after it on the line (gotchas 21-22). |
| No `printh` output when launched normally | GUI exe; capture **stderr** too (`2>&1 \| cat`) or `printh(s,"f.txt")` (lands in root_path). |
| Test runner sees only `RUNNING: ...` and no `INFO:` lines | You captured stdout only; `printh` goes to stderr on Windows. |
| `-x` never returns | Game loop running, **syntax error**, or cart **over 8192 tokens** (all hang). Use `extcmd("shutdown")` + `timeout`; check output for `syntax error`; count tokens first. |
| Edits not picked up | PICO-8 has unsaved changes → "DIDN'T RELOAD". Save/discard in PICO-8 or relaunch. |
| `X` and `x` treated differently / `PRINT` undefined | Uppercase = puny glyphs; lowercase everything. |
| Score goes negative | 16.16 overflow; use `>>16` integer storage. |
| Map bottom half corrupted | You drew in sprite banks 2-3 (shared memory). |
| HUD scrolls with world | Reset `camera()` before drawing HUD. |
| Holes inside converted sprites | Black mapped to colour 0 (transparent); use another key colour + `palt`. Or not a hole at all: a dark tint mapped to the background's colour — check the colour table. |
| Cart won't save as .p8.png | Compressed > 15360 B; check `shrinko8 --count`, export with `--minify`. |
| "future version" error | `-accept_future 1`. |
| Settings lost | config.txt written only on clean exit; killed process doesn't save. |

## Platform Notes (Windows)
- Git Bash: quote `"C:\Program Files (x86)\..."` (space + parens); `cygpath -m` gives `C:/...` paths PICO-8 accepts; `taskkill //F`, `cmd //c start "" ...`.
- Detach the playtest window with `cmd //c start` or PowerShell `Start-Process` (a backgrounded `&` may die with the shell).
- Backups accumulate in `%APPDATA%\pico-8\backup`.
- Exported binaries write `printh` files next to the exe.

## Asset sources
itch.io tag pages (`itch.io/game-assets/tag-pico-8`, `/free/tag-pico-8`, `/assets-cc0/free/tag-pico-8`), OpenGameArt "pico-8", Lexaloffle BBS carts (viewable source; default BBS licence CC4-BY-NC-SA → non-commercial). Learning: Lazy Devs (YouTube), NerdyTeachers, awesome-pico-8.

## References
- Manual: https://www.lexaloffle.com/dl/docs/pico-8_manual.html (local `pico-8_manual.txt` includes changelog)
- shrinko8: https://github.com/thisismypassport/shrinko8 · https://pypi.org/project/shrinko/
- lupaz8: https://github.com/thisismypassport/lupaz8
- pico-8-mcp: https://github.com/nutshot2000/pico-8-mcp · https://github.com/smartfrog/pico8-mcp
- Token tricks: https://github.com/seleb/PICO-8-Token-Optimizations
- .p8 format (archived wiki): https://web.archive.org/web/2024/https://pico-8.fandom.com/wiki/P8FileFormat
- Palette: https://nerdyteachers.com/PICO-8/Guide/Colors · hidden: https://nerdyteachers.com/PICO-8/Guide/HIDDEN_PALETTE
- Large numbers: https://lexaloffle.com/bbs/?pid=156546 · `_ENV`: https://www.lexaloffle.com/bbs/?tid=43912
- awesome-pico-8: https://github.com/pico-8/awesome-pico-8
- AI-dev experience: https://www.lexaloffle.com/bbs/?tid=153543 · https://lgallardo.com/2025/11/09/pico8-ai-game-development/

---

*Last updated: 2026-10-20*
*Setup verified on: Windows 10, PICO-8 v0.2.7, shrinko8 v1.2.7d, Git Bash (headless -x behaviour, stderr capture, rot90/sset, tonum(s,2) money, shrinko8 lint/count with #include all run locally; `?`/one-line-if parse gotchas and test-cart include exclusion verified 2026-10-20)*
