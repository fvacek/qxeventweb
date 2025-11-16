import { Component, createSignal, onMount } from "solid-js";
import { useAuth, type AuthUser } from "~/context/AuthContext";
import { localMicrosoftAuthService, type LocalMicrosoftUser } from "~/auth/msal-local";
import { showToast } from "~/components/ui/toast";

interface LocalMicrosoftSignInProps {
  onSuccess?: (user: AuthUser) => void
  onError?: (error: Error) => void
  buttonText?: string
  clientId?: string
  tenantType?: 'consumers' | 'organizations' | 'common' | string
  redirectUri?: string
}

const LocalMicrosoftSignIn: Component<LocalMicrosoftSignInProps> = (props) => {
  const { setUser } = useAuth();
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [isInitialized, setIsInitialized] = createSignal(false);

  const convertToAuthUser = (microsoftUser: LocalMicrosoftUser): AuthUser => {
    return {
      email: microsoftUser.email,
      name: microsoftUser.name,
      avatar: undefined // Microsoft Graph API would be needed for profile picture
    };
  };

  const handleSignInSuccess = (microsoftUser: LocalMicrosoftUser) => {
    console.log('Local Microsoft sign-in successful:', microsoftUser);
    const authUser = convertToAuthUser(microsoftUser);
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
      const response = await localMicrosoftAuthService.signInWithPopup();
      if (response.account) {
        const user: LocalMicrosoftUser = {
          id: response.account.localAccountId || response.account.homeAccountId || '',
          email: response.account.username || (response.account.idTokenClaims as any)?.email || '',
          name: response.account.name || (response.account.idTokenClaims as any)?.name || '',
          given_name: (response.account.idTokenClaims as any)?.given_name,
          family_name: (response.account.idTokenClaims as any)?.family_name,
          preferred_username: (response.account.idTokenClaims as any)?.preferred_username || response.account.username,
        };
        handleSignInSuccess(user);
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

      {/*{isInitialized() && (
        <div class="flex items-center justify-center text-sm text-green-600">
          <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
          </svg>
          Ready to sign in
        </div>
      )}*/}

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
              {/*{error()?.includes("Client ID") && (
                <div class="mt-2">
                  <p class="text-xs text-red-600">
                    💡 Set your Azure AD client ID: <br/>
                    <code class="bg-red-100 px-1 rounded">
                      &lt;LocalMicrosoftSignIn clientId="your-client-id" /&gt;
                    </code>
                  </p>
                </div>
              )}*/}
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
