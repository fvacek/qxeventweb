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
    const user = await userManager.signinRedirectCallback();
    // TODO: Do something with the user object, like storing it in a context
    console.log(user);
    return user;
  }
}

export const authService = new AuthService();
