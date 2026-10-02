-- Wire homeAirport JSON field into save_community profile upserts.

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
      hobbies, countries_traveled, socials, avatar_url, cover_url, hidden, disabled, deleted_at,
      home_airport
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
      nullif(person.value ->> 'deletedAt', '')::timestamptz,
      nullif(upper(trim(coalesce(person.value ->> 'homeAirport', ''))), '')
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
      deleted_at = excluded.deleted_at,
      home_airport = excluded.home_airport;
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

notify pgrst, 'reload schema';
