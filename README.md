# travelhues-api

NestJS TypeScript API for Travelhues. It serves the same story, spot, and itinerary shape the mobile app reads.

## Run

```bash
npm install
npm run start:dev
```

The API listens on port 4000.

Copy `.env.example` to `.env` and set `ADMIN_TOKEN` before starting. Admin routes expect `Authorization: Bearer <token>`.

Content and settings are stored in `data/store.json`. The first start seeds the Thailand story.

## Routes

- `GET /`
- `GET /settings`
- `GET /stories`
- `GET /stories/:slug`
- `GET /stories/:slug/itineraries/:itinerarySlug`
- `GET /creators/:username`
- `GET /admin/settings` and `PUT /admin/settings`
- `GET /admin/stories`, `POST /admin/stories`, `GET|PUT|DELETE /admin/stories/:slug`
- Spot and itinerary writes live under `/admin/stories/:slug/spots` and `/admin/stories/:slug/itineraries`
