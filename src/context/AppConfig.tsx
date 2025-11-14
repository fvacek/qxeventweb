import { createContext, useContext } from "solid-js";

export type AppConfig = {
  brokerUrl: string,
  qxeventdPath: string,
  eventsPath: string,
  theme: "light" | "dark",
  debug: boolean,
  eventSqlApiPath: (event_id: number) => string,
};

// Non-reactive config object
export const config: AppConfig = {
    brokerUrl: import.meta.env.QXEVENT_BROKER_URL || "ws://localhost:3777?user=test&password=test",
    qxeventdPath: import.meta.env.QXEVENTD_PATH || "test/qx/eventd",
    eventsPath: import.meta.env.QXEVENTS_PATH || "test/qx/events",
    theme: "dark",
    debug: import.meta.env.DEV || false,
    eventSqlApiPath: function(event_id: number) { return `${this.eventsPath}/{event_id}/sql`; },
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
