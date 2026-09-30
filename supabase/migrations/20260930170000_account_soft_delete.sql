alter table public.profiles add column if not exists disabled boolean not null default false;
alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.stories add column if not exists deleted_at timestamptz;
alter table public.spots add column if not exists deleted_at timestamptz;
alter table public.itineraries add column if not exists deleted_at timestamptz;
alter table public.story_blogs add column if not exists deleted_at timestamptz;
alter table public.glimpses add column if not exists deleted_at timestamptz;

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
      creator_username, creator_display_name, creator_bio, creator_avatar_url, deleted_at
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
      story.value -> 'creator' ->> 'avatarUrl',
      nullif(story.value ->> 'deletedAt', '')::timestamptz
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
      creator_avatar_url = excluded.creator_avatar_url,
      deleted_at = excluded.deleted_at;

    delete from public.itineraries where story_slug = story.value ->> 'slug';
    delete from public.spots where story_slug = story.value ->> 'slug';

    spot_pos := 0;
    for spot in
      select value
      from jsonb_array_elements(coalesce(story.value -> 'spots', '[]'::jsonb)) as value
    loop
      insert into public.spots (
        story_slug, id, type, title, description, images, lat, lng, address,
        avg_minutes, avg_cost_thb, tags, archived, deleted_at, position
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
        nullif(spot.value ->> 'deletedAt', '')::timestamptz,
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
      insert into public.story_blogs (story_slug, slug, title, body, cover_url, archived, deleted_at, position)
      values (
        story.value ->> 'slug',
        blog.value ->> 'slug',
        blog.value ->> 'title',
        blog.value ->> 'body',
        coalesce(blog.value ->> 'coverUrl', ''),
        coalesce((blog.value ->> 'archived')::boolean, false),
        nullif(blog.value ->> 'deletedAt', '')::timestamptz,
        blog_pos
      );
      blog_pos := blog_pos + 1;
    end loop;

    itin_pos := 0;
    for itin in
      select value
      from jsonb_array_elements(coalesce(story.value -> 'itineraries', '[]'::jsonb)) as value
    loop
      insert into public.itineraries (story_slug, slug, title, summary, cover_url, archived, deleted_at, position)
      values (
        story.value ->> 'slug',
        itin.value ->> 'slug',
        itin.value ->> 'title',
        itin.value ->> 'summary',
        itin.value ->> 'coverUrl',
        coalesce((itin.value ->> 'archived')::boolean, false),
        nullif(itin.value ->> 'deletedAt', '')::timestamptz,
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
      hobbies, countries_traveled, socials, avatar_url, cover_url, hidden, disabled, deleted_at
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
      coalesce((person.value ->> 'hidden')::boolean, false),
      coalesce((person.value ->> 'disabled')::boolean, false),
      nullif(person.value ->> 'deletedAt', '')::timestamptz
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
      hidden = excluded.hidden,
      disabled = excluded.disabled,
      deleted_at = excluded.deleted_at;
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
      link_kind, link_story_slug, link_itinerary_slug, link_spot_id, link_label, deleted_at
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
      glimpse.value -> 'link' ->> 'label',
      nullif(glimpse.value ->> 'deletedAt', '')::timestamptz
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
      link_label = excluded.link_label,
      deleted_at = excluded.deleted_at;
  end loop;

  delete from public.glimpse_likes where true;
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

  delete from public.glimpse_comments where true;
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

  delete from public.content_marks where true;
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

