import { User } from "oidc-client-ts";
import type { AuthUser } from "~/context/AuthContext";

/**
 * Converts OIDC User (from Microsoft auth) to simplified AuthUser
 */
export function convertOidcUserToAuthUser(oidcUser: User): AuthUser {
  return {
    email: oidcUser.profile.email || '',
    name: oidcUser.profile.name || oidcUser.profile.email || 'User',
    avatar: oidcUser.profile.picture
  };
}

/**
 * Gets the user's display name from AuthUser
 */
export function getUserDisplayName(user: AuthUser | null): string {
  if (!user) return 'Guest';
  return user.name || user.email || 'User';
}

/**
 * Gets the user's email from AuthUser
 */
export function getUserEmail(user: AuthUser | null): string {
  if (!user) return '';
  return user.email;
}

/**
 * Gets the user's avatar URL from AuthUser
 */
export function getUserAvatar(user: AuthUser | null): string | undefined {
  if (!user) return undefined;
  return user.avatar;
}