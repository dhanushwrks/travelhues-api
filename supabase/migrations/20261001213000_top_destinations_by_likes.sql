-- Speed up destination ranking by likes on spots and itineraries.

create index if not exists content_marks_likes_by_story_idx
  on public.content_marks (story_slug)
  where action = 'like';

create index if not exists stories_live_destination_country_idx
  on public.stories (destination_country)
  where deleted_at is null;

create index if not exists itineraries_live_by_story_idx
  on public.itineraries (story_slug)
  where archived = false;

create or replace function public.top_destination_slugs(
  p_country text default '',
  p_limit integer default 10
)
returns table (slug text, likes bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with story_likes as (
    select story_slug, count(*)::bigint as likes
    from public.content_marks
    where action = 'like'
    group by story_slug
  )
  select
    s.slug,
    coalesce(sl.likes, 0) as likes
  from public.stories s
  left join story_likes sl on sl.story_slug = s.slug
  where s.deleted_at is null
    and exists (
      select 1
      from public.itineraries i
      where i.story_slug = s.slug
        and i.archived = false
    )
    and (
      coalesce(trim(p_country), '') = ''
      or upper(s.destination_country) = upper(trim(p_country))
      or lower(s.destination_country) = lower(trim(p_country))
    )
  order by coalesce(sl.likes, 0) desc, s.slug asc
  limit greatest(1, least(coalesce(p_limit, 10), 50));
$$;

revoke all on function public.top_destination_slugs(text, integer) from public, anon, authenticated;
grant execute on function public.top_destination_slugs(text, integer) to service_role;
