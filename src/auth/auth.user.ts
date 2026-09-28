export const usernamePattern = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;

export type AccountRole = 'tcc' | 'traveler';

export type AuthUser = {
  id: string;
  email: string;
  role: AccountRole;
  username: string;
  displayName: string;
};
