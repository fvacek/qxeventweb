import { createContext, useContext } from "solid-js";
import { createStore } from "solid-js/store";

export type AppConfig = {
  brokerUrl: string;
  theme: "light" | "dark";
  debug: boolean;
};

const [config, setConfig] = createStore<AppConfig>({
    brokerUrl: "ws://localhost:3777?user=test&password=test",
    theme: "dark",
    debug: true,
});

const AppConfigContext = createContext([config, setConfig] as const);

export const useAppConfig = () => useContext(AppConfigContext);

export default AppConfigContext;
