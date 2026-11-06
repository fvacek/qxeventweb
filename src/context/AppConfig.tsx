import { createContext, useContext } from "solid-js";

export type AppConfig = {
  brokerUrl: string,
  qxeventdPath: string,
  // eventsPath: string,
  theme: "light" | "dark",
  debug: boolean,
  qxeventdSqlApiPath: () => string,
  eventApiPath: (event_id: number) => string,
  eventSqlApiPath: (event_id: number) => string,
  eventCtlApiPath: () => string,
  // eventCtlEventApiPath: (event_id: number) => string,
  // eventCtlEventSqlApiPath: (event_id: number) => string,
};

// When the broker URL points to localhost but the page is opened from another
// host (e.g. a mobile device on the LAN), localhost would resolve to the client
// device itself. Use the page's hostname instead.
function resolveBrokerUrl(url: string): string {
  if (typeof window === "undefined") return url;
  const parsed = URL.parse(url);
  const pageHost = window.location.hostname;
  const isLocal = (h: string) => h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  if (parsed && isLocal(parsed.hostname) && !isLocal(pageHost)) {
    parsed.hostname = pageHost;
    return parsed.toString();
  }
  return url;
}

// Non-reactive config object
export const config: AppConfig = {
    brokerUrl: resolveBrokerUrl(import.meta.env.VITE_QXEVENT_BROKER_URL || "ws://localhost:3777?user=test&password=test"),
    qxeventdPath: import.meta.env.VITE_QXEVENTD_PATH || "test/qx/qxeventd",
    // eventsPath: import.meta.env.VITE_QXEVENT_DB_PATH || "test/qx/eventdb",
    theme: "dark",
    debug: import.meta.env.DEV || false,
    qxeventdSqlApiPath: function () { return `${this.qxeventdPath}/sql`; },
    eventCtlApiPath: function () { return `${this.qxeventdPath}/eventctl`; },
    eventApiPath: function (event_id: number) { return `${this.eventCtlApiPath()}/${event_id}`; },
    eventSqlApiPath: function (event_id: number) { return `${this.eventApiPath(event_id)}/sql`; },
    // eventCtlEventApiPath: function (event_id: number) { return `${this.eventCtlApiPath()}/${event_id}`; },
    // eventCtlEventSqlApiPath: function (event_id: number) { return `${this.eventCtlEventApiPath(event_id)}/sql`; },
};

const AppConfigContext = createContext(config);

export const useAppConfig = () => {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error("useAppConfig must be used within an AppConfigContext provider");
  }
  return context;
};

export default AppConfigContext;
