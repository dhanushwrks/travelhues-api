import type { Glimpse } from '../glimpses/glimpses.types.js';

export type StoryHighlight = {
  highlightVideoUrl?: string;
  highlightStreamUrl?: string;
};

function isHlsUrl(url: string) {
  return /\.m3u8(\?|$)/i.test(url);
}

export function highlightForStory(glimpses: Glimpse[], storySlug: string): StoryHighlight {
  const glimpse = glimpses.find(
    (item) =>
      !item.deletedAt &&
      item.videoUrl &&
      item.link?.storySlug === storySlug &&
      (item.link.kind === 'story' || !item.link.itinerarySlug),
  );
  if (!glimpse) return {};
  if (isHlsUrl(glimpse.videoUrl)) {
    return { highlightStreamUrl: glimpse.videoUrl };
  }
  return { highlightVideoUrl: glimpse.videoUrl };
}
