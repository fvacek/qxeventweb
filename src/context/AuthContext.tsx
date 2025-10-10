import {
  createContext,
  useContext,
  ParentProps,
  createSignal,
  Accessor,
  Setter,
} from "solid-js";
import { User } from "oidc-client-ts";

interface AuthContextType {
  user: Accessor<User | null>;
  setUser: Setter<User | null>;
}

const AuthContext = createContext<AuthContextType>();

export const AuthProvider = (props: ParentProps) => {
  const [user, setUser] = createSignal<User | null>(null);

  return (
    <AuthContext.Provider value={{ user, setUser }}>
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
