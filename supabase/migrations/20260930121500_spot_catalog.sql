-- Spot categories and kinds are chosen in admin. Existing spots keep their type slug.

create table public.spot_categories (
  slug text primary key,
  label text not null,
  position integer not null
);

create table public.spot_kinds (
  category_slug text not null references public.spot_categories (slug) on delete restrict,
  label text not null,
  position integer not null,
  primary key (category_slug, label)
);

insert into public.spot_categories (slug, label, position) values
  ('stay', 'Stay', 0),
  ('food', 'Food', 1),
  ('activity', 'Activity', 2),
  ('sightseeing', 'Sightseeing', 3),
  ('shop', 'Shop', 4);

insert into public.spot_kinds (category_slug, label, position) values
  ('stay', 'Hotel', 0),
  ('stay', 'Guesthouse', 1),
  ('stay', 'Homestay', 2),
  ('food', 'Restaurant', 0),
  ('food', 'Cafe', 1),
  ('food', 'Street food', 2),
  ('activity', 'Trek', 0),
  ('activity', 'Class', 1),
  ('activity', 'Boat', 2),
  ('activity', 'Walk', 3),
  ('sightseeing', 'Temple', 0),
  ('sightseeing', 'Viewpoint', 1),
  ('sightseeing', 'Neighborhood', 2),
  ('shop', 'Market', 0),
  ('shop', 'Boutique', 1);

alter table public.spots drop constraint spots_type_check;

alter table public.spots
  add constraint spots_type_category_fkey
  foreign key (type) references public.spot_categories (slug);

alter table public.spot_categories enable row level security;
alter table public.spot_kinds enable row level security;

revoke all on table public.spot_categories from anon, authenticated;
revoke all on table public.spot_kinds from anon, authenticated;
