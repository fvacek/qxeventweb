import { PublicClientApplication } from '@azure/msal-browser';

// Configuration for Microsoft Authentication
const msalConfig = {
  auth: {
    clientId: "91558390-82a8-4607-8a39-29046dbe3a14", // Replace with your Azure AD client ID
    authority: "https://login.microsoftonline.com/consumers", // For personal Microsoft accounts
    redirectUri: typeof window !== 'undefined' ? `${window.location.origin}/` : "http://localhost:3000/",
    validateAuthority: false,
    knownAuthorities: ["login.microsoftonline.com"],
  },
  cache: {
    cacheLocation: "localStorage",
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      loggerCallback: (level: number, message: string, containsPii: boolean) => {
        if (containsPii) {
          return;
        }
        console.log(`MSAL [${level}]: ${message}`);
      },
    },
  },
};

// Make MSAL available globally for compatibility with existing service
if (typeof window !== 'undefined') {
  (window as any).PublicClientApplication = PublicClientApplication;
}

// Create and initialize MSAL instance
let msalInstance: PublicClientApplication | null = null;

const initializeMsal = async (): Promise<PublicClientApplication> => {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
    await msalInstance.initialize();
  }
  return msalInstance;
};

// Local Microsoft Authentication Service
export class LocalMicrosoftAuthService {
  private msal: PublicClientApplication | null = null;
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (!this.isInitialized) {
      this.msal = await initializeMsal();
      this.isInitialized = true;
      console.log('Local MSAL initialized successfully');
    }
  }

  async signInWithPopup() {
    await this.initialize();
    if (!this.msal) throw new Error('MSAL not initialized');

    return await this.msal.loginPopup({
      scopes: ["openid", "profile", "email"],
      prompt: "select_account",
    });
  }

  async signInWithRedirect() {
    await this.initialize();
    if (!this.msal) throw new Error('MSAL not initialized');

    return await this.msal.loginRedirect({
      scopes: ["openid", "profile", "email"],
    });
  }

  async handleRedirectResponse() {
    await this.initialize();
    if (!this.msal) throw new Error('MSAL not initialized');

    return await this.msal.handleRedirectPromise();
  }

  async getAccessToken(scopes: string[] = ["openid", "profile", "email"]) {
    await this.initialize();
    if (!this.msal) throw new Error('MSAL not initialized');

    const accounts = this.msal.getAllAccounts();
    if (accounts.length === 0) {
      throw new Error('No authenticated accounts found');
    }

    const silentRequest = {
      scopes: scopes,
      account: accounts[0],
    };

    try {
      const response = await this.msal.acquireTokenSilent(silentRequest);
      return response.accessToken;
    } catch (error) {
      // Fall back to interactive token acquisition
      const response = await this.msal.acquireTokenPopup(silentRequest);
      return response.accessToken;
    }
  }

  getCurrentUser() {
    if (!this.msal) return null;

    const accounts = this.msal.getAllAccounts();
    if (accounts.length > 0) {
      const account = accounts[0];
      return {
        id: account.localAccountId || account.homeAccountId,
        email: account.username || account.idTokenClaims?.email || '',
        name: account.name || account.idTokenClaims?.name || '',
        given_name: account.idTokenClaims?.given_name,
        family_name: account.idTokenClaims?.family_name,
        preferred_username: account.idTokenClaims?.preferred_username || account.username,
      };
    }
    return null;
  }

  async signOut() {
    await this.initialize();
    if (!this.msal) throw new Error('MSAL not initialized');

    const accounts = this.msal.getAllAccounts();
    if (accounts.length > 0) {
      await this.msal.logoutPopup({
        account: accounts[0],
      });
    }
  }

  updateConfig(
    clientId: string,
    tenantType: 'common' | 'consumers' | 'organizations' | string = 'consumers',
    redirectUri?: string
  ) {
    msalConfig.auth.clientId = clientId;

    if (redirectUri) {
      msalConfig.auth.redirectUri = redirectUri;
    } else {
      // Ensure redirect URI has trailing slash
      const origin = typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000";
      msalConfig.auth.redirectUri = origin.endsWith('/') ? origin : `${origin}/`;
    }

    if (tenantType === 'consumers') {
      msalConfig.auth.authority = "https://login.microsoftonline.com/consumers";
    } else if (tenantType === 'organizations') {
      msalConfig.auth.authority = "https://login.microsoftonline.com/organizations";
    } else if (tenantType === 'common') {
      msalConfig.auth.authority = "https://login.microsoftonline.com/common";
    } else {
      msalConfig.auth.authority = `https://login.microsoftonline.com/${tenantType}`;
    }

    // Reset instance to reinitialize with new config
    this.msal = null;
    this.isInitialized = false;
    msalInstance = null;
  }

  // Helper method to get all possible redirect URIs for debugging
  getRedirectUriOptions(): string[] {
    const origin = typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000";
    return [
      origin,
      `${origin}/`,
      `${origin}/auth/callback`,
      `${origin}/auth/callback/microsoft`,
      `${origin}/login/callback`,
      window?.location?.href || origin,
    ];
  }

  // Method to test redirect URI configuration
  validateRedirectUri(): { isValid: boolean; suggestions: string[]; current: string } {
    const currentUri = msalConfig.auth.redirectUri;
    const suggestions = this.getRedirectUriOptions();

    return {
      isValid: true, // We can't validate against Azure AD here, but provide suggestions
      suggestions,
      current: currentUri
    };
  }
}

// Export singleton instance
export const localMicrosoftAuthService = new LocalMicrosoftAuthService();

// Export types
export interface LocalMicrosoftUser {
  id: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
}

export { PublicClientApplication };
