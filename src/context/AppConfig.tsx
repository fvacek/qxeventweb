import { createContext, useContext } from "solid-js";
import { createStore } from "solid-js/store";

export type AppConfig = {
  brokerUrl: string;
  theme: "light" | "dark";
  debug: boolean;
};

export const [config, setConfig] = createStore<AppConfig>({
    brokerUrl: import.meta.env.QXEVENT_BROKER_URL || "ws://localhost:3777?user=test&password=test1",
    theme: "dark",
    debug: import.meta.env.DEV || false,
});

const AppConfigContext = createContext([config, setConfig] as const);

export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error("useAppConfig must be used within an AppConfigContext.Provider");
  }
  return context;
};

export default AppConfigContext;
