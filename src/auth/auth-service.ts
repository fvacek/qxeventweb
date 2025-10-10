import { UserManager } from "oidc-client-ts";
import { googleOidcConfig, microsoftOidcConfig } from "./auth-config";

class AuthService {
  private googleUserManager: UserManager;
  private microsoftUserManager: UserManager;

  constructor() {
    this.googleUserManager = new UserManager(googleOidcConfig);
    this.microsoftUserManager = new UserManager(microsoftOidcConfig);
  }

  async login(provider: "google" | "microsoft") {
    const userManager =
      provider === "google"
        ? this.googleUserManager
        : this.microsoftUserManager;
    await userManager.signinRedirect();
  }

  async handleCallback(provider: "google" | "microsoft") {
    const userManager =
      provider === "google"
        ? this.googleUserManager
        : this.microsoftUserManager;

    console.log(`Handling ${provider} callback...`);
    console.log('Current URL:', window.location.href);
    console.log('Search params:', new URLSearchParams(window.location.search));

    try {
      const user = await userManager.signinRedirectCallback();
      console.log('Successfully authenticated user:', user);
      return user;
    } catch (error) {
      console.error('Detailed callback error:', error);

      throw error;
    }
  }
}

export const authService = new AuthService();
