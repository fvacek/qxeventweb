import { Component } from "solid-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { authService } from "~/auth/auth-service";
import GoogleSignIn from "~/components/GoogleSignIn";
import type { GoogleUser } from "~/auth/google-auth";

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginDialog: Component<LoginDialogProps> = (props) => {
  const handleGoogleSuccess = (user: GoogleUser) => {
    console.log('Login successful:', user);
    props.onClose();
  };

  const handleGoogleError = (error: Error) => {
    console.error('Login failed:', error);
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
          <Button class="w-full" onClick={() => authService.login("microsoft")}>
            Login with Microsoft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
