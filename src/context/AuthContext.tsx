import {
  createContext,
  useContext,
  ParentProps,
  createSignal,
  Accessor,
  Setter,
} from "solid-js";
import { User } from "oidc-client-ts";
import type { GoogleUser } from "~/auth/google-auth";
import { normalizeUser, type NormalizedUser } from "~/auth/user-utils";

// Generic user type that works with both OIDC and Google auth
export type AuthUser = User | GoogleUser;

interface AuthContextType {
  user: Accessor<NormalizedUser | null>;
  setUser: (user: AuthUser | null) => void;
  rawUser: Accessor<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType>();

export const AuthProvider = (props: ParentProps) => {
  const [rawUser, setRawUser] = createSignal<AuthUser | null>(null);
  
  const user = () => {
    const raw = rawUser();
    return raw ? normalizeUser(raw) : null;
  };
  
  const setUser = (user: AuthUser | null) => {
    setRawUser(user);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, rawUser }}>
      {props.children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
