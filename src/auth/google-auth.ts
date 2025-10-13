declare global {
  interface Window {
    google: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          prompt: () => void;
          renderButton: (
            parent: HTMLElement,
            options: GoogleButtonConfiguration
          ) => void;
          disableAutoSelect: () => void;
        };
        oauth2: {
          initTokenClient: (config: GoogleTokenConfiguration) => GoogleTokenClient;
        };
      };
    };
  }
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GoogleCredentialResponse {
  credential: string;
  select_by?: string;
}

interface GoogleButtonConfiguration {
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
}

interface GoogleTokenConfiguration {
  client_id: string;
  scope: string;
  callback: (response: GoogleTokenResponse) => void;
  error_callback?: (error: any) => void;
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface GoogleTokenClient {
  requestAccessToken: () => void;
}

interface GoogleUser {
  id: string;
  email: string;
  name: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

class GoogleAuthService {
  private clientId = "921803215801-igjbc90peabavthblhsmo1da37bo9r4l.apps.googleusercontent.com";
  private isInitialized = false;

  constructor() {
    this.loadGoogleScript();
  }

  private loadGoogleScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (window.google) {
        this.isInitialized = true;
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.onload = () => {
        this.isInitialized = true;
        resolve();
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.loadGoogleScript();
    }
  }

  private decodeJWT(token: string): any {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(
        atob(base64)
          .split('')
          .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      );
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('Error decoding JWT:', error);
      return null;
    }
  }

  async signInWithCredential(): Promise<GoogleUser> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      window.google.accounts.id.initialize({
        client_id: this.clientId,
        callback: (response: GoogleCredentialResponse) => {
          try {
            const userData = this.decodeJWT(response.credential);
            if (userData) {
              const user: GoogleUser = {
                id: userData.sub,
                email: userData.email,
                name: userData.name,
                picture: userData.picture,
                given_name: userData.given_name,
                family_name: userData.family_name,
              };
              resolve(user);
            } else {
              reject(new Error('Failed to decode user data'));
            }
          } catch (error) {
            reject(error);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: false,
      });

      window.google.accounts.id.prompt();
    });
  }

  async signInWithToken(): Promise<{ user: GoogleUser; accessToken: string }> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: 'openid profile email',
        callback: async (response: GoogleTokenResponse) => {
          try {
            // Get user info using the access token
            const userInfoResponse = await fetch(
              `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${response.access_token}`
            );
            
            if (!userInfoResponse.ok) {
              throw new Error('Failed to fetch user info');
            }
            
            const userData = await userInfoResponse.json();
            const user: GoogleUser = {
              id: userData.id,
              email: userData.email,
              name: userData.name,
              picture: userData.picture,
              given_name: userData.given_name,
              family_name: userData.family_name,
            };
            
            resolve({ user, accessToken: response.access_token });
          } catch (error) {
            reject(error);
          }
        },
        error_callback: (error: any) => {
          reject(new Error(`OAuth error: ${error.error}`));
        },
      });

      tokenClient.requestAccessToken();
    });
  }

  renderButton(
    parent: HTMLElement,
    options: GoogleButtonConfiguration = {}
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        await this.ensureInitialized();
        
        window.google.accounts.id.initialize({
          client_id: this.clientId,
          callback: (response: GoogleCredentialResponse) => {
            // This callback will be handled by the component using this service
            const event = new CustomEvent('googleSignIn', {
              detail: response
            });
            parent.dispatchEvent(event);
          },
        });

        window.google.accounts.id.renderButton(parent, {
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          ...options,
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  parseCredentialResponse(response: GoogleCredentialResponse): GoogleUser | null {
    const userData = this.decodeJWT(response.credential);
    if (userData) {
      return {
        id: userData.sub,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        given_name: userData.given_name,
        family_name: userData.family_name,
      };
    }
    return null;
  }
}

export const googleAuthService = new GoogleAuthService();
export type { GoogleUser, GoogleCredentialResponse, GoogleButtonConfiguration };