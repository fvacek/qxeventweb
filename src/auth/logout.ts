/**
 * Logout utility for handling different authentication providers
 */

import { googleAuthService } from './google-auth';

export interface LogoutOptions {
  /** Whether to show a confirmation dialog before logging out */
  confirm?: boolean;
  /** Whether to redirect after logout */
  redirect?: boolean;
  /** URL to redirect to after logout (defaults to '/') */
  redirectUrl?: string;
}

/**
 * Handles logout for different authentication providers
 */
export class LogoutService {
  /**
   * Logs out the current user regardless of auth provider
   */
  async logout(options: LogoutOptions = {}): Promise<void> {
    const {
      confirm = false,
      redirect = false,
      redirectUrl = '/'
    } = options;

    // Show confirmation dialog if requested
    if (confirm) {
      const shouldLogout = window.confirm('Are you sure you want to log out?');
      if (!shouldLogout) {
        return;
      }
    }

    try {
      // Clear any stored authentication data
      this.clearStoredAuth();

      // Clear Google authentication if present
      await this.clearGoogleAuth();

      // Clear OIDC authentication if present
      await this.clearOidcAuth();

      console.log('User logged out successfully');

      // Redirect if requested
      if (redirect) {
        window.location.href = redirectUrl;
      }

    } catch (error) {
      console.error('Error during logout:', error);
      throw new Error('Failed to log out completely');
    }
  }

  /**
   * Clears stored authentication data from localStorage/sessionStorage
   */
  private clearStoredAuth(): void {
    try {
      // Clear common auth storage keys
      const authKeys = [
        'auth_user',
        'google_auth_token',
        'microsoft_auth_token',
        'oidc_user',
        'access_token',
        'id_token',
        'refresh_token'
      ];

      authKeys.forEach(key => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });

      // Clear any keys that start with 'oidc.' (oidc-client-ts storage)
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('oidc.')) {
          localStorage.removeItem(key);
        }
      });

      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('oidc.')) {
          sessionStorage.removeItem(key);
        }
      });

    } catch (error) {
      console.warn('Error clearing stored auth data:', error);
    }
  }

  /**
   * Clears Google authentication state
   */
  private async clearGoogleAuth(): Promise<void> {
    try {
      // Google Sign-In doesn't require explicit logout for security,
      // but we can revoke tokens if we have them
      if (window.google?.accounts?.id) {
        // Disable auto-select for future sign-ins
        window.google.accounts.id.disableAutoSelect();
      }
    } catch (error) {
      console.warn('Error clearing Google auth:', error);
    }
  }

  /**
   * Clears OIDC authentication state (Microsoft, etc.)
   */
  private async clearOidcAuth(): Promise<void> {
    try {
      // Clear any OIDC user manager state
      // Note: This is handled by clearStoredAuth() above
      console.log('OIDC auth state cleared');
    } catch (error) {
      console.warn('Error clearing OIDC auth:', error);
    }
  }

  /**
   * Checks if user is currently authenticated
   */
  isAuthenticated(): boolean {
    // Check for common auth indicators
    return !!(
      localStorage.getItem('auth_user') ||
      sessionStorage.getItem('auth_user') ||
      Object.keys(localStorage).some(key => key.startsWith('oidc.'))
    );
  }

  /**
   * Gets the current authentication provider if detectable
   */
  getCurrentProvider(): string | null {
    try {
      // Check for Google auth indicators
      if (Object.keys(localStorage).some(key => key.includes('google'))) {
        return 'google';
      }

      // Check for Microsoft auth indicators
      if (Object.keys(localStorage).some(key => key.includes('microsoft'))) {
        return 'microsoft';
      }

      // Check for generic OIDC
      if (Object.keys(localStorage).some(key => key.startsWith('oidc.'))) {
        return 'oidc';
      }

      return null;
    } catch (error) {
      console.warn('Error detecting auth provider:', error);
      return null;
    }
  }
}

// Export singleton instance
export const logoutService = new LogoutService();

// Export convenience functions
export const logout = (options?: LogoutOptions) => logoutService.logout(options);
export const isAuthenticated = () => logoutService.isAuthenticated();
export const getCurrentProvider = () => logoutService.getCurrentProvider();
