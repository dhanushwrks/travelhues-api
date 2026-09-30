alter table public.app_settings
  add column if not exists instagram_url text not null default 'https://www.instagram.com/travelhues',
  add column if not exists linkedin_url text not null default 'https://www.linkedin.com/company/travelhues',
  add column if not exists youtube_url text not null default 'https://www.youtube.com/@travelhues',
  add column if not exists terms_url text not null default 'https://travelhues.com/terms',
  add column if not exists policies_url text not null default 'https://travelhues.com/policies';
