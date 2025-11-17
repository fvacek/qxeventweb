import { Component, createSignal, onMount, onCleanup } from "solid-js";
import { useAuth, type AuthUser } from "~/context/AuthContext";
import { localMicrosoftAuthService, type LocalMicrosoftUser } from "~/auth/msal-local";
import { showToast } from "~/components/ui/toast";

/**
 * LocalMicrosoftSignIn Component
 * 
 * A comprehensive Microsoft authentication component with avatar support.
 * Integrates with Microsoft Graph API to fetch user profile pictures.
 * 
 * Features:
 * - Microsoft OAuth authentication via MSAL
 * - Automatic avatar fetching from Microsoft Graph API
 * - Proper memory management for blob URLs
 * - Graceful fallback when avatar permissions are missing
 * - Interactive consent for additional permissions
 * - Toast notifications for user feedback
 * 
 * Avatar Support:
 * - Automatically requests User.Read scope during sign-in when enabled
 * - Falls back to interactive consent if initial auth lacks permissions
 * - Handles users without profile photos gracefully
 * - Cleans up object URLs to prevent memory leaks
 * 
 * @example
 * // Basic usage with avatar (default)
 * <LocalMicrosoftSignIn 
 *   clientId="your-azure-ad-client-id"
 *   onSuccess={(user) => console.log('Avatar URL:', user.avatar)}
 * />
 * 
 * @example
 * // Disable avatar fetching
 * <LocalMicrosoftSignIn 
 *   clientId="your-azure-ad-client-id"
 *   enableAvatar={false}
 * />
 * 
 * @example
 * // With custom tenant and redirect
 * <LocalMicrosoftSignIn 
 *   clientId="your-azure-ad-client-id"
 *   tenantType="organizations"
 *   redirectUri="https://yourapp.com/auth/callback"
 *   buttonText="Sign in with Work Account"
 * />
 */

interface LocalMicrosoftSignInProps {
  onSuccess?: (user: AuthUser) => void
  onError?: (error: Error) => void
  buttonText?: string
  clientId?: string
  tenantType?: 'consumers' | 'organizations' | 'common' | string
  redirectUri?: string
  /** 
   * Whether to fetch and include user avatar from Microsoft Graph API.
   * Requires User.Read permission. Defaults to true.
   * If consent fails, authentication continues without avatar.
   */
  enableAvatar?: boolean
}

const LocalMicrosoftSignIn: Component<LocalMicrosoftSignInProps> = (props) => {
  const { setUser } = useAuth();
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [isInitialized, setIsInitialized] = createSignal(false);
  const [currentAvatarUrl, setCurrentAvatarUrl] = createSignal<string | null>(null);

  const convertToAuthUser = (microsoftUser: LocalMicrosoftUser, avatar?: string): AuthUser => {
    return {
      email: microsoftUser.email,
      name: microsoftUser.name,
      avatar: avatar
    };
  };

  const handleSignInSuccess = async (microsoftUser: LocalMicrosoftUser) => {
    console.log('Local Microsoft sign-in successful:', microsoftUser);

    // Try to fetch avatar from Microsoft Graph API if enabled
    let avatar: string | undefined = undefined;
    if (props.enableAvatar !== false) {
      try {
        const accessToken = await localMicrosoftAuthService.getAccessToken(['User.Read']);
        if (accessToken) {
          const response = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          });

          if (response.ok) {
            const blob = await response.blob();
            avatar = URL.createObjectURL(blob);

            // Clean up previous avatar URL if it exists
            const prevUrl = currentAvatarUrl();
            if (prevUrl) {
              URL.revokeObjectURL(prevUrl);
            }
            setCurrentAvatarUrl(avatar);
          } else if (response.status === 404) {
            // User doesn't have a profile photo - this is normal
            console.log('User has no profile photo');
          } else {
            console.warn('Failed to fetch profile photo:', response.status, response.statusText);
          }
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message.includes('consent_required') || error.message.includes('invalid_grant')) {
            console.log('User needs to consent to User.Read permission for avatar. Attempting to request consent...');
            
            // Try to request additional consent for User.Read
            try {
              await localMicrosoftAuthService.requestAdditionalConsent(['User.Read']);
              // Retry avatar fetch after consent
              const retryToken = await localMicrosoftAuthService.getAccessToken(['User.Read']);
              if (retryToken) {
                const retryResponse = await fetch('https://graph.microsoft.com/v1.0/me/photo/$value', {
                  headers: {
                    'Authorization': `Bearer ${retryToken}`
                  }
                });
                
                if (retryResponse.ok) {
                  const blob = await retryResponse.blob();
                  avatar = URL.createObjectURL(blob);
                  
                  // Clean up previous avatar URL if it exists
                  const prevUrl = currentAvatarUrl();
                  if (prevUrl) {
                    URL.revokeObjectURL(prevUrl);
                  }
                  setCurrentAvatarUrl(avatar);
                  
                  showToast({
                    title: "Avatar loaded",
                    description: "Profile picture is now available",
                    variant: "success"
                  });
                }
              }
            } catch (consentError) {
              console.warn('Failed to get additional consent for avatar:', consentError);
              showToast({
                title: "Avatar unavailable",
                description: "Additional permissions needed for profile picture",
                variant: "warning"
              });
            }
          } else {
            console.warn('Failed to fetch user avatar:', error);
          }
        }
        // Continue without avatar - not a critical error
      }
    }

    const authUser = convertToAuthUser(microsoftUser, avatar);
    setUser(authUser);
    props.onSuccess?.(authUser);
    showToast({
      title: "Sign in successful",
      description: `Welcome, ${microsoftUser.name}!`,
      variant: "success"
    });
  };

  const handleSignInError = (error: Error) => {
    console.error("Local Microsoft sign-in error:", error);
    setError(error.message);
    props.onError?.(error);
    showToast({
      title: "Sign in failed",
      description: error.message,
      variant: "error",
    });
  };

  const initializeService = async () => {
    try {
      if (props.clientId) {
        localMicrosoftAuthService.updateConfig(
          props.clientId,
          props.tenantType || 'consumers',
          props.redirectUri
        );
      }
      await localMicrosoftAuthService.initialize();
      setIsInitialized(true);
      setError(null);
    } catch (error) {
      console.error('Failed to initialize local MSAL service:', error);

      if (error instanceof Error) {
        if (error.message.includes('unauthorized_client') || error.message.includes('not enabled for consumers')) {
          setError("Azure AD app not configured for personal accounts. Please check your app registration settings.");
        } else {
          setError(`Initialization failed: ${error.message}`);
        }
      } else {
        setError('Initialization failed: Unknown error');
      }
    }
  };

  const handleSignIn = async () => {
    if (!isInitialized()) {
      await initializeService();
    }

    if (!isInitialized()) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Include User.Read scope if avatar is enabled
      const scopes = ["openid", "profile", "email"];
      if (props.enableAvatar !== false) {
        scopes.push("User.Read");
      }
      
      const response = await localMicrosoftAuthService.signInWithPopupWithScopes(scopes);
      if (response.account) {
        const user: LocalMicrosoftUser = {
          id: response.account.localAccountId || response.account.homeAccountId || '',
          email: response.account.username || (response.account.idTokenClaims as any)?.email || '',
          name: response.account.name || (response.account.idTokenClaims as any)?.name || '',
          given_name: (response.account.idTokenClaims as any)?.given_name,
          family_name: (response.account.idTokenClaims as any)?.family_name,
          preferred_username: (response.account.idTokenClaims as any)?.preferred_username || response.account.username,
        };
        await handleSignInSuccess(user);
      }
    } catch (error: any) {
      // Provide specific error messages for common issues
      if (error.message?.includes('redirect_uri')) {
        const suggestions = localMicrosoftAuthService.getRedirectUriOptions();
        const errorMsg = `Redirect URI mismatch. Current: ${window.location.origin}. Try one of these in Azure AD: ${suggestions.join(', ')}`;
        handleSignInError(new Error(errorMsg));
      } else if (error.message?.includes('unauthorized_client') || error.message?.includes('not enabled for consumers')) {
        handleSignInError(new Error("App not configured for personal accounts. Check 'Supported account types' in Azure AD."));
      } else if (error.message?.includes('AADB2C90118')) {
        handleSignInError(new Error("Password reset required. Please reset your password."));
      } else if (error.message?.includes('AADB2C90091')) {
        handleSignInError(new Error("User cancelled sign-in process."));
      } else {
        handleSignInError(error as Error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  onMount(async () => {
    await initializeService();
  });

  onCleanup(() => {
    // Clean up avatar object URL when component is unmounted
    const avatarUrl = currentAvatarUrl();
    if (avatarUrl) {
      URL.revokeObjectURL(avatarUrl);
    }
  });

  return (
    <div class="space-y-4">
      {/* Main Sign-in Button */}
      <button
        onClick={handleSignIn}
        disabled={isLoading() || !isInitialized()}
        class="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {/* Microsoft Logo SVG */}
        <svg width="20" height="20" viewBox="0 0 21 21" class="mr-3">
          <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
          <rect x="12" y="1" width="9" height="9" fill="#00a4ef"/>
          <rect x="1" y="12" width="9" height="9" fill="#ffb900"/>
          <rect x="12" y="12" width="9" height="9" fill="#7fba00"/>
        </svg>

        {isLoading()
          ? "Signing in..."
          : !isInitialized()
            ? "Initializing..."
            : (props.buttonText || "Sign in with Microsoft")
        }
      </button>

      {/* Status Indicators */}
      {!isInitialized() && !error() && (
        <div class="flex items-center justify-center text-sm text-gray-500">
          <div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
          Initializing Microsoft authentication...
        </div>
      )}

      {/* Error Display */}
      {error() && (
        <div class="bg-red-50 border border-red-200 rounded-md p-4">
          <div class="flex">
            <div class="shrink-0">
              <svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
              </svg>
            </div>
            <div class="ml-3">
              <h3 class="text-sm font-medium text-red-800">Authentication Error</h3>
              <div class="mt-2">
                <p class="text-sm text-red-700">{error()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Configuration Help - Minimal */}
      {!props.clientId && (
        <div class="bg-blue-50 border border-blue-200 rounded-md p-3">
          <p class="text-sm text-blue-800">
            Please set your Azure AD client ID: <code class="bg-blue-100 px-1 rounded">clientId="your-client-id"</code>
          </p>
        </div>
      )}
    </div>
  );
};

export default LocalMicrosoftSignIn;
