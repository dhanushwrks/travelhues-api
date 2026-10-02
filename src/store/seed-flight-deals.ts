import type { Story } from '../content/content.types.js';
import { flightDealOrigins, type FlightDeal, type FlightDealOrigin } from '../flight-deals/flight-deals.types.js';

const ORIGINS = flightDealOrigins;

const DESTINATION_AIRPORT: Record<string, string> = {
  thailand: 'BKK',
};

const BASE_PRICES: Record<FlightDealOrigin, number> = {
  BLR: 12499,
  BOM: 11999,
  DEL: 12999,
  HYD: 12299,
  MAA: 11899,
};

function storyCountryCode(story: Story): string {
  const raw = story.destination.country.trim();
  if (/^[A-Za-z]{2}$/.test(raw)) return raw.toUpperCase();
  if (raw.toLowerCase() === 'thailand') return 'TH';
  return raw.slice(0, 2).toUpperCase();
}

function destinationIata(story: Story): string {
  if (DESTINATION_AIRPORT[story.slug]) return DESTINATION_AIRPORT[story.slug];
  const name = story.destination.name.toLowerCase();
  if (name.includes('bangkok') || story.slug.includes('thailand')) return 'BKK';
  return 'BKK';
}

function dealUuid(storyIndex: number, originIndex: number): string {
  const tail = (storyIndex * 10 + originIndex).toString(16).padStart(12, '0');
  const head = (0xa1000000 + storyIndex).toString(16).padStart(8, '0');
  return `${head}-0001-4000-8000-${tail}`;
}

export function seedFlightDeals(stories: Story[]): FlightDeal[] {
  const open = stories.filter(
    (item) => !item.archived && !item.deletedAt && item.itineraries.length > 0,
  );
  if (!open.length) return [];

  const now = new Date();
  const validFrom = now.toISOString();
  const validUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();
  const deals: FlightDeal[] = [];

  for (const story of open) {
    const destinationCity = story.destination.name || 'Bangkok';
    const destinationCountry = storyCountryCode(story);
    const destIata = destinationIata(story);
    const featuredItinerary =
      story.itineraries.find((item) => !item.archived && !item.deletedAt)?.slug ?? '';

    ORIGINS.forEach((origin, index) => {
      const price = BASE_PRICES[origin] + open.indexOf(story) * 250;
      const storyIndex = open.indexOf(story);
      deals.push({
        id: dealUuid(storyIndex, index + 1),
        originIata: origin,
        destinationIata: destIata,
        destinationCity,
        destinationCountry,
        departureDate: '2026-11-15',
        returnDate: '2026-11-22',
        priceInr: price,
        currency: 'INR',
        affiliateUrl: `https://example.com/book/${story.slug}`,
        affiliatePartner: 'seed',
        headline: `${origin} → ${destinationCity} from ₹${price.toLocaleString('en-IN')}`,
        subtitle: `Pair this fare with the ${story.title} story.`,
        badge: 'Deal',
        storyCreatorUsername: story.creator.username,
        storySlug: story.slug,
        featuredItinerarySlug: featuredItinerary,
        featuredSpotIds: [],
        status: 'published',
        validFrom,
        validUntil,
        priority: 10 - index,
        externalId: `seed-${story.slug}-${origin}-${destIata}`,
        createdAt,
        updatedAt: createdAt,
      });
    });
  }

  return deals;
}
