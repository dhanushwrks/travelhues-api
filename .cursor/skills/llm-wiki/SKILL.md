---
name: llm-wiki
description: >-
  Creates and updates the TravelHues LLM Wiki (markdown dictionary under wiki/).
  Use when ingesting raw sources, documenting domain context, answering
  cross-session questions, linting wiki health, or when the user mentions wiki,
  glossary, project dictionary, or Karpathy LLM Wiki.
---

# TravelHues LLM Wiki

Implements the [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern for **whichever TravelHues repo is open** (`travelhues-app`, `travelhues-api`, `travelhues-admin`).

Project rule **always applies**: `.cursor/rules/llm-wiki.mdc` (wiki-first exploration; wiki updates after substantive changes).

## Before you write

1. Read `wiki/SCHEMA.md` and `wiki/index.md` in the **current repo root**.
2. For cross-repo topics, read `wiki/ecosystem.md` and the sibling repo wiki only when needed (avoid duplicating long pages).
3. Never modify files under `raw/` except when the user explicitly adds new raw material (humans drop files; agents read).

## Create wiki (bootstrap)

If `wiki/index.md` is missing, copy the layout from an existing TravelHues repo: `wiki/SCHEMA.md`, `wiki/index.md`, `wiki/log.md`, `wiki/overview.md`, `wiki/ecosystem.md`, `raw/README.md`, `raw/references/llm-wiki-pattern.md`.

## Ingest workflow

```
- [ ] Confirm raw path (raw/ or seed/ in app)
- [ ] Read source fully
- [ ] Add wiki/sources/<slug>.md (summary + link to raw)
- [ ] Update concepts/modules/entity pages (touch all affected topics)
- [ ] Update wiki/index.md
- [ ] Append wiki/log.md: ## [YYYY-MM-DD] ingest | <title>
- [ ] If API contract changes: update travelhues-api wiki first, then app/admin
```

Prefer one source per ingest with user review unless they ask to batch.

## Update workflow

When code or behavior changes:

1. Identify owning repo (API vs app UI vs admin desk).
2. Edit the smallest set of wiki pages; add `decisions/` ADR if non-obvious.
3. Fix cross-links and `ecosystem.md` if ports, env vars, or routes changed.
4. Log: `## [date] update | <topic>`.

## Query workflow

1. `wiki/index.md` → relevant pages → `src/` as needed.
2. Cite paths in answers.
3. If the answer is reusable, add a wiki page and index row (do not leave knowledge only in chat).

## Lint workflow

On user request or after large changes:

- Contradictions between wiki pages or wiki vs code
- Stale route/module lists
- Orphan wiki pages (not in index, no inbound links)
- Missing glossary entries for terms used in new code
- `ecosystem.md` out of sync across the three repos

Report findings as a short checklist; fix when asked.

## Page quality

- One topic per file under `concepts/` or `modules/`.
- Relative links only.
- Optional YAML frontmatter per `wiki/SCHEMA.md`.
- Keep summaries in `index.md` to one line.

## Multi-repo paths

Sibling checkouts (typical):

- `travelhues-app`
- `travelhues-api`
- `travelhues-admin`

Only write wiki files inside the repo you are editing unless the user asks to sync a specific page to siblings (usually `ecosystem.md`).
