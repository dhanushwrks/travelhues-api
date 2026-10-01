-- Purchase-only flags + mock entitlement ledger.

alter table public.spots
  add column if not exists purchase_only boolean not null default false,
  add column if not exists price_inr integer not null default 99;

alter table public.itineraries
  add column if not exists purchase_only boolean not null default false,
  add column if not exists price_inr integer not null default 99;

alter table public.story_blogs
  add column if not exists purchase_only boolean not null default false,
  add column if not exists price_inr integer not null default 99;

create table if not exists public.content_purchases (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.profiles (id) on delete cascade,
  story_slug text not null,
  kind text not null check (kind in ('spot', 'itinerary', 'blog')),
  item_id text not null,
  price_inr integer not null check (price_inr >= 0),
  created_at timestamptz not null default now(),
  unique (buyer_id, story_slug, kind, item_id)
);

create index if not exists content_purchases_buyer_idx
  on public.content_purchases (buyer_id);

create index if not exists content_purchases_item_idx
  on public.content_purchases (story_slug, kind, item_id);

notify pgrst, 'reload schema';
