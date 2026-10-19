---
id: powershell-51-convertfrom-json-array-nesting
type: reference
title: "Windows PowerShell 5.1: @($raw | ConvertFrom-Json) nests JSON arrays"
summary: "In PS 5.1 ConvertFrom-Json emits a JSON array as one pipeline object, so wrapping the pipeline in @() creates an array inside an array; saving it back produces {\"value\": [...], \"Count\": n}."
tags:
  - powershell
  - windows
  - json
  - gotcha
status: verified
embedding_version: 1
---

# Windows PowerShell 5.1: `@($raw | ConvertFrom-Json)` nests JSON arrays

In Windows PowerShell 5.1 (not PowerShell 7+), `ConvertFrom-Json` writes a parsed JSON **array**
to the pipeline as a *single* object instead of enumerating it. So:

```powershell
@('["a","b"]' | ConvertFrom-Json).Count     # 1, not 2: an array inside an array
@(ConvertFrom-Json '["a","b"]').Count       # also 1
```

## Symptoms
- `.Count` on a parsed list is always 1.
- Append-then-save code (`@(existing) + $new | ConvertTo-Json`) turns the old list into
  `{"value": [...], "Count": n}`: 5.1's `ConvertTo-Json` serializes the nested array with its
  extended-type properties. Each later save nests it again.
- Code that writes a parsed list into another JSON file (for example, adding deny rules to a
  settings file) writes an object where strings were expected.

## Fix
Assign first, then wrap. `@()` on a variable that already holds an array doesn't nest:

```powershell
function ConvertFrom-JsonArray([string]$raw) {
  $parsed = ConvertFrom-Json -InputObject $raw
  return @($parsed)        # the caller's @(...) collects the elements flat
}
```

Native-command output (such as `gh ... --json`) arrives as `string[]`; join it with `Out-String`
before parsing.

## Testing
A test that only ever saves a one-item list won't catch this. Add a second item and check that the
saved file has no `"value"` key. Also note that 5.1's `Set-Content -Encoding UTF8` writes a BOM;
read such files with a BOM-tolerant decoder (`utf-8-sig` in Python).
