import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  Block,
  CommuteLeg,
  Creator,
  Destination,
  Itinerary,
  Reservation,
  Spot,
  Story,
  StoryBlog,
} from '../content/content.types.js';
import type { SpotCatalogItem } from '../content/spot-catalog.js';
import { isCountryCode } from '../people/countries.js';
import { StoreService } from '../store/store.service.js';
import type { Settings } from '../store/store.types.js';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

@Injectable()
export class AdminService {
  constructor(private readonly store: StoreService) {}

  settings() {
    return this.store.getSettings();
  }

  async saveSettings(body: unknown): Promise<Settings> {
    const current = this.store.getSettings().app;
    const record = asRecord(body, 'Settings');
    const app = asRecord(record.app, 'App settings');
    const settings = parseSettings({
      ...record,
      app: {
        instagramUrl: current.instagramUrl,
        linkedinUrl: current.linkedinUrl,
        youtubeUrl: current.youtubeUrl,
        termsUrl: current.termsUrl,
        policiesUrl: current.policiesUrl,
        ...app,
      },
    });
    await this.store.update((draft) => {
      draft.settings = settings;
    });
    return this.store.getSettings();
  }

  catalog() {
    return this.store.getCatalog();
  }

  async saveCatalog(body: unknown): Promise<SpotCatalogItem[]> {
    const catalog = parseCatalog(body);
    try {
      return await this.store.replaceCatalog(catalog);
    } catch (caught) {
      throw new BadRequestException(
        caught instanceof Error ? caught.message : 'Could not save categories',
      );
    }
  }

  stories() {
    return this.store.getStories();
  }

  storiesFor(user: { id: string; username: string }) {
    return this.store
      .getStories()
      .filter((story) => !story.deletedAt && this.owns(story, user));
  }

  requireOwned(user: { id: string; username: string }, slug: string) {
    const story = this.requireStory(slug);
    if (story.deletedAt) throw new NotFoundException('That story was not found');
    if (!this.owns(story, user)) {
      throw new ForbiddenException('That story belongs to someone else');
    }
    return story;
  }

  story(slug: string) {
    return this.requireStory(slug);
  }

  async createStoryForCreator(
    owner: { id: string; username: string; displayName: string },
    body: unknown,
  ): Promise<Story> {
    const story = parseStory(body, {
      requireEmptyCollections: true,
      catalog: this.store.getCatalog(),
      creator: {
        username: owner.username,
        displayName: owner.displayName,
        bio: '',
        avatarUrl:
          'https://images.unsplash.com/photo-1527980965255-d3b416303d12?auto=format&fit=crop&w=400&q=80',
      },
    });
    story.ownerId = owner.id;
    const country = story.destination.country.toUpperCase();
    const open = this.store.getSettings().app.enabledCountries ?? [];
    if (!open.includes(country)) {
      throw new BadRequestException('That country is not open for stories');
    }
    if (this.store.getStories().some((item) => item.slug === story.slug)) {
      throw new ConflictException(`Story ${story.slug} already exists`);
    }
    await this.store.update((draft) => {
      draft.stories.push(story);
    });
    return this.requireStory(story.slug);
  }

  async createStory(body: unknown): Promise<Story> {
    const story = parseStory(body, {
      requireEmptyCollections: true,
      catalog: this.store.getCatalog(),
    });
    if (this.store.getStories().some((item) => item.slug === story.slug)) {
      throw new ConflictException(`Story ${story.slug} already exists`);
    }
    const ownerId = asRecord(body, 'Story').ownerId;
    if (typeof ownerId === 'string' && /^[0-9a-f-]{36}$/i.test(ownerId)) {
      story.ownerId = ownerId;
    }
    await this.store.update((draft) => {
      draft.stories.push(story);
    });
    return this.requireStory(story.slug);
  }

  async updateStory(slug: string, body: unknown): Promise<Story> {
    const current = this.requireStory(slug);
    const next = parseStory(body, {
      slug,
      catalog: this.store.getCatalog(),
      creator: current.creator,
    });
    const country = next.destination.country.toUpperCase();
    const open = this.store.getSettings().app.enabledCountries ?? [];
    if (!open.includes(country)) {
      throw new BadRequestException('That country is not open for stories');
    }
    await this.store.update((draft) => {
      const index = draft.stories.findIndex((item) => item.slug === slug);
      const existing = draft.stories[index];
      if (!existing) return;
      draft.stories[index] = {
        ...next,
        slug,
        ownerId: existing.ownerId,
        archived: existing.archived ?? false,
        deletedAt: existing.deletedAt,
        destination: {
          ...next.destination,
          country,
        },
        spots: existing.spots,
        itineraries: existing.itineraries,
        blogs: existing.blogs ?? [],
      };
    });
    return this.requireStory(slug);
  }

  async deleteStory(slug: string) {
    this.requireStory(slug);
    await this.store.update((draft) => {
      draft.stories = draft.stories.filter((item) => item.slug !== slug);
    });
  }

  async createSpot(storySlug: string, body: unknown): Promise<Spot> {
    const story = this.requireStory(storySlug);
    const spot = parseSpot(body, undefined, this.store.getCatalog());
    if (story.spots.some((item) => item.id === spot.id)) {
      throw new ConflictException(`Spot ${spot.id} already exists`);
    }
    await this.store.update((draft) => {
      draft.stories
        .find((item) => item.slug === storySlug)
        ?.spots.push(spot);
    });
    return spot;
  }

  async createBlog(storySlug: string, body: unknown): Promise<StoryBlog> {
    const story = this.requireStory(storySlug);
    const record = asRecord(body, 'Blog');
    const blog: StoryBlog = {
      slug: asSlug(record.slug, 'Blog slug'),
      title: asText(record.title, 'Title'),
      body: asText(record.body, 'Body'),
      coverUrl: optionalCover(record.coverUrl),
      archived: false,
    };
    if ((story.blogs ?? []).some((item) => item.slug === blog.slug)) {
      throw new ConflictException(`Blog ${blog.slug} already exists`);
    }
    await this.store.update((draft) => {
      const current = draft.stories.find((item) => item.slug === storySlug);
      if (!current) return;
      current.blogs = [...(current.blogs ?? []), blog];
    });
    return blog;
  }

  async updateBlog(storySlug: string, blogSlug: string, body: unknown): Promise<StoryBlog> {
    const story = this.requireStory(storySlug);
    const previous = (story.blogs ?? []).find((item) => item.slug === blogSlug);
    if (!previous) throw new NotFoundException(`Blog ${blogSlug} was not found`);
    const record = asRecord(body, 'Blog');
    const blog: StoryBlog = {
      ...previous,
      slug: blogSlug,
      title: asText(record.title, 'Title'),
      body: asText(record.body, 'Body'),
      coverUrl: optionalCover(record.coverUrl),
    };
    await this.store.update((draft) => {
      const current = draft.stories.find((item) => item.slug === storySlug);
      if (!current) return;
      current.blogs = (current.blogs ?? []).map((item) => (item.slug === blogSlug ? blog : item));
    });
    return blog;
  }

  async updateSpot(
    storySlug: string,
    spotId: string,
    body: unknown,
  ): Promise<Spot> {
    const story = this.requireStory(storySlug);
    if (!story.spots.some((item) => item.id === spotId)) {
      throw new NotFoundException(`Spot ${spotId} was not found`);
    }
    const previous = story.spots.find((item) => item.id === spotId);
    const spot = {
      ...parseSpot(body, spotId, this.store.getCatalog()),
      archived: previous?.archived ?? false,
    };
    await this.store.update((draft) => {
      const current = draft.stories.find((item) => item.slug === storySlug);
      if (!current) return;
      current.spots = current.spots.map((item) =>
        item.id === spotId ? spot : item,
      );
    });
    return spot;
  }

  async deleteSpot(storySlug: string, spotId: string) {
    const story = this.requireStory(storySlug);
    if (!story.spots.some((item) => item.id === spotId)) {
      throw new NotFoundException(`Spot ${spotId} was not found`);
    }
    const usedBy = story.itineraries
      .filter((itinerary) =>
        itinerary.days.some((day) =>
          day.blocks.some(
            (block) => block.kind === 'spot' && block.spotId === spotId,
          ),
        ),
      )
      .map((itinerary) => itinerary.title);
    if (usedBy.length > 0) {
      throw new BadRequestException(
        `Remove this spot from ${usedBy.join(', ')} before deleting it`,
      );
    }
    await this.store.update((draft) => {
      const current = draft.stories.find((item) => item.slug === storySlug);
      if (!current) return;
      current.spots = current.spots.filter((item) => item.id !== spotId);
    });
  }

  async createItinerary(storySlug: string, body: unknown): Promise<Itinerary> {
    const story = this.requireStory(storySlug);
    const itinerary = parseItinerary(body, story.spots);
    if (story.itineraries.some((item) => item.slug === itinerary.slug)) {
      throw new ConflictException(
        `Itinerary ${itinerary.slug} already exists`,
      );
    }
    await this.store.update((draft) => {
      draft.stories
        .find((item) => item.slug === storySlug)
        ?.itineraries.push(itinerary);
    });
    return itinerary;
  }

  async updateItinerary(
    storySlug: string,
    itinerarySlug: string,
    body: unknown,
  ): Promise<Itinerary> {
    const story = this.requireStory(storySlug);
    if (!story.itineraries.some((item) => item.slug === itinerarySlug)) {
      throw new NotFoundException(`Itinerary ${itinerarySlug} was not found`);
    }
    const previous = story.itineraries.find((item) => item.slug === itinerarySlug);
    const itinerary = {
      ...parseItinerary(body, story.spots, itinerarySlug),
      archived: previous?.archived ?? false,
    };
    await this.store.update((draft) => {
      const current = draft.stories.find((item) => item.slug === storySlug);
      if (!current) return;
      current.itineraries = current.itineraries.map((item) =>
        item.slug === itinerarySlug ? itinerary : item,
      );
    });
    return itinerary;
  }

  async deleteItinerary(storySlug: string, itinerarySlug: string) {
    const story = this.requireStory(storySlug);
    if (!story.itineraries.some((item) => item.slug === itinerarySlug)) {
      throw new NotFoundException(`Itinerary ${itinerarySlug} was not found`);
    }
    await this.store.update((draft) => {
      const current = draft.stories.find((item) => item.slug === storySlug);
      if (!current) return;
      current.itineraries = current.itineraries.filter(
        (item) => item.slug !== itinerarySlug,
      );
    });
  }

  async setStoryArchived(storySlug: string, archived: boolean) {
    this.requireStory(storySlug);
    await this.store.update((draft) => {
      const story = draft.stories.find((item) => item.slug === storySlug);
      if (story) story.archived = archived;
    });
    return { archived };
  }

  async setSpotArchived(storySlug: string, spotId: string, archived: boolean) {
    this.requirePiece(storySlug, (story) => story.spots.some((item) => item.id === spotId), `Spot ${spotId} was not found`);
    await this.store.update((draft) => {
      const spot = draft.stories.find((item) => item.slug === storySlug)?.spots.find((item) => item.id === spotId);
      if (spot) spot.archived = archived;
    });
    return { archived };
  }

  async setBlogArchived(storySlug: string, blogSlug: string, archived: boolean) {
    this.requirePiece(
      storySlug,
      (story) => (story.blogs ?? []).some((item) => item.slug === blogSlug),
      `Blog ${blogSlug} was not found`,
    );
    await this.store.update((draft) => {
      const blog = draft.stories.find((item) => item.slug === storySlug)?.blogs?.find((item) => item.slug === blogSlug);
      if (blog) blog.archived = archived;
    });
    return { archived };
  }

  async setItineraryArchived(storySlug: string, itinerarySlug: string, archived: boolean) {
    this.requirePiece(
      storySlug,
      (story) => story.itineraries.some((item) => item.slug === itinerarySlug),
      `Itinerary ${itinerarySlug} was not found`,
    );
    await this.store.update((draft) => {
      const itinerary = draft.stories
        .find((item) => item.slug === storySlug)
        ?.itineraries.find((item) => item.slug === itinerarySlug);
      if (itinerary) itinerary.archived = archived;
    });
    return { archived };
  }

  private requirePiece(storySlug: string, present: (story: Story) => boolean, missing: string) {
    const story = this.requireStory(storySlug);
    if (!present(story)) throw new NotFoundException(missing);
  }

  private owns(story: Story, user: { id: string; username: string }) {
    return story.ownerId === user.id || story.creator.username === user.username;
  }

  private requireStory(slug: string): Story {
    const story = this.store.getStories().find((item) => item.slug === slug);
    if (!story) throw new NotFoundException(`Story ${slug} was not found`);
    return story;
  }
}

function parseSettings(body: unknown): Settings {
  const record = asRecord(body, 'Settings');
  const app = asRecord(record.app, 'App settings');
  const api = asRecord(record.api, 'API settings');
  const corsOrigins = asStringArray(api.corsOrigins, 'CORS origins').map(
    (origin) => {
      let url: URL;
      try {
        url = new URL(origin);
      } catch {
        throw new BadRequestException(`${origin} is not a valid origin`);
      }
      if (url.origin !== origin || (url.protocol !== 'http:' && url.protocol !== 'https:')) {
        throw new BadRequestException(`${origin} must be an http origin`);
      }
      return origin;
    },
  );
  return {
    app: {
      name: asText(app.name, 'App name'),
      tagline: asText(app.tagline, 'Tagline'),
      publicUrl: asHttpUrl(app.publicUrl, 'Public URL'),
      mapsEnabled: asBoolean(app.mapsEnabled, 'Maps'),
      enabledCountries: asCountryCodes(app.enabledCountries),
      instagramUrl: optionalHttpUrl(app.instagramUrl, 'Instagram'),
      linkedinUrl: optionalHttpUrl(app.linkedinUrl, 'LinkedIn'),
      youtubeUrl: optionalHttpUrl(app.youtubeUrl, 'YouTube'),
      termsUrl: optionalHttpUrl(app.termsUrl, 'Terms'),
      policiesUrl: optionalHttpUrl(app.policiesUrl, 'Policies'),
    },
    api: {
      corsOrigins,
      contentPublished: asBoolean(api.contentPublished, 'Published'),
    },
  };
}

function parseStory(
  body: unknown,
  options: {
    slug?: string;
    requireEmptyCollections?: boolean;
    creator?: Story['creator'];
    catalog?: SpotCatalogItem[];
  },
): Story {
  const record = asRecord(body, 'Story');
  const slug = options.slug ?? asSlug(record.slug, 'Story slug');
  const spots = options.requireEmptyCollections
    ? []
    : asSpotList(record.spots, options.catalog ?? []);
  const itineraries = options.requireEmptyCollections ? [] : [];
  return {
    slug,
    title: asText(record.title, 'Title'),
    summary: asText(record.summary, 'Summary'),
    coverUrl: asHttpUrl(record.coverUrl, 'Cover URL'),
    destination: parseDestination(record.destination),
    creator: options.creator ?? parseCreator(record.creator),
    spots,
    itineraries,
    blogs: [],
    archived: false,
  };
}

function asSpotList(value: unknown, catalog: SpotCatalogItem[]): Spot[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new BadRequestException('Spots must be a list');
  return value.map((item) => parseSpot(item, undefined, catalog));
}

function parseDestination(value: unknown): Destination {
  const record = asRecord(value, 'Destination');
  return {
    name: asText(record.name, 'Destination'),
    country: asText(record.country, 'Country'),
    lat: asCoord(record.lat, 'Latitude', -90, 90),
    lng: asCoord(record.lng, 'Longitude', -180, 180),
  };
}

function parseCreator(value: unknown): Creator {
  const record = asRecord(value, 'Creator');
  return {
    username: asSlug(record.username, 'Username'),
    displayName: asText(record.displayName, 'Display name'),
    bio: asText(record.bio, 'Bio'),
    avatarUrl: asHttpUrl(record.avatarUrl, 'Avatar URL'),
  };
}

function parseSpot(body: unknown, id: string | undefined, catalog: SpotCatalogItem[]): Spot {
  const record = asRecord(body, 'Spot');
  const type = asSlug(record.type, 'Spot category');
  const category = catalog.find((item) => item.slug === type);
  if (!category) throw new BadRequestException('Spot category is not recognised');
  const tags = asStringArray(record.tags, 'Tags');
  for (const tag of tags) {
    const owner = catalog.find((item) => item.kinds.includes(tag));
    if (owner && owner.slug !== category.slug) {
      throw new BadRequestException(`${tag} is not a kind of ${category.label}`);
    }
  }
  return {
    id: id ?? asSlug(record.id, 'Spot id'),
    type,
    title: asText(record.title, 'Spot title'),
    description: asText(record.description, 'Description'),
    images: asStringArray(record.images, 'Images').map((image) =>
      asHttpUrl(image, 'Image URL'),
    ),
    lat: asCoord(record.lat, 'Latitude', -90, 90),
    lng: asCoord(record.lng, 'Longitude', -180, 180),
    address: asText(record.address, 'Address'),
    avgMinutes: asNonNegative(record.avgMinutes, 'Time'),
    avgCostThb: asNonNegative(record.avgCostThb, 'Cost'),
    tags,
    archived: false,
  };
}

function parseCatalog(body: unknown): SpotCatalogItem[] {
  if (!Array.isArray(body) || body.length === 0) {
    throw new BadRequestException('Add at least one category');
  }
  const seen = new Set<string>();
  return body.map((item, index) => {
    const record = asRecord(item, `Category ${index + 1}`);
    const label = asText(record.label, `Category ${index + 1}`);
    const slug = asSlug(record.slug ?? slugify(label), `Category ${index + 1}`);
    if (seen.has(slug)) throw new BadRequestException(`${label} repeats a category`);
    seen.add(slug);
    const kinds = asStringArray(record.kinds, `${label} kinds`);
    const kindSeen = new Set<string>();
    for (const kind of kinds) {
      const name = kind.trim();
      if (!name) throw new BadRequestException(`${label} has an empty kind`);
      const key = name.toLowerCase();
      if (kindSeen.has(key)) throw new BadRequestException(`${name} is listed twice`);
      kindSeen.add(key);
    }
    return { slug, label, kinds: kinds.map((kind) => kind.trim()) };
  });
}

function slugify(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseItinerary(
  body: unknown,
  spots: Spot[],
  slug?: string,
): Itinerary {
  const record = asRecord(body, 'Itinerary');
  const days = record.days;
  if (!Array.isArray(days) || days.length === 0) {
    throw new BadRequestException('An itinerary needs at least one day');
  }
  const spotIds = new Set(spots.map((spot) => spot.id));
  return {
    slug: slug ?? asSlug(record.slug, 'Itinerary slug'),
    title: asText(record.title, 'Title'),
    summary: asText(record.summary, 'Summary'),
    coverUrl: asHttpUrl(record.coverUrl, 'Cover URL'),
    days: days.map((day, index) => parseDay(day, index, spotIds)),
    reservations: parseReservations(record.reservations, days.length, spotIds),
    archived: false,
  };
}

function parseDay(value: unknown, index: number, spotIds: Set<string>) {
  const record = asRecord(value, `Day ${index + 1}`);
  const blocks = record.blocks;
  if (!Array.isArray(blocks)) {
    throw new BadRequestException(`Day ${index + 1} needs a block list`);
  }
  const brief =
    typeof record.brief === 'string' && record.brief.trim()
      ? record.brief.trim()
      : undefined;
  return {
    title: asText(record.title, `Day ${index + 1} title`),
    ...(brief ? { brief } : {}),
    blocks: blocks.map((block) => parseBlock(block, spotIds)),
  };
}

function parseReservations(
  value: unknown,
  dayCount: number,
  spotIds: Set<string>,
): Reservation[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw new BadRequestException('Reservations must be a list');
  }
  return value.map((item, index) => parseReservation(item, index, dayCount, spotIds));
}

function parseReservation(
  value: unknown,
  index: number,
  dayCount: number,
  spotIds: Set<string>,
): Reservation {
  const record = asRecord(value, `Reservation ${index + 1}`);
  const type = parseReservationType(record.type);
  const fromDay = clampDay(asDayIndex(record.fromDay, `Reservation ${index + 1} from day`), dayCount);
  const toDay = Math.max(
    fromDay,
    clampDay(asDayIndex(record.toDay ?? record.fromDay, `Reservation ${index + 1} to day`), dayCount),
  );
  const spotId =
    typeof record.spotId === 'string' && record.spotId.trim()
      ? asSlug(record.spotId, `Reservation ${index + 1} find`)
      : undefined;
  if (spotId && !spotIds.has(spotId)) {
    throw new BadRequestException(`Reservation find ${spotId} is not on this story`);
  }
  const rentalKind = parseRentalKind(record.rentalKind);
  const estCostThb =
    record.estCostThb === undefined || record.estCostThb === null || record.estCostThb === ''
      ? undefined
      : asNonNegative(record.estCostThb, `Reservation ${index + 1} cost`);
  return {
    id:
      typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : `reservation-${index + 1}`,
    type,
    title: asText(record.title, `Reservation ${index + 1} title`),
    spotId,
    fromDay,
    toDay,
    fromPlace: optionalText(record.fromPlace),
    toPlace: optionalText(record.toPlace),
    rentalKind,
    estCostThb,
    link: optionalText(record.link),
    notes: optionalText(record.notes),
    airline: optionalText(record.airline),
    flightNumber: optionalText(record.flightNumber),
    timeOfDay: optionalText(record.timeOfDay),
  };
}

function parseReservationType(value: unknown): Reservation['type'] {
  if (value === 'stay' || value === 'rental' || value === 'flight' || value === 'experience') {
    return value;
  }
  if (value === 'hotel') return 'stay';
  if (value === 'car') return 'rental';
  throw new BadRequestException('Reservation type must be stay, rental, flight, or experience');
}

function parseRentalKind(value: unknown): Reservation['rentalKind'] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (value === 'car' || value === 'bike' || value === 'scooter') return value;
  throw new BadRequestException('Rental kind must be car, bike, or scooter');
}

function asDayIndex(value: unknown, label: string) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  }
  throw new BadRequestException(`${label} is required`);
}

function clampDay(value: number, dayCount: number) {
  if (dayCount <= 0) return 0;
  return Math.min(value, dayCount - 1);
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function parseBlock(value: unknown, spotIds: Set<string>): Block {
  const record = asRecord(value, 'Block');
  if (record.kind === 'note') {
    return { kind: 'note', body: asText(record.body, 'Note') };
  }
  if (record.kind === 'spot') {
    const spotId = asSlug(record.spotId, 'Spot');
    if (!spotIds.has(spotId)) {
      throw new BadRequestException(`Spot ${spotId} is not on this story`);
    }
    const commute = parseCommute(record.commute);
    return {
      kind: 'spot',
      spotId,
      body: asText(record.body, 'Spot note'),
      ...(commute ? { commute } : {}),
    };
  }
  throw new BadRequestException('A block is either a note or a spot');
}

function parseCommute(value: unknown): CommuteLeg | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const record = asRecord(value, 'Commute');
  const mode = record.mode;
  if (mode !== 'cab' && mode !== 'public' && mode !== 'self_drive' && mode !== 'flight') {
    throw new BadRequestException('Commute mode must be cab, public, self drive, or flight');
  }
  const minutes =
    record.minutes === undefined || record.minutes === null || record.minutes === ''
      ? undefined
      : asNonNegative(Number(record.minutes), 'Commute time');
  const costThb =
    record.costThb === undefined || record.costThb === null || record.costThb === ''
      ? undefined
      : asNonNegative(Number(record.costThb), 'Commute cost');
  const mapsMinutes =
    record.mapsMinutes === undefined || record.mapsMinutes === null || record.mapsMinutes === ''
      ? undefined
      : asNonNegative(Number(record.mapsMinutes), 'Maps time');
  const mapsDistanceM =
    record.mapsDistanceM === undefined ||
    record.mapsDistanceM === null ||
    record.mapsDistanceM === ''
      ? undefined
      : asNonNegative(Number(record.mapsDistanceM), 'Maps distance');
  const minutesSource = record.minutesSource;
  if (
    minutesSource !== undefined &&
    minutesSource !== null &&
    minutesSource !== '' &&
    minutesSource !== 'manual' &&
    minutesSource !== 'maps' &&
    minutesSource !== 'maps_overridden'
  ) {
    throw new BadRequestException('Commute minutes source is invalid');
  }
  return {
    mode,
    notes: optionalText(record.notes),
    minutes,
    costThb,
    mapsMinutes,
    mapsDistanceM,
    minutesSource:
      minutesSource === 'manual' || minutesSource === 'maps' || minutesSource === 'maps_overridden'
        ? minutesSource
        : undefined,
  };
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(`${label} is incomplete`);
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${label} is required`);
  }
  return value.trim();
}

function asSlug(value: unknown, label: string) {
  const text = asText(value, label);
  if (!slugPattern.test(text)) {
    throw new BadRequestException(`${label} must be a lowercase slug`);
  }
  return text;
}

function asBoolean(value: unknown, label: string) {
  if (typeof value !== 'boolean') {
    throw new BadRequestException(`${label} must be on or off`);
  }
  return value;
}

function asCountryCodes(value: unknown) {
  if (value == null) return [];
  const codes = asStringArray(value, 'Enabled countries').map((code) => code.toUpperCase());
  if (codes.some((code) => !isCountryCode(code))) {
    throw new BadRequestException('Choose countries from the list');
  }
  return [...new Set(codes)].slice(0, 80);
}

function asStringArray(value: unknown, label: string) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new BadRequestException(`${label} must be a list of text`);
  }
  return value.map((item) => item.trim()).filter((item) => item !== '');
}

function optionalCover(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  return asHttpUrl(value, 'Cover URL');
}

function optionalHttpUrl(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  return asHttpUrl(value, label);
}

function asHttpUrl(value: unknown, label: string) {
  const text = asText(value, label);
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BadRequestException(`${label} must be a URL`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new BadRequestException(`${label} must be an http URL`);
  }
  return text;
}

function asCoord(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
    throw new BadRequestException(`${label} is out of range`);
  }
  return value;
}

function asNonNegative(value: unknown, label: string) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < 0) {
    throw new BadRequestException(`${label} must be zero or more`);
  }
  return value;
}
