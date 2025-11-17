import { createSignal, createEffect, createMemo } from "solid-js";
import { createStore } from "solid-js/store";
import { RpcValue } from "libshv-js";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
import { createSqlTable } from "~/lib/SqlTable";
import { RecChng, RecChngSchema } from "~/schema/rpc-sql-schema";
import { parse } from "valibot";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import LateEntries from "../components/Entries";
import { StageControl } from "~/components/StageControl";
import EventInfo from "~/components/EventInfo";

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
  event_id_str: string;
}

const Event = ({ event_id_str: initialEventId }: EventProps) => {
  const appConfig = useAppConfig();
  const { wsClient, status } = useWsClient();

  const [eventId, _setEventId] = createSignal<number>(parseInt(initialEventId));
  const [eventConfig, setEventConfig] = createStore(new EventConfig());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>("");
  const [recchngReceived, setRecchngReceived] = createSignal<RecChng | null>(null);
  const [currentStage, setCurrentStage] = createSignal(1);

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
      const eid = eventId();
      loadEventConfig(eid);

      const client = wsClient()!;
      // Subscribe to event SQL path (used by LateEntries)
      console.log("Subscribing SQL recchng", appConfig.eventSqlApiPath(eid));
      client.subscribe("qxeventweb", appConfig.eventSqlApiPath(eid), "recchng", (path: string, method: string, param?: RpcValue) => {
        console.log("Received signal:", path, method, param);
        const recchng: RecChng = parse(RecChngSchema, param);
        console.log("recchng:", recchng);
        setRecchngReceived(recchng);
      });
    }
  });

  return (
    <div class="flex w-full flex-col items-center justify-center p-4">
      <div class="flex flex-row w-full mb-6 justify-between">
        <p class="text-3xl font-bold">{eventConfig.name}</p>
        <StageControl currentStage={currentStage} />
      </div>


      {loading() && (
        <div class="text-blue-600 mb-4">Loading event configuration...</div>
      )}

      {error() && (
        <div class="text-red-600 mb-4 p-2 border border-red-300 rounded bg-red-50">
          {error()}
        </div>
      )}

      {!loading() && !error() && eventConfig.name && (
        <div class="w-full max-w-7xl">
          <Tabs defaultValue="event-info" class="w-full">
            <TabsList class="grid w-full grid-cols-2">
              <TabsTrigger value="event-info">Event</TabsTrigger>
              <TabsTrigger value="entries">Entries</TabsTrigger>
            </TabsList>

            <TabsContent value="event-info" class="space-y-4">
              <EventInfo eventConfig={eventConfig} />
            </TabsContent>

            <TabsContent value="entries" class="space-y-4">
              <LateEntries eventId={eventId()} eventConfig={() => eventConfig} currentStage={currentStage()} />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default Event;
