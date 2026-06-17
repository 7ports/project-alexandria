# references/

Short, **canonical pointers**: command cheatsheets, links, and version-compat
tables you look up rather than read through.

- **Holds:** quick-lookup material (e.g. "git rebase-onto cheatsheet",
  API base URLs, version-compatibility tables).
- **Does not hold:** full setup guides (`guides/`), conceptual explanations
  (`concepts/`), or long-form comparisons (`articles/`).
- **Boundary:** project-agnostic only — no business logic, project architecture,
  or team conventions. Project-specific knowledge belongs in that project's
  `CLAUDE.md`.

Each file is a single markdown doc with YAML frontmatter (`type: reference`).
See `templates/guide-template.md` for the frontmatter shape and
`.voltron/analyses/alexandria-vectordb-design.md` for the full content schema.
