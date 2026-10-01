-- Persist optional day briefs on itinerary days.
alter table public.itinerary_days
  add column if not exists brief text not null default '';
