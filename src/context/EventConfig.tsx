import {
  Accessor,
  createContext,
  createEffect,
  createSignal,
  useContext,
} from "solid-js";
import { createStore } from "solid-js/store";
import { RpcValue } from "libshv-js";
import { useAppConfig } from "./AppConfig";
import { useWsClient } from "./WsClient";

export class StageConfig {
  stageStart: string = "";
}

export class EventConfig {
  name?: string;
  place?: string;
  date?: Date;
  stageCount: number = 1;
  // stages: StageConfig[] = []
}

interface EventConfigContextType {
  eventConfig: EventConfig;
  setEventConfig: (eventConfig: EventConfig) => void;
  eventOpen: Accessor<boolean>;
}

const EventConfigContext = createContext<EventConfigContextType>();

export function EventConfigProvider(props: { children: any }) {
  const appConfig = useAppConfig();
  const { wsClient, status } = useWsClient();

  const [eventConfig, setEventConfig] = createStore(new EventConfig());
  const [eventOpen, setEventOpen] = createSignal(false);

  createEffect(() => {
    if (status() === "Connected") {
      loadEventConfig();
    }
  });

  /**
   * Parses event configuration from RPC response data
   * 
   * @param input - RPC response with rows array containing config key-value pairs
   * @returns EventConfig object with parsed values or defaults on error
   * 
   * @example
   * const rpcResult = {
   *   rows: [
   *     ['event.name', null, 'Championship 2024', ''],
   *     ['event.place', null, 'Stadium', ''],
   *     ['event.date', null, '2024-12-01', ''],
   *     ['event.stageCount', null, '3', '']
   *   ]
   * };
   * const config = parseEventConfig(rpcResult);
   */
  function parseEventConfig(input: RpcValue): EventConfig {
    // Validate input structure
    if (!input || typeof input !== "object" || input === null) {
      console.warn("Invalid input format for parseEventConfig:", input);
      return new EventConfig();
    }

    const data = input as any;
    if (!Array.isArray(data.rows)) {
      console.warn("Missing or invalid rows in RPC response:", input);
      return new EventConfig();
    }

    // Helper to find a config value by key
    const getValue = (key: string): string => {
      const row = data.rows.find((r: any[]) => r && r[0] === key);
      return row && row[2] ? String(row[2]).replace(/['"]/g, "") : "";
    };

    // Get config values
    const name = getValue("event.name");
    const place = getValue("event.place");
    const dateStr = getValue("event.date");
    const stageCountStr = getValue("event.stageCount") || "1";

    // Parse date safely
    let date: Date;
    if (dateStr) {
      date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        console.warn("Invalid date string:", dateStr);
        date = new Date();
      }
    } else {
      date = new Date();
    }

    // Parse stage count safely
    const stageCount = Math.max(1, parseInt(stageCountStr, 10) || 1);

    if (appConfig.debug) {
      console.log("Parsed event config:", { name, place, date, stageCount });
    }

    return { name, place, date, stageCount };
  }

  const loadEventConfig = async () => {
    if (appConfig.debug) {
      console.log("Loading event config");
    }
    try {
      const client = wsClient();
      if (!client) {
        throw new Error("WebSocket client not initialized");
      }
      const result = await client.callRpcMethod(appConfig.eventPath, "select", [
        "SELECT * FROM config",
      ]);
      if (result instanceof Error) {
        console.error("RPC error:", result);
        throw new Error(result.message);
      }
      if (appConfig.debug) {
        console.log("Event config raw result:", result);
      }
      const event_config = parseEventConfig(result);
      if (appConfig.debug) {
        console.log("Parsed event config:", event_config);
      }
      setEventConfig(event_config);
      setEventOpen(true);
    } catch (error) {
      console.error("Failed to load event config:", error);
    }
  };

  const value = {
    eventConfig,
    setEventConfig,
    eventOpen,
  };

  return (
    <EventConfigContext.Provider value={value}>
      {props.children}
    </EventConfigContext.Provider>
  );
}

export function useEventConfig() {
  const context = useContext(EventConfigContext);
  if (!context) {
    throw new Error(
      "useEventConfig must be used within an EventConfigProvider",
    );
  }
  return context;
}
