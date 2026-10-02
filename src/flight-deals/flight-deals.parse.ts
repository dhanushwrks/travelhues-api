import { BadRequestException } from '@nestjs/common';
import { isCountryCode } from '../people/countries.js';
import {
  flightDealOrigins,
  type FlightDeal,
  type FlightDealEventType,
  type FlightDealStatus,
} from './flight-deals.types.js';

const iataPattern = /^[A-Z]{3}$/;

export function normalizeIata(value: string) {
  return value.trim().toUpperCase();
}

export function assertOriginIata(value: string) {
  const code = normalizeIata(value);
  if (!flightDealOrigins.includes(code as (typeof flightDealOrigins)[number])) {
    throw new BadRequestException('Choose a supported home airport');
  }
  return code;
}

export function assertAirportIata(value: string, label: string) {
  const code = normalizeIata(value);
  if (!iataPattern.test(code)) {
    throw new BadRequestException(`${label} must be a 3-letter airport code`);
  }
  return code;
}

export function assertDate(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    throw new BadRequestException(`${label} must be YYYY-MM-DD`);
  }
  const text = value.trim();
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new BadRequestException(`${label} must be a valid date`);
  }
  return text;
}

export function optionalDate(value: unknown, label: string) {
  if (value == null || value === '') return '';
  return assertDate(value, label);
}

export function parseDealBody(body: unknown, partial: boolean): Partial<FlightDeal> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Deal details are required');
  }
  const record = body as Record<string, unknown>;
  const patch: Partial<FlightDeal> = {};

  if (!partial || 'originIata' in record) {
    patch.originIata = assertOriginIata(asString(record.originIata, 'Origin airport'));
  }
  if (!partial || 'destinationIata' in record) {
    patch.destinationIata = assertAirportIata(
      asString(record.destinationIata, 'Destination airport'),
      'Destination airport',
    );
  }
  if (!partial || 'destinationCity' in record) {
    patch.destinationCity = asText(record.destinationCity, 'Destination city', 80);
  }
  if (!partial || 'destinationCountry' in record) {
    const code = asText(record.destinationCountry, 'Destination country', 2).toUpperCase();
    if (!isCountryCode(code)) throw new BadRequestException('Choose a valid country code');
    patch.destinationCountry = code;
  }
  if (!partial || 'departureDate' in record) {
    patch.departureDate = assertDate(record.departureDate, 'Departure date');
  }
  if (!partial || 'returnDate' in record) {
    patch.returnDate = optionalDate(record.returnDate, 'Return date');
  }
  if (!partial || 'priceInr' in record) {
    patch.priceInr = asPrice(record.priceInr);
  }
  if (!partial || 'currency' in record) {
    patch.currency = asText(record.currency ?? 'INR', 'Currency', 8).toUpperCase();
  }
  if (!partial || 'affiliateUrl' in record) {
    patch.affiliateUrl = asUrl(record.affiliateUrl, 'Affiliate URL');
  }
  if (!partial || 'affiliatePartner' in record) {
    patch.affiliatePartner = asOptionalText(record.affiliatePartner, 80);
  }
  if (!partial || 'headline' in record) {
    patch.headline = asOptionalText(record.headline, 120);
  }
  if (!partial || 'subtitle' in record) {
    patch.subtitle = asOptionalText(record.subtitle, 200);
  }
  if (!partial || 'badge' in record) {
    patch.badge = asOptionalText(record.badge, 40);
  }
  if (!partial || 'storyCreatorUsername' in record) {
    patch.storyCreatorUsername = asOptionalText(record.storyCreatorUsername, 40).toLowerCase();
  }
  if (!partial || 'storySlug' in record) {
    patch.storySlug = asOptionalText(record.storySlug, 80);
  }
  if (!partial || 'featuredItinerarySlug' in record) {
    patch.featuredItinerarySlug = asOptionalText(record.featuredItinerarySlug, 80);
  }
  if (!partial || 'featuredSpotIds' in record) {
    patch.featuredSpotIds = asSpotIds(record.featuredSpotIds);
  }
  if (!partial || 'status' in record) {
    patch.status = asStatus(record.status);
  }
  if (!partial || 'validFrom' in record) {
    patch.validFrom = record.validFrom
      ? assertIso(record.validFrom, 'Valid from')
      : new Date().toISOString();
  }
  if (!partial || 'validUntil' in record) {
    patch.validUntil = assertIso(record.validUntil, 'Valid until');
  }
  if (!partial || 'priority' in record) {
    patch.priority = asPriority(record.priority);
  }
  if (!partial || 'externalId' in record) {
    patch.externalId = asOptionalText(record.externalId, 120);
  }

  return patch;
}

export function parseEventBody(body: unknown): {
  type: FlightDealEventType;
  metadata?: Record<string, unknown>;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('Event details are required');
  }
  const record = body as Record<string, unknown>;
  const type = record.type;
  const allowed: FlightDealEventType[] = [
    'impression',
    'affiliate_click',
    'story_open',
    'itinerary_open',
    'spot_open',
    'purchase',
  ];
  if (typeof type !== 'string' || !allowed.includes(type as FlightDealEventType)) {
    throw new BadRequestException('Event type is not valid');
  }
  const metadata =
    record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? (record.metadata as Record<string, unknown>)
      : undefined;
  return { type: type as FlightDealEventType, metadata };
}

export function parseHomeAirport(value: unknown) {
  if (value == null || value === '') return '';
  return assertOriginIata(asString(value, 'Home airport'));
}

function asStatus(value: unknown): FlightDealStatus {
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new BadRequestException('Status must be draft, published, or archived');
}

function asString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${label} is required`);
  }
  return value.trim();
}

function asText(value: unknown, label: string, max: number) {
  const text = asString(value, label);
  if (text.length > max) throw new BadRequestException(`${label} is too long`);
  return text;
}

function asOptionalText(value: unknown, max: number) {
  if (value == null) return '';
  if (typeof value !== 'string') throw new BadRequestException('Expected text');
  const text = value.trim();
  if (text.length > max) throw new BadRequestException('Text is too long');
  return text;
}

function asPrice(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new BadRequestException('Price must be zero or more');
  }
  return Math.round(value);
}

function asPriority(value: unknown) {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new BadRequestException('Priority must be a whole number');
  }
  return value;
}

function asUrl(value: unknown, label: string) {
  const text = asString(value, label);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BadRequestException(`${label} must be a full web address`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException(`${label} must be http or https`);
  }
  return url.toString();
}

function assertIso(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new BadRequestException(`${label} is required`);
  }
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new BadRequestException(`${label} must be a valid time`);
  return new Date(time).toISOString();
}

function asSpotIds(value: unknown) {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof value === 'string') {
    return value
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
  }
  throw new BadRequestException('Featured spot ids must be a list');
}
