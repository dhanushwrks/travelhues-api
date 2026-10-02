import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.user.js';
import { StoreService } from '../store/store.service.js';
import {
  assertOriginIata,
  normalizeIata,
  parseDealBody,
  parseEventBody,
} from './flight-deals.parse.js';
import type {
  FlightDeal,
  FlightDealAnalytics,
  FlightDealImportResult,
  FlightDealStoryPreview,
  PublicFlightDeal,
} from './flight-deals.types.js';

@Injectable()
export class FlightDealsService {
  constructor(private readonly store: StoreService) {}

  listPublic(origin: string | undefined, limit: number) {
    const now = Date.now();
    const originCode = origin ? normalizeIata(origin) : '';
    const items = this.store
      .getFlightDeals()
      .filter((deal) => deal.status === 'published')
      .filter((deal) => Date.parse(deal.validFrom) <= now && Date.parse(deal.validUntil) >= now)
      .filter((deal) => !originCode || deal.originIata === originCode)
      .sort(
        (left, right) =>
          right.priority - left.priority ||
          left.priceInr - right.priceInr ||
          left.departureDate.localeCompare(right.departureDate),
      )
      .slice(0, limit)
      .map((deal) => this.presentPublic(deal));
    return items;
  }

  getPublic(id: string) {
    const deal = this.requireDeal(id);
    if (deal.status !== 'published') throw new NotFoundException('That deal was not found');
    const now = Date.now();
    if (Date.parse(deal.validFrom) > now || Date.parse(deal.validUntil) < now) {
      throw new NotFoundException('That deal was not found');
    }
    return this.presentPublic(deal);
  }

  async recordEvent(dealId: string, user: AuthUser | undefined, body: unknown) {
    this.requireDeal(dealId);
    const { type, metadata } = parseEventBody(body);
    await this.store.recordFlightDealEvent({
      id: randomUUID(),
      dealId,
      profileId: user?.id ?? '',
      eventType: type,
      metadata: metadata ?? {},
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  }

  bookRedirect(dealId: string, user: AuthUser | undefined) {
    const deal = this.getPublic(dealId);
    void this.store.recordFlightDealEvent({
      id: randomUUID(),
      dealId,
      profileId: user?.id ?? '',
      eventType: 'affiliate_click',
      metadata: {},
      createdAt: new Date().toISOString(),
    });
    const url = new URL(deal.affiliateUrl);
    const subId = user?.id ? `th_deal_${dealId}_u_${user.id}` : `th_deal_${dealId}_anon`;
    url.searchParams.set('sub_id', subId);
    return url.toString();
  }

  adminList(query: { origin?: string; status?: string }) {
    const origin = query.origin ? normalizeIata(query.origin) : '';
    const status = query.status?.trim();
    return this.store
      .getFlightDeals()
      .filter((deal) => !origin || deal.originIata === origin)
      .filter((deal) => !status || deal.status === status)
      .sort(
        (left, right) =>
          right.updatedAt.localeCompare(left.updatedAt) || left.originIata.localeCompare(right.originIata),
      );
  }

  async adminCreate(body: unknown) {
    const input = parseDealBody(body, false) as Partial<FlightDeal>;
    const now = new Date().toISOString();
    const deal: FlightDeal = {
      id: randomUUID(),
      originIata: input.originIata!,
      destinationIata: input.destinationIata!,
      destinationCity: input.destinationCity!,
      destinationCountry: input.destinationCountry!,
      departureDate: input.departureDate!,
      returnDate: input.returnDate ?? '',
      priceInr: input.priceInr!,
      currency: input.currency ?? 'INR',
      affiliateUrl: input.affiliateUrl!,
      affiliatePartner: input.affiliatePartner ?? '',
      headline: input.headline ?? defaultHeadline(input),
      subtitle: input.subtitle ?? '',
      badge: input.badge ?? 'Deal',
      storyCreatorUsername: input.storyCreatorUsername ?? '',
      storySlug: input.storySlug ?? '',
      featuredItinerarySlug: input.featuredItinerarySlug ?? '',
      featuredSpotIds: input.featuredSpotIds ?? [],
      status: input.status ?? 'draft',
      validFrom: input.validFrom ?? now,
      validUntil: input.validUntil ?? defaultValidUntil(input.departureDate!),
      priority: input.priority ?? 0,
      externalId: input.externalId ?? '',
      createdAt: now,
      updatedAt: now,
    };
    if (deal.status === 'published') this.assertStoryLink(deal);
    await this.store.upsertFlightDeal(deal);
    return deal;
  }

  async adminUpdate(id: string, body: unknown) {
    const existing = this.requireDeal(id);
    const patch = parseDealBody(body, true);
    const next: FlightDeal = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    if (next.status === 'published') this.assertStoryLink(next);
    await this.store.upsertFlightDeal(next);
    return next;
  }

  async adminArchive(id: string) {
    const existing = this.requireDeal(id);
    const next = { ...existing, status: 'archived' as const, updatedAt: new Date().toISOString() };
    await this.store.upsertFlightDeal(next);
    return next;
  }

  async adminImport(body: unknown): Promise<FlightDealImportResult> {
    const rows = readImportRows(body);
    const result: FlightDealImportResult = { created: 0, updated: 0, errors: [] };
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        const mapped = mapImportRow(row);
        const existing = this.findForUpsert(mapped);
        if (existing) {
          await this.adminUpdate(existing.id, mapped);
          result.updated += 1;
        } else {
          await this.adminCreate(mapped);
          result.created += 1;
        }
      } catch (error) {
        result.errors.push({
          row: index + 1,
          message: error instanceof Error ? error.message : 'Import failed',
        });
      }
    }
    return result;
  }

  storySuggestions(destinationCity: string, country: string) {
    const city = destinationCity.trim().toLowerCase();
    const countryCode = country.trim().toUpperCase();
    return this.store
      .getStories()
      .filter((story) => !story.archived && !story.deletedAt)
      .filter((story) => {
        if (countryCode && story.destination.country.toUpperCase() !== countryCode) return false;
        if (!city) return true;
        return story.destination.name.toLowerCase().includes(city);
      })
      .slice(0, 12)
      .map((story) => ({
        storySlug: story.slug,
        storyCreatorUsername: story.creator.username,
        title: story.title,
        destination: story.destination.name,
        country: story.destination.country,
      }));
  }

  analytics(): FlightDealAnalytics {
    const events = this.store.getFlightDealEvents();
    const purchases = this.store.getPurchases().filter((item) => item.sourceDealId);
    const affiliateClicks = events.filter((item) => item.eventType === 'affiliate_click').length;
    const storyOpens = events.filter((item) => item.eventType === 'story_open').length;
    const attributedPurchases = purchases.length;
    const gmv = purchases.reduce((total, item) => total + item.priceInr, 0);
    const deals = this.store.getFlightDeals();
    const topDeals = deals
      .map((deal) => {
        const dealEvents = events.filter((item) => item.dealId === deal.id);
        const dealPurchases = purchases.filter((item) => item.sourceDealId === deal.id);
        return {
          id: deal.id,
          headline: deal.headline || `${deal.originIata} → ${deal.destinationIata}`,
          originIata: deal.originIata,
          destinationIata: deal.destinationIata,
          affiliateClicks: dealEvents.filter((item) => item.eventType === 'affiliate_click').length,
          storyOpens: dealEvents.filter((item) => item.eventType === 'story_open').length,
          purchases: dealPurchases.length,
          gmvInr: dealPurchases.reduce((total, item) => total + item.priceInr, 0),
        };
      })
      .sort(
        (left, right) =>
          right.affiliateClicks - left.affiliateClicks || right.storyOpens - left.storyOpens,
      )
      .slice(0, 10);
    return {
      dealAffiliateClicks: affiliateClicks,
      dealStoryOpens: storyOpens,
      dealAttributedPurchases: attributedPurchases,
      dealAttributedGmvInr: gmv,
      topDeals,
    };
  }

  assertDealForAttribution(dealId: string) {
    const deal = this.store.getFlightDeals().find((item) => item.id === dealId);
    if (!deal || deal.status === 'archived') return null;
    return deal;
  }

  private presentPublic(deal: FlightDeal): PublicFlightDeal {
    return {
      ...deal,
      tripType: deal.returnDate ? 'return' : 'one_way',
      storyPreview: this.storyPreview(deal),
    };
  }

  private storyPreview(deal: FlightDeal): FlightDealStoryPreview | null {
    if (!deal.storySlug || !deal.storyCreatorUsername) return null;
    const story = this.store
      .getStories()
      .find(
        (item) =>
          item.slug === deal.storySlug &&
          item.creator.username === deal.storyCreatorUsername &&
          !item.archived &&
          !item.deletedAt,
      );
    if (!story) return null;
    return {
      slug: story.slug,
      title: story.title,
      coverUrl: story.coverUrl,
      creator: {
        username: story.creator.username,
        displayName: story.creator.displayName,
      },
    };
  }

  private assertStoryLink(deal: FlightDeal) {
    if (!deal.storySlug || !deal.storyCreatorUsername) {
      throw new BadRequestException('Published deals need a linked story');
    }
    const story = this.store
      .getStories()
      .find(
        (item) =>
          item.slug === deal.storySlug &&
          item.creator.username === deal.storyCreatorUsername &&
          !item.archived &&
          !item.deletedAt,
      );
    if (!story) {
      throw new BadRequestException('Linked story was not found or is not live');
    }
  }

  private requireDeal(id: string) {
    const deal = this.store.getFlightDeals().find((item) => item.id === id);
    if (!deal) throw new NotFoundException('That deal was not found');
    return deal;
  }

  private findForUpsert(input: Record<string, unknown>) {
    const externalId =
      typeof input.externalId === 'string' && input.externalId.trim()
        ? input.externalId.trim()
        : '';
    if (externalId) {
      return this.store.getFlightDeals().find((item) => item.externalId === externalId);
    }
    const origin = assertOriginIata(String(input.originIata ?? ''));
    const destination = normalizeIata(String(input.destinationIata ?? ''));
    const departure = String(input.departureDate ?? '');
    const affiliate = String(input.affiliateUrl ?? '');
    return this.store
      .getFlightDeals()
      .find(
        (item) =>
          item.originIata === origin &&
          item.destinationIata === destination &&
          item.departureDate === departure &&
          item.affiliateUrl === affiliate,
      );
  }
}

function defaultHeadline(input: Partial<FlightDeal>) {
  if (input.headline) return input.headline;
  return `${input.originIata ?? ''} → ${input.destinationIata ?? ''}`.trim();
}

function defaultValidUntil(departureDate: string) {
  const base = Date.parse(`${departureDate}T23:59:59Z`);
  const time = Number.isNaN(base) ? Date.now() : base;
  return new Date(time + 7 * 24 * 60 * 60 * 1000).toISOString();
}

function readImportRows(body: unknown): Record<string, unknown>[] {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Import payload is required');
  }
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.rows)) {
    return record.rows.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === 'object' && !Array.isArray(row),
    );
  }
  if (typeof record.csv === 'string') {
    return parseCsv(record.csv);
  }
  throw new BadRequestException('Provide rows or csv text');
}

function parseCsv(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((item) => item.trim());
  const rows: Record<string, unknown>[] = [];
  for (let index = 1; index < lines.length; index += 1) {
    const cells = splitCsvLine(lines[index]);
    const row: Record<string, unknown> = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells.map((item) => item.trim());
}

function mapImportRow(row: Record<string, unknown>) {
  const price = row.price_inr ?? row.priceInr;
  return {
    originIata: row.origin_iata ?? row.originIata,
    destinationIata: row.destination_iata ?? row.destinationIata,
    destinationCity: row.destination_city ?? row.destinationCity,
    destinationCountry: row.destination_country ?? row.destinationCountry,
    departureDate: row.departure_date ?? row.departureDate,
    returnDate: row.return_date ?? row.returnDate ?? '',
    priceInr: typeof price === 'string' ? Number(price) : price,
    affiliateUrl: row.affiliate_url ?? row.affiliateUrl,
    affiliatePartner: row.affiliate_partner ?? row.affiliatePartner ?? '',
    headline: row.headline ?? '',
    subtitle: row.subtitle ?? '',
    storyCreatorUsername: row.story_creator_username ?? row.storyCreatorUsername ?? '',
    storySlug: row.story_slug ?? row.storySlug ?? '',
    featuredItinerarySlug: row.featured_itinerary_slug ?? row.featuredItinerarySlug ?? '',
    featuredSpotIds: row.featured_spot_ids ?? row.featuredSpotIds ?? '',
    validFrom: row.valid_from ?? row.validFrom,
    validUntil: row.valid_until ?? row.validUntil,
    priority:
      typeof row.priority === 'string'
        ? Number(row.priority)
        : typeof row.priority === 'number'
          ? row.priority
          : 0,
    status: row.status ?? 'draft',
    externalId: row.external_id ?? row.externalId ?? '',
  };
}
