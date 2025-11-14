import {
  createContext,
  createSignal,
  useContext,
  JSX,
  createEffect,
  Accessor,
  untrack,
} from "solid-js";
import { RpcValue } from "libshv-js";
import { parse } from "valibot";
import { useWsClient } from "./WsClient";
import { useAppConfig } from "./AppConfig";
import { RecChng, RecChngSchema } from "~/schema/rpc-sql-schema";

interface SubscribeContextValue {
  recchngReceived: Accessor<RecChng | null>;
}

const SubscribeContext = createContext<SubscribeContextValue>();

export function SubscribeProvider(props: { children: JSX.Element }) {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const [recchngReceived, setRecchngReceived] = createSignal<RecChng | null>(null);
  const [eventId, setEventId] = createSignal<number>(0);

  createEffect(() => {
    if (status() === "Connected") {
      const client = wsClient()!;

      // Subscribe to qxEvent SQL path (used by Events)
      console.log("Subscribing SQL recchng", appConfig.qxeventdPath);
      client.subscribe("qxeventweb", appConfig.qxeventdPath, "recchng", (path: string, method: string, param?: RpcValue) => {
        console.log("Received signal:", path, method, param);
        const recchng: RecChng = parse(RecChngSchema, param);
        console.log("recchng:", recchng);
        setRecchngReceived(recchng);
      });
    }
  });

  createEffect(() => {
    const eid = eventId();
    const client = wsClient()!;

    // Subscribe to event SQL path (used by LateEntries)
    console.log("Subscribing SQL recchng", appConfig.eventSqlApiPath(eid));
    client.subscribe("qxeventweb", appConfig.eventSqlApiPath(eid), "recchng", (path: string, method: string, param?: RpcValue) => {
      console.log("Received signal:", path, method, param);
      const recchng: RecChng = parse(RecChngSchema, param);
      console.log("recchng:", recchng);
      setRecchngReceived(recchng);
    });
  });

  const contextValue: SubscribeContextValue = {
    recchngReceived,
  };

  return (
    <SubscribeContext.Provider value={contextValue}>
      {props.children}
    </SubscribeContext.Provider>
  );
}

export function useSubscribe(): SubscribeContextValue {
  const context = useContext(SubscribeContext);
  if (!context) {
    throw new Error("useSubscribe must be used within a SubscribeProvider");
  }
  return context;
}
