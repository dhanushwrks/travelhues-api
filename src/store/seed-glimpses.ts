import type { Story } from '../content/content.types.js';
import type { Glimpse } from '../glimpses/glimpses.types.js';
import type { Profile } from '../people/people.types.js';

export const SEED_HUE_IDS = [
  'b2000001-0001-4000-8000-000000000001',
  'b2000001-0001-4000-8000-000000000002',
  'b2000001-0001-4000-8000-000000000003',
  'b2000001-0001-4000-8000-000000000004',
  'b2000001-0001-4000-8000-000000000005',
] as const;

const SAMPLE_VIDEOS = [
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
] as const;

const SAMPLE_POSTERS = [
  'https://images.unsplash.com/photo-1528181304800-259b08848526?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1508009601955-d7d7aa50cc20?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1552465011-bca4d1a0f2c5?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=720&q=80',
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=720&q=80',
] as const;

const CAPTIONS = [
  'First light at the river market',
  'Street food lane before the crowds',
  'Temple quiet hour',
  'Night market colors',
  'Slow ferry across the channel',
] as const;

function storyCountryCode(story: Story): string {
  const raw = story.destination.country.trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  if (raw.toLowerCase() === 'thailand') return 'TH';
  return raw.slice(0, 2).toUpperCase();
}

function resolveCreator(story: Story, profiles: Profile[]): Profile | undefined {
  if (story.ownerId) {
    const owned = profiles.find((item) => item.id === story.ownerId);
    if (owned) return owned;
  }
  const named = profiles.find((item) => item.username === story.creator.username);
  if (named) return named;
  return profiles.find((item) => item.role === 'tcc' && !item.disabled && !item.deletedAt);
}

function linkForStory(story: Story) {
  const itinerary = story.itineraries.find((item) => !item.archived && !item.deletedAt);
  if (itinerary) {
    return {
      kind: 'itinerary' as const,
      storySlug: story.slug,
      itinerarySlug: itinerary.slug,
      label: itinerary.title,
    };
  }
  return {
    kind: 'story' as const,
    storySlug: story.slug,
    label: story.title,
  };
}

export function seedGlimpses(stories: Story[], profiles: Profile[]): Glimpse[] {
  const open = stories
    .filter((item) => !item.archived && !item.deletedAt && item.itineraries.length > 0)
    .slice(0, SEED_HUE_IDS.length);
  if (!open.length) return [];

  const creator = resolveCreator(open[0], profiles);
  if (!creator) return [];

  const now = Date.now();

  return SEED_HUE_IDS.map((id, index) => {
    const story = open[index % open.length];
    const country = storyCountryCode(story);
    return {
      id,
      creatorId: creator.id,
      username: creator.username,
      displayName: creator.displayName || story.creator.displayName,
      avatarUrl: creator.avatarUrl || story.creator.avatarUrl,
      caption: CAPTIONS[index] ?? CAPTIONS[0],
      videoUrl: SAMPLE_VIDEOS[index] ?? SAMPLE_VIDEOS[0],
      posterUrl: SAMPLE_POSTERS[index] ?? SAMPLE_POSTERS[0],
      country,
      createdAt: new Date(now - index * 60_000).toISOString(),
      link: linkForStory(story),
    };
  });
}
