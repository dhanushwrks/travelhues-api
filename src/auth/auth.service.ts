import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { StoreService } from '../store/store.service.js';
import { usernamePattern, type AccountRole, type AuthUser } from './auth.user.js';

@Injectable()
export class AuthService {
  private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

  constructor(private readonly store: StoreService) {}

  async signup(body: unknown) {
    const input = parseSignup(body);
    const username = input.username
      ? this.claimUsername(input.username)
      : this.availableUsername(slugFromName(input.displayName));
    const session = await this.createAccount({
      email: input.email,
      password: input.password,
      username,
      displayName: input.displayName,
      role: 'traveler',
    });
    await this.store.update((draft) => {
      if (draft.profiles.some((profile) => profile.id === session.user.id)) return;
      draft.profiles.push({
        id: session.user.id,
        role: 'traveler',
        email: input.email,
        username: session.user.username,
        displayName: input.displayName,
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
        hasPassword: true,
        usernameChangedAt: new Date().toISOString(),
      });
    });
    return this.login({ email: input.email, password: input.password, intent: 'traveler' });
  }

  async createAccount(input: {
    email: string;
    password: string;
    username: string;
    displayName: string;
    role: AccountRole;
  }) {
    const admin = this.adminClient();
    const created = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      app_metadata: { role: input.role },
      user_metadata: {
        username: input.username,
        display_name: input.displayName,
      },
    });
    if (created.error || !created.data.user) {
      throw new BadRequestException(created.error?.message ?? 'Could not create the account');
    }
    return this.login({
      email: input.email,
      password: input.password,
      intent: input.role === 'tcc' ? 'tcc' : 'traveler',
    });
  }

  async login(body: unknown) {
    const input = parseLogin(body);
    const client = this.publishableClient();
    const signedIn = await client.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });
    if (signedIn.error || !signedIn.data.session || !signedIn.data.user) {
      throw new UnauthorizedException('Email or password was not accepted');
    }
    const user = this.userFromSession(
      signedIn.data.user.id,
      signedIn.data.user.email ?? input.email,
      signedIn.data.user.app_metadata,
      signedIn.data.user.user_metadata,
    );
    if (input.intent === 'tcc' && user.role !== 'tcc') {
      throw new ForbiddenException('This email is a traveler account. Sign in as a user.');
    }
    if (input.intent === 'traveler' && user.role === 'tcc') {
      throw new ForbiddenException('This email is a creator account. Sign in as a creator.');
    }
    await this.admit(user);
    return {
      accessToken: signedIn.data.session.access_token,
      user,
    };
  }

  async admit(user: AuthUser) {
    const profile = this.store.getProfiles().find((item) => item.id === user.id);
    if (!profile) return;
    if (profile.deletedAt) {
      throw new ForbiddenException('This account has been deleted');
    }
    if (!profile.disabled) return;
    await this.store.update((draft) => {
      const current = draft.profiles.find((item) => item.id === user.id);
      if (current && !current.deletedAt) current.disabled = false;
    });
  }

  assertActive(user: AuthUser) {
    const profile = this.store.getProfiles().find((item) => item.id === user.id);
    if (!profile) return;
    if (profile.deletedAt) throw new UnauthorizedException('This account has been deleted');
    if (profile.disabled) {
      throw new UnauthorizedException('This account is disabled. Sign in to use it again.');
    }
  }

  async verify(token: string): Promise<AuthUser> {
    const url = this.requiredEnv('SUPABASE_URL');
    const jwksUrl = this.requiredEnv('SUPABASE_JWKS_URL');
    if (!this.jwks) this.jwks = createRemoteJWKSet(new URL(jwksUrl));
    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: `${url}/auth/v1`,
        audience: 'authenticated',
      });
      return this.userFromJwt(
        verified.payload as JWTPayload & {
          app_metadata?: unknown;
          user_metadata?: unknown;
        },
      );
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Sign in to continue');
    }
  }

  async syncProfile(id: string, username: string, displayName: string) {
    const admin = this.adminClient();
    const updated = await admin.auth.admin.updateUserById(id, {
      user_metadata: { username, display_name: displayName },
    });
    if (updated.error) {
      throw new BadRequestException(updated.error.message);
    }
  }

  async checkPassword(email: string, password: string) {
    const client = this.publishableClient();
    const signedIn = await client.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw new UnauthorizedException('Current password is not right');
    }
  }

  async updatePassword(id: string, password: string) {
    const admin = this.adminClient();
    const updated = await admin.auth.admin.updateUserById(id, { password });
    if (updated.error) throw new BadRequestException(updated.error.message);
  }

  async authProviders(id: string): Promise<string[]> {
    const admin = this.adminClient();
    const result = await admin.auth.admin.getUserById(id);
    if (result.error || !result.data.user) return [];
    const identities = result.data.user.identities ?? [];
    return identities.map((item) => item.provider).filter(Boolean);
  }

  async deleteAccount(id: string) {
    const admin = this.adminClient();
    const removed = await admin.auth.admin.deleteUser(id);
    if (removed.error) throw new BadRequestException(removed.error.message);
  }

  private claimUsername(username: string) {
    if (this.usernameTaken(username)) {
      throw new ConflictException('That handle is already in use');
    }
    return username;
  }

  private availableUsername(base: string) {
    const root = usernamePattern.test(base)
      ? base
      : `user-${base.replace(/[^a-z0-9]/g, '').slice(0, 8) || 'guest'}`;
    if (!this.usernameTaken(root)) return root;
    return `${root.slice(0, 20)}-${randomSuffix()}`;
  }

  private usernameTaken(username: string) {
    if (this.store.getProfiles().some((profile) => profile.username === username)) return true;
    return this.store.getWaitlist().some(
      (item) => item.handle === username && item.status !== 'declined',
    );
  }

  private userFromJwt(
    payload: JWTPayload & { app_metadata?: unknown; user_metadata?: unknown },
  ): AuthUser {
    const id = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : '';
    if (!id) throw new UnauthorizedException('Sign in to continue');
    return this.userFromSession(id, email, payload.app_metadata, payload.user_metadata);
  }

  private userFromSession(
    id: string,
    email: string,
    appMetadata: unknown,
    userMetadata: unknown,
  ): AuthUser {
    const app = asRecord(appMetadata);
    const profile = asRecord(userMetadata);
    const role = app.role === 'tcc' ? 'tcc' : 'traveler';
    let username =
      typeof profile.username === 'string' && usernamePattern.test(profile.username)
        ? profile.username
        : `user-${id.slice(0, 8)}`;
    let displayName = firstText(profile.display_name, profile.full_name, profile.name) || 'Traveler';
    const stored = this.store.getProfiles().find((item) => item.id === id);
    if (stored) {
      username = stored.username;
      displayName = stored.displayName;
    }
    return { id, email, role, username, displayName };
  }

  private adminClient(): SupabaseClient {
    return createClient(this.requiredEnv('SUPABASE_URL'), this.requiredEnv('SUPABASE_SECRET_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private publishableClient(): SupabaseClient {
    return createClient(
      this.requiredEnv('SUPABASE_URL'),
      this.requiredEnv('SUPABASE_PUBLISHABLE_KEY'),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }

  private requiredEnv(name: string) {
    const value = process.env[name];
    if (!value) {
      throw new ServiceUnavailableException('Sign-in is not configured');
    }
    return value;
  }
}

function parseSignup(body: unknown) {
  const record = asRecord(body);
  if (record.role === 'tcc') {
    throw new BadRequestException('Creator accounts open from an invite');
  }
  const username =
    typeof record.username === 'string' && record.username.trim()
      ? asUsername(record.username)
      : '';
  return {
    email: asEmail(record.email),
    password: asPassword(record.password),
    username,
    displayName: asText(record.displayName, 'Name'),
  };
}

function parseLogin(body: unknown) {
  const record = asRecord(body);
  const intent =
    record.intent === 'tcc' || record.intent === 'traveler' ? record.intent : null;
  return { email: asEmail(record.email), password: asPassword(record.password), intent };
}

function slugFromName(name: string) {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return slug.length >= 3 ? slug : 'traveler';
}

function randomSuffix() {
  return Math.random().toString(36).slice(2, 6);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function asText(value: unknown, label: string) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new BadRequestException(`${label} is required`);
  }
  return value.trim();
}

function asEmail(value: unknown) {
  const email = asText(value, 'Email').toLowerCase();
  if (!email.includes('@')) throw new BadRequestException('Email is not valid');
  return email;
}

function asPassword(value: unknown) {
  const password = asText(value, 'Password');
  if (password.length < 6) {
    throw new BadRequestException('Password must be at least 6 characters');
  }
  return password;
}

function asUsername(value: unknown) {
  const username = asText(value, 'Username').toLowerCase();
  if (!usernamePattern.test(username)) {
    throw new BadRequestException('Username must be a lowercase slug');
  }
  return username;
}
