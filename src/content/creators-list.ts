import type { Profile } from '../people/people.types.js';
import { listCountries } from '../people/countries.js';
import type { Story } from './content.types.js';

export type CreatorListItem = {
  username: string;
  displayName: string;
  avatarUrl: string;
  coverUrl: string;
  blurb: string;
  introVideoUrl: string;
  stories: number;
  countries: number;
  spots: number;
  itineraries: number;
  blogs: number;
};

export type CreatorsPage = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  items: CreatorListItem[];
};

type Ranked = CreatorListItem & { popular: number };

export function listCreatorsCatalog(
  input: {
    q?: string;
    country?: string;
    page?: string;
    limit?: string;
  },
  stories: Story[],
  profiles: Profile[],
  likeCounts: { key: string; likes: number }[] = [],
): CreatorsPage {
  const names = new Map(listCountries().map((item) => [item.code, item]));
  const needle = (input.q ?? '').trim().toLowerCase();
  const country = (input.country ?? '').trim().toUpperCase();
  const page = Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(input.limit ?? '8', 10) || 8));

  const storyLikes = new Map<string, number>();
  for (const entry of likeCounts) {
    if (!entry.key.startsWith('spot:') && !entry.key.startsWith('itinerary:')) continue;
    const slug = entry.key.split(':')[1];
    if (!slug) continue;
    storyLikes.set(slug, (storyLikes.get(slug) ?? 0) + entry.likes);
  }

  const byUsername = new Map<string, Ranked>();
  const seen = new Set<string>();

  for (const profile of profiles) {
    if (profile.role !== 'tcc' || profile.hidden || profile.disabled || profile.deletedAt) continue;
    if (!profile.username) continue;
    seen.add(profile.username);
    const owned = stories.filter((story) => story.creator.username === profile.username);
    const item = buildCreator(profile, owned, storyLikes, names);
    if (country && !creatorMatchesCountry(profile, owned, country, names)) continue;
    if (needle && !matchesName(needle, [profile.displayName, profile.username, profile.headline, profile.bio])) {
      continue;
    }
    byUsername.set(profile.username, item);
  }

  for (const story of stories) {
    const username = story.creator.username;
    if (!username || seen.has(username)) continue;
    seen.add(username);
    const owned = stories.filter((item) => item.creator.username === username);
    if (country && !creatorMatchesCountry(undefined, owned, country, names)) continue;
    if (needle && !matchesName(needle, [story.creator.displayName, username, story.creator.bio])) continue;
    byUsername.set(username, buildCreator(undefined, owned, storyLikes, names, story));
  }

  const ranked = [...byUsername.values()].sort(
    (left, right) =>
      right.stories - left.stories ||
      right.popular - left.popular ||
      left.displayName.localeCompare(right.displayName),
  );

  const start = (page - 1) * limit;
  const items = ranked.slice(start, start + limit).map(({ popular: _popular, ...item }) => item);
  return {
    page,
    limit,
    total: ranked.length,
    hasMore: start + limit < ranked.length,
    items,
  };
}

function buildCreator(
  profile: Profile | undefined,
  owned: Story[],
  storyLikes: Map<string, number>,
  names: Map<string, { name: string }>,
  fallbackStory?: Story,
): Ranked {
  const first = owned[0] ?? fallbackStory;
  const countries = new Set<string>();
  if (profile?.country) {
    const code = asCode(profile.country, names);
    if (code) countries.add(code);
  }
  for (const code of profile?.countriesTraveled ?? []) {
    const normalized = asCode(code, names);
    if (normalized) countries.add(normalized);
  }
  let spots = 0;
  let itineraries = 0;
  let blogs = 0;
  let popular = 0;
  for (const story of owned) {
    const code = asCode(story.destination.country, names);
    if (code) countries.add(code);
    spots += story.spots.filter((spot) => !spot.archived).length;
    itineraries += story.itineraries.filter((plan) => !plan.archived).length;
    blogs += (story.blogs ?? []).filter((blog) => !blog.archived).length;
    popular += storyLikes.get(story.slug) ?? 0;
  }

  return {
    username: profile?.username || first?.creator.username || '',
    displayName: profile?.displayName || first?.creator.displayName || '',
    avatarUrl: profile?.avatarUrl || first?.creator.avatarUrl || '',
    coverUrl: profile?.coverUrl || first?.coverUrl || '',
    blurb: (profile?.headline || profile?.bio || first?.creator.bio || '').trim(),
    introVideoUrl: profile?.introVideoUrl?.trim() || '',
    stories: owned.length,
    countries: countries.size,
    spots,
    itineraries,
    blogs,
    popular,
  };
}

function creatorMatchesCountry(
  profile: Profile | undefined,
  owned: Story[],
  country: string,
  names: Map<string, { name: string }>,
) {
  const codes = new Set<string>();
  if (profile?.country) {
    const code = asCode(profile.country, names);
    if (code) codes.add(code);
  }
  for (const code of profile?.countriesTraveled ?? []) {
    const normalized = asCode(code, names);
    if (normalized) codes.add(normalized);
  }
  for (const story of owned) {
    const code = asCode(story.destination.country, names);
    if (code) codes.add(code);
  }
  return codes.has(country);
}

function matchesName(needle: string, fields: string[]) {
  return fields.some((field) => {
    const value = field.trim().toLowerCase();
    return value === needle || value.startsWith(needle) || value.includes(needle);
  });
}

function asCode(stored: string, names: Map<string, { name: string }>) {
  const upper = stored.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const found = [...names.entries()].find(
    ([, item]) => item.name.toLowerCase() === stored.trim().toLowerCase(),
  );
  return found?.[0] ?? '';
}
