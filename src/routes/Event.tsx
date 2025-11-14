import { createSignal, createEffect, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { RpcValue } from "libshv-js";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
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

interface EventProps {
  event_id: number;
}

const Event = ({ event_id: initialEventId }: EventProps) => {
  const appConfig = useAppConfig();
  const { wsClient, status } = useWsClient();

  const [eventId, setEventId] = createSignal(initialEventId);
  const [eventConfig, setEventConfig] = createStore(new EventConfig());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>("");

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
  };

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

  const loadEventConfig = async (event_id: number) => {
    if (event_id === 0) {
      setEventConfig(new EventConfig());
      return;
    }

    if (appConfig.debug) {
      console.log("Loading event config for event ID:", event_id);
    }

    setLoading(true);
    setError("");

    try {
      const event_config_result = await callRpcMethod(appConfig.eventSqlApiPath(event_id), "query", [
        "SELECT * FROM config",
      ]);
      const stages_result = await callRpcMethod(appConfig.eventSqlApiPath(event_id), "query", [
        "SELECT startdateTime FROM stages",
      ]);
      const event_config = parseEventConfig(event_config_result, stages_result);
      if (appConfig.debug) {
        console.log("Loaded event config:", event_config);
      }
      setEventConfig(event_config);
    } catch (error) {
      console.error("Failed to load event config:", error);
      setError(`Failed to load event config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  // Load event config when WebSocket is connected and event ID changes
  createEffect(() => {
    if (status() === "Connected" && eventId() > 0) {
      loadEventConfig(eventId());
    }
  });

  return (
    <div class="flex w-full flex-col items-center justify-center p-4">
      <h1 class="text-3xl font-bold mb-4">Event {eventId()}</h1>

      {loading() && (
        <div class="text-blue-600 mb-4">Loading event configuration...</div>
      )}

      {error() && (
        <div class="text-red-600 mb-4 p-2 border border-red-300 rounded bg-red-50">
          {error()}
        </div>
      )}

      {!loading() && !error() && eventConfig.name && (
        <div class="w-full max-w-2xl bg-white shadow-lg rounded-lg p-6">
          <h2 class="text-2xl font-semibold mb-4">Event Configuration</h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <p class="text-lg">{eventConfig.name || 'N/A'}</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Place</label>
              <p class="text-lg">{eventConfig.place || 'N/A'}</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <p class="text-lg">{eventConfig.date?.toLocaleDateString() || 'N/A'}</p>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Stages</label>
              <p class="text-lg">{eventConfig.stageCount}</p>
            </div>
          </div>

          {eventConfig.stages.length > 0 && (
            <div class="mt-6">
              <h3 class="text-lg font-medium mb-3">Stage Information</h3>
              <div class="space-y-2">
                {eventConfig.stages.map((stage, index) => (
                  <div class="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
                    <span class="font-medium">Stage {index + 1}</span>
                    <span>{stage.stageStart.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Event;
