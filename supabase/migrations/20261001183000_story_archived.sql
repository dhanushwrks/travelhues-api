-- Story-level archive, matching spots / itineraries / blogs.

alter table public.stories
  add column if not exists archived boolean not null default false;
