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
    createEffect(
        (prevUrl) => {
            const currentBrokerUrl = appConfig.brokerUrl;
            
            // Skip only if URL hasn't changed (but allow initial connection)
            if (prevUrl !== undefined && currentBrokerUrl === prevUrl) {
                return currentBrokerUrl;
            }
            
            // Always reconnect on brokerUrl changes, even in error states
            // The error might be due to old credentials, and new URL might have correct ones
            untrack(() => {
                if (appConfig.debug) {
                    if (prevUrl === undefined) {
                        console.log('Initial connection to:', currentBrokerUrl);
                    } else {
                        console.log('Auto-reconnecting due to brokerUrl change:', currentBrokerUrl);
                    }
                }
            });
            
            createConnection();
            
            return currentBrokerUrl;
        }, 
        undefined
    );

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
