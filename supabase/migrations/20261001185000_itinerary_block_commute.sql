-- Store inter-stop commute details on itinerary blocks.

alter table public.itinerary_blocks
  add column if not exists commute jsonb;
