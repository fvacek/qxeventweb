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

interface LoginDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginDialog: Component<LoginDialogProps> = (props) => {
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
          <Button class="w-full" onClick={() => authService.login("google")}>
            Login with Google
          </Button>
          <Button class="w-full" onClick={() => authService.login("microsoft")}>
            Login with Microsoft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LoginDialog;
