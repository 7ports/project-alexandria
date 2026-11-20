# [The idea, stated as a claim — e.g. "Write-path durability must be loud"]

<!-- A concept explains WHY or HOW something works: a design pattern, a trade-off, a failure
shape, an architecture insight. It should outlive any one tool version. Record one when you
understood something, not only when you installed something (write-back trigger 6).

write_knowledge({ name: "<slug>", type: "concept", content: <this body>,
  metadata: { title, summary, tags } }) — frontmatter is composed for you.

Not a concept: install steps (guide), a single gotcha with its fix (reference), a long
multi-source write-up (article). Project-agnostic only: replace project, host, path and account
names with placeholders such as <your-project>, <path/to/repo>, <API_KEY>. -->

## The idea in one paragraph

What is true, and why it matters. Someone who reads only this paragraph should be able to
act on it.

## The failure shape (or: the situation where it applies)

The concrete symptom or decision point. What goes wrong when the idea is ignored, and why
that is easy to miss.

## Why it works this way

The mechanism. Cause and effect, not just the rule. A small diagram, a code sketch or a
worked example is welcome.

## The rule

What to do, stated so it can be checked:

- Do X.
- Never Y, because Z.

## When it does not apply

Edge cases, the trade-off you pay, and the cases where the opposite choice is right.

## Related

- Guides, references or other concepts this connects to (`read_knowledge("<slug>")`).
