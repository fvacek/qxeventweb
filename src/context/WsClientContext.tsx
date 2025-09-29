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

type WsClientStatus = "Connecting" | "Connected" | "Disconnected" | "Error";

interface WsClientContextValue {
  socket: Accessor<WsClient | null>;
  status: Accessor<WsClientStatus>;
}

const WsClientContext = createContext<WsClientContextValue>();

export function WsClientProvider(props: { children: JSX.Element }) {
  const [status, setStatus] = createSignal<WsClientStatus>("Connecting");
  const [socket, setSocket] = createSignal<WsClient | null>(null);

  const [username, setUsername] = createSignal('test');
  const [password, setPassword] = createSignal('test');
  const [brokerUrl, setBrokerUrl] = createSignal('ws://localhost:3777');

  onMount(() => {
    let ws = new WsClient({
      logDebug: console.debug,
      wsUri: brokerUrl(),
      login: {
        type: 'PLAIN',
        user: username(),
        password: password(),
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
