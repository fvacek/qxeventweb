import { Component, createSignal, onMount } from "solid-js";
import { useAuth, type AuthUser } from "~/context/AuthContext";
import {
  microsoftAuthService,
  type MicrosoftUser,
} from "~/auth/microsoft-auth";
import { showToast } from "~/components/ui/toast";

interface MicrosoftSignInProps {
  onSuccess?: (user: AuthUser) => void
  onError?: (error: Error) => void
  buttonText?: 'Sign in with Microsoft' | 'Sign up with Microsoft' | 'Continue with Microsoft'
  theme?: 'light' | 'dark'
  size?: 'small' | 'medium' | 'large'
}

const MicrosoftSignIn: Component<MicrosoftSignInProps> = (props) => {
  const { setUser } = useAuth();
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const [result, setResult] = createSignal<string>("");
  let buttonRef: HTMLDivElement | undefined;

  const convertMicrosoftUserToAuthUser = (microsoftUser: MicrosoftUser): AuthUser => {
    return {
      email: microsoftUser.email,
      name: microsoftUser.name,
      avatar: undefined // Microsoft Graph API would be needed for profile picture
    }
  }

  const handleSignInSuccess = (microsoftUser: MicrosoftUser) => {
    console.log('Microsoft sign-in successful:', microsoftUser)
    const authUser = convertMicrosoftUserToAuthUser(microsoftUser)
    setUser(authUser)
    props.onSuccess?.(authUser)
    showToast({
      title: "Sign in successful",
      description: `Welcome, ${microsoftUser.name}!`,
      variant: "success"
    })
  }

  const handleSignInError = (error: Error) => {
    console.error("Microsoft sign-in error:", error);
    setError(error.message);
    props.onError?.(error);
    showToast({
      title: "Sign in failed",
      description: error.message,
      variant: "error",
    });
  };

  const handleCredentialSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const microsoftUser = await microsoftAuthService.signInWithCredential()
      handleSignInSuccess(microsoftUser)
    } catch (error) {
      handleSignInError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTokenSignIn = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const { user: microsoftUser } = await microsoftAuthService.signInWithToken()
      handleSignInSuccess(microsoftUser)
    } catch (error) {
      handleSignInError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(async () => {
    if (buttonRef) {
      try {
        // Check configuration first
        const config = microsoftAuthService.validateConfiguration();
        if (!config.isValid) {
          console.error("Microsoft auth configuration errors:", config.errors);
          setError(`Configuration error: ${config.errors.join(", ")}`);
          return;
        }

        // Add event listener for the custom Microsoft sign-in event
        buttonRef.addEventListener(
          "microsoftSignIn",
          ((event: CustomEvent<{ user: MicrosoftUser }>) => {
            const user = event.detail.user;
            if (user) {
              handleSignInSuccess(user);
            } else {
              handleSignInError(
                new Error("Failed to parse Microsoft credential response"),
              );
            }
          }) as EventListener,
        );

        // Add event listener for sign-in errors
        buttonRef.addEventListener(
          "microsoftSignInError",
          ((event: CustomEvent<{ error: Error }>) => {
            handleSignInError(event.detail.error);
          }) as EventListener,
        );

        // Render the Microsoft sign-in button
        await microsoftAuthService.renderButton(buttonRef, {
          theme: props.theme || "light",
          size: props.size || "large",
          text: props.buttonText || "Sign in with Microsoft",
        });
      } catch (error) {
        console.error("Failed to render Microsoft sign-in button:", error);
        
        // Provide more specific error messages
        if (error instanceof Error) {
          if (error.message.includes("timeout")) {
            setError("Microsoft authentication initialization timed out. Please check your internet connection and try again.");
          } else if (error.message.includes("Client ID")) {
            setError("Microsoft authentication is not configured. Please set up your Azure AD client ID.");
          } else {
            setError(`Failed to initialize Microsoft sign-in: ${error.message}`);
          }
        } else {
          setError("Failed to initialize Microsoft sign-in");
        }
      }
    }
  });

  return (
    <div>
      {/* Microsoft MSAL Button */}
      <div
        ref={buttonRef}
        class={`microsoft-signin-button ${isLoading() ? "microsoft-signin-loading" : ""}`}
      />

      {/* Alternative manual buttons for testing */}
      <div class="mt-4 space-y-2">
        <button
          onClick={handleCredentialSignIn}
          disabled={isLoading()}
          class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading() ? "Signing in..." : "Sign in with Microsoft (Popup)"}
        </button>
        
        <button
          onClick={handleTokenSignIn}
          disabled={isLoading()}
          class="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          {isLoading() ? "Signing in..." : "Sign in with Microsoft (Token)"}
        </button>

        <button
          onClick={async () => {
            const status = microsoftAuthService.getInitializationStatus();
            console.log("MSAL Status:", status);
            setResult(JSON.stringify(status, null, 2));
          }}
          class="w-full flex justify-center py-2 px-4 border border-yellow-300 rounded-md shadow-sm text-sm font-medium text-yellow-700 bg-yellow-50 hover:bg-yellow-100"
        >
          Check MSAL Status
        </button>
      </div>

      {/* Error display */}
      {error() && (
        <div class="mt-4">
          <div class="flex">
            <div class="shrink-0">
              <svg
                class="h-5 w-5 text-red-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clip-rule="evenodd"
                />
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

      {/* Debug info display */}
      {result() && (
        <div class="mt-4 bg-gray-50 border border-gray-200 rounded-md p-4">
          <h4 class="font-medium text-gray-900 mb-2">Debug Information</h4>
          <pre class="text-xs text-gray-700 whitespace-pre-wrap">{result()}</pre>
        </div>
      )}
    </div>
  );
};

export default MicrosoftSignIn;