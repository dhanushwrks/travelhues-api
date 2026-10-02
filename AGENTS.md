# travelhues-api agent notes

## Project dictionary (LLM Wiki)

TravelHues uses the [LLM Wiki](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f) pattern. **Before** exploring or implementing non-trivial work, read `wiki/index.md` and related pages (`.cursor/rules/llm-wiki.mdc`). **After** substantive changes, update `wiki/` per `wiki/SCHEMA.md`, `wiki/index.md`, and `wiki/log.md`; use the **llm-wiki** skill. Immutable inputs live in `raw/`.

When routes or Supabase schema change, update this repo's wiki first, then align `travelhues-app` / `travelhues-admin` concept pages.

## Run / deploy

See `README.md` for routes, env vars, and EC2 deploy scripts.
