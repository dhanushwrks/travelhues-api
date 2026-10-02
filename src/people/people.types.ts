export const socialPlatforms = [
  'youtube',
  'instagram',
  'facebook',
  'linkedin',
  'website',
] as const;

export type SocialPlatform = (typeof socialPlatforms)[number];

export type SocialLink = {
  platform: SocialPlatform;
  url: string;
};

export type Profile = {
  id: string;
  role: 'tcc' | 'traveler';
  email: string;
  username: string;
  displayName: string;
  headline: string;
  bio: string;
  dateOfBirth: string;
  country: string;
  homeAirport: string;
  hobbies: string[];
  countriesTraveled: string[];
  socials: SocialLink[];
  avatarUrl: string;
  coverUrl: string;
  /** Short intro clip for TCC avatars; empty when unset. */
  introVideoUrl: string;
  hidden: boolean;
  disabled: boolean;
  deletedAt: string | null;
  /** False for Google-only accounts until they set a password. */
  hasPassword: boolean;
  /** When set, travelers cannot change username again. Null = one change still allowed. */
  usernameChangedAt: string | null;
};

export type WaitlistStatus = 'pending' | 'accepted' | 'declined';

export type WaitlistRequest = {
  id: string;
  status: WaitlistStatus;
  createdAt: string;
  name: string;
  country: string;
  dateOfBirth: string;
  socials: SocialLink[];
  handle: string;
  bio: string;
  hobbies: string[];
  countriesTraveled: string[];
};

export type CreatorInvite = {
  token: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
  waitlistId: string | null;
};

export type ProfileDraft = {
  displayName: string;
  username: string;
  headline: string;
  bio: string;
  dateOfBirth: string;
  country: string;
  hobbies: string[];
  countriesTraveled: string[];
  socials: SocialLink[];
};
