import { createContext, useContext } from "solid-js";

export type AppConfig = {
  brokerUrl: string,
  eventPath: string,
  theme: "light" | "dark",
  debug: boolean,
  eventSqlPath: () => string,
  qxEventShvPath: () => string,
};

// Non-reactive config object
export const config: AppConfig = {
    brokerUrl: import.meta.env.QXEVENT_BROKER_URL || "ws://localhost:3777?user=test&password=test",
    eventPath: import.meta.env.QXEVENT_EVENT_PATH || "test/sql/hsh2025",
    theme: "dark",
    debug: import.meta.env.DEV || false,
    eventSqlPath: function() { return `${this.eventPath}/sql`; },
    qxEventShvPath: function() { return 'test/qxeventd'; },
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
