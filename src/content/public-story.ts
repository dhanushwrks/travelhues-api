import type { Itinerary, Spot, Story, StoryBlog } from './content.types.js';

export type PurchaseEntitlement = {
  storySlug: string;
  kind: 'spot' | 'itinerary' | 'blog';
  itemId: string;
};

export function quietAccounts(
  profiles: { id: string; username: string; disabled?: boolean; deletedAt?: string | null }[],
) {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const profile of profiles) {
    if (!profile.disabled && !profile.deletedAt) continue;
    ids.add(profile.id);
    if (profile.username) names.add(profile.username);
  }
  return { ids, names };
}

export function storyIsPublic(
  story: Story,
  quiet: { ids: Set<string>; names: Set<string> },
) {
  if (story.deletedAt) return false;
  if (story.archived) return false;
  if (story.ownerId && quiet.ids.has(story.ownerId)) return false;
  if (quiet.names.has(story.creator.username)) return false;
  return true;
}

export function personalAccounts(
  profiles: { id: string; username: string; role?: string }[],
) {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const profile of profiles) {
    if (profile.role !== 'traveler') continue;
    ids.add(profile.id);
    if (profile.username) names.add(profile.username);
  }
  return { ids, names };
}

export function isPersonalTrip(
  story: Story,
  personal: { ids: Set<string>; names: Set<string> },
) {
  if (story.ownerId && personal.ids.has(story.ownerId)) return true;
  return personal.names.has(story.creator.username);
}

export function entitlementKey(storySlug: string, kind: string, itemId: string) {
  return `${storySlug}:${kind}:${itemId}`;
}

export function entitlementSet(purchases: PurchaseEntitlement[]) {
  return new Set(
    purchases.map((item) => entitlementKey(item.storySlug, item.kind, item.itemId)),
  );
}

export function publicStory(
  story: Story,
  options: { viewerId?: string; entitlements?: Set<string> } = {},
): Story {
  const spots = story.spots.filter((spot) => !spot.archived && !spot.deletedAt);
  const live = new Set(spots.map((spot) => spot.id));
  const owner = Boolean(options.viewerId && story.ownerId && options.viewerId === story.ownerId);
  const entitled = options.entitlements ?? new Set<string>();

  return {
    ...story,
    spots: spots.map((spot) =>
      redactSpot(spot, story.slug, owner || entitled.has(entitlementKey(story.slug, 'spot', spot.id))),
    ),
    blogs: (story.blogs ?? [])
      .filter((blog) => !blog.archived && !blog.deletedAt)
      .map((blog) =>
        redactBlog(
          blog,
          story.slug,
          owner || entitled.has(entitlementKey(story.slug, 'blog', blog.slug)),
        ),
      ),
    itineraries: story.itineraries
      .filter((item) => !item.archived && !item.deletedAt)
      .map((item) => {
        const unlocked =
          owner || entitled.has(entitlementKey(story.slug, 'itinerary', item.slug));
        const filtered: Itinerary = {
          ...item,
          days: item.days.map((day) => ({
            ...day,
            blocks: day.blocks.filter(
              (block) => block.kind !== 'spot' || live.has(block.spotId),
            ),
          })),
        };
        return redactItinerary(filtered, unlocked);
      }),
  };
}

function redactSpot(spot: Spot, _storySlug: string, unlocked: boolean): Spot {
  const purchaseOnly = Boolean(spot.purchaseOnly);
  const priceInr = spot.priceInr ?? 99;
  if (!purchaseOnly || unlocked) {
    return {
      ...spot,
      purchaseOnly,
      priceInr,
      locked: false,
    };
  }
  return {
    id: spot.id,
    type: spot.type,
    title: spot.title,
    description: '',
    images: spot.images.slice(0, 1),
    lat: 0,
    lng: 0,
    address: '',
    avgMinutes: 0,
    avgCostThb: 0,
    tags: [],
    archived: spot.archived,
    deletedAt: spot.deletedAt,
    purchaseOnly: true,
    priceInr,
    locked: true,
  };
}

function redactBlog(blog: StoryBlog, _storySlug: string, unlocked: boolean): StoryBlog {
  const purchaseOnly = Boolean(blog.purchaseOnly);
  const priceInr = blog.priceInr ?? 99;
  if (!purchaseOnly || unlocked) {
    return {
      ...blog,
      purchaseOnly,
      priceInr,
      locked: false,
    };
  }
  return {
    slug: blog.slug,
    title: blog.title,
    body: '',
    coverUrl: blog.coverUrl,
    archived: blog.archived,
    deletedAt: blog.deletedAt,
    purchaseOnly: true,
    priceInr,
    locked: true,
  };
}

function redactItinerary(item: Itinerary, unlocked: boolean): Itinerary {
  const purchaseOnly = Boolean(item.purchaseOnly);
  const priceInr = item.priceInr ?? 99;
  if (!purchaseOnly || unlocked) {
    return {
      ...item,
      purchaseOnly,
      priceInr,
      locked: false,
    };
  }
  return {
    slug: item.slug,
    title: item.title,
    summary: item.summary,
    coverUrl: item.coverUrl,
    days: item.days.map((day) => ({
      title: day.title,
      blocks: [],
    })),
    reservations: [],
    archived: item.archived,
    deletedAt: item.deletedAt,
    purchaseOnly: true,
    priceInr,
    locked: true,
  };
}
