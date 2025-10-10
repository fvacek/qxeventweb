import { Component, onMount } from "solid-js";
import { useAuth } from "~/context/AuthContext";
import { authService } from "./auth-service";
import { useSearchParams } from "@solidjs/router";

interface OidcLoginProps {
  provider: "google" | "microsoft";
}

const OidcLogin: Component<OidcLoginProps> = (props) => {
  const { setUser } = useAuth();
  const [searchParams] = useSearchParams();

  onMount(async () => {
    if (searchParams.code) {
      const user = await authService.handleCallback(props.provider);
      setUser(user);
      window.location.href = "/";
    }
  });

  return <div>Handling login...</div>;
};

export default OidcLogin;
