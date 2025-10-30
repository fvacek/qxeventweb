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

interface RecChngContextValue {
  recchngReceived: Accessor<RecChng | null>;
}

const RecChngContext = createContext<RecChngContextValue>();

export function RecChngProvider(props: { children: JSX.Element }) {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const [recchngReceived, setRecchngReceived] = createSignal<RecChng | null>(null);
  


  // Subscribe to both event SQL and qxEvent SQL paths
  createEffect(() => {
    if (status() === "Connected") {
      const client = wsClient()!;

      // Subscribe to event SQL path (used by LateEntries)
      console.log("Subscribing SQL recchng", appConfig.eventSqlPath());
      client.subscribe("qxeventweb", appConfig.eventSqlPath(), "recchng", (path: string, method: string, param?: RpcValue) => {
        console.log("Received signal:", path, method, param);
        const recchng: RecChng = parse(RecChngSchema, param);
        console.log("recchng:", recchng);
        setRecchngReceived(recchng);
      });

      // Subscribe to qxEvent SQL path (used by Events)
      console.log("Subscribing SQL recchng", `${appConfig.qxEventShvPath()}/sql`);
      client.subscribe("qxeventweb", `${appConfig.qxEventShvPath()}/sql`, "recchng", (path: string, method: string, param?: RpcValue) => {
        console.log("Received signal:", path, method, param);
        const recchng: RecChng = parse(RecChngSchema, param);
        console.log("recchng:", recchng);
        untrack(() => setRecchngReceived(recchng));
      });
    }
  });
  
  const contextValue: RecChngContextValue = {
    recchngReceived,
  };

  return (
    <RecChngContext.Provider value={contextValue}>
      {props.children}
    </RecChngContext.Provider>
  );
}

export function useRecChng(): RecChngContextValue {
  const context = useContext(RecChngContext);
  if (!context) {
    throw new Error("useRecChng must be used within a RecChngProvider");
  }
  return context;
}
