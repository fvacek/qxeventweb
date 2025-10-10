import { Component, createSignal, onMount } from "solid-js";
import { useAuth } from "~/context/AuthContext";
import {
  googleAuthService,
  type GoogleUser,
  type GoogleCredentialResponse,
} from "~/auth/google-auth";
import { showToast } from "~/components/ui/toast";

interface GoogleSignInProps {
  onSuccess?: (user: GoogleUser) => void;
  onError?: (error: Error) => void;
  buttonText?: "signin_with" | "signup_with" | "continue_with" | "signin";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
}

const GoogleSignIn: Component<GoogleSignInProps> = (props) => {
  const { setUser } = useAuth();
  const [isLoading, setIsLoading] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let buttonRef: HTMLDivElement | undefined;

  const handleSignInSuccess = (user: GoogleUser) => {
    console.log("Google sign-in successful:", user);
    setUser(user);
    props.onSuccess?.(user);
    showToast({
      title: "Sign in successful",
      description: `Welcome, ${user.name}!`,
      variant: "success",
    });
  };

  const handleSignInError = (error: Error) => {
    console.error("Google sign-in error:", error);
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
      const user = await googleAuthService.signInWithCredential();
      handleSignInSuccess(user);
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
      const { user } = await googleAuthService.signInWithToken();
      handleSignInSuccess(user);
    } catch (error) {
      handleSignInError(error as Error);
    } finally {
      setIsLoading(false);
    }
  };

  onMount(async () => {
    if (buttonRef) {
      try {
        // Add event listener for the custom Google sign-in event
        buttonRef.addEventListener(
          "googleSignIn",
          (event: CustomEvent<GoogleCredentialResponse>) => {
            const user = googleAuthService.parseCredentialResponse(
              event.detail,
            );
            if (user) {
              handleSignInSuccess(user);
            } else {
              handleSignInError(
                new Error("Failed to parse Google credential response"),
              );
            }
          },
        );

        // Render the Google sign-in button
        await googleAuthService.renderButton(buttonRef, {
          theme: props.theme || "outline",
          size: props.size || "large",
          text: props.buttonText || "signin_with",
          shape: "rectangular",
        });
      } catch (error) {
        console.error("Failed to render Google sign-in button:", error);
        setError("Failed to initialize Google sign-in");
      }
    }
  });

  return (
    <div>
      {/* Google Identity Services Button */}
      <div
        ref={buttonRef}
        class={`google-signin-button ${isLoading() ? "google-signin-loading" : ""}`}
      />

      {/* Error display */}
      {error() && (
        <div>
          <div class="flex">
            <div class="flex-shrink-0">
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
              <h3>Authentication Error</h3>
              <div class="mt-2">
                <p>{error()}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoogleSignIn;
