import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.user.js';
import { StoreService } from '../store/store.service.js';
import type { ContentMark } from './marks.types.js';

@Injectable()
export class MarksService {
  constructor(private readonly store: StoreService) {}

  library(userId: string) {
    const stories = this.published();
    const marks = this.liveMarks();
    return {
      marks: marks
        .filter((mark) => mark.userId === userId)
        .map((mark) => this.enrich(mark, stories))
        .filter((mark) => mark !== null),
      counts: this.counts(marks, stories),
    };
  }

  async toggle(user: AuthUser, body: unknown) {
    if (user.role !== 'traveler') {
      throw new ForbiddenException('Travelers save and like itineraries and spots');
    }
    const mark = this.parse(user.id, body);
    this.requireTarget(mark);
    await this.store.update((draft) => {
      const index = draft.contentMarks.findIndex((item) => sameMark(item, mark));
      if (index >= 0) draft.contentMarks.splice(index, 1);
      else draft.contentMarks.push(mark);
    });
    const marks = this.liveMarks().filter((item) => sameTarget(item, mark));
    return {
      liked: marks.some((item) => item.userId === user.id && item.action === 'like'),
      saved: marks.some((item) => item.userId === user.id && item.action === 'save'),
      likes: marks.filter((item) => item.action === 'like').length,
    };
  }

  private parse(userId: string, body: unknown): ContentMark {
    const record = asRecord(body);
    const action = record.action === 'like' || record.action === 'save' ? record.action : null;
    const kind = record.kind === 'itinerary' || record.kind === 'spot' ? record.kind : null;
    if (!action || !kind) throw new BadRequestException('Choose a like or a save');
    const storySlug = asText(record.storySlug);
    const itinerarySlug = kind === 'itinerary' ? asText(record.itinerarySlug) : '';
    const spotId = kind === 'spot' ? asText(record.spotId) : '';
    return { userId, action, kind, storySlug, itinerarySlug, spotId };
  }

  private requireTarget(mark: ContentMark) {
    const story = this.published().find((item) => item.slug === mark.storySlug);
    if (!story) throw new NotFoundException('That story was not found');
    if (mark.kind === 'itinerary' && !story.itineraries.some((item) => item.slug === mark.itinerarySlug)) {
      throw new NotFoundException('That itinerary was not found');
    }
    if (mark.kind === 'spot' && !story.spots.some((item) => item.id === mark.spotId)) {
      throw new NotFoundException('That spot was not found');
    }
  }

  private enrich(mark: ContentMark, stories: ReturnType<MarksService['published']>) {
    const story = stories.find((item) => item.slug === mark.storySlug);
    if (!story) return null;
    if (mark.kind === 'itinerary') {
      const itinerary = story.itineraries.find((item) => item.slug === mark.itinerarySlug);
      if (!itinerary) return null;
      return { ...mark, title: itinerary.title, storyTitle: story.title };
    }
    const spot = story.spots.find((item) => item.id === mark.spotId);
    if (!spot) return null;
    return { ...mark, title: spot.title, storyTitle: story.title };
  }

  private counts(marks: ContentMark[], stories: ReturnType<MarksService['published']>) {
    const live = new Set(stories.map((story) => story.slug));
    const totals = new Map<string, number>();
    for (const mark of marks) {
      if (mark.action !== 'like') continue;
      if (!live.has(mark.storySlug)) continue;
      const key = markKey(mark);
      totals.set(key, (totals.get(key) ?? 0) + 1);
    }
    return [...totals.entries()].map(([key, likes]) => ({ key, likes }));
  }

  private liveMarks() {
    const gone = new Set(
      this.store.getProfiles().filter((profile) => profile.deletedAt).map((profile) => profile.id),
    );
    return this.store.getMarks().filter((mark) => !gone.has(mark.userId));
  }

  private published() {
    if (!this.store.getSettings().api.contentPublished) return [];
    return this.store.getStories().filter((story) => !story.deletedAt);
  }
}

export function markKey(mark: Pick<ContentMark, 'kind' | 'storySlug' | 'itinerarySlug' | 'spotId'>) {
  return mark.kind === 'spot'
    ? `spot:${mark.storySlug}:${mark.spotId}`
    : `itinerary:${mark.storySlug}:${mark.itinerarySlug}`;
}

function sameTarget(item: ContentMark, mark: ContentMark) {
  return (
    item.kind === mark.kind &&
    item.storySlug === mark.storySlug &&
    item.itinerarySlug === mark.itinerarySlug &&
    item.spotId === mark.spotId
  );
}

function sameMark(item: ContentMark, mark: ContentMark) {
  return item.userId === mark.userId && item.action === mark.action && sameTarget(item, mark);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Expected an object');
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException('That item was not found');
  }
  return value.trim();
}
