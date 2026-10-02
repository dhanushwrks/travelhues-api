export const flightDealOrigins = ['BLR', 'BOM', 'HYD', 'DEL', 'MAA'] as const;

export type FlightDealOrigin = (typeof flightDealOrigins)[number];

export type FlightDealStatus = 'draft' | 'published' | 'archived';

export type FlightDealEventType =
  | 'impression'
  | 'affiliate_click'
  | 'story_open'
  | 'itinerary_open'
  | 'spot_open'
  | 'purchase';

export type FlightDeal = {
  id: string;
  originIata: string;
  destinationIata: string;
  destinationCity: string;
  destinationCountry: string;
  departureDate: string;
  returnDate: string;
  priceInr: number;
  currency: string;
  affiliateUrl: string;
  affiliatePartner: string;
  headline: string;
  subtitle: string;
  badge: string;
  storyCreatorUsername: string;
  storySlug: string;
  featuredItinerarySlug: string;
  featuredSpotIds: string[];
  status: FlightDealStatus;
  validFrom: string;
  validUntil: string;
  priority: number;
  externalId: string;
  listPriceInr?: number;
  airlineName?: string;
  cabinClass?: string;
  stops?: number;
  baggageSummary?: string;
  createdAt: string;
  updatedAt: string;
};

export type FlightDealEvent = {
  id: string;
  dealId: string;
  profileId: string;
  eventType: FlightDealEventType;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type FlightDealStoryPreview = {
  slug: string;
  title: string;
  coverUrl: string;
  creator: {
    username: string;
    displayName: string;
  };
};

export type PublicFlightDeal = FlightDeal & {
  storyPreview?: FlightDealStoryPreview | null;
  tripType: 'one_way' | 'return';
  listPriceInr: number;
  offerPercent: number;
  tripDays: number;
  travelMonthLabel: string;
  cabinClass: string;
  stopsLabel: string;
  baggageSummary: string;
  airlineName: string;
  dealEndsAt: string;
};

export type FlightDealsListResponse = {
  items: PublicFlightDeal[];
  total: number;
  hasMore: boolean;
};

export type FlightDealSort = 'featured' | 'latest' | 'offer';

export type FlightDealImportRowError = {
  row: number;
  message: string;
};

export type FlightDealImportResult = {
  created: number;
  updated: number;
  errors: FlightDealImportRowError[];
};

export type FlightDealAnalytics = {
  dealAffiliateClicks: number;
  dealStoryOpens: number;
  dealAttributedPurchases: number;
  dealAttributedGmvInr: number;
  topDeals: {
    id: string;
    headline: string;
    originIata: string;
    destinationIata: string;
    affiliateClicks: number;
    storyOpens: number;
    purchases: number;
    gmvInr: number;
  }[];
};
