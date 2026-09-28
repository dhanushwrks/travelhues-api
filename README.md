# travelhues-api

NestJS TypeScript API for Travelhues. It serves the same story, spot, and itinerary shape the mobile app reads.

## Run

```bash
npm install
npm run start:dev
```

The API listens on port 4000, on every network interface.

## Deploy

The box is one `t4g.micro` in `ap-south-1`, defined in `infra/ec2.yaml`. `scripts/ec2-bootstrap.sh` installs Node 22 and PM2. `scripts/deploy.sh` builds and reloads the process. Do not commit `.env`.

Copy `.env.example` to `.env` and set `ADMIN_TOKEN` plus the Supabase URL and keys before starting. Admin routes expect `Authorization: Bearer <token>`.

Content and settings live in Supabase. Apply `supabase/migrations/20260928124017_content_schema.sql` in the SQL editor before the first start. The first start seeds the Thailand story. A `STORE_PATH` override keeps tests on a local JSON file.

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
