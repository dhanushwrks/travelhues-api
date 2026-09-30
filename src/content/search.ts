import type { Profile } from '../people/people.types.js';
import { listCountries } from '../people/countries.js';
import type { Story } from './content.types.js';

export type SearchKind = 'all' | 'country' | 'story' | 'place' | 'creator' | 'itinerary';
export type SearchSort = 'relevance' | 'name' | 'popular' | 'recent';

export type SearchHit = {
  kind: Exclude<SearchKind, 'all'>;
  title: string;
  subtitle: string;
  imageUrl: string;
  country: string;
  spotType: string;
  code: string;
  storySlug: string;
  spotId: string;
  itinerarySlug: string;
  username: string;
  creatorName: string;
};

export type SearchPage = {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  items: SearchHit[];
};

type Ranked = SearchHit & { score: number; popular: number; recent: number };

const kinds = new Set<SearchKind>(['all', 'country', 'story', 'place', 'creator', 'itinerary']);
const sorts = new Set<SearchSort>(['relevance', 'name', 'popular', 'recent']);

export function searchCatalog(
  input: {
    q?: string;
    kind?: string;
    country?: string;
    spot?: string;
    sort?: string;
    page?: string;
    limit?: string;
  },
  stories: Story[],
  profiles: Profile[],
  enabledCountries: string[],
  likeCounts: { key: string; likes: number }[] = [],
): SearchPage {
  const needle = (input.q ?? '').trim().toLowerCase();
  const kind = kinds.has(input.kind as SearchKind) ? (input.kind as SearchKind) : 'all';
  const sort = sorts.has(input.sort as SearchSort) ? (input.sort as SearchSort) : 'relevance';
  const country = (input.country ?? '').trim().toUpperCase();
  const spotTypes = new Set(
    (input.spot ?? '')
      .toLowerCase()
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .flatMap((item) => (item === 'experience' || item === 'experiences' ? ['activity', 'sightseeing'] : [item])),
  );
  const page = Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1);
  const limit = Math.min(24, Math.max(1, Number.parseInt(input.limit ?? '8', 10) || 8));
  const names = new Map(listCountries().map((item) => [item.code, item]));
  const likes = new Map(likeCounts.map((item) => [item.key, item.likes]));
  const storyOrder = new Map(stories.map((story, index) => [story.slug, index]));
  const storyLikes = new Map(
    stories.map((story) => {
      let total = 0;
      for (const [key, count] of likes) {
        if (key.startsWith(`spot:${story.slug}:`) || key.startsWith(`itinerary:${story.slug}:`)) total += count;
      }
      return [story.slug, total] as const;
    }),
  );

  const hits: Ranked[] = [];

  const storyCount = new Map<string, number>();
  for (const story of stories) {
    const username = story.creator.username;
    if (username) storyCount.set(username, (storyCount.get(username) ?? 0) + 1);
  }

  if (kind === 'all' || kind === 'story') {
    for (const story of stories) {
      const code = asCode(story.destination.country, names);
      if (!matchesCountry(story.destination.country, country, names)) continue;
      const score = rank(needle, [
        story.title,
        story.summary,
        story.destination.name,
        countryLabel(code, names),
        story.creator.displayName,
      ]);
      if (needle && score === 0) continue;
      hits.push({
        kind: 'story',
        title: story.title,
        subtitle: `${countryLabel(code, names)} · ${story.creator.displayName}`,
        imageUrl: story.coverUrl,
        country: code,
        spotType: '',
        code: '',
        storySlug: story.slug,
        spotId: '',
        username: story.creator.username,
        creatorName: story.creator.displayName,
        itinerarySlug: '',
        score,
        popular: storyLikes.get(story.slug) ?? 0,
        recent: storyOrder.get(story.slug) ?? 0,
      });
    }
  }

  if (kind === 'all' || kind === 'place') {
    for (const story of stories) {
      const code = asCode(story.destination.country, names);
      if (!matchesCountry(story.destination.country, country, names)) continue;
      story.spots.forEach((place, index) => {
        if (place.deletedAt) return;
        if (spotTypes.size > 0 && !spotTypes.has(place.type)) return;
        const score = rank(needle, [place.title, place.address, place.description, ...place.tags, story.title]);
        if (needle && score === 0) return;
        hits.push({
          kind: 'place',
          title: place.title,
          subtitle: place.address || story.title,
          imageUrl: place.images[0] ?? '',
          country: code,
          spotType: place.type,
          code: '',
          storySlug: story.slug,
          spotId: place.id,
          itinerarySlug: '',
          username: story.creator.username,
          creatorName: story.creator.displayName,
          score,
          popular: likes.get(`spot:${story.slug}:${place.id}`) ?? 0,
          recent: (storyOrder.get(story.slug) ?? 0) * 1000 + index,
        });
      });
    }
  }

  if (kind === 'all' || kind === 'itinerary') {
    for (const story of stories) {
      const code = asCode(story.destination.country, names);
      if (!matchesCountry(story.destination.country, country, names)) continue;
      story.itineraries.forEach((plan, index) => {
        if (plan.deletedAt) return;
        const score = rank(needle, [plan.title, plan.summary, story.title, story.destination.name, countryLabel(code, names)]);
        if (needle && score === 0) return;
        hits.push({
          kind: 'itinerary',
          title: plan.title,
          subtitle: `${story.title} · ${plan.days.length} ${plan.days.length === 1 ? 'day' : 'days'}`,
          imageUrl: plan.coverUrl || story.coverUrl,
          country: code,
          spotType: '',
          code: '',
          storySlug: story.slug,
          spotId: '',
          itinerarySlug: plan.slug,
          username: story.creator.username,
          creatorName: story.creator.displayName,
          score,
          popular: likes.get(`itinerary:${story.slug}:${plan.slug}`) ?? 0,
          recent: (storyOrder.get(story.slug) ?? 0) * 1000 + index,
        });
      });
    }
  }

  if (kind === 'all' || kind === 'creator') {
    const seen = new Set<string>();
    for (const profile of profiles) {
      if (profile.role !== 'tcc' || profile.hidden || profile.disabled || profile.deletedAt) continue;
      if (!profile.username) continue;
      seen.add(profile.username);
      const storiesHere = stories.filter((story) => story.creator.username === profile.username);
      const codes = new Set(
        [profile.country, ...profile.countriesTraveled, ...storiesHere.map((story) => story.destination.country)]
          .map((item) => asCode(item, names))
          .filter((item) => /^[A-Z]{2}$/.test(item)),
      );
      if (country && !codes.has(country)) continue;
      const score = rank(needle, [profile.displayName, profile.username, profile.headline, profile.bio]);
      if (needle && score === 0) continue;
      hits.push(
        creatorHit(
          profile.username,
          profile.displayName,
          profile.headline || profile.bio,
          profile.avatarUrl,
          storyCount.get(profile.username) ?? 0,
          score,
          creatorRank(profile.username, stories, storyLikes, storyOrder),
        ),
      );
    }
    for (const story of stories) {
      const username = story.creator.username;
      if (!username || seen.has(username)) continue;
      seen.add(username);
      if (!matchesCountry(story.destination.country, country, names)) continue;
      const score = rank(needle, [story.creator.displayName, username, story.creator.bio]);
      if (needle && score === 0) continue;
      const count = storyCount.get(username) ?? 1;
      hits.push(
        creatorHit(username, story.creator.displayName, story.creator.bio, story.creator.avatarUrl, count, score, creatorRank(username, stories, storyLikes, storyOrder)),
      );
    }
  }

  hits.sort((left, right) => compare(left, right, sort));
  const start = (page - 1) * limit;
  const items = hits.slice(start, start + limit).map(({ score: _score, popular: _popular, recent: _recent, ...item }) => item);
  return {
    page,
    limit,
    total: hits.length,
    hasMore: start + limit < hits.length,
    items,
  };
}

function creatorHit(
  username: string,
  displayName: string,
  blurb: string,
  avatarUrl: string,
  stories: number,
  score: number,
  rank: { popular: number; recent: number },
): Ranked {
  return {
    kind: 'creator',
    title: displayName || username,
    subtitle: blurb || `${stories} ${stories === 1 ? 'story' : 'stories'}`,
    imageUrl: avatarUrl,
    country: '',
    spotType: '',
    code: '',
    storySlug: '',
    spotId: '',
    itinerarySlug: '',
    username,
    creatorName: displayName,
    score,
    popular: rank.popular,
    recent: rank.recent,
  };
}

function creatorRank(
  username: string,
  stories: Story[],
  storyLikes: Map<string, number>,
  storyOrder: Map<string, number>,
) {
  let popular = 0;
  let recent = 0;
  for (const story of stories) {
    if (story.creator.username !== username) continue;
    popular += storyLikes.get(story.slug) ?? 0;
    recent = Math.max(recent, storyOrder.get(story.slug) ?? 0);
  }
  return { popular, recent };
}

function rank(needle: string, fields: string[]) {
  if (!needle) return 1;
  let best = 0;
  for (const field of fields) {
    const value = field.trim().toLowerCase();
    if (!value) continue;
    if (value === needle) best = Math.max(best, 100);
    else if (value.startsWith(needle)) best = Math.max(best, 80);
    else if (value.includes(needle)) best = Math.max(best, 40);
  }
  return best;
}

function matchesCountry(stored: string, selected: string, names: Map<string, { name: string }>) {
  if (!selected) return true;
  return asCode(stored, names) === selected;
}

function asCode(stored: string, names: Map<string, { name: string }>) {
  const upper = stored.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  const found = [...names.entries()].find(([, item]) => item.name.toLowerCase() === stored.trim().toLowerCase());
  return found?.[0] ?? "";
}

function countryLabel(code: string, names: Map<string, { name: string }>) {
  return names.get(code)?.name ?? code;
}

function compare(left: Ranked, right: Ranked, sort: SearchSort) {
  if (sort === 'name') return left.title.localeCompare(right.title) || right.score - left.score;
  if (sort === 'popular') return right.popular - left.popular || right.recent - left.recent || left.title.localeCompare(right.title);
  if (sort === 'recent') return right.recent - left.recent || right.score - left.score || left.title.localeCompare(right.title);
  return right.score - left.score || right.popular - left.popular || left.title.localeCompare(right.title);
}
