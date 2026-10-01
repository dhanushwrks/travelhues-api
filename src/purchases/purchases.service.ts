import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.user.js';
import { StoreService } from '../store/store.service.js';
import type { ContentPurchase, PurchaseKind } from './purchases.types.js';

@Injectable()
export class PurchasesService {
  constructor(private readonly store: StoreService) {}

  async purchase(user: AuthUser, body: unknown) {
    if (user.role !== 'traveler') {
      throw new ForbiddenException('Travelers purchase content');
    }
    const { storySlug, kind, itemId } = this.parse(body);
    const story = this.store.getStories().find((item) => item.slug === storySlug);
    if (!story || story.archived || story.deletedAt) {
      throw new NotFoundException('That story was not found');
    }

    let priceInr = 99;
    let purchaseOnly = false;
    if (kind === 'spot') {
      const spot = story.spots.find((item) => item.id === itemId && !item.archived && !item.deletedAt);
      if (!spot) throw new NotFoundException('That spot was not found');
      purchaseOnly = Boolean(spot.purchaseOnly);
      priceInr = spot.priceInr ?? 99;
    } else if (kind === 'itinerary') {
      const itinerary = story.itineraries.find(
        (item) => item.slug === itemId && !item.archived && !item.deletedAt,
      );
      if (!itinerary) throw new NotFoundException('That itinerary was not found');
      purchaseOnly = Boolean(itinerary.purchaseOnly);
      priceInr = itinerary.priceInr ?? 99;
    } else {
      const blog = (story.blogs ?? []).find(
        (item) => item.slug === itemId && !item.archived && !item.deletedAt,
      );
      if (!blog) throw new NotFoundException('That blog was not found');
      purchaseOnly = Boolean(blog.purchaseOnly);
      priceInr = blog.priceInr ?? 99;
    }

    if (!purchaseOnly) {
      throw new BadRequestException('That item is free');
    }
    if (priceInr <= 0) {
      throw new BadRequestException('That item needs a price');
    }

    const existing = this.store
      .getPurchases()
      .find(
        (item) =>
          item.buyerId === user.id &&
          item.storySlug === storySlug &&
          item.kind === kind &&
          item.itemId === itemId,
      );
    if (existing) {
      return { ok: true, alreadyOwned: true, purchase: existing };
    }

    const purchase: ContentPurchase = {
      id: randomUUID(),
      buyerId: user.id,
      storySlug,
      kind,
      itemId,
      priceInr,
      createdAt: new Date().toISOString(),
    };
    const saved = await this.store.recordPurchase(purchase);
    return { ok: true, alreadyOwned: false, purchase: saved };
  }

  private parse(body: unknown): {
    storySlug: string;
    kind: PurchaseKind;
    itemId: string;
  } {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Purchase details are required');
    }
    const record = body as Record<string, unknown>;
    const storySlug = typeof record.storySlug === 'string' ? record.storySlug.trim() : '';
    const itemId = typeof record.itemId === 'string' ? record.itemId.trim() : '';
    const kind =
      record.kind === 'spot' || record.kind === 'itinerary' || record.kind === 'blog'
        ? record.kind
        : null;
    if (!storySlug || !itemId || !kind) {
      throw new BadRequestException('Choose a spot, itinerary, or blog to purchase');
    }
    return { storySlug, kind, itemId };
  }
}
