import { User } from "oidc-client-ts";
import type { GoogleUser } from "./google-auth";
import type { AuthUser } from "~/context/AuthContext";

/**
 * Normalized user interface that works consistently across auth providers
 */
export interface NormalizedUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
  // Keep profile structure for backward compatibility
  profile: {
    name: string;
    email: string;
    picture?: string;
    given_name?: string;
    family_name?: string;
    sub?: string;
  };
}

/**
 * Checks if a user object is from OIDC client
 */
export function isOidcUser(user: AuthUser): user is User {
  return user && typeof user === 'object' && 'profile' in user;
}

/**
 * Checks if a user object is from Google Identity Services
 */
export function isGoogleUser(user: AuthUser): user is GoogleUser {
  return user && typeof user === 'object' && 'id' in user && !('profile' in user);
}

/**
 * Normalizes user data from different auth providers into a consistent format
 */
export function normalizeUser(user: AuthUser): NormalizedUser {
  if (isOidcUser(user)) {
    // OIDC user - already has the expected structure
    return {
      id: user.profile.sub || user.profile.id || '',
      email: user.profile.email || '',
      name: user.profile.name || '',
      picture: user.profile.picture,
      given_name: user.profile.given_name,
      family_name: user.profile.family_name,
      profile: {
        name: user.profile.name || '',
        email: user.profile.email || '',
        picture: user.profile.picture,
        given_name: user.profile.given_name,
        family_name: user.profile.family_name,
        sub: user.profile.sub || user.profile.id,
      }
    };
  } else if (isGoogleUser(user)) {
    // Google user - needs to be restructured
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      given_name: user.given_name,
      family_name: user.family_name,
      profile: {
        name: user.name,
        email: user.email,
        picture: user.picture,
        given_name: user.given_name,
        family_name: user.family_name,
        sub: user.id,
      }
    };
  } else {
    // Fallback for unknown user types
    console.warn('Unknown user type:', user);
    return {
      id: '',
      email: '',
      name: 'Unknown User',
      profile: {
        name: 'Unknown User',
        email: '',
      }
    };
  }
}

/**
 * Gets the user's display name from any auth provider
 */
export function getUserDisplayName(user: AuthUser | null): string {
  if (!user) return 'Guest';
  
  const normalized = normalizeUser(user);
  return normalized.name || normalized.email || 'User';
}

/**
 * Gets the user's email from any auth provider
 */
export function getUserEmail(user: AuthUser | null): string {
  if (!user) return '';
  
  const normalized = normalizeUser(user);
  return normalized.email;
}

/**
 * Gets the user's avatar/picture URL from any auth provider
 */
export function getUserPicture(user: AuthUser | null): string | undefined {
  if (!user) return undefined;
  
  const normalized = normalizeUser(user);
  return normalized.picture;
}

/**
 * Gets the user's ID from any auth provider
 */
export function getUserId(user: AuthUser | null): string {
  if (!user) return '';
  
  const normalized = normalizeUser(user);
  return normalized.id;
}