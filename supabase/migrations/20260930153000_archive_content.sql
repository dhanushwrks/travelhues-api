alter table public.spots add column if not exists archived boolean not null default false;
alter table public.itineraries add column if not exists archived boolean not null default false;
alter table public.story_blogs add column if not exists archived boolean not null default false;

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
  blog record;
  itin record;
  day record;
  block record;
  inserted_day_id bigint;
  spot_pos integer;
  blog_pos integer;
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
        avg_minutes, avg_cost_thb, tags, archived, position
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
        coalesce((spot.value ->> 'archived')::boolean, false),
        spot_pos
      );
      spot_pos := spot_pos + 1;
    end loop;

    delete from public.story_blogs where story_slug = story.value ->> 'slug';
    blog_pos := 0;
    for blog in
      select value
      from jsonb_array_elements(coalesce(story.value -> 'blogs', '[]'::jsonb)) as value
    loop
      insert into public.story_blogs (story_slug, slug, title, body, cover_url, archived, position)
      values (
        story.value ->> 'slug',
        blog.value ->> 'slug',
        blog.value ->> 'title',
        blog.value ->> 'body',
        coalesce(blog.value ->> 'coverUrl', ''),
        coalesce((blog.value ->> 'archived')::boolean, false),
        blog_pos
      );
      blog_pos := blog_pos + 1;
    end loop;

    itin_pos := 0;
    for itin in
      select value
      from jsonb_array_elements(coalesce(story.value -> 'itineraries', '[]'::jsonb)) as value
    loop
      insert into public.itineraries (story_slug, slug, title, summary, cover_url, archived, position)
      values (
        story.value ->> 'slug',
        itin.value ->> 'slug',
        itin.value ->> 'title',
        itin.value ->> 'summary',
        itin.value ->> 'coverUrl',
        coalesce((itin.value ->> 'archived')::boolean, false),
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
