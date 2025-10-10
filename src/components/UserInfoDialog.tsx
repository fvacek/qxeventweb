import { Component, createSignal } from "solid-js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useAuth, type AuthUser } from "~/context/AuthContext";
import { showToast } from "~/components/ui/toast";
import { logoutService } from "~/auth/logout";

interface UserInfoDialogProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser;
}

const UserInfoDialog: Component<UserInfoDialogProps> = (props) => {
  const { setUser } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = createSignal(false);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      // Use logout service to handle cleanup
      await logoutService.logout();

      // Clear the user from context
      setUser(null);

      // Show success message
      showToast({
        title: "Logged out",
        description: "You have been successfully logged out.",
        variant: "success"
      });

      // Close dialog
      props.onClose();

    } catch (error) {
      console.error("Logout error:", error);
      showToast({
        title: "Logout failed",
        description: "There was an error logging you out. Please try again.",
        variant: "error"
      });
    } finally {
      setIsLoggingOut(false);
    }
  };

  const getUserInitials = (name: string) => {
    const names = name.trim().split(" ");
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return name[0]?.toUpperCase() || "?";
  };

  return (
    <Dialog open={props.isOpen} onOpenChange={props.onClose}>
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Account Information</DialogTitle>
        </DialogHeader>

        <div class="flex flex-col items-center space-y-4 py-4">
          {/* Avatar */}
          <div class="flex items-center justify-center">
            {props.user.avatar ? (
              <img
                src={props.user.avatar}
                alt={props.user.name}
                class="w-20 h-20 rounded-full object-cover border-4 border-gray-200 shadow-lg"
                onError={(e) => {
                  // Replace with fallback on error
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.nextElementSibling;
                  // if (fallback) fallback.style.display = 'flex';
                }}
              />
            ) : null}

            {/* Fallback avatar */}
            <div
              class="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg"
              style={{ display: props.user.avatar ? 'none' : 'flex' }}
            >
              {getUserInitials(props.user.name)}
            </div>
          </div>

          {/* User details */}
          <div class="text-center space-y-2">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">
              {props.user.name}
            </h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {props.user.email}
            </p>
          </div>

          {/* Account info */}
          <div class="w-full space-y-3 mt-6">
            <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
              <div class="space-y-2">
                <div class="flex justify-between items-center">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Name
                  </span>
                  <span class="text-sm text-gray-900 dark:text-white">
                    {props.user.name}
                  </span>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email
                  </span>
                  <span class="text-sm text-gray-900 dark:text-white">
                    {props.user.email}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div class="flex flex-col space-y-2 pt-4">
          <Button
            onClick={handleLogout}
            disabled={isLoggingOut()}
            variant="destructive"
            class="w-full"
          >
            {isLoggingOut() ? "Logging out..." : "Log out"}
          </Button>
          <Button
            onClick={props.onClose}
            variant="outline"
            class="w-full"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default UserInfoDialog;
