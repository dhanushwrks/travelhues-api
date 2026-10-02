import { BadRequestException } from '@nestjs/common';
import { usernamePattern } from '../auth/auth.user.js';
import { isCountryCode } from './countries.js';
import { parseHomeAirport } from '../flight-deals/flight-deals.parse.js';
import {
  socialPlatforms,
  type ProfileDraft,
  type SocialLink,
  type SocialPlatform,
} from './people.types.js';

export function parseWaitlist(body: unknown): Omit<ProfileDraft, 'headline'> & {
  name: string;
} {
  const record = asRecord(body);
  const draft = parseProfileFields(record, { headlineOptional: true });
  return { ...draft, name: draft.displayName };
}

export function parseInviteAccount(body: unknown) {
  const record = asRecord(body);
  return {
    ...parseProfileFields(record, { headlineOptional: true }),
    email: asEmail(record.email),
    password: asPassword(record.password),
    avatarDataUrl: optionalDataUrl(record.avatarDataUrl),
    coverDataUrl: optionalDataUrl(record.coverDataUrl),
  };
}

export function parseProfilePatch(body: unknown) {
  const record = asRecord(body);
  const patch: Partial<ProfileDraft> & {
    hidden?: boolean;
    homeAirport?: string;
    avatarDataUrl?: string;
    coverDataUrl?: string;
    introVideoUrl?: string;
    introVideoDataUrl?: string;
  } = {};
  if ('displayName' in record) patch.displayName = asText(record.displayName, 'Name', 80);
  if ('username' in record) patch.username = asHandle(record.username);
  if ('headline' in record) patch.headline = asHeadline(record.headline);
  if ('bio' in record) patch.bio = asBio(record.bio);
  if ('dateOfBirth' in record) patch.dateOfBirth = asDateOfBirth(record.dateOfBirth);
  if ('country' in record) patch.country = asCountry(record.country);
  if ('homeAirport' in record) {
    patch.homeAirport =
      record.homeAirport === '' ? '' : parseHomeAirport(record.homeAirport);
  }
  if ('hobbies' in record) patch.hobbies = asHobbies(record.hobbies);
  if ('countriesTraveled' in record) {
    patch.countriesTraveled = asCountries(record.countriesTraveled);
  }
  if ('socials' in record) patch.socials = asSocials(record.socials, false);
  if ('hidden' in record) {
    if (typeof record.hidden !== 'boolean') {
      throw new BadRequestException('Hidden must be true or false');
    }
    patch.hidden = record.hidden;
  }
  if ('avatarDataUrl' in record) patch.avatarDataUrl = photoPatch(record.avatarDataUrl);
  if ('coverDataUrl' in record) patch.coverDataUrl = photoPatch(record.coverDataUrl);
  if ('introVideoUrl' in record) patch.introVideoUrl = videoUrlPatch(record.introVideoUrl);
  if ('introVideoDataUrl' in record) patch.introVideoDataUrl = videoDataPatch(record.introVideoDataUrl);
  return patch;
}

export function parsePasswordChange(body: unknown, options: { requireCurrent: boolean }) {
  const record = asRecord(body);
  const password = asPassword(record.password, 'New password');
  const confirmPassword = typeof record.confirmPassword === 'string' ? record.confirmPassword : '';
  if (confirmPassword !== password) {
    throw new BadRequestException('New password and confirmation do not match');
  }
  if (!options.requireCurrent) {
    return { currentPassword: null as string | null, password };
  }
  const currentPassword = asPassword(record.currentPassword, 'Current password');
  if (password === currentPassword) {
    throw new BadRequestException('Choose a password that is different from the current one');
  }
  return { currentPassword, password };
}

export function parseUsernameQuery(value: string) {
  return asHandle(value);
}

function parseProfileFields(
  record: Record<string, unknown>,
  options: { headlineOptional: boolean },
): ProfileDraft {
  return {
    displayName: asText(record.name ?? record.displayName, 'Name', 80),
    username: asHandle(record.handle ?? record.username),
    headline: options.headlineOptional
      ? asHeadline(record.headline ?? '')
      : asHeadline(record.headline),
    bio: asBio(record.bio),
    dateOfBirth: asDateOfBirth(record.dateOfBirth),
    country: asCountry(record.country),
    hobbies: asHobbies(record.hobbies ?? []),
    countriesTraveled: asCountries(record.countriesTraveled ?? []),
    socials: asSocials(record.socials, true),
  };
}

export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException('Expected an object');
  }
  return value as Record<string, unknown>;
}

function asText(value: unknown, label: string, max: number) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${label} is required`);
  }
  const text = value.trim();
  if (text.length > max) throw new BadRequestException(`${label} is too long`);
  return text;
}

function asHandle(value: unknown) {
  const handle = asText(value, 'Handle', 30).toLowerCase();
  if (!usernamePattern.test(handle) || handle.length < 3) {
    throw new BadRequestException(
      'Handle uses lowercase letters, numbers, and single hyphens or underscores',
    );
  }
  return handle;
}

function asHeadline(value: unknown) {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const text = value.trim();
  if (text.length > 80) throw new BadRequestException('Headline is too long');
  return text;
}

function asBio(value: unknown) {
  const bio = asText(value, 'Bio', 600);
  if (bio.length < 20) throw new BadRequestException('Bio should be at least a sentence');
  return bio;
}

function asDateOfBirth(value: unknown) {
  const text = asText(value, 'Date of birth', 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new BadRequestException('Date of birth must be a calendar date');
  }
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
    throw new BadRequestException('Date of birth must be a calendar date');
  }
  const today = new Date();
  const cutoff = new Date(Date.UTC(today.getUTCFullYear() - 13, today.getUTCMonth(), today.getUTCDate()));
  if (date > cutoff) throw new BadRequestException('You need to be at least 13');
  return text;
}

function asCountry(value: unknown) {
  const code = asText(value, 'Country', 2).toUpperCase();
  if (!isCountryCode(code)) throw new BadRequestException('Choose a country from the list');
  return code;
}

function asCountries(value: unknown) {
  if (!Array.isArray(value)) throw new BadRequestException('Countries travelled must be a list');
  const codes = value.map((item) => {
    if (typeof item !== 'string') throw new BadRequestException('Choose a country from the list');
    const code = item.toUpperCase();
    if (!isCountryCode(code)) throw new BadRequestException('Choose a country from the list');
    return code;
  });
  return [...new Set(codes)].slice(0, 40);
}

function asHobbies(value: unknown) {
  if (!Array.isArray(value)) throw new BadRequestException('Hobbies must be a list');
  const hobbies: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') throw new BadRequestException('Hobby must be text');
    const hobby = item.trim();
    if (!hobby) continue;
    if (hobby.length > 24) throw new BadRequestException('A hobby can be 24 characters');
    if (!hobbies.some((existing) => existing.toLowerCase() === hobby.toLowerCase())) {
      hobbies.push(hobby);
    }
  }
  return hobbies.slice(0, 12);
}

function asSocials(value: unknown, required: boolean): SocialLink[] {
  if (!Array.isArray(value)) throw new BadRequestException('Add a social link');
  const links: SocialLink[] = [];
  for (const item of value) {
    const record = asRecord(item);
    const platform = record.platform;
    if (!socialPlatforms.includes(platform as SocialPlatform)) {
      throw new BadRequestException('Choose a social network');
    }
    const url = asText(record.url, 'Link', 300);
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Link must be a full web address');
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new BadRequestException('Link must be a full web address');
    }
    links.push({ platform: platform as SocialPlatform, url: parsed.toString() });
  }
  if (required && links.length === 0) {
    throw new BadRequestException('Add a social link so the profile can be checked');
  }
  return links.slice(0, 8);
}

function asEmail(value: unknown) {
  const email = asText(value, 'Email', 120).toLowerCase();
  if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
    throw new BadRequestException('Email is not valid');
  }
  return email;
}

function asPassword(value: unknown, label = 'Password') {
  if (typeof value !== 'string' || value.length < 6) {
    throw new BadRequestException(`${label} must be at least 6 characters`);
  }
  if (value.length > 72) throw new BadRequestException('Password is too long');
  return value;
}

function photoPatch(value: unknown) {
  if (value == null || value === '') return '';
  return optionalDataUrl(value) ?? '';
}

function optionalDataUrl(value: unknown) {
  if (value == null || value === '') return undefined;
  if (typeof value !== 'string' || !value.startsWith('data:image/')) {
    throw new BadRequestException('Photo must be an image');
  }
  if (value.length > 2_800_000) throw new BadRequestException('Photo must be under 2 MB');
  return value;
}

function videoUrlPatch(value: unknown) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string') throw new BadRequestException('Intro video must be a link');
  const text = value.trim();
  if (text.startsWith('/media/')) {
    if (!/^\/media\/[a-f0-9]{16}\.(mp4|webm|mov)$/i.test(text)) {
      throw new BadRequestException('Intro video link is not valid');
    }
    return text;
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new BadRequestException('Intro video must be a web address');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Intro video must be a web address');
  }
  return text;
}

function videoDataPatch(value: unknown) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !/^data:video\/(mp4|webm|quicktime);base64,/i.test(value)) {
    throw new BadRequestException('Intro video must be an MP4, WebM, or MOV file');
  }
  // Base64 expands ~33%; keep under the 12 MB JSON body limit.
  if (value.length > 10_500_000) {
    throw new BadRequestException('Intro video must be under 8 MB');
  }
  return value;
}
