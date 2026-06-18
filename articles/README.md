# articles/

Longer-form **synthesis, comparison, or how-to** that spans multiple tools.

- **Holds:** cross-tool write-ups that weigh options or walk an end-to-end
  workflow (e.g. "Choosing an embedded vector store").
- **Does not hold:** single-tool setup (`guides/`), a single conceptual
  explanation (`concepts/`), or short canonical pointers (`references/`).
- **Boundary:** project-agnostic only — no business logic, project architecture,
  or team conventions. Project-specific knowledge belongs in that project's
  `CLAUDE.md`.

Each file is a single markdown doc with YAML frontmatter (`type: article`).
See `templates/guide-template.md` for the frontmatter shape and
`.voltron/analyses/alexandria-vectordb-design.md` for the full content schema.
