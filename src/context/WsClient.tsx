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
} from "solid-js";
import { WsClient } from 'libshv-js';
import { useAppConfig } from "./AppConfig";
import { EventConfig, useEventConfig } from "./EventConfig";

const { setEventConfig } = useEventConfig();

type WsClientStatus = "Connecting" | "Connected" | "Disconnected" | "Error" | "AuthError";

interface WsClientContextValue {
  wsClient: Accessor<WsClient | null>;
  status: Accessor<WsClientStatus>;
  reconnect: () => void;
  reconnectWithNewUrl: (newUrl: string) => void;
}

const WsClientContext = createContext<WsClientContextValue>();

export function WsClientProvider(props: { children: JSX.Element }) {
    const [status, setStatus] = createSignal<WsClientStatus>("Disconnected");
    const [wsClient, setWsClient] = createSignal<WsClient | null>(null);
    let connectionTimeout: number | null = null;

    const appConfig = useAppConfig();
    let currentBrokerUrl = appConfig.brokerUrl;

    const createConnection = () => {
        // Prevent multiple simultaneous connection attempts
        if (status() === "Connecting") {
            if (appConfig.debug) {
                console.log('Skipping connection attempt - already connecting');
            }
            return;
        }

        if (appConfig.debug) {
            console.log('Starting connection attempt to:', currentBrokerUrl);
        }

        // Clear any existing timeout
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
        }

        // Close existing connection if it exists
        const existingSocket = wsClient();
        if (existingSocket) {
            existingSocket.close();
            setWsClient(null);
        }

        setStatus("Connecting");

        // Set timeout to prevent infinite connecting state
        connectionTimeout = setTimeout(() => {
            if (status() === "Connecting") {
                setStatus("Error");
                console.error("Connection timeout: Failed to connect within 10 seconds");
            }
        }, 10000);

        try {
            const broker_url = URL.parse(currentBrokerUrl);
            if (!broker_url) {
                throw new Error("Invalid broker URL");
            }

            const ws = new WsClient({
                logDebug: appConfig.debug ? console.debug : () => {},
                wsUri: currentBrokerUrl.toString(),
                login: {
                    type: 'PLAIN',
                    user: broker_url.searchParams.get('user') || '',
                    password: broker_url.searchParams.get('password') || '',
                },
                onConnected: () => {
                    if (connectionTimeout) {
                        clearTimeout(connectionTimeout);
                        connectionTimeout = null;
                    }
                    // loadEventConfig();
                    setStatus('Connected');
                },
                onDisconnected: () => {
                    if (connectionTimeout) {
                        clearTimeout(connectionTimeout);
                        connectionTimeout = null;
                    }
                    setStatus('Disconnected');
                },
                onConnectionFailure: (error: Error) => {
                    if (connectionTimeout) {
                        clearTimeout(connectionTimeout);
                        connectionTimeout = null;
                    }
                    console.log(`Connection failed: ${error.message}`);
                    // Check if it's likely an authentication error
                    if (error.message.toLowerCase().includes('auth') ||
                        error.message.toLowerCase().includes('login') ||
                        error.message.toLowerCase().includes('credential')) {
                        setStatus('AuthError');
                    } else {
                        setStatus('Error');
                    }
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
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            console.error('Failed to create WsClient:', error);
            setStatus('Error');
        }
    };

    // Initial connection
    createConnection();

    const reconnect = () => {
        // Manual reconnect - directly call createConnection
        if (appConfig.debug) {
            console.log('Manual reconnect requested');
        }
        createConnection();
    };

    const reconnectWithNewUrl = (newUrl: string) => {
        if (appConfig.debug) {
            console.log('Reconnecting with new URL:', newUrl);
        }
        currentBrokerUrl = newUrl;
        createConnection();
    };

    onCleanup(() => {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
        }
        const ws = wsClient();
        if (ws) {
            ws.close();
        }
    });

    const loadEventConfig = async (ws: WsClient) => {
        if (appConfig.debug) {
            console.log('Loading event config');
        }
        try {
            const result = await ws.callRpcMethod(appConfig.eventPath, "select", ["SELECT * FROM config"])
            if (result instanceof Error) {
                console.error("RPC error:", result)
                throw new Error(result.message)
            }
            const event_config = new EventConfig();
            event_config.eventName = "foo-bar";
            setEventConfig(event_config);
        } catch (error) {
            console.error('Failed to load event config:', error);
        }
    };

    return (
        <WsClientContext.Provider value={{ wsClient: wsClient, status, reconnect, reconnectWithNewUrl }}>
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
