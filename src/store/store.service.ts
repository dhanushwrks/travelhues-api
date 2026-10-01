import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Block, CommuteLeg, Itinerary, Spot, Story } from '../content/content.types.js';
import type { Glimpse, GlimpseComment, GlimpseLike } from '../glimpses/glimpses.types.js';
import type { ContentMark } from '../marks/marks.types.js';
import type { CreatorInvite, Profile, WaitlistRequest } from '../people/people.types.js';
import type { Settings } from './store.types.js';
import { seedSpotCatalog, type SpotCatalogItem } from '../content/spot-catalog.js';

type StoreFile = {
  settings: Settings;
  stories: Story[];
  profiles: Profile[];
  waitlist: WaitlistRequest[];
  invites: CreatorInvite[];
  glimpses: Glimpse[];
  glimpseLikes: GlimpseLike[];
  glimpseComments: GlimpseComment[];
  contentMarks: ContentMark[];
};

export const brandLinkDefaults = {
  instagramUrl: 'https://www.instagram.com/travelhues',
  linkedinUrl: 'https://www.linkedin.com/company/travelhues',
  youtubeUrl: 'https://www.youtube.com/@travelhues',
  termsUrl: 'https://travelhues.com/terms',
  policiesUrl: 'https://travelhues.com/policies',
};

export function defaultSettings(): Settings {
  return {
    app: {
      name: 'Travelhues',
      tagline: 'Stories, spots, and the days between them.',
      publicUrl: 'http://localhost:3001',
      mapsEnabled: true,
      enabledCountries: ['TH'],
      ...brandLinkDefaults,
    },
    api: {
      corsOrigins: [
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
      ],
      contentPublished: true,
    },
  };
}

@Injectable()
export class StoreService implements OnModuleInit {
  private data: StoreFile = blankStore(defaultSettings(), []);
  private queue: Promise<void> = Promise.resolve();
  private ready: Promise<void> = Promise.resolve();
  private supabase: SupabaseClient | null = null;
  private databaseReady = false;
  private catalog: SpotCatalogItem[] = seedSpotCatalog;

  async onModuleInit() {
    this.ready = this.load();
    await this.ready;
  }

  getSettings(): Settings {
    return structuredClone(this.data.settings);
  }

  getStories(): Story[] {
    return structuredClone(this.data.stories);
  }

  getProfiles(): Profile[] {
    return structuredClone(this.data.profiles);
  }

  getWaitlist(): WaitlistRequest[] {
    return structuredClone(this.data.waitlist);
  }

  getInvites(): CreatorInvite[] {
    return structuredClone(this.data.invites);
  }

  getGlimpses(): Glimpse[] {
    return structuredClone(this.data.glimpses);
  }

  getGlimpseLikes(): GlimpseLike[] {
    return structuredClone(this.data.glimpseLikes);
  }

  getGlimpseComments(): GlimpseComment[] {
    return structuredClone(this.data.glimpseComments);
  }

  getMarks(): ContentMark[] {
    return structuredClone(this.data.contentMarks);
  }

  getCatalog(): SpotCatalogItem[] {
    return structuredClone(this.catalog);
  }

  async replaceCatalog(next: SpotCatalogItem[]): Promise<SpotCatalogItem[]> {
    await this.ready;
    const used = new Set(
      this.data.stories.flatMap((story) => story.spots.map((spot) => spot.type)),
    );
    for (const slug of used) {
      if (!next.some((item) => item.slug === slug)) {
        throw new Error(`Remove the spots that use ${slug} before deleting that category`);
      }
    }
    if (this.databaseReady) await this.writeCatalog(next);
    this.catalog = structuredClone(next);
    return this.getCatalog();
  }

  async update(mutator: (draft: StoreFile) => void): Promise<void> {
    await this.ready;
    const run = this.queue.then(async () => {
      mutator(this.data);
      await this.persist();
    });
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
  }

  private storePath() {
    return process.env.STORE_PATH ?? 'data/store.json';
  }

  private usesDatabase() {
    return this.databaseReady;
  }

  private async load() {
    if (
      !process.env.STORE_PATH &&
      process.env.SUPABASE_URL &&
      process.env.SUPABASE_SECRET_KEY
    ) {
      await this.loadDatabase();
      return;
    }
    await this.loadFile();
  }

  private async loadFile() {
    try {
      const raw = await readFile(this.storePath(), 'utf8');
      const parsed = JSON.parse(raw) as StoreFile;
      if (!parsed.settings?.app || !parsed.settings.api || !Array.isArray(parsed.stories)) {
        throw new Error('Store file is missing settings or stories');
      }
      this.data = {
        ...blankStore(normalizeSettings(parsed.settings), parsed.stories),
        profiles: parsed.profiles ?? [],
        waitlist: parsed.waitlist ?? [],
        invites: parsed.invites ?? [],
        glimpses: parsed.glimpses ?? [],
        glimpseLikes: parsed.glimpseLikes ?? [],
        glimpseComments: parsed.glimpseComments ?? [],
        contentMarks: parsed.contentMarks ?? [],
      };
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? error.code
          : undefined;
      if (code !== 'ENOENT') throw error;
      this.data = blankStore(defaultSettings(), []);
      await this.persist();
    }
  }

  private async loadDatabase() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error('Supabase is not configured');
    this.supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const settingsResult = await this.supabase
      .from('app_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle();
    if (settingsResult.error) {
      if (isMissingSchema(settingsResult.error.message)) {
        this.supabase = null;
        console.error(
          'Supabase is connected, but public.app_settings does not exist yet. Apply supabase/migrations/20260928124017_content_schema.sql, then restart the API. Using the local JSON store until then.',
        );
        await this.loadFile();
        return;
      }
      throw new Error(settingsResult.error.message);
    }
    this.databaseReady = true;
    if (!settingsResult.data) {
      this.data = blankStore(defaultSettings(), []);
      await this.persistDatabase();
      await this.loadPeopleFile();
      await this.loadCommunity();
      await this.loadCatalog();
      return;
    }
    this.data = blankStore(
      mapSettings(settingsResult.data as SettingsRow),
      await this.fetchStories(),
    );
    await this.loadPeopleFile();
    await this.loadCommunity();
    await this.loadCatalog();
  }

  private async loadCatalog() {
    if (!this.supabase) return;
    const categories = await this.supabase
      .from('spot_categories')
      .select('slug, label, position')
      .order('position');
    if (categories.error) {
      if (isMissingSchema(categories.error.message)) return;
      throw new Error(categories.error.message);
    }
    const kinds = await this.supabase
      .from('spot_kinds')
      .select('category_slug, label, position')
      .order('position');
    if (kinds.error) throw new Error(kinds.error.message);
    const rows = categories.data ?? [];
    if (rows.length === 0) {
      this.catalog = structuredClone(seedSpotCatalog);
      await this.writeCatalog(this.catalog);
      return;
    }
    const kindRows = kinds.data ?? [];
    this.catalog = rows.map((row) => ({
      slug: row.slug,
      label: row.label,
      kinds: kindRows
        .filter((kind) => kind.category_slug === row.slug)
        .map((kind) => kind.label),
    }));
  }

  private async writeCatalog(next: SpotCatalogItem[]) {
    if (!this.supabase) return;
    for (const [position, item] of next.entries()) {
      const saved = await this.supabase.from('spot_categories').upsert({
        slug: item.slug,
        label: item.label,
        position,
      });
      if (saved.error) throw new Error(saved.error.message);
    }
    const slugs = next.map((item) => item.slug);
    const cleared = await this.supabase
      .from('spot_kinds')
      .delete()
      .in('category_slug', slugs);
    if (cleared.error) throw new Error(cleared.error.message);
    const kindRows = next.flatMap((item) =>
      item.kinds.map((label, position) => ({
        category_slug: item.slug,
        label,
        position,
      })),
    );
    if (kindRows.length > 0) {
      const inserted = await this.supabase.from('spot_kinds').insert(kindRows);
      if (inserted.error) throw new Error(inserted.error.message);
    }
    const leftoverKinds = await this.supabase
      .from('spot_kinds')
      .delete()
      .not('category_slug', 'in', `(${slugs.join(',')})`);
    if (leftoverKinds.error) throw new Error(leftoverKinds.error.message);
    const removed = await this.supabase
      .from('spot_categories')
      .delete()
      .not('slug', 'in', `(${slugs.join(',')})`);
    if (removed.error) throw new Error(removed.error.message);
  }

  private async fetchStories(): Promise<Story[]> {
    if (!this.supabase) throw new Error('Supabase is not configured');
    const result = await this.supabase.from('stories').select(`
      slug, owner_id, title, summary, cover_url,
      destination_name, destination_country, destination_lat, destination_lng,
      creator_username, creator_display_name, creator_bio, creator_avatar_url, archived, deleted_at,
      spots (id, type, title, description, images, lat, lng, address, avg_minutes, avg_cost_thb, tags, archived, deleted_at, position),
      story_blogs (slug, title, body, cover_url, archived, deleted_at, position),
      itineraries (
        slug, title, summary, cover_url, archived, deleted_at, reservations, position,
        itinerary_days (
          position, title,
          itinerary_blocks (position, kind, body, spot_id, commute)
        )
      )
    `);
    if (result.error) throw new Error(result.error.message);
    return (result.data ?? []).map((row) => mapStory(row as StoryRow));
  }

  private async loadCommunity() {
    if (!this.supabase) return;
    const profiles = await this.supabase.from('profiles').select('*');
    if (profiles.error) {
      if (isMissingSchema(profiles.error.message)) return;
      throw new Error(profiles.error.message);
    }
    if ((profiles.data ?? []).length > 0) {
      this.data.profiles = (profiles.data ?? []).map((row) => mapProfile(row as ProfileRow));
    }
    const [waitlist, invites, glimpses, likes, comments, marks] = await Promise.all([
      this.supabase.from('waitlist').select('*'),
      this.supabase.from('creator_invites').select('*'),
      this.supabase.from('glimpses').select('*'),
      this.supabase.from('glimpse_likes').select('*'),
      this.supabase.from('glimpse_comments').select('*'),
      this.supabase.from('content_marks').select('*'),
    ]);
    for (const result of [waitlist, invites, glimpses, likes, comments, marks]) {
      if (result.error) {
        if (isMissingSchema(result.error.message)) return;
        throw new Error(result.error.message);
      }
    }
    if ((waitlist.data ?? []).length > 0) {
      this.data.waitlist = (waitlist.data ?? []).map((row) => mapWaitlist(row as WaitlistRow));
    }
    if ((invites.data ?? []).length > 0) {
      this.data.invites = (invites.data ?? []).map((row) => mapInvite(row as InviteRow));
    }
    if ((glimpses.data ?? []).length > 0) {
      this.data.glimpses = (glimpses.data ?? []).map((row) => mapGlimpse(row as GlimpseRow));
    }
    if ((likes.data ?? []).length > 0) {
      this.data.glimpseLikes = (likes.data ?? []).map((row) => ({
        glimpseId: (row as LikeRow).glimpse_id,
        userId: (row as LikeRow).user_id,
      }));
    }
    if ((comments.data ?? []).length > 0) {
      this.data.glimpseComments = (comments.data ?? []).map((row) => mapComment(row as CommentRow));
    }
    if ((marks.data ?? []).length > 0) {
      this.data.contentMarks = (marks.data ?? []).map((row) => mapMark(row as MarkRow));
    }
  }

  private async persist() {
    if (this.usesDatabase()) {
      await this.persistDatabase();
      await this.persistPeopleFile();
      return;
    }
    await this.persistFile();
  }

  private peoplePath() {
    return 'data/people.json';
  }

  private async loadPeopleFile() {
    try {
      const raw = await readFile(this.peoplePath(), 'utf8');
      const parsed = JSON.parse(raw) as Partial<
        Pick<StoreFile, 'profiles' | 'waitlist' | 'invites'>
      >;
      this.data.profiles = parsed.profiles ?? [];
      this.data.waitlist = parsed.waitlist ?? [];
      this.data.invites = parsed.invites ?? [];
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (code !== 'ENOENT') throw error;
    }
  }

  private async persistPeopleFile() {
    const path = this.peoplePath();
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(
      tmp,
      `${JSON.stringify(
        {
          profiles: this.data.profiles,
          waitlist: this.data.waitlist,
          invites: this.data.invites,
        },
        null,
        2,
      )}\n`,
    );
    await rename(tmp, path);
  }

  private async persistDatabase() {
    if (!this.supabase) throw new Error('Supabase is not configured');
    const result = await this.supabase.rpc('save_content', { payload: this.data });
    if (result.error) throw new Error(result.error.message);
    await this.persistBrandLinks();
    await this.persistIntroVideos();
    await this.persistStoryArchived();
    await this.persistItineraryReservations();
    await this.persistItineraryBlockCommutes();
  }

  private async persistStoryArchived() {
    if (!this.supabase) return;
    for (const story of this.data.stories) {
      const result = await this.supabase
        .from('stories')
        .update({ archived: story.archived ?? false })
        .eq('slug', story.slug);
      if (result.error && !isMissingSchema(result.error.message)) {
        throw new Error(result.error.message);
      }
    }
  }

  private async persistItineraryReservations() {
    if (!this.supabase) return;
    for (const story of this.data.stories) {
      for (const itinerary of story.itineraries) {
        const result = await this.supabase
          .from('itineraries')
          .update({ reservations: itinerary.reservations ?? [] })
          .eq('story_slug', story.slug)
          .eq('slug', itinerary.slug);
        if (result.error && !isMissingSchema(result.error.message)) {
          throw new Error(result.error.message);
        }
      }
    }
  }

  private async persistItineraryBlockCommutes() {
    if (!this.supabase) return;
    for (const story of this.data.stories) {
      for (const itinerary of story.itineraries) {
        for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex += 1) {
          const day = itinerary.days[dayIndex];
          const dayLookup = await this.supabase
            .from('itinerary_days')
            .select('id')
            .eq('story_slug', story.slug)
            .eq('itinerary_slug', itinerary.slug)
            .eq('position', dayIndex)
            .maybeSingle();
          if (dayLookup.error && !isMissingSchema(dayLookup.error.message)) {
            throw new Error(dayLookup.error.message);
          }
          const dayId = dayLookup.data?.id;
          if (!dayId) continue;
          for (let blockIndex = 0; blockIndex < day.blocks.length; blockIndex += 1) {
            const block = day.blocks[blockIndex];
            if (block.kind !== 'spot') continue;
            const result = await this.supabase
              .from('itinerary_blocks')
              .update({ commute: block.commute ?? null })
              .eq('day_id', dayId)
              .eq('position', blockIndex);
            if (result.error && !isMissingSchema(result.error.message)) {
              throw new Error(result.error.message);
            }
          }
        }
      }
    }
  }

  private async persistIntroVideos() {
    if (!this.supabase) return;
    for (const profile of this.data.profiles) {
      const result = await this.supabase
        .from('profiles')
        .update({ intro_video_url: profile.introVideoUrl ?? '' })
        .eq('id', profile.id);
      if (result.error && !isMissingSchema(result.error.message)) {
        throw new Error(result.error.message);
      }
    }
  }

  private async persistBrandLinks() {
    if (!this.supabase) return;
    const app = this.data.settings.app;
    const result = await this.supabase
      .from('app_settings')
      .update({
        instagram_url: app.instagramUrl,
        linkedin_url: app.linkedinUrl,
        youtube_url: app.youtubeUrl,
        terms_url: app.termsUrl,
        policies_url: app.policiesUrl,
      })
      .eq('id', 1);
    if (result.error && !isMissingSchema(result.error.message)) {
      throw new Error(result.error.message);
    }
  }

  private async persistFile() {
    const path = this.storePath();
    await mkdir(dirname(path), { recursive: true });
    const tmp = `${path}.tmp`;
    await writeFile(tmp, `${JSON.stringify(this.data, null, 2)}\n`);
    await rename(tmp, path);
  }
}

type SettingsRow = {
  name: string;
  tagline: string;
  public_url: string;
  maps_enabled: boolean;
  enabled_countries: string[] | null;
  cors_origins: string[] | null;
  content_published: boolean;
  instagram_url?: string | null;
  linkedin_url?: string | null;
  youtube_url?: string | null;
  terms_url?: string | null;
  policies_url?: string | null;
};

type BlockRow = {
  position: number;
  kind: string;
  body: string;
  spot_id: string | null;
  commute?: unknown;
};

type DayRow = {
  position: number;
  title: string;
  itinerary_blocks: BlockRow[] | null;
};

type ItineraryRow = {
  slug: string;
  title: string;
  summary: string;
  cover_url: string;
  archived?: boolean | null;
  deleted_at?: string | null;
  reservations?: unknown;
  position: number;
  itinerary_days: DayRow[] | null;
};

type SpotRow = {
  id: string;
  type: Spot['type'];
  title: string;
  description: string;
  images: string[] | null;
  lat: number;
  lng: number;
  address: string;
  avg_minutes: number;
  avg_cost_thb: number;
  tags: string[] | null;
  archived?: boolean | null;
  deleted_at?: string | null;
  position: number;
};

type StoryRow = {
  slug: string;
  owner_id: string | null;
  title: string;
  summary: string;
  cover_url: string;
  destination_name: string;
  destination_country: string;
  destination_lat: number;
  destination_lng: number;
  creator_username: string;
  creator_display_name: string;
  creator_bio: string;
  creator_avatar_url: string;
  archived?: boolean | null;
  deleted_at?: string | null;
  spots: SpotRow[] | null;
  itineraries: ItineraryRow[] | null;
  story_blogs: BlogRow[] | null;
};

type BlogRow = {
  slug: string;
  title: string;
  body: string;
  cover_url?: string | null;
  archived?: boolean | null;
  deleted_at?: string | null;
  position: number;
};

function blankStore(settings: Settings, stories: Story[]): StoreFile {
  return {
    settings: normalizeSettings(settings),
    stories,
    profiles: [],
    waitlist: [],
    invites: [],
    glimpses: [],
    glimpseLikes: [],
    glimpseComments: [],
    contentMarks: [],
  };
}

function normalizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    app: {
      ...settings.app,
      enabledCountries: settings.app.enabledCountries ?? ['TH'],
      instagramUrl: brandUrl(settings.app.instagramUrl, brandLinkDefaults.instagramUrl),
      linkedinUrl: brandUrl(settings.app.linkedinUrl, brandLinkDefaults.linkedinUrl),
      youtubeUrl: brandUrl(settings.app.youtubeUrl, brandLinkDefaults.youtubeUrl),
      termsUrl: brandUrl(settings.app.termsUrl, brandLinkDefaults.termsUrl),
      policiesUrl: brandUrl(settings.app.policiesUrl, brandLinkDefaults.policiesUrl),
    },
  };
}

function brandUrl(value: string | null | undefined, fallback: string) {
  if (value == null) return fallback;
  return value.trim();
}

function mapSettings(row: SettingsRow): Settings {
  return {
    app: {
      name: row.name,
      tagline: row.tagline,
      publicUrl: row.public_url,
      mapsEnabled: row.maps_enabled,
      enabledCountries: row.enabled_countries ?? ['TH'],
      instagramUrl: brandUrl(row.instagram_url, brandLinkDefaults.instagramUrl),
      linkedinUrl: brandUrl(row.linkedin_url, brandLinkDefaults.linkedinUrl),
      youtubeUrl: brandUrl(row.youtube_url, brandLinkDefaults.youtubeUrl),
      termsUrl: brandUrl(row.terms_url, brandLinkDefaults.termsUrl),
      policiesUrl: brandUrl(row.policies_url, brandLinkDefaults.policiesUrl),
    },
    api: {
      corsOrigins: row.cors_origins ?? [],
      contentPublished: row.content_published,
    },
  };
}

function mapStory(row: StoryRow): Story {
  return {
    slug: row.slug,
    ownerId: row.owner_id ?? undefined,
    title: row.title,
    summary: row.summary,
    coverUrl: row.cover_url,
    destination: {
      name: row.destination_name,
      country: row.destination_country,
      lat: row.destination_lat,
      lng: row.destination_lng,
    },
    creator: {
      username: row.creator_username,
      displayName: row.creator_display_name,
      bio: row.creator_bio,
      avatarUrl: row.creator_avatar_url,
    },
    spots: byPosition(row.spots ?? []).map(mapSpot),
    itineraries: byPosition(row.itineraries ?? []).map(mapItinerary),
    blogs: byPosition(row.story_blogs ?? []).map((blog) => ({
      slug: blog.slug,
      title: blog.title,
      body: blog.body,
      coverUrl: blog.cover_url ?? '',
      archived: blog.archived ?? false,
      deletedAt: rowTime(blog.deleted_at),
    })),
    archived: row.archived ?? false,
    deletedAt: rowTime(row.deleted_at),
  };
}

function mapSpot(row: SpotRow): Spot {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    images: row.images ?? [],
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    avgMinutes: row.avg_minutes,
    avgCostThb: row.avg_cost_thb,
    tags: row.tags ?? [],
    archived: row.archived ?? false,
    deletedAt: rowTime(row.deleted_at),
  };
}

function mapItinerary(row: ItineraryRow): Itinerary {
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    coverUrl: row.cover_url,
    archived: row.archived ?? false,
    deletedAt: rowTime(row.deleted_at),
    reservations: mapReservations(row.reservations),
    days: byPosition(row.itinerary_days ?? []).map((day) => ({
      title: day.title,
      blocks: byPosition(day.itinerary_blocks ?? []).map(mapBlock),
    })),
  };
}

function mapReservations(value: unknown): Itinerary['reservations'] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const type = row.type;
    if (type !== 'stay' && type !== 'rental' && type !== 'flight' && type !== 'experience') {
      return [];
    }
    if (typeof row.id !== 'string' || !row.id.trim()) return [];
    if (typeof row.title !== 'string' || !row.title.trim()) return [];
    const fromDay = typeof row.fromDay === 'number' && row.fromDay >= 0 ? Math.floor(row.fromDay) : 0;
    const toDayRaw = typeof row.toDay === 'number' && row.toDay >= 0 ? Math.floor(row.toDay) : fromDay;
    return [
      {
        id: row.id.trim(),
        type,
        title: row.title.trim(),
        spotId: typeof row.spotId === 'string' && row.spotId.trim() ? row.spotId.trim() : undefined,
        fromDay,
        toDay: Math.max(fromDay, toDayRaw),
        fromPlace: typeof row.fromPlace === 'string' ? row.fromPlace : undefined,
        toPlace: typeof row.toPlace === 'string' ? row.toPlace : undefined,
        rentalKind:
          row.rentalKind === 'car' || row.rentalKind === 'bike' || row.rentalKind === 'scooter'
            ? row.rentalKind
            : undefined,
        estCostThb: typeof row.estCostThb === 'number' ? row.estCostThb : undefined,
        link: typeof row.link === 'string' ? row.link : undefined,
        notes: typeof row.notes === 'string' ? row.notes : undefined,
        airline: typeof row.airline === 'string' ? row.airline : undefined,
        flightNumber: typeof row.flightNumber === 'string' ? row.flightNumber : undefined,
        timeOfDay: typeof row.timeOfDay === 'string' ? row.timeOfDay : undefined,
      },
    ];
  });
}

function mapBlock(row: BlockRow): Block {
  if (row.kind === 'spot') {
    const commute = mapCommute(row.commute);
    return {
      kind: 'spot',
      spotId: row.spot_id ?? '',
      body: row.body,
      ...(commute ? { commute } : {}),
    };
  }
  return { kind: 'note', body: row.body };
}

function mapCommute(value: unknown): CommuteLeg | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  const mode = row.mode;
  if (mode !== 'cab' && mode !== 'public' && mode !== 'self_drive' && mode !== 'flight') {
    return undefined;
  }
  return {
    mode,
    notes: typeof row.notes === 'string' ? row.notes : undefined,
    minutes: typeof row.minutes === 'number' ? row.minutes : undefined,
    costThb: typeof row.costThb === 'number' ? row.costThb : undefined,
    mapsMinutes: typeof row.mapsMinutes === 'number' ? row.mapsMinutes : undefined,
    mapsDistanceM: typeof row.mapsDistanceM === 'number' ? row.mapsDistanceM : undefined,
    minutesSource:
      row.minutesSource === 'manual' ||
      row.minutesSource === 'maps' ||
      row.minutesSource === 'maps_overridden'
        ? row.minutesSource
        : undefined,
  };
}

function isMissingSchema(message: string) {
  return (
    message.includes('app_settings') ||
    message.includes('schema cache') ||
    message.includes('does not exist')
  );
}

type ProfileRow = {
  id: string;
  role: Profile['role'];
  email: string | null;
  username: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  date_of_birth: string | null;
  country: string | null;
  hobbies: string[] | null;
  countries_traveled: string[] | null;
  socials: Profile['socials'] | null;
  avatar_url: string | null;
  cover_url: string | null;
  intro_video_url?: string | null;
  hidden: boolean | null;
  disabled?: boolean | null;
  deleted_at?: string | null;
  has_password?: boolean | null;
  username_changed_at?: string | null;
};

type WaitlistRow = {
  id: string;
  status: WaitlistRequest['status'];
  created_at: string;
  name: string;
  country: string;
  date_of_birth: string | null;
  socials: WaitlistRequest['socials'] | null;
  handle: string;
  bio: string | null;
  hobbies: string[] | null;
  countries_traveled: string[] | null;
};

type InviteRow = {
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  waitlist_id: string | null;
};

type GlimpseRow = {
  id: string;
  creator_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  caption: string;
  video_url: string;
  poster_url: string | null;
  country: string;
  created_at: string;
  link_kind: 'story' | 'itinerary' | 'spot' | null;
  link_story_slug: string | null;
  link_itinerary_slug: string | null;
  link_spot_id: string | null;
  link_label: string | null;
  deleted_at?: string | null;
};

type LikeRow = { glimpse_id: string; user_id: string };
type CommentRow = {
  id: string;
  glimpse_id: string;
  user_id: string;
  username: string;
  display_name: string;
  body: string;
  created_at: string;
};
type MarkRow = {
  user_id: string;
  action: ContentMark['action'];
  kind: ContentMark['kind'];
  story_slug: string;
  itinerary_slug: string;
  spot_id: string;
};

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: row.role,
    email: row.email ?? '',
    username: row.username,
    displayName: row.display_name,
    headline: row.headline ?? '',
    bio: row.bio ?? '',
    dateOfBirth: row.date_of_birth ?? '',
    country: row.country ?? '',
    hobbies: row.hobbies ?? [],
    countriesTraveled: row.countries_traveled ?? [],
    socials: row.socials ?? [],
    avatarUrl: row.avatar_url ?? '',
    coverUrl: row.cover_url ?? '',
    introVideoUrl: row.intro_video_url ?? '',
    hidden: row.hidden ?? false,
    disabled: row.disabled ?? false,
    deletedAt: rowTime(row.deleted_at),
    hasPassword: typeof row.has_password === 'boolean' ? row.has_password : false,
    usernameChangedAt:
      row.username_changed_at === undefined
        ? undefined
        : row.username_changed_at
          ? row.username_changed_at
          : null,
  } as Profile;
}

function mapWaitlist(row: WaitlistRow): WaitlistRequest {
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    name: row.name,
    country: row.country,
    dateOfBirth: row.date_of_birth ?? '',
    socials: row.socials ?? [],
    handle: row.handle,
    bio: row.bio ?? '',
    hobbies: row.hobbies ?? [],
    countriesTraveled: row.countries_traveled ?? [],
  };
}

function mapInvite(row: InviteRow): CreatorInvite {
  return {
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    waitlistId: row.waitlist_id,
  };
}

function mapGlimpse(row: GlimpseRow): Glimpse {
  return {
    id: row.id,
    creatorId: row.creator_id,
    username: row.username,
    displayName: row.display_name,
    avatarUrl: row.avatar_url ?? '',
    caption: row.caption,
    videoUrl: row.video_url,
    posterUrl: row.poster_url ?? '',
    country: row.country,
    createdAt: row.created_at,
    link: row.link_kind
      ? {
          kind: row.link_kind,
          storySlug: row.link_story_slug ?? '',
          itinerarySlug: row.link_itinerary_slug ?? undefined,
          spotId: row.link_spot_id ?? undefined,
          label: row.link_label ?? '',
        }
      : null,
    deletedAt: rowTime(row.deleted_at),
  };
}

function rowTime(value: string | null | undefined) {
  return value ? value : null;
}

function mapComment(row: CommentRow): GlimpseComment {
  return {
    id: row.id,
    glimpseId: row.glimpse_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    body: row.body,
    createdAt: row.created_at,
  };
}

function mapMark(row: MarkRow): ContentMark {
  return {
    userId: row.user_id,
    action: row.action,
    kind: row.kind,
    storySlug: row.story_slug,
    itinerarySlug: row.itinerary_slug,
    spotId: row.spot_id,
  };
}

function byPosition<T extends { position: number }>(items: T[]) {
  return [...items].sort((left, right) => left.position - right.position);
}
