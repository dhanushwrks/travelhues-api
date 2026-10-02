# travelhues-api overview

NestJS TypeScript API for TravelHues: stories, spots, itineraries, glimpses, creators, marks, purchases, and admin writes. Content lives in Supabase (see migrations); tests may use `STORE_PATH` JSON override.

## Run

```bash
npm install
npm run start:dev
```

Listens on **port 4000** on all interfaces. Copy `.env.example` → `.env` (`ADMIN_TOKEN`, Supabase keys).

## Modules

| Module | Path |
|--------|------|
| Content | `src/content/` |
| Admin | `src/admin/` |
| Glimpses | `src/glimpses/` |
| People / creators | `src/people/` |
| Auth | `src/auth/` |
| Marks, purchases | `src/marks/`, `src/purchases/` |

Route list: repo `README.md`.

## Deploy

`infra/ec2.yaml`, `scripts/deploy.sh`, PM2 via `ecosystem.config.cjs`.

## Related

- [ecosystem.md](ecosystem.md)
- [concepts/domain-glossary.md](concepts/domain-glossary.md)
- [SCHEMA.md](SCHEMA.md)
