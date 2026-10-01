import type { Story } from './content.types.js';

export function quietAccounts(
  profiles: { id: string; username: string; disabled?: boolean; deletedAt?: string | null }[],
) {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const profile of profiles) {
    if (!profile.disabled && !profile.deletedAt) continue;
    ids.add(profile.id);
    if (profile.username) names.add(profile.username);
  }
  return { ids, names };
}

export function storyIsPublic(
  story: Story,
  quiet: { ids: Set<string>; names: Set<string> },
) {
  if (story.deletedAt) return false;
  if (story.archived) return false;
  if (story.ownerId && quiet.ids.has(story.ownerId)) return false;
  if (quiet.names.has(story.creator.username)) return false;
  return true;
}

export function personalAccounts(
  profiles: { id: string; username: string; role?: string }[],
) {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const profile of profiles) {
    if (profile.role !== 'traveler') continue;
    ids.add(profile.id);
    if (profile.username) names.add(profile.username);
  }
  return { ids, names };
}

export function isPersonalTrip(
  story: Story,
  personal: { ids: Set<string>; names: Set<string> },
) {
  if (story.ownerId && personal.ids.has(story.ownerId)) return true;
  return personal.names.has(story.creator.username);
}

export function publicStory(story: Story): Story {
  const spots = story.spots.filter((spot) => !spot.archived && !spot.deletedAt);
  const live = new Set(spots.map((spot) => spot.id));
  return {
    ...story,
    spots,
    blogs: (story.blogs ?? []).filter((blog) => !blog.archived && !blog.deletedAt),
    itineraries: story.itineraries
      .filter((item) => !item.archived && !item.deletedAt)
      .map((item) => ({
        ...item,
        days: item.days.map((day) => ({
          ...day,
          blocks: day.blocks.filter(
            (block) => block.kind !== 'spot' || live.has(block.spotId),
          ),
        })),
      })),
  };
}
