#!/usr/bin/env node
/**
 * Enrich published seed itineraries with day briefs, mid-day notes,
 * inter-stop commutes, and reservation suggestions.
 *
 * Usage:
 *   API_BASE=http://65.2.235.120:4000 node scripts/enrich-seed-itineraries.mjs
 */
const API_BASE = (process.env.API_BASE || 'http://127.0.0.1:4000').replace(/\/$/, '');

const ACCOUNTS = [
  { email: 'mira.sen@seed.travelhues.app', password: 'HueSeed-mira-41' },
  { email: 'arun.patel@seed.travelhues.app', password: 'HueSeed-arun-52' },
  { email: 'linh.tran@seed.travelhues.app', password: 'HueSeed-linh-63' },
  { email: 'aisha.rahman@seed.travelhues.app', password: 'HueSeed-aisha-74' },
  { email: 'sagar.thapa@seed.travelhues.app', password: 'HueSeed-sagar-85' },
  { email: 'dewi.putri@seed.travelhues.app', password: 'HueSeed-dewi-96' },
  { email: 'amina.nur@seed.travelhues.app', password: 'HueSeed-amina-17' },
];

const DAY_BRIEFS = [
  'Ease in. Keep the first afternoon light so the evening still has room.',
  'Move on foot where you can. The middle of the day is for shade and one good meal.',
  'Leave earlier for the ridge or outer loop. Heat and traffic climb together.',
  'Keep the last morning short. Pack before breakfast if you have a midday exit.',
];

const NOTE_BANK = [
  'Carry water and small change. The useful stalls rarely take cards.',
  'If the lane is crowded, step one street over and keep the same direction.',
  'Sit for ten minutes before the next stop. The plan works better with pauses.',
  'Ask once, then decide. The first answer is usually enough.',
  'Shoes off at the threshold. Keep a pair that is easy to slip back into.',
  'Save the sunset stop for last light, not the first viewpoint.',
];

async function main() {
  let updated = 0;
  for (const account of ACCOUNTS) {
    const token = await login(account);
    const stories = await getJson('/me/stories', token);
    for (const story of stories) {
      const spots = Object.fromEntries((story.spots || []).map((spot) => [spot.id, spot]));
      for (const plan of story.itineraries || []) {
        const enriched = enrichPlan(plan, spots, story);
        await putJson(`/stories/${story.slug}/itineraries/${plan.slug}`, token, enriched);
        updated += 1;
        console.log(`updated ${story.slug}/${plan.slug}`);
      }
    }
  }
  console.log(`done: ${updated} itineraries`);
}

function enrichPlan(plan, spots, story) {
  const days = (plan.days || []).map((day, dayIndex) => enrichDay(day, dayIndex, spots));
  const reservations = buildReservations(plan, days, spots, story);
  return {
    title: cleanTitle(plan.title),
    summary: cleanSummary(plan.summary, story),
    coverUrl: plan.coverUrl,
    days,
    reservations,
    purchaseOnly: plan.purchaseOnly ?? false,
    priceInr: plan.priceInr ?? 99,
  };
}

function enrichDay(day, dayIndex, spots) {
  const title = improveDayTitle(day.title, dayIndex);
  const brief = day.brief?.trim() || DAY_BRIEFS[Math.min(dayIndex, DAY_BRIEFS.length - 1)];
  let blocks = (day.blocks || [])
    .filter((block) => !(block.kind === 'note' && /t+est this please/i.test(block.body || '')))
    .map((block) => {
      if (block.kind === 'note') {
        return { kind: 'note', body: polishNote(block.body) };
      }
      return {
        kind: 'spot',
        spotId: block.spotId,
        body: polishStopBody(block.body, spots[block.spotId]),
      };
    });

  blocks = ensureNotes(blocks, dayIndex);
  blocks = attachCommutes(blocks, spots);
  return { title, brief, blocks };
}

function ensureNotes(blocks, dayIndex) {
  const notes = blocks.filter((block) => block.kind === 'note').length;
  if (notes >= 2) return blocks;
  const next = [...blocks];
  if (!next.some((block) => block.kind === 'note')) {
    next.unshift({
      kind: 'note',
      body: NOTE_BANK[dayIndex % NOTE_BANK.length],
    });
  }
  const firstStop = next.findIndex((block) => block.kind === 'spot');
  const mid = Math.max(firstStop + 1, Math.floor(next.length / 2));
  if (notes < 2) {
    next.splice(mid, 0, {
      kind: 'note',
      body: NOTE_BANK[(dayIndex + 3) % NOTE_BANK.length],
    });
  }
  return next;
}

function attachCommutes(blocks, spots) {
  let priorSpotId = null;
  return blocks.map((block) => {
    if (block.kind !== 'spot') return block;
    if (!priorSpotId) {
      priorSpotId = block.spotId;
      return block;
    }
    const from = spots[priorSpotId];
    const to = spots[block.spotId];
    priorSpotId = block.spotId;
    if (!from || !to) return block;
    return { ...block, commute: estimateCommute(from, to) };
  });
}

function estimateCommute(from, to) {
  const meters = haversineM(from.lat, from.lng, to.lat, to.lng);
  const km = meters / 1000;
  if (km < 0.05) {
    return {
      mode: 'walk',
      minutes: 3,
      costThb: 0,
      mapsMinutes: 3,
      mapsDistanceM: Math.round(meters) || 40,
      minutesSource: 'manual',
      notes: 'Same compound. Walk across.',
    };
  }
  if (km < 0.9) {
    const minutes = Math.max(8, Math.round(km * 14));
    return {
      mode: 'walk',
      minutes,
      costThb: 0,
      mapsMinutes: minutes,
      mapsDistanceM: Math.round(meters),
      minutesSource: 'manual',
      notes: 'Stay on the quieter parallel lane when the main road fills.',
    };
  }
  if (km < 2.5) {
    const minutes = Math.max(12, Math.round(km * 8));
    return {
      mode: 'cycle',
      minutes,
      costThb: Math.max(40, Math.round(km * 30)),
      mapsMinutes: minutes,
      mapsDistanceM: Math.round(meters),
      minutesSource: 'manual',
      notes: 'A short ride. Lock near the entrance, not on the main frontage.',
    };
  }
  if (km < 8) {
    const minutes = Math.max(18, Math.round(km * 4.5));
    return {
      mode: 'cab',
      minutes,
      costThb: Math.max(120, Math.round(80 + km * 35)),
      mapsMinutes: minutes,
      mapsDistanceM: Math.round(meters),
      minutesSource: 'manual',
      notes: 'Ask the driver to wait only if the stop is under twenty minutes.',
    };
  }
  const minutes = Math.max(35, Math.round(km * 3.2));
  return {
    mode: 'public',
    minutes,
    costThb: Math.max(40, Math.round(km * 8)),
    mapsMinutes: minutes,
    mapsDistanceM: Math.round(meters),
    minutesSource: 'manual',
    notes: 'Take the direct bus or shared van. Sit near the door for the early stop.',
  };
}

function buildReservations(plan, days, spots, story) {
  const existing = Array.isArray(plan.reservations) ? plan.reservations : [];
  if (existing.length >= 2) {
    return existing.map((item, index) => normalizeReservation(item, index, days.length, spots));
  }

  const spotList = Object.values(spots);
  const stay = spotList.find((spot) => spot.type === 'stay');
  const rental = spotList.find((spot) => spot.type === 'rental');
  const experience =
    spotList.find((spot) => spot.type === 'activity') ||
    spotList.find((spot) => spot.type === 'sightseeing');
  const lastDay = Math.max(0, days.length - 1);
  const items = [];

  if (stay) {
    items.push({
      id: `stay-${stay.id}`,
      type: 'stay',
      title: stay.title,
      spotId: stay.id,
      fromDay: 0,
      toDay: Math.max(0, lastDay - (days.length > 2 ? 1 : 0)),
      estCostThb: stay.avgCostThb || estimateStayCost(story),
      notes: 'Book the quieter room if they offer a courtyard or back side.',
      link: '',
    });
  }

  if (rental) {
    items.push({
      id: `rental-${rental.id}`,
      type: 'rental',
      title: rental.title,
      spotId: rental.id,
      fromDay: Math.min(1, lastDay),
      toDay: lastDay,
      rentalKind: guessRentalKind(rental),
      estCostThb: rental.avgCostThb || 450,
      notes: 'Check brakes and lights before you leave the shop.',
    });
  } else if (days.length >= 3) {
    items.push({
      id: `rental-scooter-${plan.slug}`,
      type: 'rental',
      title: 'Day scooter',
      fromDay: Math.min(1, lastDay),
      toDay: Math.min(2, lastDay),
      rentalKind: 'scooter',
      estCostThb: 350,
      notes: 'Useful for the outer loop. Skip it if rain is heavy.',
    });
  }

  if (experience) {
    items.push({
      id: `experience-${experience.id}`,
      type: 'experience',
      title: experience.title,
      spotId: experience.id,
      fromDay: Math.min(1, lastDay),
      toDay: Math.min(1, lastDay),
      timeOfDay: 'Morning',
      estCostThb: experience.avgCostThb || 800,
      notes: 'Reserve the earlier slot. Late slots run into heat and queues.',
    });
  }

  if (days.length >= 4 && story?.destination?.country) {
    items.push({
      id: `flight-home-${plan.slug}`,
      type: 'flight',
      title: `Leave ${story.destination.name}`,
      fromDay: lastDay,
      toDay: lastDay,
      fromPlace: story.destination.name,
      toPlace: 'Home',
      timeOfDay: 'Evening',
      airline: '',
      flightNumber: '',
      estCostThb: 0,
      notes: 'Keep the last morning open. Aim for an afternoon or evening exit.',
    });
  }

  return items;
}

function normalizeReservation(item, index, dayCount, spots) {
  const fromDay = clamp(item.fromDay ?? 0, 0, dayCount - 1);
  const toDay = Math.max(fromDay, clamp(item.toDay ?? fromDay, 0, dayCount - 1));
  const spotId = item.spotId && spots[item.spotId] ? item.spotId : undefined;
  return {
    id: item.id || `reservation-${index + 1}`,
    type: item.type,
    title: item.title,
    ...(spotId ? { spotId } : {}),
    fromDay,
    toDay,
    fromPlace: item.fromPlace || undefined,
    toPlace: item.toPlace || undefined,
    rentalKind: item.rentalKind || undefined,
    estCostThb: typeof item.estCostThb === 'number' ? item.estCostThb : undefined,
    link: item.link || undefined,
    notes: item.notes || undefined,
    airline: item.airline || undefined,
    flightNumber: item.flightNumber || undefined,
    timeOfDay: item.timeOfDay || undefined,
  };
}

function guessRentalKind(spot) {
  const text = `${spot.title} ${spot.description}`.toLowerCase();
  if (text.includes('bike') || text.includes('cycle')) return 'bike';
  if (text.includes('car')) return 'car';
  return 'scooter';
}

function estimateStayCost(story) {
  const country = story?.destination?.country;
  if (country === 'IN' || country === 'NP') return 4500;
  if (country === 'TH' || country === 'VN' || country === 'MY' || country === 'ID') return 2800;
  return 3500;
}

function improveDayTitle(title, dayIndex) {
  const cleaned = (title || '').trim();
  if (!cleaned || /^day\s*\d+/i.test(cleaned) || /^day start$/i.test(cleaned)) {
    return ['Arrival', 'The middle loop', 'Outer ridge', 'Last morning'][Math.min(dayIndex, 3)];
  }
  return cleaned;
}

function cleanTitle(title) {
  return (title || '').trim() || 'Plan';
}

function cleanSummary(summary, story) {
  const text = (summary || '').trim();
  if (text) return text;
  return `A paced plan through ${story.destination?.name || 'the city'}, with room for meals and one quiet hour.`;
}

function polishNote(body) {
  return (body || '').replace(/\s+/g, ' ').trim();
}

function polishStopBody(body, spot) {
  const text = (body || '').trim();
  if (text) return text;
  return spot?.title || 'Stop here';
}

function haversineM(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

async function login(account) {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...account, intent: 'tcc' }),
  });
  if (!response.ok) {
    throw new Error(`login failed for ${account.email}: ${await response.text()}`);
  }
  const body = await response.json();
  if (!body.accessToken) throw new Error(`no token for ${account.email}`);
  return body.accessToken;
}

async function getJson(path, token) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`GET ${path} failed: ${await response.text()}`);
  return response.json();
}

async function putJson(path, token, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PUT ${path} failed: ${await response.text()}`);
  }
  return response.json();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
