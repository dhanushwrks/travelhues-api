import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreService } from '../store/store.service.js';
import type { PublicSettings } from '../store/store.types.js';
import type { CreatorProfile, ItineraryDetail, Story } from './content.types.js';
import {
  entitlementSet,
  isPersonalTrip,
  personalAccounts,
  publicStory,
  quietAccounts,
  storyIsPublic,
} from './public-story.js';
import { searchCatalog, type SearchPage } from './search.js';
import { listCreatorsCatalog, type CreatorsPage } from './creators-list.js';

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

  getStories(viewerId?: string): Story[] {
    return this.publishedStories(viewerId);
  }

  getStory(slug: string, viewerId?: string): Story {
    const story = this.publishedStories(viewerId).find((item) => item.slug === slug);
    if (!story) {
      throw new NotFoundException(`Story ${slug} was not found`);
    }
    return story;
  }

  getItinerary(storySlug: string, itinerarySlug: string, viewerId?: string): ItineraryDetail {
    const story = this.getStory(storySlug, viewerId);
    const itinerary = story.itineraries.find((item) => item.slug === itinerarySlug);
    if (!itinerary) {
      throw new NotFoundException(`Itinerary ${itinerarySlug} was not found on ${storySlug}`);
    }
    return { story, itinerary };
  }

  getCreator(username: string, viewerId?: string): CreatorProfile {
    const owned = this.publishedStories(viewerId).filter(
      (item) => item.creator.username === username,
    );
    const story = owned[0];
    if (!story) {
      throw new NotFoundException(`Creator ${username} was not found`);
    }
    return { creator: story.creator, stories: owned };
  }

  search(query: {
    q?: string;
    kind?: string;
    country?: string;
    spot?: string;
    sort?: string;
    page?: string;
    limit?: string;
  }): SearchPage {
    const settings = this.store.getSettings();
    return searchCatalog(
      query,
      this.publishedStories(),
      this.store.getProfiles(),
      settings.app.enabledCountries ?? [],
      this.likeCounts(),
    );
  }

  listCreators(query: {
    q?: string;
    country?: string;
    page?: string;
    limit?: string;
  }): CreatorsPage {
    return listCreatorsCatalog(
      query,
      this.publishedStories(),
      this.store.getProfiles(),
      this.likeCounts(),
    );
  }

  listDestinations(query: { country?: string; limit?: string }): Story[] {
    const country = (query.country ?? '').trim();
    const limit = Math.min(50, Math.max(1, Number.parseInt(query.limit ?? '10', 10) || 10));
    const likes = this.storyLikeTotals();
    return this.publishedStories()
      .filter((story) => story.itineraries.some((plan) => !plan.archived))
      .filter((story) => matchesDestinationCountry(story.destination.country, country))
      .sort((left, right) => {
        const likeDelta = (likes.get(right.slug) ?? 0) - (likes.get(left.slug) ?? 0);
        if (likeDelta !== 0) return likeDelta;
        return left.title.localeCompare(right.title);
      })
      .slice(0, limit);
  }

  private storyLikeTotals() {
    const totals = new Map<string, number>();
    for (const mark of this.store.getMarks()) {
      if (mark.action !== 'like') continue;
      if (!mark.storySlug) continue;
      totals.set(mark.storySlug, (totals.get(mark.storySlug) ?? 0) + 1);
    }
    return totals;
  }

  private likeCounts() {
    const totals = new Map<string, number>();
    for (const mark of this.store.getMarks()) {
      if (mark.action !== 'like') continue;
      const key =
        mark.kind === 'spot'
          ? `spot:${mark.storySlug}:${mark.spotId}`
          : `itinerary:${mark.storySlug}:${mark.itinerarySlug}`;
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return [...totals.entries()].map(([key, likes]) => ({ key, likes }));
  }

  private publishedStories(viewerId?: string) {
    if (!this.store.getSettings().api.contentPublished) return [];
    const profiles = this.store.getProfiles();
    const quiet = quietAccounts(profiles);
    const personal = personalAccounts(profiles);
    const byUsername = new Map(
      profiles
        .filter((profile) => profile.username)
        .map((profile) => [profile.username, profile] as const),
    );
    const byOwner = new Map(
      profiles.filter((profile) => profile.id).map((profile) => [profile.id, profile] as const),
    );
    const entitlements = viewerId
      ? entitlementSet(
          this.store
            .getPurchases()
            .filter((item) => item.buyerId === viewerId)
            .map((item) => ({
              storySlug: item.storySlug,
              kind: item.kind,
              itemId: item.itemId,
            })),
        )
      : new Set<string>();
    return this.store
      .getStories()
      .filter((story) => storyIsPublic(story, quiet) && !isPersonalTrip(story, personal))
      .map((story) =>
        publicStory(
          withLiveCreator(
            story,
            byOwner.get(story.ownerId ?? '') ?? byUsername.get(story.creator.username),
          ),
          { viewerId, entitlements },
        ),
      );
  }
}

function withLiveCreator(
  story: Story,
  profile: { username: string; displayName: string; bio: string; avatarUrl: string } | undefined,
): Story {
  if (!profile) return story;
  return {
    ...story,
    creator: {
      username: profile.username || story.creator.username,
      displayName: profile.displayName || story.creator.displayName,
      bio: profile.bio || story.creator.bio,
      avatarUrl: profile.avatarUrl,
    },
  };
}

function matchesDestinationCountry(stored: string, selected: string) {
  if (!selected) return true;
  const code = selected.toUpperCase();
  const value = stored.trim();
  return value.toUpperCase() === code || value.toLowerCase() === selected.toLowerCase();
}
