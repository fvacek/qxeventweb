import { Component, createSignal } from "solid-js";
import { useAuth } from "~/context/AuthContext";
import LoginDialog from "./LoginDialog";

const UserLoginIndicator: Component = () => {
  const { user } = useAuth();
  const [loginDialogIsOpen, setLoginDialogIsOpen] = createSignal(false);

  const openLoginDialog = () => {
    setLoginDialogIsOpen(true);
  };

  return (
    <>
      <button onClick={openLoginDialog}>
        {user() ? user()!.profile.name : "Log in"}
      </button>
      <LoginDialog
        isOpen={loginDialogIsOpen()}
        onClose={() => setLoginDialogIsOpen(false)}
      />
    </>
  );
};

export default UserLoginIndicator;
