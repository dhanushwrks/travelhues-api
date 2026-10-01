-- Persist itinerary reservation suggestions as JSON on the itinerary row.

alter table public.itineraries
  add column if not exists reservations jsonb not null default '[]'::jsonb;
