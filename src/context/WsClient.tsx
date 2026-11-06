import {
  createContext,
  createSignal,
  useContext,
  JSX,
  onCleanup,
  Accessor,
  createEffect,
  createMemo,
  untrack,
  batch,
} from "solid-js";
import { RpcValue, WsClient } from "libshv-js";
import { useAppConfig } from "./AppConfig";
import { RecChng, RecChngSchema, SqlOperation } from "~/schema/rpc-sql-schema";
import { parse } from "valibot";
import { showToast } from "~/components/ui/toast";

type WsClientStatus =
  | "Connecting"
  | "Connected"
  | "Disconnected"
  | "Error"
  | "AuthError";

interface WsClientContextValue {
  wsClient: Accessor<WsClient | null>;
  status: Accessor<WsClientStatus>;
  // recChng: Accessor<RecChng>;
  reconnect: () => void;
  reconnectWithNewUrl: (newUrl: string) => void;
}

const WsClientContext = createContext<WsClientContextValue>();
const AUTO_RECONNECT_INTERVAL_MS = 1000;

export function WsClientProvider(props: { children: JSX.Element }) {
  const [status, setStatus] = createSignal<WsClientStatus>("Disconnected");
  const [wsClient, setWsClient] = createSignal<WsClient | null>(null);

  let connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  let autoReconnectTimer: ReturnType<typeof setInterval> | null = null;
  // Auto-reconnect only runs (and failure toasts are suppressed) once we have connected at least once
  let hasConnectedSuccessfully = false;

  const appConfig = useAppConfig();
  let currentBrokerUrl = appConfig.brokerUrl;

  const clearConnectionTimeout = () => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
      connectionTimeout = null;
    }
  };

  const reportFailure = (newStatus: "Error" | "AuthError", message: string) => {
    console.log(`Connection failed: ${message}`);
    setStatus(newStatus);
    // Don't spam a toast on every auto-reconnect attempt
    if (!hasConnectedSuccessfully) {
      showToast({ title: "Connection failed", description: message, variant: "destructive" });
    }
  };

  const stopAutoReconnect = () => {
    if (autoReconnectTimer) {
      clearInterval(autoReconnectTimer);
      autoReconnectTimer = null;
    }
  };

  const startAutoReconnect = () => {
    if (!hasConnectedSuccessfully || autoReconnectTimer) {
      return;
    }

    autoReconnectTimer = setInterval(() => {
      if (status() === "Connected") {
        stopAutoReconnect();
        return;
      }

      if (status() === "Connecting" || status() === "AuthError") {
        return;
      }

      if (appConfig.debug) {
        console.log("Auto reconnecting WebSocket");
      }
      createConnection();
    }, AUTO_RECONNECT_INTERVAL_MS);
  };

  const createConnection = () => {
    // Prevent multiple simultaneous connection attempts
    if (status() === "Connecting") {
      if (appConfig.debug) {
        console.log("Skipping connection attempt - already connecting");
      }
      return;
    }

    if (appConfig.debug) {
      console.log("Starting connection attempt to:", currentBrokerUrl);
    }

    clearConnectionTimeout();

    // Close existing connection if it exists
    wsClient()?.close();

    // Batch the state updates to prevent race conditions
    batch(() => {
      setWsClient(null);
      setStatus("Connecting");
    });

    // Set timeout to prevent infinite connecting state
    connectionTimeout = setTimeout(() => {
      if (status() === "Connecting") {
        reportFailure("Error", "Failed to connect within 10 seconds");
      }
    }, 10000);

    try {
      const broker_url = URL.parse(currentBrokerUrl);
      if (!broker_url) {
        throw new Error("Invalid broker URL");
      }

      // Callbacks from a replaced (old) client must be ignored
      const isCurrent = () => wsClient() === ws;

      const token = broker_url.searchParams.get("token") || ""
      const ws: WsClient = new WsClient({
        logDebug: appConfig.debug ? console.debug : () => {},
        wsUri: currentBrokerUrl.toString(),
        login: token ? {
          type: "TOKEN" as const,
          token: token,
        } : {
          type: "PLAIN" as const,
          user: broker_url.searchParams.get("user") || "",
          password: broker_url.searchParams.get("password") || "",
        },
        onConnected: () => {
          if (!isCurrent()) return;
          clearConnectionTimeout();
          console.log("WS CONNECTED");
          hasConnectedSuccessfully = true;
          stopAutoReconnect();
          setStatus("Connected");
        },
        onDisconnected: () => {
          if (!isCurrent()) return;
          clearConnectionTimeout();
          const st = status();
          if (st === "Connected") {
            setStatus("Disconnected");
            startAutoReconnect();
          } else if (st === "Connecting") {
            // The socket closed before login succeeded, e.g. the server is unreachable.
            // libshv-js reports this only as a close, not via onConnectionFailure.
            reportFailure("Error", `Cannot connect to broker ${broker_url.host}`);
          }
          // "Error" / "AuthError": already reported by onConnectionFailure or the timeout
        },
        onConnectionFailure: (error: Error) => {
          if (!isCurrent()) return;
          clearConnectionTimeout();
          stopAutoReconnect();
          // Check if it's likely an authentication error
          const msg = error.message.toLowerCase();
          const isAuthError = msg.includes("auth") || msg.includes("login") || msg.includes("credential");
          reportFailure(isAuthError ? "AuthError" : "Error", error.message);
        },
        onRequest: (shvPath: string) => {
          if (appConfig.debug) {
            console.log(`Requesting SHV path: ${shvPath}`);
          }
          return undefined;
        },
      });

      setWsClient(ws);
    } catch (error) {
      clearConnectionTimeout();
      reportFailure("Error", (error as Error).message);
      startAutoReconnect();
    }
  };

  // Initial connection
  createConnection();

  const reconnect = () => {
    // Manual reconnect - directly call createConnection
    if (appConfig.debug) {
      console.log("Manual reconnect requested");
    }
    createConnection();
  };

  const reconnectWithNewUrl = (newUrl: string) => {
    if (appConfig.debug) {
      console.log("Reconnecting with new URL:", newUrl);
    }
    currentBrokerUrl = newUrl;
    hasConnectedSuccessfully = false;
    stopAutoReconnect();
    createConnection();
  };

  onCleanup(() => {
    if (connectionTimeout) {
      clearTimeout(connectionTimeout);
    }
    stopAutoReconnect();
    const ws = wsClient();
    if (ws) {
      ws.close();
    }
  });

  // createEffect(() => {
  //   if (status() === "Connected") {
  //     const client = wsClient()!;
  //     console.log("Subscribing SQL recchng", appConfig.eventSqlPath());
  //     client.subscribe("qxeventweb", appConfig.eventSqlPath(), "recchng", (path: string, method: string, param?: RpcValue) => {
  //       console.log("Received signal:", path, method, param);
  //       const recchng: RecChng = parse(RecChngSchema, param);
  //       console.log("recchng:", recchng);
  //       setRecChng(recchng)
  //     });
  //   }
  // });

  return (
    <WsClientContext.Provider
      value={{ wsClient: wsClient, status, reconnect, reconnectWithNewUrl }}
    >
      {props.children}
    </WsClientContext.Provider>
  );
}

export function useWsClient() {
  const context = useContext(WsClientContext);
  if (!context) {
    throw new Error("useWsClient must be used within a WsClientProvider");
  }
  return context;
}
