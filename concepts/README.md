# concepts/

Durable, **project-agnostic explanations** of a pattern or idea — the "why/how it
works" rather than the "how to install it."

- **Holds:** conceptual explanations that outlive any single tool version
  (e.g. "HNSW vs IVF", "SSE backpressure", "embed-on-write").
- **Does not hold:** setup/install steps (those are `guides/`), web-spanning
  comparisons (`articles/`), or short pointers (`references/`).
- **Boundary:** project-agnostic only — no business logic, project architecture,
  or team conventions. Project-specific knowledge belongs in that project's
  `CLAUDE.md`.

Each file is a single markdown doc with YAML frontmatter (`type: concept`).
See `templates/guide-template.md` for the frontmatter shape and
`.voltron/analyses/alexandria-vectordb-design.md` for the full content schema.
