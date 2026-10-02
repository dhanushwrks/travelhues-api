# Domain glossary (API)

HTTP-facing names and modules. UI copy may differ; **travelhues-app** `src/lib/types.ts` mirrors many shapes.

| Term | API / module |
|------|----------------|
| **Story** | `ContentModule`; `GET /stories`, `GET /stories/:slug` |
| **Itinerary** | Nested under story; `GET /stories/:slug/itineraries/:itinerarySlug` |
| **Spot** | Admin writes under `/admin/stories/:slug/spots` |
| **Glimpse** | `GlimpsesModule`; `GET /glimpses` |
| **Creator** | `PeopleModule`; `GET /creators/:username` |
| **Settings** | `GET /settings`, admin `GET|PUT /admin/settings` |
| **Admin token** | Bearer auth on `/admin/*` routes |

Expand with per-module pages under `wiki/modules/`.
