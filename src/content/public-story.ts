import type { Story } from './content.types.js';

export function publicStory(story: Story): Story {
  const spots = story.spots.filter((spot) => !spot.archived);
  const live = new Set(spots.map((spot) => spot.id));
  return {
    ...story,
    spots,
    blogs: (story.blogs ?? []).filter((blog) => !blog.archived),
    itineraries: story.itineraries
      .filter((item) => !item.archived)
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
