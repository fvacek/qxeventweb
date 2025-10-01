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

type WsClientStatus = "Connecting" | "Connected" | "Disconnected" | "Error" | "AuthError";

interface WsClientContextValue {
  socket: Accessor<WsClient | null>;
  status: Accessor<WsClientStatus>;
  reconnect: () => void;
}

const WsClientContext = createContext<WsClientContextValue>();

export function WsClientProvider(props: { children: JSX.Element }) {
    const [status, setStatus] = createSignal<WsClientStatus>("Disconnected");
    const [socket, setSocket] = createSignal<WsClient | null>(null);
    const [lastReconnectTime, setLastReconnectTime] = createSignal(0);
    let connectionTimeout: number | null = null;

    const [appConfig] = useAppConfig();

    // Track only brokerUrl changes to prevent unnecessary reconnections
    const brokerUrl = createMemo(() => appConfig.brokerUrl);

    const createConnection = () => {
        // Prevent multiple simultaneous connection attempts
        if (status() === "Connecting") {
            if (appConfig.debug) {
                console.log('Skipping connection attempt - already connecting');
            }
            return;
        }

        // Prevent rapid reconnection attempts
        const now = Date.now();
        if (now - lastReconnectTime() < 1000) {
            if (appConfig.debug) {
                console.log('Throttling reconnection attempt - too soon since last attempt');
            }
            return;
        }

        setLastReconnectTime(now);
        
        if (appConfig.debug) {
            console.log('Starting connection attempt to:', appConfig.brokerUrl);
        }

        // Clear any existing timeout
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
        }

        // Close existing connection if it exists
        const existingSocket = socket();
        if (existingSocket) {
            existingSocket.close();
            setSocket(null);
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
            const broker_url = URL.parse(appConfig.brokerUrl);
            if (!broker_url) {
                throw new Error("Invalid broker URL");
            }

            const ws = new WsClient({
                logDebug: appConfig.debug ? console.debug : () => {},
                wsUri: appConfig.brokerUrl.toString(),
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

            setSocket(ws);
        } catch (error) {
            if (connectionTimeout) {
                clearTimeout(connectionTimeout);
                connectionTimeout = null;
            }
            console.error('Failed to create WsClient:', error);
            setStatus('Error');
        }
    };

    // Only reconnect when brokerUrl changes (not on status or other config changes)
    createEffect(() => {
        // This tracks only the brokerUrl, so it only runs when brokerUrl changes
        const currentBrokerUrl = brokerUrl();
        
        // Don't reconnect if we're in an error state - manual reconnects use different path
        // Use untrack to avoid making this effect reactive to status changes
        const currentStatus = untrack(() => status());
        if (currentStatus === 'AuthError' || currentStatus === 'Error') {
            untrack(() => {
                if (appConfig.debug) {
                    console.log('Skipping auto-reconnect due to error state:', currentStatus);
                }
            });
            return;
        }
        
        untrack(() => {
            if (appConfig.debug) {
                console.log('Auto-reconnecting due to brokerUrl change:', currentBrokerUrl);
            }
        });
        
        createConnection();
    });

    const reconnect = () => {
        // Manual reconnect - directly call createConnection without changing status
        // This prevents triggering the createEffect
        if (appConfig.debug) {
            console.log('Manual reconnect requested');
        }
        createConnection();
    };

    onCleanup(() => {
        if (connectionTimeout) {
            clearTimeout(connectionTimeout);
        }
        const ws = socket();
        if (ws) {
            ws.close();
        }
    });

    return (
        <WsClientContext.Provider value={{ socket, status, reconnect }}>
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
