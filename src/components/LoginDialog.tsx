import { Component } from "solid-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import GoogleSignIn from "~/components/GoogleSignIn";
import LocalMicrosoftSignIn from "~/components/LocalMicrosoftSignIn";
import type { AuthUser } from "~/context/AuthContext";
import { createSignal } from "solid-js";

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginDialog: Component<LoginDialogProps> = (props) => {

  const handleGoogleSuccess = (user: AuthUser) => {
    console.log('Login successful:', user);
    props.onClose();
  };

  const handleGoogleError = (error: Error) => {
    console.error('Login failed:', error);
  };

  const handleMicrosoftSuccess = (user: AuthUser) => {
    console.log('Microsoft login successful:', user);
    props.onClose();
  };

  const handleMicrosoftError = (error: Error) => {
    console.error('Microsoft login failed:', error);
  };
  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Login</DialogTitle>
          <DialogDescription>
            Choose a provider to log in with.
          </DialogDescription>
        </DialogHeader>
        <div class="flex flex-col gap-4">
          <GoogleSignIn
            onSuccess={handleGoogleSuccess}
            onError={handleGoogleError}
            buttonText="signin_with"
            theme="outline"
            size="large"
          />

          <LocalMicrosoftSignIn
            onSuccess={handleMicrosoftSuccess}
            onError={handleMicrosoftError}
            buttonText="Sign in with Microsoft"
            clientId="91558390-82a8-4607-8a39-29046dbe3a14"
            // tenantType="consumers" // MSAL only tenant
            tenantType="common"
            redirectUri={typeof window !== 'undefined' ? `${window.location.origin}/` : undefined}
          />


        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
