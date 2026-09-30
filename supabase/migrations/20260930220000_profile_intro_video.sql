alter table public.profiles
  add column if not exists intro_video_url text not null default '';
