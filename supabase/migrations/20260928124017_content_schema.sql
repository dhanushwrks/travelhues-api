-- Travelhues content for the traveler app.
-- Story -> spots and itineraries, creator profiles and storefronts, glimpses,
-- and traveler likes and saves. The Nest API uses the secret key (service_role)
-- and is the only writer. The publishable key has no table access.

create table public.app_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null,
  tagline text not null,
  public_url text not null,
  maps_enabled boolean not null default true,
  enabled_countries text[] not null default '{TH}',
  cors_origins text[] not null default '{}',
  content_published boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.stories (
  slug text primary key,
  owner_id uuid,
  title text not null,
  summary text not null,
  cover_url text not null,
  destination_name text not null,
  destination_country text not null,
  destination_lat double precision not null,
  destination_lng double precision not null,
  creator_username text not null,
  creator_display_name text not null,
  creator_bio text not null,
  creator_avatar_url text not null
);

create index stories_creator_username_idx on public.stories (creator_username);

create table public.spots (
  story_slug text not null references public.stories (slug) on delete cascade,
  id text not null,
  type text not null check (type in ('stay', 'food', 'activity', 'sightseeing', 'shop')),
  title text not null,
  description text not null,
  images text[] not null default '{}',
  lat double precision not null,
  lng double precision not null,
  address text not null,
  avg_minutes integer not null check (avg_minutes >= 0),
  avg_cost_thb integer not null check (avg_cost_thb >= 0),
  tags text[] not null default '{}',
  position integer not null,
  primary key (story_slug, id)
);

create table public.itineraries (
  story_slug text not null references public.stories (slug) on delete cascade,
  slug text not null,
  title text not null,
  summary text not null,
  cover_url text not null,
  position integer not null,
  primary key (story_slug, slug)
);

create table public.itinerary_days (
  id bigint generated always as identity primary key,
  story_slug text not null,
  itinerary_slug text not null,
  position integer not null,
  title text not null,
  unique (story_slug, itinerary_slug, position),
  foreign key (story_slug, itinerary_slug)
    references public.itineraries (story_slug, slug) on delete cascade
);

create index itinerary_days_itinerary_idx
  on public.itinerary_days (story_slug, itinerary_slug);

create table public.itinerary_blocks (
  id bigint generated always as identity primary key,
  day_id bigint not null references public.itinerary_days (id) on delete cascade,
  story_slug text not null,
  position integer not null,
  kind text not null check (kind in ('note', 'spot')),
  body text not null,
  spot_id text,
  unique (day_id, position),
  foreign key (story_slug, spot_id) references public.spots (story_slug, id),
  check (
    (kind = 'note' and spot_id is null)
    or (kind = 'spot' and spot_id is not null)
  )
);

create index itinerary_blocks_day_id_idx on public.itinerary_blocks (day_id);
create index itinerary_blocks_spot_idx on public.itinerary_blocks (story_slug, spot_id);

create or replace function public.save_content(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  settings jsonb := payload -> 'settings';
  story record;
  spot record;
  itin record;
  day record;
  block record;
  inserted_day_id bigint;
  spot_pos integer;
  itin_pos integer;
  day_pos integer;
  block_pos integer;
begin
  insert into public.app_settings (
    id, name, tagline, public_url, maps_enabled, enabled_countries, cors_origins, content_published, updated_at
  )
  values (
    1,
    settings -> 'app' ->> 'name',
    settings -> 'app' ->> 'tagline',
    settings -> 'app' ->> 'publicUrl',
    (settings -> 'app' ->> 'mapsEnabled')::boolean,
    case
      when settings -> 'app' -> 'enabledCountries' is null then '{TH}'::text[]
      else coalesce(
        (
          select array_agg(code)
          from jsonb_array_elements_text(settings -> 'app' -> 'enabledCountries') as code
        ),
        '{}'::text[]
      )
    end,
    coalesce(
      (
        select array_agg(origin)
        from jsonb_array_elements_text(settings -> 'api' -> 'corsOrigins') as origin
      ),
      '{}'::text[]
    ),
    (settings -> 'api' ->> 'contentPublished')::boolean,
    now()
  )
  on conflict (id) do update
  set
    name = excluded.name,
    tagline = excluded.tagline,
    public_url = excluded.public_url,
    maps_enabled = excluded.maps_enabled,
    enabled_countries = excluded.enabled_countries,
    cors_origins = excluded.cors_origins,
    content_published = excluded.content_published,
    updated_at = now();

  delete from public.stories
  where slug not in (
    select item ->> 'slug'
    from jsonb_array_elements(coalesce(payload -> 'stories', '[]'::jsonb)) as item
  );

  for story in
    select value
    from jsonb_array_elements(coalesce(payload -> 'stories', '[]'::jsonb)) as value
  loop
    insert into public.stories (
      slug, owner_id, title, summary, cover_url,
      destination_name, destination_country, destination_lat, destination_lng,
      creator_username, creator_display_name, creator_bio, creator_avatar_url
    )
    values (
      story.value ->> 'slug',
      nullif(story.value ->> 'ownerId', '')::uuid,
      story.value ->> 'title',
      story.value ->> 'summary',
      story.value ->> 'coverUrl',
      story.value -> 'destination' ->> 'name',
      story.value -> 'destination' ->> 'country',
      (story.value -> 'destination' ->> 'lat')::double precision,
      (story.value -> 'destination' ->> 'lng')::double precision,
      story.value -> 'creator' ->> 'username',
      story.value -> 'creator' ->> 'displayName',
      story.value -> 'creator' ->> 'bio',
      story.value -> 'creator' ->> 'avatarUrl'
    )
    on conflict (slug) do update
    set
      owner_id = excluded.owner_id,
      title = excluded.title,
      summary = excluded.summary,
      cover_url = excluded.cover_url,
      destination_name = excluded.destination_name,
      destination_country = excluded.destination_country,
      destination_lat = excluded.destination_lat,
      destination_lng = excluded.destination_lng,
      creator_username = excluded.creator_username,
      creator_display_name = excluded.creator_display_name,
      creator_bio = excluded.creator_bio,
      creator_avatar_url = excluded.creator_avatar_url;

    delete from public.itineraries where story_slug = story.value ->> 'slug';
    delete from public.spots where story_slug = story.value ->> 'slug';

    spot_pos := 0;
    for spot in
      select value
      from jsonb_array_elements(coalesce(story.value -> 'spots', '[]'::jsonb)) as value
    loop
      insert into public.spots (
        story_slug, id, type, title, description, images, lat, lng, address,
        avg_minutes, avg_cost_thb, tags, position
      )
      values (
        story.value ->> 'slug',
        spot.value ->> 'id',
        spot.value ->> 'type',
        spot.value ->> 'title',
        spot.value ->> 'description',
        coalesce(
          (
            select array_agg(image)
            from jsonb_array_elements_text(coalesce(spot.value -> 'images', '[]'::jsonb)) as image
          ),
          '{}'::text[]
        ),
        (spot.value ->> 'lat')::double precision,
        (spot.value ->> 'lng')::double precision,
        spot.value ->> 'address',
        round((spot.value ->> 'avgMinutes')::numeric)::integer,
        round((spot.value ->> 'avgCostThb')::numeric)::integer,
        coalesce(
          (
            select array_agg(tag)
            from jsonb_array_elements_text(coalesce(spot.value -> 'tags', '[]'::jsonb)) as tag
          ),
          '{}'::text[]
        ),
        spot_pos
      );
      spot_pos := spot_pos + 1;
    end loop;

    itin_pos := 0;
    for itin in
      select value
      from jsonb_array_elements(coalesce(story.value -> 'itineraries', '[]'::jsonb)) as value
    loop
      insert into public.itineraries (story_slug, slug, title, summary, cover_url, position)
      values (
        story.value ->> 'slug',
        itin.value ->> 'slug',
        itin.value ->> 'title',
        itin.value ->> 'summary',
        itin.value ->> 'coverUrl',
        itin_pos
      );

      day_pos := 0;
      for day in
        select value
        from jsonb_array_elements(coalesce(itin.value -> 'days', '[]'::jsonb)) as value
      loop
        insert into public.itinerary_days (story_slug, itinerary_slug, position, title)
        values (story.value ->> 'slug', itin.value ->> 'slug', day_pos, day.value ->> 'title')
        returning id into inserted_day_id;

        block_pos := 0;
        for block in
          select value
          from jsonb_array_elements(coalesce(day.value -> 'blocks', '[]'::jsonb)) as value
        loop
          insert into public.itinerary_blocks (
            day_id, story_slug, position, kind, body, spot_id
          )
          values (
            inserted_day_id,
            story.value ->> 'slug',
            block_pos,
            block.value ->> 'kind',
            block.value ->> 'body',
            case
              when block.value ->> 'kind' = 'spot' then block.value ->> 'spotId'
              else null
            end
          );
          block_pos := block_pos + 1;
        end loop;
        day_pos := day_pos + 1;
      end loop;
      itin_pos := itin_pos + 1;
    end loop;
  end loop;

  perform public.save_community(payload);
end;
$$;

revoke all on table public.app_settings from anon, authenticated;
revoke all on table public.stories from anon, authenticated;
revoke all on table public.spots from anon, authenticated;
revoke all on table public.itineraries from anon, authenticated;
revoke all on table public.itinerary_days from anon, authenticated;
revoke all on table public.itinerary_blocks from anon, authenticated;
revoke all on sequence public.itinerary_days_id_seq from anon, authenticated;
revoke all on sequence public.itinerary_blocks_id_seq from anon, authenticated;
revoke all on function public.save_content(jsonb) from public, anon, authenticated;
grant execute on function public.save_content(jsonb) to service_role;

alter table public.app_settings enable row level security;
alter table public.stories enable row level security;
alter table public.spots enable row level security;
alter table public.itineraries enable row level security;
alter table public.itinerary_days enable row level security;
alter table public.itinerary_blocks enable row level security;

create index stories_owner_id_idx on public.stories (owner_id);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('tcc', 'traveler')),
  email text not null default '',
  username text not null unique,
  display_name text not null,
  headline text not null default '',
  bio text not null default '',
  date_of_birth text not null default '',
  country text not null default '',
  hobbies text[] not null default '{}',
  countries_traveled text[] not null default '{}',
  socials jsonb not null default '[]',
  avatar_url text not null default '',
  cover_url text not null default '',
  hidden boolean not null default false
);

create index profiles_role_idx on public.profiles (role);

create table public.waitlist (
  id text primary key,
  status text not null check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  name text not null,
  country text not null,
  date_of_birth text not null default '',
  socials jsonb not null default '[]',
  handle text not null,
  bio text not null default '',
  hobbies text[] not null default '{}',
  countries_traveled text[] not null default '{}'
);

create table public.creator_invites (
  token text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  waitlist_id text references public.waitlist (id) on delete set null
);

create table public.glimpses (
  id text primary key,
  creator_id uuid not null references public.profiles (id) on delete cascade,
  username text not null,
  display_name text not null,
  avatar_url text not null default '',
  caption text not null,
  video_url text not null,
  poster_url text not null default '',
  country text not null,
  created_at timestamptz not null default now(),
  link_kind text check (link_kind in ('story', 'itinerary', 'spot')),
  link_story_slug text,
  link_itinerary_slug text,
  link_spot_id text,
  link_label text
);

create index glimpses_country_idx on public.glimpses (country);
create index glimpses_created_at_idx on public.glimpses (created_at desc);

create table public.glimpse_likes (
  glimpse_id text not null references public.glimpses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (glimpse_id, user_id)
);

create table public.glimpse_comments (
  id text primary key,
  glimpse_id text not null references public.glimpses (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  username text not null,
  display_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.content_marks (
  user_id uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('like', 'save')),
  kind text not null check (kind in ('itinerary', 'spot')),
  story_slug text not null,
  itinerary_slug text not null default '',
  spot_id text not null default '',
  primary key (user_id, action, kind, story_slug, itinerary_slug, spot_id)
);

create or replace function public.save_community(payload jsonb)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  person record;
  request record;
  invite record;
  glimpse record;
  like_row record;
  note record;
  mark record;
begin
  delete from public.profiles
  where id::text not in (
    select item ->> 'id'
    from jsonb_array_elements(coalesce(payload -> 'profiles', '[]'::jsonb)) as item
    where coalesce(item ->> 'id', '') <> ''
  );

  for person in
    select value
    from jsonb_array_elements(coalesce(payload -> 'profiles', '[]'::jsonb)) as value
  loop
    if coalesce(person.value ->> 'id', '') = '' then
      continue;
    end if;
    insert into public.profiles (
      id, role, email, username, display_name, headline, bio, date_of_birth, country,
      hobbies, countries_traveled, socials, avatar_url, cover_url, hidden
    )
    values (
      (person.value ->> 'id')::uuid,
      person.value ->> 'role',
      coalesce(person.value ->> 'email', ''),
      person.value ->> 'username',
      person.value ->> 'displayName',
      coalesce(person.value ->> 'headline', ''),
      coalesce(person.value ->> 'bio', ''),
      coalesce(person.value ->> 'dateOfBirth', ''),
      coalesce(person.value ->> 'country', ''),
      coalesce(
        (select array_agg(hobby) from jsonb_array_elements_text(coalesce(person.value -> 'hobbies', '[]'::jsonb)) as hobby),
        '{}'::text[]
      ),
      coalesce(
        (select array_agg(code) from jsonb_array_elements_text(coalesce(person.value -> 'countriesTraveled', '[]'::jsonb)) as code),
        '{}'::text[]
      ),
      coalesce(person.value -> 'socials', '[]'::jsonb),
      coalesce(person.value ->> 'avatarUrl', ''),
      coalesce(person.value ->> 'coverUrl', ''),
      coalesce((person.value ->> 'hidden')::boolean, false)
    )
    on conflict (id) do update
    set
      role = excluded.role,
      email = excluded.email,
      username = excluded.username,
      display_name = excluded.display_name,
      headline = excluded.headline,
      bio = excluded.bio,
      date_of_birth = excluded.date_of_birth,
      country = excluded.country,
      hobbies = excluded.hobbies,
      countries_traveled = excluded.countries_traveled,
      socials = excluded.socials,
      avatar_url = excluded.avatar_url,
      cover_url = excluded.cover_url,
      hidden = excluded.hidden;
  end loop;

  delete from public.waitlist
  where id not in (
    select item ->> 'id'
    from jsonb_array_elements(coalesce(payload -> 'waitlist', '[]'::jsonb)) as item
  );

  for request in
    select value
    from jsonb_array_elements(coalesce(payload -> 'waitlist', '[]'::jsonb)) as value
  loop
    insert into public.waitlist (
      id, status, created_at, name, country, date_of_birth, socials, handle, bio, hobbies, countries_traveled
    )
    values (
      request.value ->> 'id',
      request.value ->> 'status',
      coalesce((request.value ->> 'createdAt')::timestamptz, now()),
      request.value ->> 'name',
      request.value ->> 'country',
      coalesce(request.value ->> 'dateOfBirth', ''),
      coalesce(request.value -> 'socials', '[]'::jsonb),
      request.value ->> 'handle',
      coalesce(request.value ->> 'bio', ''),
      coalesce(
        (select array_agg(hobby) from jsonb_array_elements_text(coalesce(request.value -> 'hobbies', '[]'::jsonb)) as hobby),
        '{}'::text[]
      ),
      coalesce(
        (select array_agg(code) from jsonb_array_elements_text(coalesce(request.value -> 'countriesTraveled', '[]'::jsonb)) as code),
        '{}'::text[]
      )
    )
    on conflict (id) do update
    set
      status = excluded.status,
      name = excluded.name,
      country = excluded.country,
      date_of_birth = excluded.date_of_birth,
      socials = excluded.socials,
      handle = excluded.handle,
      bio = excluded.bio,
      hobbies = excluded.hobbies,
      countries_traveled = excluded.countries_traveled;
  end loop;

  delete from public.creator_invites
  where token not in (
    select item ->> 'token'
    from jsonb_array_elements(coalesce(payload -> 'invites', '[]'::jsonb)) as item
  );

  for invite in
    select value
    from jsonb_array_elements(coalesce(payload -> 'invites', '[]'::jsonb)) as value
  loop
    insert into public.creator_invites (token, created_at, expires_at, used_at, waitlist_id)
    values (
      invite.value ->> 'token',
      coalesce((invite.value ->> 'createdAt')::timestamptz, now()),
      (invite.value ->> 'expiresAt')::timestamptz,
      nullif(invite.value ->> 'usedAt', '')::timestamptz,
      nullif(invite.value ->> 'waitlistId', '')
    )
    on conflict (token) do update
    set
      expires_at = excluded.expires_at,
      used_at = excluded.used_at,
      waitlist_id = excluded.waitlist_id;
  end loop;

  delete from public.glimpses
  where id not in (
    select item ->> 'id'
    from jsonb_array_elements(coalesce(payload -> 'glimpses', '[]'::jsonb)) as item
  );

  for glimpse in
    select value
    from jsonb_array_elements(coalesce(payload -> 'glimpses', '[]'::jsonb)) as value
  loop
    insert into public.glimpses (
      id, creator_id, username, display_name, avatar_url, caption, video_url, poster_url, country, created_at,
      link_kind, link_story_slug, link_itinerary_slug, link_spot_id, link_label
    )
    values (
      glimpse.value ->> 'id',
      (glimpse.value ->> 'creatorId')::uuid,
      glimpse.value ->> 'username',
      glimpse.value ->> 'displayName',
      coalesce(glimpse.value ->> 'avatarUrl', ''),
      glimpse.value ->> 'caption',
      glimpse.value ->> 'videoUrl',
      coalesce(glimpse.value ->> 'posterUrl', ''),
      glimpse.value ->> 'country',
      coalesce((glimpse.value ->> 'createdAt')::timestamptz, now()),
      glimpse.value -> 'link' ->> 'kind',
      glimpse.value -> 'link' ->> 'storySlug',
      nullif(glimpse.value -> 'link' ->> 'itinerarySlug', ''),
      nullif(glimpse.value -> 'link' ->> 'spotId', ''),
      glimpse.value -> 'link' ->> 'label'
    )
    on conflict (id) do update
    set
      username = excluded.username,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      caption = excluded.caption,
      video_url = excluded.video_url,
      poster_url = excluded.poster_url,
      country = excluded.country,
      link_kind = excluded.link_kind,
      link_story_slug = excluded.link_story_slug,
      link_itinerary_slug = excluded.link_itinerary_slug,
      link_spot_id = excluded.link_spot_id,
      link_label = excluded.link_label;
  end loop;

  delete from public.glimpse_likes;
  for like_row in
    select value
    from jsonb_array_elements(coalesce(payload -> 'glimpseLikes', '[]'::jsonb)) as value
  loop
    insert into public.glimpse_likes (glimpse_id, user_id)
    select like_row.value ->> 'glimpseId', (like_row.value ->> 'userId')::uuid
    where exists (select 1 from public.glimpses where id = like_row.value ->> 'glimpseId')
      and exists (select 1 from public.profiles where id = (like_row.value ->> 'userId')::uuid)
    on conflict do nothing;
  end loop;

  delete from public.glimpse_comments;
  for note in
    select value
    from jsonb_array_elements(coalesce(payload -> 'glimpseComments', '[]'::jsonb)) as value
  loop
    insert into public.glimpse_comments (id, glimpse_id, user_id, username, display_name, body, created_at)
    select
      note.value ->> 'id',
      note.value ->> 'glimpseId',
      (note.value ->> 'userId')::uuid,
      note.value ->> 'username',
      note.value ->> 'displayName',
      note.value ->> 'body',
      coalesce((note.value ->> 'createdAt')::timestamptz, now())
    where exists (select 1 from public.glimpses where id = note.value ->> 'glimpseId')
      and exists (select 1 from public.profiles where id = (note.value ->> 'userId')::uuid);
  end loop;

  delete from public.content_marks;
  for mark in
    select value
    from jsonb_array_elements(coalesce(payload -> 'contentMarks', '[]'::jsonb)) as value
  loop
    insert into public.content_marks (user_id, action, kind, story_slug, itinerary_slug, spot_id)
    select
      (mark.value ->> 'userId')::uuid,
      mark.value ->> 'action',
      mark.value ->> 'kind',
      mark.value ->> 'storySlug',
      coalesce(mark.value ->> 'itinerarySlug', ''),
      coalesce(mark.value ->> 'spotId', '')
    where exists (select 1 from public.profiles where id = (mark.value ->> 'userId')::uuid);
  end loop;
end;
$$;

revoke all on function public.save_community(jsonb) from public, anon, authenticated;
grant execute on function public.save_community(jsonb) to service_role;

alter table public.profiles enable row level security;
alter table public.waitlist enable row level security;
alter table public.creator_invites enable row level security;
alter table public.glimpses enable row level security;
alter table public.glimpse_likes enable row level security;
alter table public.glimpse_comments enable row level security;
alter table public.content_marks enable row level security;

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.waitlist from anon, authenticated;
revoke all on table public.creator_invites from anon, authenticated;
revoke all on table public.glimpses from anon, authenticated;
revoke all on table public.glimpse_likes from anon, authenticated;
revoke all on table public.glimpse_comments from anon, authenticated;
revoke all on table public.content_marks from anon, authenticated;

create schema if not exists private;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', 'user-' || left(new.id::text, 8)),
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      'Traveler'
    ),
    case
      when new.raw_app_meta_data ->> 'role' = 'tcc' then 'tcc'
      else 'traveler'
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function private.handle_new_user();
