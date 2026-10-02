# TravelHues ecosystem

Three repositories share product vocabulary and API contracts. Each repo has its own `wiki/`; keep this page aligned across repos when links or ports change.

| Repo | Role | Default local |
|------|------|----------------|
| `travelhues-app` | Consumer/creator Next.js PWA | `npm run dev` |
| `travelhues-api` | NestJS API + Supabase content | `npm run start:dev` → port **4000** |
| `travelhues-admin` | Story/settings admin desk | `npm run dev -- --port 3002` |

Typical checkout layout: sibling folders under the same parent directory.

## Integration

- App and admin call this API via `NEXT_PUBLIC_API_URL`.
- Admin routes require `Authorization: Bearer <ADMIN_TOKEN>`.
- Public routes: see [overview.md](overview.md) and repo `README.md`.
- Content schema: `supabase/migrations/`.

## Wiki workflow

1. Put immutable inputs in `raw/`.
2. Own API/module documentation here; link from app/admin wiki for UI-only behavior.
3. On route or schema changes, update this wiki before sibling repos.
