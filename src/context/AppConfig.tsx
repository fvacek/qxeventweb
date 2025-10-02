import { createContext, useContext } from "solid-js";

export type AppConfig = {
  brokerUrl: string;
  theme: "light" | "dark";
  debug: boolean;
};

// Non-reactive config object
export const config: AppConfig = {
    brokerUrl: import.meta.env.QXEVENT_BROKER_URL || "ws://localhost:3777?user=test&password=test",
    theme: "dark",
    debug: import.meta.env.DEV || false,
};

const AppConfigContext = createContext(config);

export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error("useAppConfig must be used within an AppConfigContext.Provider");
  }
  return context;
};

export default AppConfigContext;
