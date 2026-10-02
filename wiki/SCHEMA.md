# TravelHues LLM Wiki schema

Pattern source: [Karpathy LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) (copy in [`../raw/references/llm-wiki-pattern.md`](../raw/references/llm-wiki-pattern.md)).

## Repo scope

**travelhues-api** — NestJS API on port 4000: stories, spots, itineraries, glimpses, creators, admin writes, Supabase content store. Documents routes, modules, auth, deploy (`infra/`, PM2), migrations.

Sibling wikis: `travelhues-app` (consumer app), `travelhues-admin` (admin desk). See [ecosystem.md](ecosystem.md).

## Layers

| Layer | Path | Who writes |
|-------|------|------------|
| Raw sources | `raw/` | Humans (immutable for agents) |
| Wiki | `wiki/` | LLM maintains; humans review |
| Schema | `wiki/SCHEMA.md` | Humans + LLM co-evolve |
| Agent entry | `AGENTS.md` | Points agents at this wiki |

## Page types

- **overview.md** — What this repo is and how to run it.
- **ecosystem.md** — How the three repos connect (keep in sync across repos).
- **concepts/** — Glossary, domain models, conventions.
- **modules/** — Nest modules (`content`, `admin`, `glimpses`, etc.).
- **sources/** — One summary page per ingested raw file.
- **decisions/** — ADR-style notes.

Use relative links. Prefer stable slugs.

## Frontmatter (optional)

```yaml
---
title: Page title
tags: [api, content]
sources: [raw/example.md]
updated: 2026-10-02
---
```

## Operations

### Ingest

1. Add file under `raw/`.
2. Create or update `wiki/sources/<slug>.md`.
3. Update module/concept pages.
4. Update [index.md](index.md).
5. Append [log.md](log.md): `## [YYYY-MM-DD] ingest | <title>`.

### Query

Read `index.md` first; cite `wiki/...` or `src/...`. File durable answers back into the wiki.

### Lint

Check route lists vs `README.md` and controllers; cross-repo contract vs `travelhues-app` types; orphan pages; `ecosystem.md` sync.

## Index and log

- **index.md** — Catalog by category.
- **log.md** — Append-only timeline.

## Skill

Use `.cursor/skills/llm-wiki/SKILL.md`.
