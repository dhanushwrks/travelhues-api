import type { FlightDeal, PublicFlightDeal } from './flight-deals.types.js';

export function tripDaysBetween(departure: string, returnDate: string) {
  if (!returnDate) return 1;
  const start = Date.parse(`${departure}T00:00:00Z`);
  const end = Date.parse(`${returnDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)) + 1);
}

export function travelMonthLabel(departure: string, returnDate: string) {
  const start = new Date(`${departure}T00:00:00Z`);
  const end = returnDate ? new Date(`${returnDate}T00:00:00Z`) : start;
  const fmt = (date: Date) =>
    date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const same = start.getUTCMonth() === end.getUTCMonth();
  return same ? fmt(start) : `${fmt(start)}–${fmt(end)}`;
}

export function listPriceForDeal(deal: FlightDeal) {
  if (deal.listPriceInr && deal.listPriceInr > deal.priceInr) return deal.listPriceInr;
  return Math.round(deal.priceInr * 1.35);
}

export function offerPercent(deal: FlightDeal) {
  const list = listPriceForDeal(deal);
  if (list <= deal.priceInr) return 0;
  return Math.round((1 - deal.priceInr / list) * 100);
}

export function stopsLabel(stops: number | undefined) {
  if (stops === 0) return 'Direct';
  if (stops === 1) return '1 stop';
  if (typeof stops === 'number' && stops > 1) return `${stops} stops`;
  return '1 stop';
}

export function enrichPublicDeal(
  deal: FlightDeal,
  storyPreview: PublicFlightDeal['storyPreview'],
): PublicFlightDeal {
  const listPriceInr = listPriceForDeal(deal);
  const tripDays = tripDaysBetween(deal.departureDate, deal.returnDate);
  return {
    ...deal,
    tripType: deal.returnDate ? 'return' : 'one_way',
    storyPreview,
    listPriceInr,
    offerPercent: offerPercent(deal),
    tripDays,
    travelMonthLabel: travelMonthLabel(deal.departureDate, deal.returnDate),
    cabinClass: deal.cabinClass || 'Economy',
    stopsLabel: stopsLabel(deal.stops),
    baggageSummary:
      deal.baggageSummary || '1 free cabin bag · 1 free check-in bag',
    airlineName: deal.airlineName || deal.affiliatePartner || 'Partner airline',
    dealEndsAt: deal.validUntil,
  };
}
