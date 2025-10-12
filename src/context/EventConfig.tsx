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
import { createSqlTable } from "~/lib/SqlTable";

export type StageConfig = {
  stageStart: Date;
}

export class EventConfig {
  name?: string;
  place?: string;
  date?: Date;
  stageCount: number = 1;
  stages: StageConfig[] = [];
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

  const callRpcMethod = async (shvPath: string | undefined, method: string, params?: RpcValue) => {
    const client = wsClient();
    if (!client) {
      throw new Error("WebSocket client not initialized");
    }
    let result = await client.callRpcMethod(shvPath, method, params);
    if (result instanceof Error) {
      console.error("RPC error:", result);
      throw new Error(result.message);
    }
    if (appConfig.debug) {
      console.log("Event config raw result:", result);
    }

    return result;
}

  function parseEventConfig(event_config: RpcValue, stages_config: RpcValue): EventConfig {
    const data = createSqlTable(event_config);

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
    const parseDate = (dateStr: string): Date => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid date string: ${dateStr}`);
      }
      return date;
    };

    // Parse stage count safely
    const stageCount = Math.max(1, parseInt(stageCountStr, 10) || 1);

    const stages_table = createSqlTable(stages_config);

    let stages: StageConfig[] = [];
    for (let i = 0; i < stageCount; i++) {
      if (i < stages_table.rowCount()) {
        const s = stages_table.get(i, "startdatetime");
        stages.push({
          stageStart: parseDate(s?.toString() || ""),
        });
      } else {
        stages.push({
          stageStart: new Date(),
        });
      }
    }

    return {
      name,
      place,
      date: parseDate(dateStr),
      stageCount,
      stages,
    };
  }

  const loadEventConfig = async () => {
    if (appConfig.debug) {
      console.log("Loading event config");
    }
    try {
      const event_config_result = await callRpcMethod(appConfig.eventPath, "select", [
        "SELECT * FROM config",
      ]);
      const stages_result = await callRpcMethod(appConfig.eventPath, "select", [
        "SELECT startdateTime FROM stages",
      ]);
      const event_config = parseEventConfig(event_config_result, stages_result);
      if (appConfig.debug) {
        console.log("Loaded event config:", event_config);
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
