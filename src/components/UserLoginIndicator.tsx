import { Component, createSignal, createMemo } from "solid-js";
import { useAuth } from "~/context/AuthContext";
import GoogleSignIn from "~/components/GoogleSignIn";
import UserInfoDialog from "./UserInfoDialog";
import "./UserLoginIndicator.css";

const UserLoginIndicator: Component = () => {
  const { user } = useAuth();
  const [userInfoDialogIsOpen, setUserInfoDialogIsOpen] = createSignal(false);
  const [avatarError, setAvatarError] = createSignal(false);

  const handleButtonClick = () => {
    if (user()) {
      setUserInfoDialogIsOpen(true);
    }
  };

  // Get user initials for fallback avatar
  const userInitials = createMemo(() => {
    const currentUser = user();
    if (!currentUser?.name) return "?";

    const names = currentUser.name.trim().split(" ");
    if (names.length >= 2) {
      return (names[0][0] + names[names.length - 1][0]).toUpperCase();
    }
    return currentUser.name[0].toUpperCase();
  });

  const handleAvatarError = () => {
    setAvatarError(true);
  };

  return (
    <div class="user-login-indicator">
      {user() ? (
        <>
          <button
            onClick={handleButtonClick}
            class="login-button logged-in"
            aria-label={`Account info for ${user()!.name}`}
          >
            {user()!.avatar && !avatarError() ? (
              <img
                src={user()!.avatar}
                alt={user()!.name}
                class="user-avatar"
                onError={handleAvatarError}
                onLoad={() => setAvatarError(false)}
              />
            ) : (
              <div class="avatar-fallback">
                {userInitials()}
              </div>
            )}
            <span class="user-name">{user()!.name}</span>
          </button>
          <UserInfoDialog
            isOpen={userInfoDialogIsOpen()}
            onClose={() => setUserInfoDialogIsOpen(false)}
            user={user()!}
          />
        </>
      ) : (
        <GoogleSignIn
          buttonText="signin"
          theme="outline"
          size="medium"
          width={120}
        />
      )}
    </div>
  );
};

export default UserLoginIndicator;