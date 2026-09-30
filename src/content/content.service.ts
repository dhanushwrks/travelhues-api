import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreService } from '../store/store.service.js';
import type { PublicSettings } from '../store/store.types.js';
import type { CreatorProfile, ItineraryDetail, Story } from './content.types.js';
import { publicStory, quietAccounts, storyIsPublic } from './public-story.js';

@Injectable()
export class ContentService {
  constructor(private readonly store: StoreService) {}

  getPublicSettings(): PublicSettings {
    const settings = this.store.getSettings();
    return {
      app: settings.app,
      contentPublished: settings.api.contentPublished,
    };
  }

  getStories(): Story[] {
    return this.publishedStories();
  }

  getStory(slug: string): Story {
    const story = this.publishedStories().find((item) => item.slug === slug);
    if (!story) {
      throw new NotFoundException(`Story ${slug} was not found`);
    }
    return story;
  }

  getItinerary(storySlug: string, itinerarySlug: string): ItineraryDetail {
    const story = this.getStory(storySlug);
    const itinerary = story.itineraries.find(
      (item) => item.slug === itinerarySlug,
    );
    if (!itinerary) {
      throw new NotFoundException(
        `Itinerary ${itinerarySlug} was not found on ${storySlug}`,
      );
    }
    return { story, itinerary };
  }

  getCreator(username: string): CreatorProfile {
    const owned = this.publishedStories().filter(
      (item) => item.creator.username === username,
    );
    const story = owned[0];
    if (!story) {
      throw new NotFoundException(`Creator ${username} was not found`);
    }
    return { creator: story.creator, stories: owned };
  }

  private publishedStories() {
    if (!this.store.getSettings().api.contentPublished) return [];
    const quiet = quietAccounts(this.store.getProfiles());
    return this.store
      .getStories()
      .filter((story) => storyIsPublic(story, quiet))
      .map(publicStory);
  }
}
