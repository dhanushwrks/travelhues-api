import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthUser } from '../auth/auth.user.js';
import { AuthService } from '../auth/auth.service.js';
import { publicStory, entitlementSet } from '../content/public-story.js';
import { StoreService } from '../store/store.service.js';
import {
  parseInviteAccount,
  parsePasswordChange,
  parseProfilePatch,
  parseUsernameQuery,
  parseWaitlist,
} from './people.parse.js';
import type {
  CreatorInvite,
  Profile,
  ProfileDraft,
  WaitlistRequest,
} from './people.types.js';

@Injectable()
export class PeopleService {
  constructor(
    private readonly store: StoreService,
    private readonly auth: AuthService,
  ) {}

  async submitWaitlist(body: unknown) {
    const input = parseWaitlist(body);
    const id = randomBytes(12).toString('hex');
    const request: WaitlistRequest = {
      id,
      status: 'pending',
      createdAt: new Date().toISOString(),
      name: input.name,
      country: input.country,
      dateOfBirth: input.dateOfBirth,
      socials: input.socials,
      handle: input.username,
      bio: input.bio,
      hobbies: input.hobbies,
      countriesTraveled: input.countriesTraveled,
    };
    await this.store.update((draft) => {
      if (handleTaken(draft, request.handle)) {
        throw new ConflictException('That handle is already in use');
      }
      draft.waitlist.push(request);
    });
    return { id, status: 'pending' as const };
  }

  waitlist() {
    return [...this.store.getWaitlist()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async setWaitlistStatus(id: string, body: unknown) {
    const status = readStatus(body);
    let updated: WaitlistRequest | undefined;
    await this.store.update((draft) => {
      const request = draft.waitlist.find((item) => item.id === id);
      if (!request) throw new NotFoundException('That request was not found');
      if (status === 'accepted' && handleTaken(draft, request.handle, undefined, id)) {
        throw new ConflictException('That handle is already in use');
      }
      request.status = status;
      updated = structuredClone(request);
    });
    return updated;
  }

  invites() {
    return [...this.store.getInvites()]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .map((invite) => ({ ...invite, url: this.inviteUrl(invite.token) }));
  }

  async createInvite(body: unknown) {
    const record = asObject(body);
    const days = record.expiresInDays;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 30) {
      throw new BadRequestException('Choose an expiry between 1 and 30 days');
    }
    const waitlistId =
      typeof record.waitlistId === 'string' && record.waitlistId
        ? record.waitlistId
        : null;
    const token = randomBytes(18).toString('base64url');
    const now = new Date();
    const invite: CreatorInvite = {
      token,
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString(),
      usedAt: null,
      waitlistId,
    };
    await this.store.update((draft) => {
      if (waitlistId) {
        const request = draft.waitlist.find((item) => item.id === waitlistId);
        if (!request) throw new NotFoundException('That request was not found');
        if (request.status !== 'accepted') {
          throw new BadRequestException('Accept the request before creating a link');
        }
      }
      draft.invites.push(invite);
    });
    return { ...invite, url: this.inviteUrl(token) };
  }

  async revokeInvite(token: string) {
    await this.store.update((draft) => {
      const invite = draft.invites.find((item) => item.token === token);
      if (!invite) throw new NotFoundException('That link was not found');
      if (invite.usedAt) throw new BadRequestException('That link has already been used');
      draft.invites = draft.invites.filter((item) => item.token !== token);
    });
  }

  previewInvite(token: string) {
    const invite = this.requireOpenInvite(token);
    const request = invite.waitlistId
      ? this.store.getWaitlist().find((item) => item.id === invite.waitlistId)
      : undefined;
    return {
      expiresAt: invite.expiresAt,
      prefill: request
        ? {
            name: request.name,
            country: request.country,
            dateOfBirth: request.dateOfBirth,
            socials: request.socials,
            handle: request.handle,
            bio: request.bio,
            hobbies: request.hobbies,
            countriesTraveled: request.countriesTraveled,
          }
        : null,
    };
  }

  async redeemInvite(token: string, body: unknown) {
    const input = parseInviteAccount(body);
    this.requireOpenInvite(token);
    const avatarUrl = input.avatarDataUrl ? await this.saveImage(input.avatarDataUrl) : '';
    const coverUrl = input.coverDataUrl ? await this.saveImage(input.coverDataUrl) : '';
    await this.store.update((draft) => {
      const current = draft.invites.find((item) => item.token === token);
      if (!current || current.usedAt || Date.parse(current.expiresAt) <= Date.now()) {
        throw new GoneException('This link is no longer valid');
      }
      if (handleTaken(draft, input.username, undefined, current.waitlistId ?? undefined)) {
        throw new ConflictException('That handle is already in use');
      }
    });
    const session = await this.auth.createAccount({
      email: input.email,
      password: input.password,
      username: input.username,
      displayName: input.displayName,
      role: 'tcc',
    });
    await this.store.update((draft) => {
      const current = draft.invites.find((item) => item.token === token);
      if (!current || current.usedAt) throw new GoneException('This link is no longer valid');
      if (handleTaken(draft, input.username, undefined, current.waitlistId ?? undefined)) {
        throw new ConflictException('That handle is already in use');
      }
      draft.profiles.push(
        profileFromDraft(session.user.id, 'tcc', input.email, input, {
          avatarUrl,
          coverUrl,
        }),
      );
      current.usedAt = new Date().toISOString();
    });
    return session;
  }

  async ensureProfile(user: AuthUser) {
    if (this.store.getProfiles().some((item) => item.id === user.id)) return;
    await this.store.update((draft) => {
      if (draft.profiles.some((item) => item.id === user.id)) return;
      const profile = blankProfile(user);
      if (handleTaken(draft, profile.username)) {
        profile.username = `user-${user.id.slice(0, 8)}`;
      }
      draft.profiles.push(profile);
    });
  }

  async me(user: AuthUser) {
    const profile = this.store.getProfiles().find((item) => item.id === user.id);
    if (!profile) throw new NotFoundException('Profile was not found');
    normalizeProfileInPlace(profile);
    const hasPassword = await this.resolveHasPassword(profile, user.id);
    if (hasPassword !== profile.hasPassword) {
      await this.store.update((draft) => {
        const current = draft.profiles.find((item) => item.id === user.id);
        if (current) current.hasPassword = hasPassword;
      });
    }
    return this.present({ ...profile, hasPassword }, true, user.id);
  }

  async updateMe(user: AuthUser, body: unknown) {
    const patch = parseProfilePatch(body);
    const avatarUrl = patch.avatarDataUrl ? await this.saveImage(patch.avatarDataUrl) : undefined;
    const coverUrl = patch.coverDataUrl ? await this.saveImage(patch.coverDataUrl) : undefined;
    const introFromData =
      patch.introVideoDataUrl && patch.introVideoDataUrl !== ''
        ? await this.saveVideo(patch.introVideoDataUrl)
        : undefined;
    let next: Profile | undefined;
    await this.store.update((draft) => {
      const profile = draft.profiles.find((item) => item.id === user.id);
      if (!profile) throw new NotFoundException('Profile was not found');
      normalizeProfileInPlace(profile);
      if (patch.username && patch.username !== profile.username) {
        const canChange =
          profile.role === 'tcc' || profile.usernameChangedAt === null;
        if (!canChange) {
          throw new BadRequestException('Username can only be changed once');
        }
        if (handleTaken(draft, patch.username, profile.id)) {
          throw new ConflictException('That handle is already in use');
        }
        profile.username = patch.username;
        if (profile.role !== 'tcc') {
          profile.usernameChangedAt = new Date().toISOString();
        }
      }
      if (patch.displayName !== undefined) profile.displayName = patch.displayName;
      if (patch.headline !== undefined) profile.headline = patch.headline;
      if (patch.bio !== undefined) profile.bio = patch.bio;
      if (patch.dateOfBirth !== undefined) profile.dateOfBirth = patch.dateOfBirth;
      if (patch.country !== undefined) profile.country = patch.country;
      if (patch.homeAirport !== undefined) profile.homeAirport = patch.homeAirport;
      if (patch.hobbies !== undefined) profile.hobbies = patch.hobbies;
      if (patch.countriesTraveled !== undefined) {
        profile.countriesTraveled = patch.countriesTraveled;
      }
      if (patch.socials !== undefined) profile.socials = patch.socials;
      if (patch.hidden !== undefined) profile.hidden = patch.hidden;
      if (patch.avatarDataUrl === '') profile.avatarUrl = '';
      else if (avatarUrl !== undefined) profile.avatarUrl = avatarUrl;
      if (patch.coverDataUrl === '') profile.coverUrl = '';
      else if (coverUrl !== undefined) profile.coverUrl = coverUrl;
      if (profile.role === 'tcc') {
        if (patch.introVideoUrl === '') profile.introVideoUrl = '';
        else if (introFromData !== undefined) profile.introVideoUrl = introFromData;
        else if (patch.introVideoUrl !== undefined) profile.introVideoUrl = patch.introVideoUrl;
      } else if (patch.introVideoUrl !== undefined || patch.introVideoDataUrl !== undefined) {
        throw new BadRequestException('Only a creator can set an introduction video');
      }
      if (profile.role === 'tcc') requireCreatorBasics(profile);
      for (const story of draft.stories) {
        const owned = story.ownerId === profile.id || story.creator.username === profile.username;
        if (!owned) continue;
        story.creator = {
          username: profile.username,
          displayName: profile.displayName,
          bio: profile.bio,
          avatarUrl: profile.avatarUrl,
        };
      }
      next = structuredClone(profile);
    });
    if (!next) throw new NotFoundException('Profile was not found');
    if (patch.homeAirport !== undefined) {
      await this.store.patchProfileHomeAirport(user.id, patch.homeAirport);
    }
    await this.auth.syncProfile(user.id, next.username, next.displayName);
    return this.present(next, true, user.id);
  }

  async changePassword(user: AuthUser, body: unknown) {
    const profile = this.store.getProfiles().find((item) => item.id === user.id);
    if (!profile) throw new NotFoundException('Profile was not found');
    normalizeProfileInPlace(profile);
    const hasPassword = await this.resolveHasPassword(profile, user.id);
    const input = parsePasswordChange(body, { requireCurrent: hasPassword });
    if (hasPassword) {
      if (!input.currentPassword) {
        throw new BadRequestException('Current password is required');
      }
      await this.auth.checkPassword(user.email, input.currentPassword);
    }
    await this.auth.updatePassword(user.id, input.password);
    await this.store.update((draft) => {
      const current = draft.profiles.find((item) => item.id === user.id);
      if (!current) throw new NotFoundException('Profile was not found');
      current.hasPassword = true;
    });
    return { updated: true, hasPassword: true };
  }

  usernameAvailable(user: AuthUser, handle: string) {
    const username = parseUsernameQuery(handle);
    const profiles = this.store.getProfiles();
    const self = profiles.find((item) => item.id === user.id);
    if (self && self.username === username) {
      return { available: true, username };
    }
    const draft = {
      profiles,
      waitlist: this.store.getWaitlist(),
      invites: this.store.getInvites(),
    };
    if (handleTaken(draft, username, user.id)) {
      return { available: false, username };
    }
    return { available: true, username };
  }

  private async resolveHasPassword(profile: Profile, userId: string) {
    if (profile.hasPassword) return true;
    const providers = await this.auth.authProviders(userId);
    if (providers.includes('email')) return true;
    return false;
  }

  async disableMe(user: AuthUser) {
    await this.store.update((draft) => {
      const profile = draft.profiles.find((item) => item.id === user.id);
      if (!profile) throw new NotFoundException('Profile was not found');
      if (profile.deletedAt) throw new ForbiddenException('This account has been deleted');
      profile.disabled = true;
    });
    return { disabled: true };
  }

  async deleteMe(user: AuthUser) {
    const deletedAt = new Date().toISOString();
    await this.store.update((draft) => {
      const profile = draft.profiles.find((item) => item.id === user.id);
      if (!profile) throw new NotFoundException('Profile was not found');
      profile.deletedAt = deletedAt;
      profile.disabled = false;
      for (const story of draft.stories) {
        const owned = story.ownerId === user.id || story.creator.username === profile.username;
        if (!owned) continue;
        story.deletedAt = deletedAt;
        for (const spot of story.spots) spot.deletedAt = deletedAt;
        for (const blog of story.blogs ?? []) blog.deletedAt = deletedAt;
        for (const plan of story.itineraries) plan.deletedAt = deletedAt;
      }
      for (const glimpse of draft.glimpses) {
        if (glimpse.creatorId === user.id || glimpse.username === profile.username) {
          glimpse.deletedAt = deletedAt;
        }
      }
    });
  }

  publicProfile(username: string, viewer?: AuthUser | null) {
    const profile = this.store.getProfiles().find((item) => item.username === username);
    if (profile) {
      if (profile.role !== 'tcc') throw new NotFoundException('Profile was not found');
      if (profile.deletedAt || profile.disabled) throw new NotFoundException('Profile was not found');
      if (profile.hidden && profile.id !== viewer?.id) {
        throw new NotFoundException('Profile was not found');
      }
      return this.present(profile, Boolean(viewer && profile.id === viewer.id), viewer?.id);
    }
    const stories = this.storiesFor(username, undefined);
    const story = stories[0];
    if (!story) throw new NotFoundException('Profile was not found');
    return this.present(
      {
        id: '',
        role: 'tcc',
        email: '',
        username: story.creator.username,
        displayName: story.creator.displayName,
        headline: '',
        bio: story.creator.bio,
        dateOfBirth: '',
        country: '',
        homeAirport: '',
        hobbies: [],
        countriesTraveled: [],
        socials: [],
        avatarUrl: story.creator.avatarUrl,
        coverUrl: story.coverUrl,
        introVideoUrl: '',
        hidden: false,
        disabled: false,
        deletedAt: null,
        hasPassword: true,
        usernameChangedAt: null,
      },
      false,
      viewer?.id,
    );
  }

  private present(profile: Profile, includePrivate: boolean, viewerId?: string) {
    const stories = this.storiesFor(profile.username, profile.id).filter(
      (story) => includePrivate || !story.archived,
    );
    const entitlements = viewerId
      ? entitlementSet(
          this.store
            .getPurchases()
            .filter((item) => item.buyerId === viewerId)
            .map((item) => ({
              storySlug: item.storySlug,
              kind: item.kind,
              itemId: item.itemId,
            })),
        )
      : new Set<string>();
    const visible = stories.map((story) =>
      publicStory(story, { viewerId, entitlements }),
    );
    const spots = visible.reduce((total, story) => total + story.spots.length, 0);
    const itineraries = visible.reduce((total, story) => total + story.itineraries.length, 0);
    const normalized = normalizeProfile(profile);
    return {
      id: includePrivate ? normalized.id : undefined,
      email: includePrivate ? normalized.email : undefined,
      dateOfBirth: includePrivate ? normalized.dateOfBirth : undefined,
      username: normalized.username,
      displayName: normalized.displayName,
      headline: normalized.headline,
      bio: normalized.bio,
      country: normalized.country,
      homeAirport: normalized.homeAirport ?? '',
      countriesTraveled: normalized.countriesTraveled,
      hobbies: normalized.hobbies,
      socials: normalized.socials,
      avatarUrl: normalized.avatarUrl,
      coverUrl: normalized.coverUrl,
      introVideoUrl: normalized.introVideoUrl,
      role: normalized.role,
      hidden: normalized.hidden,
      hasPassword: includePrivate ? normalized.hasPassword : undefined,
      canChangeUsername: includePrivate
        ? normalized.role === 'tcc' || normalized.usernameChangedAt === null
        : undefined,
      counts: {
        stories: stories.length,
        spots,
        itineraries,
      },
      stories: visible,
    };
  }

  private storiesFor(username: string, id: string | undefined) {
    return this.store
      .getStories()
      .filter(
        (story) =>
          !story.deletedAt &&
          (story.creator.username === username || (id !== undefined && id !== '' && story.ownerId === id)),
      );
  }

  private requireOpenInvite(token: string) {
    const invite = this.store.getInvites().find((item) => item.token === token);
    if (!invite) throw new NotFoundException('This link is not valid');
    if (invite.usedAt) throw new GoneException('This link has already been used');
    if (Date.parse(invite.expiresAt) <= Date.now()) {
      throw new GoneException('This link has expired');
    }
    return invite;
  }

  private inviteUrl(token: string) {
    const base = this.store.getSettings().app.publicUrl.replace(/\/$/, '');
    return `${base}/join/${token}`;
  }

  async storePhoto(body: unknown) {
    const dataUrl =
      body && typeof body === 'object' && 'dataUrl' in body
        ? (body as { dataUrl?: unknown }).dataUrl
        : undefined;
    if (typeof dataUrl !== 'string' || dataUrl === '') {
      throw new BadRequestException('Photo is required');
    }
    if (dataUrl.startsWith('data:video/')) {
      return { url: await this.saveVideo(dataUrl) };
    }
    return { url: await this.saveImage(dataUrl) };
  }

  private async saveImage(dataUrl: string) {
    const matched = /^data:image\/(jpeg|png|webp);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
    if (!matched) throw new BadRequestException('Photo must be a JPEG, PNG, or WebP');
    const bytes = Buffer.from(matched[2], 'base64');
    if (bytes.length > 2_000_000) {
      throw new BadRequestException('Photo must be under 2 MB');
    }
    const ext = matched[1].toLowerCase() === 'jpeg' ? 'jpg' : matched[1].toLowerCase();
    const name = `${randomBytes(8).toString('hex')}.${ext}`;
    const directory = join(process.cwd(), 'data', 'media');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), bytes);
    return `/media/${name}`;
  }

  private async saveVideo(dataUrl: string) {
    const matched = /^data:video\/(mp4|webm|quicktime);base64,([a-z0-9+/=\s]+)$/i.exec(dataUrl);
    if (!matched) throw new BadRequestException('Intro video must be an MP4, WebM, or MOV file');
    const bytes = Buffer.from(matched[2], 'base64');
    if (bytes.length > 8_000_000) {
      throw new BadRequestException('Intro video must be under 8 MB');
    }
    const kind = matched[1].toLowerCase();
    const ext = kind === 'quicktime' ? 'mov' : kind;
    const name = `${randomBytes(8).toString('hex')}.${ext}`;
    const directory = join(process.cwd(), 'data', 'media');
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, name), bytes);
    return `/media/${name}`;
  }
}

function blankProfile(user: AuthUser): Profile {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    headline: '',
    bio: '',
    dateOfBirth: '',
    country: '',
    homeAirport: '',
    hobbies: [],
    countriesTraveled: [],
    socials: [],
    avatarUrl: '',
    coverUrl: '',
    introVideoUrl: '',
    hidden: false,
    disabled: false,
    deletedAt: null,
    hasPassword: false,
    usernameChangedAt: null,
  };
}

function profileFromDraft(
  id: string,
  role: Profile['role'],
  email: string,
  draft: ProfileDraft,
  images: { avatarUrl: string; coverUrl: string },
): Profile {
  return {
    id,
    role,
    email,
    username: draft.username,
    displayName: draft.displayName,
    headline: draft.headline,
    bio: draft.bio,
    dateOfBirth: draft.dateOfBirth,
    country: draft.country,
    homeAirport: '',
    hobbies: draft.hobbies,
    countriesTraveled: draft.countriesTraveled,
    socials: draft.socials,
    avatarUrl: images.avatarUrl,
    coverUrl: images.coverUrl,
    introVideoUrl: '',
    hidden: false,
    disabled: false,
    deletedAt: null,
    hasPassword: true,
    usernameChangedAt: role === 'traveler' ? new Date().toISOString() : null,
  };
}

function normalizeProfile(profile: Profile): Profile {
  const next = { ...profile };
  normalizeProfileInPlace(next);
  return next;
}

function normalizeProfileInPlace(profile: Profile) {
  if (typeof profile.introVideoUrl !== 'string') {
    profile.introVideoUrl = '';
  }
  if (typeof profile.hasPassword !== 'boolean') {
    // Resolved on /me via auth providers; false until proven.
    profile.hasPassword = false;
  }
  if (typeof profile.homeAirport !== 'string') {
    profile.homeAirport = '';
  }
  if (profile.usernameChangedAt === undefined) {
    if (profile.role === 'tcc') {
      profile.usernameChangedAt = null;
    } else if (profile.username === `user-${profile.id.slice(0, 8)}`) {
      // Auto handle from Google / ensureProfile: allow one edit.
      profile.usernameChangedAt = null;
    } else {
      // Email signup already chose a handle.
      profile.usernameChangedAt = new Date(0).toISOString();
    }
  }
}

function requireCreatorBasics(profile: Profile) {
  if (!profile.dateOfBirth || !profile.country || !profile.bio || profile.socials.length === 0) {
    throw new BadRequestException('A creator profile needs a birthday, country, bio, and a link');
  }
}

function handleTaken(
  draft: {
    profiles: Profile[];
    waitlist: WaitlistRequest[];
    invites: CreatorInvite[];
  },
  handle: string,
  exceptProfileId?: string,
  exceptWaitlistId?: string,
) {
  if (
    draft.profiles.some((profile) => profile.username === handle && profile.id !== exceptProfileId)
  ) {
    return true;
  }
  return draft.waitlist.some((item) => {
    if (item.handle !== handle || item.id === exceptWaitlistId) return false;
    if (item.status === 'declined') return false;
    if (item.status === 'pending') return true;
    const used = draft.invites.some((invite) => invite.waitlistId === item.id && invite.usedAt);
    return !used;
  });
}

function readStatus(body: unknown) {
  const record = asObject(body);
  if (record.status === 'accepted' || record.status === 'declined') return record.status;
  throw new BadRequestException('Choose accepted or declined');
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Expected an object');
  }
  return value as Record<string, unknown>;
}
