import type { Story } from '../content/content.types.js';
import type { FlightDeal } from '../flight-deals/flight-deals.types.js';

const SEED_DEAL_IDS = {
  blr: 'a1000001-0001-4000-8000-000000000001',
  bom: 'a1000001-0001-4000-8000-000000000002',
  del: 'a1000001-0001-4000-8000-000000000003',
  hyd: 'a1000001-0001-4000-8000-000000000004',
  maa: 'a1000001-0001-4000-8000-000000000005',
} as const;

export function seedFlightDeals(stories: Story[]): FlightDeal[] {
  const story = stories.find((item) => item.slug === 'thailand' && !item.archived && !item.deletedAt);
  if (!story) return [];

  const now = new Date();
  const validFrom = now.toISOString();
  const validUntil = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  const createdAt = now.toISOString();
  const destinationCity = story.destination.name || 'Bangkok';
  const destinationCountry =
    story.destination.country.length === 2
      ? story.destination.country.toUpperCase()
      : 'TH';

  const origins: { code: keyof typeof SEED_DEAL_IDS; price: number }[] = [
    { code: 'blr', price: 12499 },
    { code: 'bom', price: 11999 },
    { code: 'del', price: 12999 },
    { code: 'hyd', price: 12299 },
    { code: 'maa', price: 11899 },
  ];

  return origins.map(({ code, price }, index) => {
    const origin = code.toUpperCase() as 'BLR' | 'BOM' | 'DEL' | 'HYD' | 'MAA';
    return {
      id: SEED_DEAL_IDS[code],
      originIata: origin,
      destinationIata: 'BKK',
      destinationCity,
      destinationCountry,
      departureDate: '2026-11-15',
      returnDate: '2026-11-22',
      priceInr: price,
      currency: 'INR',
      affiliateUrl: 'https://example.com/book/thailand',
      affiliatePartner: 'seed',
      headline: `${origin} → Bangkok from ₹${price.toLocaleString('en-IN')}`,
      subtitle: 'Pair this fare with the Thailand story and 4-day plan.',
      badge: 'Deal',
      storyCreatorUsername: story.creator.username,
      storySlug: story.slug,
      featuredItinerarySlug: 'thailand-in-4-days',
      featuredSpotIds: [],
      status: 'published' as const,
      validFrom,
      validUntil,
      priority: 10 - index,
      externalId: `seed-${origin}-bkk`,
      createdAt,
      updatedAt: createdAt,
    };
  });
}
