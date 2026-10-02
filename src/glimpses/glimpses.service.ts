import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.user.js';
import { isCountryCode } from '../people/countries.js';
import { quietAccounts } from '../content/public-story.js';
import { StoreService } from '../store/store.service.js';
import { glimpsePlaybackFields } from './glimpse-media.js';
import type { Glimpse, GlimpseComment, GlimpseLink } from './glimpses.types.js';

@Injectable()
export class GlimpsesService {
  constructor(private readonly store: StoreService) {}

  list(
    viewerId: string,
    query: { country?: string; storySlug?: string; limit?: string } = {},
  ) {
    if (!this.store.getSettings().api.contentPublished) return [];
    const code = query.country ? query.country.toUpperCase() : '';
    const storySlug = (query.storySlug ?? '').trim();
    const cap = Math.min(50, Math.max(1, Number.parseInt(query.limit ?? '0', 10) || 0));
    const quiet = quietAccounts(this.store.getProfiles());
    let rows = this.store
      .getGlimpses()
      .filter((glimpse) => !glimpse.deletedAt)
      .filter((glimpse) => !quiet.ids.has(glimpse.creatorId) && !quiet.names.has(glimpse.username))
      .filter((glimpse) => !code || glimpse.country === code)
      .filter((glimpse) => !storySlug || glimpse.link?.storySlug === storySlug);
    if (cap > 0) rows = rows.slice(0, cap);
    return rows.map((glimpse) => this.present(glimpse, viewerId));
  }

  async create(user: AuthUser, body: unknown) {
    if (user.role !== 'tcc') throw new ForbiddenException('Only a creator can add a short');
    const input = parseGlimpse(body);
    this.assertCountry(input.country);
    const link = this.resolveLink(user, input.link);
    const profile = this.store.getProfiles().find((item) => item.id === user.id);
    const glimpse: Glimpse = {
      id: randomBytes(8).toString('hex'),
      creatorId: user.id,
      username: user.username,
      displayName: user.displayName,
      avatarUrl: profile?.avatarUrl ?? '',
      caption: input.caption,
      videoUrl: input.videoUrl,
      posterUrl: input.posterUrl,
      country: input.country,
      createdAt: new Date().toISOString(),
      link,
    };
    await this.store.update((draft) => {
      draft.glimpses.unshift(glimpse);
    });
    return this.present(glimpse, user.id);
  }

  async toggleLike(user: AuthUser, id: string) {
    if (user.role !== 'traveler') {
      throw new ForbiddenException('Travelers like shorts');
    }
    this.requireGlimpse(id);
    let liked = false;
    await this.store.update((draft) => {
      const existing = draft.glimpseLikes.find(
        (like) => like.glimpseId === id && like.userId === user.id,
      );
      if (existing) {
        draft.glimpseLikes = draft.glimpseLikes.filter(
          (like) => !(like.glimpseId === id && like.userId === user.id),
        );
        liked = false;
        return;
      }
      draft.glimpseLikes.push({ glimpseId: id, userId: user.id });
      liked = true;
    });
    const likes = this.store.getGlimpseLikes().filter((like) => like.glimpseId === id).length;
    return { liked, likes };
  }

  async remove(user: AuthUser, id: string) {
    const glimpse = this.requireGlimpse(id);
    if (glimpse.creatorId !== user.id) {
      throw new ForbiddenException('You can remove a short you posted');
    }
    await this.store.update((draft) => {
      draft.glimpses = draft.glimpses.filter((item) => item.id !== id);
      draft.glimpseLikes = draft.glimpseLikes.filter((like) => like.glimpseId !== id);
      draft.glimpseComments = draft.glimpseComments.filter((comment) => comment.glimpseId !== id);
    });
  }

  async comment(user: AuthUser, id: string, body: unknown) {
    this.requireGlimpse(id);
    const text = readComment(body);
    const comment: GlimpseComment = {
      id: randomBytes(8).toString('hex'),
      glimpseId: id,
      userId: user.id,
      username: user.username,
      displayName: user.displayName,
      body: text,
      createdAt: new Date().toISOString(),
    };
    await this.store.update((draft) => {
      draft.glimpseComments.push(comment);
    });
    return comment;
  }

  private present(glimpse: Glimpse, viewerId: string) {
    const likes = this.store.getGlimpseLikes().filter((like) => like.glimpseId === glimpse.id);
    const comments = this.store
      .getGlimpseComments()
      .filter((comment) => comment.glimpseId === glimpse.id);
    const playback = glimpsePlaybackFields(glimpse.videoUrl);
    return {
      ...glimpse,
      videoUrl: playback.videoUrl || glimpse.videoUrl,
      streamUrl: playback.streamUrl,
      avatarUrl: this.avatarFor(glimpse),
      likes: likes.length,
      liked: likes.some((like) => like.userId === viewerId),
      comments,
    };
  }

  private avatarFor(glimpse: Glimpse) {
    if (glimpse.avatarUrl) return glimpse.avatarUrl;
    const profile = this.store
      .getProfiles()
      .find((item) => item.id === glimpse.creatorId || item.username === glimpse.username);
    if (profile?.avatarUrl) return profile.avatarUrl;
    const story = this.store
      .getStories()
      .find((item) => item.creator.username === glimpse.username && item.creator.avatarUrl);
    return story?.creator.avatarUrl ?? "";
  }

  private requireGlimpse(id: string) {
    const glimpse = this.store.getGlimpses().find((item) => item.id === id);
    if (!glimpse) throw new NotFoundException('That short was not found');
    return glimpse;
  }

  private assertCountry(code: string) {
    const enabled = this.store.getSettings().app.enabledCountries ?? [];
    if (!enabled.includes(code)) {
      throw new BadRequestException('That country is not open for shorts');
    }
  }

  private resolveLink(user: AuthUser, link: RawLink | null): GlimpseLink | null {
    if (!link) return null;
    const story = this.store.getStories().find((item) => item.slug === link.storySlug);
    if (!story) throw new NotFoundException('That story was not found');
    const owns = story.ownerId === user.id || story.creator.username === user.username;
    if (!owns) throw new ForbiddenException('Link a story you created');
    if (link.kind === 'story') return { kind: 'story', storySlug: story.slug, label: story.title };
    if (link.kind === 'itinerary') {
      const itinerary = story.itineraries.find((item) => item.slug === link.itinerarySlug);
      if (!itinerary) throw new NotFoundException('That itinerary was not found');
      return {
        kind: 'itinerary',
        storySlug: story.slug,
        itinerarySlug: itinerary.slug,
        label: itinerary.title,
      };
    }
    const spot = story.spots.find((item) => item.id === link.spotId);
    if (!spot) throw new NotFoundException('That spot was not found');
    return { kind: 'spot', storySlug: story.slug, spotId: spot.id, label: spot.title };
  }
}

type RawLink = {
  kind: 'story' | 'itinerary' | 'spot';
  storySlug: string;
  itinerarySlug?: string;
  spotId?: string;
};

function parseGlimpse(body: unknown) {
  const record = asRecord(body);
  const country = asText(record.country, 'Country').toUpperCase();
  if (!isCountryCode(country)) throw new BadRequestException('Choose a country from the list');
  return {
    caption: asCaption(record.caption),
    videoUrl: asHttp(record.videoUrl, 'Video'),
    posterUrl: record.posterUrl ? asHttp(record.posterUrl, 'Poster') : '',
    country,
    link: parseLink(record.link),
  };
}

function parseLink(value: unknown): RawLink | null {
  if (value == null) return null;
  const record = asRecord(value);
  const kind = record.kind;
  if (kind !== 'story' && kind !== 'itinerary' && kind !== 'spot') {
    throw new BadRequestException('Link a story, itinerary, or spot');
  }
  const storySlug = asText(record.storySlug, 'Story');
  if (kind === 'itinerary') {
    return { kind, storySlug, itinerarySlug: asText(record.itinerarySlug, 'Itinerary') };
  }
  if (kind === 'spot') return { kind, storySlug, spotId: asText(record.spotId, 'Spot') };
  return { kind, storySlug };
}

function readComment(body: unknown) {
  const text = asText(asRecord(body).body, 'Comment');
  if (text.length > 280) throw new BadRequestException('Comment is too long');
  return text;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Expected an object');
  }
  return value as Record<string, unknown>;
}

function asCaption(value: unknown) {
  const caption = asText(value, 'Caption');
  if (caption.length > 140) throw new BadRequestException('Caption can be 140 characters');
  return caption;
}

function asText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${label} is required`);
  }
  return value.trim();
}

function asHttp(value: unknown, label: string) {
  const text = asText(value, label);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BadRequestException(`${label} must be a web address`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException(`${label} must be a web address`);
  }
  return text;
}
