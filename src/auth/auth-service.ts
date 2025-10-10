import { UserManager } from "oidc-client-ts";
import { microsoftOidcConfig } from "./auth-config";

class AuthService {
  private microsoftUserManager: UserManager;

  constructor() {
    this.microsoftUserManager = new UserManager(microsoftOidcConfig);
  }

  async login(provider: "microsoft") {
    await this.microsoftUserManager.signinRedirect();
  }

  async handleCallback(provider: "microsoft") {
    console.log(`Handling ${provider} callback...`);
    console.log('Current URL:', window.location.href);
    console.log('Search params:', new URLSearchParams(window.location.search));

    try {
      const user = await this.microsoftUserManager.signinRedirectCallback();
      console.log('Successfully authenticated user:', user);
      return user;
    } catch (error) {
      console.error('Detailed callback error:', error);

      throw error;
    }
  }
}

export const authService = new AuthService();
