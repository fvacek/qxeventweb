import {
  createContext,
  createSignal,
  useContext,
  JSX,
  onCleanup,
  onMount,
  Accessor,
} from "solid-js";
import { WsClient } from 'libshv-js';
import { useAppConfig } from "./AppConfig";

type WsClientStatus = "Connecting" | "Connected" | "Disconnected" | "Error";

interface WsClientContextValue {
  socket: Accessor<WsClient | null>;
  status: Accessor<WsClientStatus>;
}

const WsClientContext = createContext<WsClientContextValue>();

export function WsClientProvider(props: { children: JSX.Element }) {
    const [status, setStatus] = createSignal<WsClientStatus>("Connecting");
    const [socket, setSocket] = createSignal<WsClient | null>(null);

    const [appConfig, setAppConfig] = useAppConfig();

    onMount(() => {
        const broker_url = URL.parse(appConfig.brokerUrl) ?? (() => { throw new Error("Invalid broker URL"); })();
        let ws = new WsClient({
        logDebug: console.debug,
        wsUri: appConfig.brokerUrl.toString(),
        login: {
            type: 'PLAIN',
            user: broker_url.searchParams.get('user') || '',
            password: broker_url.searchParams.get('password') || '',
        },
        onConnected: () => {
            setStatus('Connected');
        },
        onDisconnected: () => {
            setStatus('Disconnected');
        },
        onConnectionFailure: (error: Error) => {
            console.log(`Connection failed: ${error.message}`);
            setStatus(`Error`);
        },
        onRequest: (shvPath: string) => {
            console.log(`Requesting SHV path: ${shvPath}`);
            return undefined;
        },
        });

        onCleanup(() => {
        ws.close();
        });
    });

    return (
        <WsClientContext.Provider value={{ socket, status }}>
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
