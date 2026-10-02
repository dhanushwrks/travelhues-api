import { describe, expect, it } from 'vitest';
import { highlightForStory } from './story-highlight.js';

describe('highlightForStory', () => {
  it('returns MP4 highlight for linked glimpse', () => {
    const result = highlightForStory(
      [
        {
          id: '1',
          creatorId: 'c',
          username: 'u',
          displayName: 'U',
          avatarUrl: '',
          caption: '',
          videoUrl: '/media/abc.mp4',
          posterUrl: '',
          country: 'TH',
          createdAt: '',
          link: { kind: 'story', storySlug: 'bangkok', label: 'Story' },
        },
      ],
      'bangkok',
    );
    expect(result.highlightVideoUrl).toBe('/media/abc.mp4');
    expect(result.highlightStreamUrl).toBeUndefined();
  });

  it('returns HLS stream field for m3u8 URLs', () => {
    const result = highlightForStory(
      [
        {
          id: '1',
          creatorId: 'c',
          username: 'u',
          displayName: 'U',
          avatarUrl: '',
          caption: '',
          videoUrl: 'https://cdn.example/highlight.m3u8',
          posterUrl: '',
          country: 'TH',
          createdAt: '',
          link: { kind: 'story', storySlug: 'bangkok', label: 'Story' },
        },
      ],
      'bangkok',
    );
    expect(result.highlightStreamUrl).toBe('https://cdn.example/highlight.m3u8');
  });
});
