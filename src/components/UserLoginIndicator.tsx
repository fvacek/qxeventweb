import { Component, createSignal, createMemo } from "solid-js";
import { useAuth } from "~/context/AuthContext";
import LoginDialog from "./LoginDialog";
import UserInfoDialog from "./UserInfoDialog";
import "./UserLoginIndicator.css";

const UserLoginIndicator: Component = () => {
  const { user } = useAuth();
  const [loginDialogIsOpen, setLoginDialogIsOpen] = createSignal(false);
  const [userInfoDialogIsOpen, setUserInfoDialogIsOpen] = createSignal(false);
  const [avatarError, setAvatarError] = createSignal(false);

  const handleButtonClick = () => {
    if (user()) {
      // If logged in, show user info dialog
      setUserInfoDialogIsOpen(true);
    } else {
      // If not logged in, show login dialog
      setLoginDialogIsOpen(true);
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
      <button 
        onClick={handleButtonClick}
        class={`login-button ${user() ? 'logged-in' : 'logged-out'}`}
        aria-label={user() ? `Account info for ${user()!.name}` : "Log in"}
      >
        {user() ? (
          <>
            {/* Avatar with fallback */}
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
          </>
        ) : (
          <span class="login-text">Log in</span>
        )}
      </button>
      <LoginDialog
        isOpen={loginDialogIsOpen()}
        onClose={() => setLoginDialogIsOpen(false)}
      />
      {user() && (
        <UserInfoDialog
          isOpen={userInfoDialogIsOpen()}
          onClose={() => setUserInfoDialogIsOpen(false)}
          user={user()!}
        />
      )}
    </div>
  );
};

export default UserLoginIndicator;
