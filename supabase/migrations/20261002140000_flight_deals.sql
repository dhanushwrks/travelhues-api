-- Flight deals funnel: deals, events, home airport, purchase attribution.

create table if not exists public.flight_deals (
  id uuid primary key default gen_random_uuid(),
  origin_iata char(3) not null,
  destination_iata char(3) not null,
  destination_city text not null,
  destination_country char(2) not null,
  departure_date date not null,
  return_date date,
  price_inr integer not null check (price_inr >= 0),
  currency text not null default 'INR',
  affiliate_url text not null,
  affiliate_partner text not null default '',
  headline text not null default '',
  subtitle text not null default '',
  badge text not null default '',
  story_creator_username text not null default '',
  story_slug text not null default '',
  featured_itinerary_slug text not null default '',
  featured_spot_ids jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  valid_from timestamptz not null default now(),
  valid_until timestamptz not null,
  priority integer not null default 0,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flight_deals_origin_status_idx
  on public.flight_deals (origin_iata, status, valid_until);

create index if not exists flight_deals_story_idx
  on public.flight_deals (story_slug, status);

create unique index if not exists flight_deals_external_id_idx
  on public.flight_deals (external_id)
  where external_id is not null and external_id <> '';

create table if not exists public.flight_deal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.flight_deals (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  event_type text not null check (
    event_type in (
      'impression',
      'affiliate_click',
      'story_open',
      'itinerary_open',
      'spot_open',
      'purchase'
    )
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists flight_deal_events_deal_type_idx
  on public.flight_deal_events (deal_id, event_type, created_at);

alter table public.profiles
  add column if not exists home_airport char(3);

alter table public.content_purchases
  add column if not exists source_deal_id uuid references public.flight_deals (id) on delete set null;

notify pgrst, 'reload schema';
