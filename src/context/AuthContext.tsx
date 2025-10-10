import {
  createContext,
  useContext,
  ParentProps,
  createSignal,
  Accessor,
  Setter,
} from "solid-js";

// Simplified user type with essential fields only
export interface AuthUser {
  email: string;
  name: string;
  avatar?: string;
}

interface AuthContextType {
  user: Accessor<AuthUser | null>;
  setUser: Setter<AuthUser | null>;
}

const AuthContext = createContext<AuthContextType>();

export const AuthProvider = (props: ParentProps) => {
  const [user, setUser] = createSignal<AuthUser | null>(null);

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
