declare global {
  interface Window {
    PublicClientApplication: any;
  }
}

interface MicrosoftAuthConfiguration {
  clientId: string;
  authority?: string;
  redirectUri?: string;
  scopes?: string[];
}

interface MicrosoftUser {
  id: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
}

interface MicrosoftAuthResponse {
  account: {
    homeAccountId: string;
    environment: string;
    tenantId: string;
    username: string;
    localAccountId: string;
    name: string;
    idTokenClaims: {
      aud: string;
      iss: string;
      iat: number;
      exp: number;
      email: string;
      given_name?: string;
      family_name?: string;
      name: string;
      oid: string;
      preferred_username: string;
      sub: string;
      tid: string;
      ver: string;
    };
  };
  idToken: string;
  accessToken: string;
  scopes: string[];
  expiresOn: Date;
}

interface MicrosoftButtonConfiguration {
  theme?: 'light' | 'dark';
  size?: 'small' | 'medium' | 'large';
  text?: 'Sign in with Microsoft' | 'Sign up with Microsoft' | 'Continue with Microsoft';
  width?: number;
}

class MicrosoftAuthService {
  private clientId = "91558390-82a8-4607-8a39-29046dbe3a14"; // Replace with your actual client ID from auth-config.ts
  private msalInstance: any = null;
  private isInitialized = false;
  private authority = "https://login.microsoftonline.com/consumers"; // Use consumers for personal Microsoft accounts
  private tenantType: 'common' | 'consumers' | 'organizations' | string = 'consumers';
  private redirectUri = typeof window !== 'undefined' ? window.location.origin : "http://localhost:3000";

  constructor() {
    // Only initialize in browser environment
    if (typeof window !== 'undefined') {
      this.loadMsalScript();
    }
  }

  private loadMsalScript(): Promise<void> {
    const cdnUrls = [
      'https://alcdn.msauth.net/browser/2.38.4/js/msal-browser.min.js',
      'https://unpkg.com/@azure/msal-browser@2.38.4/lib/msal-browser.min.js',
      'https://cdn.jsdelivr.net/npm/@azure/msal-browser@2.38.4/lib/msal-browser.min.js',
      'https://alcdn.msauth.net/browser/2.35.0/js/msal-browser.min.js'
    ];

    return new Promise((resolve, reject) => {
      if (typeof window === 'undefined') {
        reject(new Error('Window is not defined - not in browser environment'));
        return;
      }

      if (window.PublicClientApplication) {
        console.log('MSAL already loaded, initializing...');
        try {
          this.initializeMsal();
          resolve();
        } catch (error) {
          reject(error);
        }
        return;
      }

      let attemptIndex = 0;
      
      const tryLoadScript = (url: string) => {
        console.log(`Loading MSAL.js from CDN (attempt ${attemptIndex + 1}/${cdnUrls.length}): ${url}`);
        
        const script = document.createElement('script');
        script.src = url;
        script.async = true;
        script.crossOrigin = 'anonymous';
        
        script.onload = () => {
          console.log('MSAL.js loaded successfully from:', url);
          try {
            // Wait a bit for the script to fully initialize
            setTimeout(() => {
              if (window.PublicClientApplication) {
                this.initializeMsal();
                resolve();
              } else {
                reject(new Error('MSAL.js loaded but PublicClientApplication not available'));
              }
            }, 100);
          } catch (error) {
            reject(error);
          }
        };
        
        script.onerror = (event) => {
          console.error(`Failed to load MSAL.js from ${url}:`, event);
          
          // Try next CDN URL
          attemptIndex++;
          if (attemptIndex < cdnUrls.length) {
            // Remove failed script
            script.remove();
            // Try next URL after a short delay
            setTimeout(() => tryLoadScript(cdnUrls[attemptIndex]), 1000);
          } else {
            reject(new Error(`Failed to load MSAL.js library from all CDNs. Tried: ${cdnUrls.join(', ')}`));
          }
        };
        
        document.head.appendChild(script);
      };

      // Start with the first CDN
      tryLoadScript(cdnUrls[attemptIndex]);
    });
  }

  private initializeMsal(): void {
    if (typeof window === 'undefined' || !window.PublicClientApplication) {
      console.error('MSAL initialization failed - PublicClientApplication not available');
      throw new Error('PublicClientApplication not available');
    }

    console.log('Initializing MSAL with config:', {
      clientId: this.clientId,
      authority: this.authority,
      redirectUri: this.redirectUri
    });

    const msalConfig = {
      auth: {
        clientId: this.clientId,
        authority: this.authority,
        redirectUri: this.redirectUri,
        validateAuthority: false,
        knownAuthorities: ["login.microsoftonline.com"],
        clientCapabilities: ["CP1"],
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

    try {
      console.log('Creating PublicClientApplication...');
      this.msalInstance = new window.PublicClientApplication(msalConfig);
      
      console.log('Starting MSAL initialization...');
      this.msalInstance.initialize().then(() => {
        console.log('MSAL initialized successfully');
        this.isInitialized = true;
      }).catch((error: any) => {
        console.error('MSAL initialization promise failed:', error);
        throw new Error(`MSAL initialization failed: ${error.message || error}`);
      });
    } catch (error) {
      console.error('Failed to create PublicClientApplication:', error);
      throw new Error(`Failed to create MSAL instance: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (typeof window === 'undefined') {
      throw new Error('Microsoft auth is only available in browser environment');
    }

    if (!this.isInitialized) {
      console.log('MSAL not initialized, starting initialization...');
      
      try {
        // Try initialization with fallbacks
        await this.initializeWithFallbacks();
        
        // Wait for MSAL to initialize with better timeout handling
        let attempts = 0;
        const maxAttempts = 100; // 10 seconds total
        const interval = 100; // 100ms intervals
        
        console.log('Waiting for MSAL initialization...');
        while (!this.isInitialized && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, interval));
          attempts++;
          
          if (attempts % 10 === 0) {
            console.log(`Still waiting for MSAL initialization... (${attempts * interval}ms)`);
          }
        }
        
        if (!this.isInitialized) {
          throw new Error(`MSAL initialization timeout after ${maxAttempts * interval}ms. Please check your client ID and network connection. Try using the debug component to diagnose issues.`);
        }
        
        console.log('MSAL initialization completed successfully');
      } catch (error) {
        console.error('MSAL initialization error:', error);
        
        // Provide more helpful error messages
        if (error instanceof Error) {
          if (error.message.includes('CDN')) {
            throw new Error('Failed to load MSAL from CDN. Please check your internet connection or try the debug component for alternative loading methods.');
          } else if (error.message.includes('Client ID')) {
            throw new Error('Client ID configuration error. Please set your Azure AD client ID using the debug component or microsoftAuthService.updateConfig().');
          }
        }
        
        throw error;
      }
    }
  }

  private convertToMicrosoftUser(account: any): MicrosoftUser {
    return {
      id: account.localAccountId || account.homeAccountId,
      email: account.username || account.idTokenClaims?.email || '',
      name: account.name || account.idTokenClaims?.name || '',
      given_name: account.idTokenClaims?.given_name,
      family_name: account.idTokenClaims?.family_name,
      preferred_username: account.idTokenClaims?.preferred_username || account.username,
    };
  }

  async signInWithCredential(): Promise<MicrosoftUser> {
    return this.signInWithPopup();
  }

  async signInWithPopup(): Promise<MicrosoftUser> {
    await this.ensureInitialized();

    const loginRequest = {
      scopes: ["openid", "profile", "email"],
      prompt: "select_account",
      extraQueryParameters: {
        domain_hint: "consumers" // Hint that we want consumer accounts
      }
    };

    try {
      const response = await this.msalInstance.loginPopup(loginRequest);
      return this.convertToMicrosoftUser(response.account);
    } catch (error) {
      console.error('Microsoft sign-in error:', error);
      throw new Error(`Microsoft sign-in failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async signInWithToken(): Promise<{ user: MicrosoftUser; accessToken: string }> {
    await this.ensureInitialized();

    const loginRequest = {
      scopes: ["openid", "profile", "email", "https://graph.microsoft.com/User.Read"],
      extraQueryParameters: {
        domain_hint: "consumers" // Hint that we want consumer accounts
      }
    };

    try {
      const response = await this.msalInstance.loginPopup(loginRequest);
      const user = this.convertToMicrosoftUser(response.account);

      // Get access token
      const tokenRequest = {
        scopes: ["https://graph.microsoft.com/User.Read"],
        account: response.account,
      };

      const tokenResponse = await this.msalInstance.acquireTokenSilent(tokenRequest);

      return { user, accessToken: tokenResponse.accessToken };
    } catch (error) {
      console.error('Microsoft sign-in with token error:', error);
      throw new Error(`Microsoft sign-in with token failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async signInWithRedirect(): Promise<void> {
    await this.ensureInitialized();

    const loginRequest = {
      scopes: ["openid", "profile", "email"],
      extraQueryParameters: {
        domain_hint: "consumers" // Hint that we want consumer accounts
      }
    };

    try {
      await this.msalInstance.loginRedirect(loginRequest);
    } catch (error) {
      console.error('Microsoft sign-in redirect error:', error);
      throw new Error(`Microsoft sign-in redirect failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async handleRedirectResponse(): Promise<MicrosoftUser | null> {
    await this.ensureInitialized();

    try {
      const response = await this.msalInstance.handleRedirectPromise();
      if (response && response.account) {
        return this.convertToMicrosoftUser(response.account);
      }
      return null;
    } catch (error) {
      console.error('Microsoft redirect response error:', error);
      throw new Error(`Microsoft redirect response failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getAccessToken(scopes: string[] = ["openid", "profile", "email"]): Promise<string> {
    await this.ensureInitialized();

    const accounts = this.msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      throw new Error('No authenticated accounts found');
    }

    const silentRequest = {
      scopes: scopes,
      account: accounts[0],
    };

    try {
      const response = await this.msalInstance.acquireTokenSilent(silentRequest);
      return response.accessToken;
    } catch (error) {
      console.error('Failed to acquire token silently:', error);
      // Fall back to interactive token acquisition
      try {
        const response = await this.msalInstance.acquireTokenPopup(silentRequest);
        return response.accessToken;
      } catch (interactiveError) {
        console.error('Failed to acquire token interactively:', interactiveError);
        throw new Error(`Failed to acquire access token: ${interactiveError instanceof Error ? interactiveError.message : 'Unknown error'}`);
      }
    }
  }

  getCurrentUser(): MicrosoftUser | null {
    if (!this.isInitialized || !this.msalInstance) {
      return null;
    }

    const accounts = this.msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      return this.convertToMicrosoftUser(accounts[0]);
    }
    return null;
  }

  async signOut(): Promise<void> {
    await this.ensureInitialized();

    const accounts = this.msalInstance.getAllAccounts();
    if (accounts.length > 0) {
      try {
        await this.msalInstance.logoutPopup({
          account: accounts[0],
        });
      } catch (error) {
        console.error('Microsoft sign-out error:', error);
        throw new Error(`Microsoft sign-out failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  renderButton(
    parent: HTMLElement,
    options: MicrosoftButtonConfiguration = {},
    onSignIn?: (user: MicrosoftUser) => void
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.ensureInitialized();

        // Create a custom Microsoft sign-in button
        const button = document.createElement('button');
        button.className = 'microsoft-signin-button';
        button.style.cssText = `
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px 16px;
          border: 1px solid #8c8c8c;
          border-radius: 2px;
          background-color: ${options.theme === 'dark' ? '#2f2f2f' : '#ffffff'};
          color: ${options.theme === 'dark' ? '#ffffff' : '#5e5e5e'};
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: ${options.size === 'small' ? '13px' : options.size === 'large' ? '15px' : '14px'};
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s, border-color 0.2s;
          width: ${options.width ? options.width + 'px' : 'auto'};
          min-width: 200px;
          text-decoration: none;
          outline: none;
        `;

        // Microsoft logo SVG
        const microsoftLogo = `
          <svg width="20" height="20" viewBox="0 0 21 21" style="margin-right: 8px;">
            <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
            <rect x="12" y="1" width="9" height="9" fill="#00a4ef"/>
            <rect x="1" y="12" width="9" height="9" fill="#ffb900"/>
            <rect x="12" y="12" width="9" height="9" fill="#7fba00"/>
          </svg>
        `;

        button.innerHTML = `${microsoftLogo}${options.text || 'Sign in with Microsoft'}`;

        // Add hover effects
        button.addEventListener('mouseenter', () => {
          button.style.backgroundColor = options.theme === 'dark' ? '#404040' : '#f5f5f5';
          button.style.borderColor = '#666666';
        });

        button.addEventListener('mouseleave', () => {
          button.style.backgroundColor = options.theme === 'dark' ? '#2f2f2f' : '#ffffff';
          button.style.borderColor = '#8c8c8c';
        });

        button.addEventListener('focus', () => {
          button.style.outline = '2px solid #0078d4';
          button.style.outlineOffset = '2px';
        });

        button.addEventListener('blur', () => {
          button.style.outline = 'none';
        });

        // Add click handler
        button.addEventListener('click', async (e) => {
          e.preventDefault();
          button.disabled = true;
          button.style.opacity = '0.6';

          try {
            const user = await this.signInWithPopup();
            if (onSignIn) {
              onSignIn(user);
            }

            // Dispatch custom event similar to Google auth
            const event = new CustomEvent('microsoftSignIn', {
              detail: { user }
            });
            parent.dispatchEvent(event);
          } catch (error) {
            console.error('Microsoft sign-in button error:', error);
            const errorEvent = new CustomEvent('microsoftSignInError', {
              detail: { error }
            });
            parent.dispatchEvent(errorEvent);
          } finally {
            button.disabled = false;
            button.style.opacity = '1';
          }
        });

        parent.appendChild(button);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  parseCredentialResponse(response: any): MicrosoftUser | null {
    if (response && response.account) {
      return this.convertToMicrosoftUser(response.account);
    }
    return null;
  }

  // Update client configuration
  updateConfig(config: Partial<MicrosoftAuthConfiguration>): void {
    if (config.clientId) {
      this.clientId = config.clientId;
    }
    if (config.authority) {
      this.authority = config.authority;
    }
    if (config.redirectUri) {
      this.redirectUri = config.redirectUri;
    }
    
    // Reinitialize if MSAL was already loaded
    if (typeof window !== 'undefined' && window.PublicClientApplication && this.isInitialized) {
      this.isInitialized = false;
      this.initializeMsal();
    }
  }

  // Diagnostic methods
  getInitializationStatus(): { isInitialized: boolean; hasScript: boolean; hasInstance: boolean; clientId: string } {
    return {
      isInitialized: this.isInitialized,
      hasScript: typeof window !== 'undefined' && !!window.PublicClientApplication,
      hasInstance: !!this.msalInstance,
      clientId: this.clientId
    };
  }

  async forceReinitialize(): Promise<void> {
    console.log('Forcing MSAL reinitialization...');
    this.isInitialized = false;
    this.msalInstance = null;
    
    // Remove all existing MSAL scripts
    const existingScripts = document.querySelectorAll('script[src*="msal-browser"], script[src*="alcdn.msauth.net"], script[src*="unpkg.com"], script[src*="jsdelivr.net"]');
    existingScripts.forEach(script => script.remove());
    
    // Clear window object
    if (window.PublicClientApplication) {
      delete (window as any).PublicClientApplication;
    }
    
    // Clear any cached modules if using module bundler
    if ('webpackChunkName' in window) {
      delete (window as any).webpackChunkName;
    }
    
    await this.loadMsalScript();
  }

  validateConfiguration(): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    if (!this.clientId || this.clientId === "YOUR_MICROSOFT_CLIENT_ID") {
      errors.push("Client ID is not set or still uses placeholder value");
    }
    
    if (!this.authority) {
      errors.push("Authority is not set");
    }
    
    if (!this.redirectUri) {
      errors.push("Redirect URI is not set");
    }
    
    if (typeof window === 'undefined') {
      errors.push("Not running in browser environment");
    }
    
    // Check network connectivity
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      warnings.push("No internet connection detected - CDN loading may fail");
    }
    
    // Check if we're in a secure context for localStorage
    if (typeof window !== 'undefined' && location.protocol !== 'https:' && location.hostname !== 'localhost') {
      warnings.push("Non-HTTPS context detected - some features may not work properly");
    }
    
    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  // Configure tenant type for different authentication scenarios
  setTenantType(tenantType: 'common' | 'consumers' | 'organizations' | string): void {
    this.tenantType = tenantType;
    if (tenantType === 'consumers') {
      this.authority = "https://login.microsoftonline.com/consumers";
    } else if (tenantType === 'organizations') {
      this.authority = "https://login.microsoftonline.com/organizations";
    } else if (tenantType === 'common') {
      this.authority = "https://login.microsoftonline.com/common";
    } else {
      // Specific tenant ID
      this.authority = `https://login.microsoftonline.com/${tenantType}`;
    }

    // Reinitialize if already loaded
    if (typeof window !== 'undefined' && window.PublicClientApplication && this.isInitialized) {
      this.isInitialized = false;
      this.initializeMsal();
    }
  }

  // Alternative initialization method using dynamic import
  async loadMsalViaDynamicImport(): Promise<void> {
    try {
      console.log('Attempting to load MSAL via dynamic import...');
      
      // Try to load via ES modules
      const msalModule = await import('https://cdn.skypack.dev/@azure/msal-browser@2.38.4');
      
      if (msalModule && msalModule.PublicClientApplication) {
        (window as any).PublicClientApplication = msalModule.PublicClientApplication;
        console.log('MSAL loaded successfully via dynamic import');
        this.initializeMsal();
      } else {
        throw new Error('MSAL module loaded but PublicClientApplication not found');
      }
    } catch (error) {
      console.error('Dynamic import failed:', error);
      throw new Error(`Failed to load MSAL via dynamic import: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Fallback method to load MSAL
  async initializeWithFallbacks(): Promise<void> {
    const methods = [
      () => this.loadMsalScript(),
      () => this.loadMsalViaDynamicImport(),
    ];

    let lastError: Error | null = null;

    for (let i = 0; i < methods.length; i++) {
      try {
        console.log(`Trying initialization method ${i + 1}/${methods.length}`);
        await methods[i]();
        console.log(`Initialization method ${i + 1} succeeded`);
        return; // Success, exit
      } catch (error) {
        console.error(`Initialization method ${i + 1} failed:`, error);
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (i < methods.length - 1) {
          console.log('Trying next initialization method...');
          // Wait before trying next method
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // All methods failed
    throw new Error(`All MSAL initialization methods failed. Last error: ${lastError?.message || 'Unknown error'}`);
  }
}

export const microsoftAuthService = new MicrosoftAuthService();
export type { MicrosoftUser, MicrosoftButtonConfiguration, MicrosoftAuthConfiguration };
