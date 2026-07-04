import { createSignal, createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { RpcValue, makeMap, ShvRI, CallRpcMethodOptions } from "libshv-js";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
import { createSqlTable } from "~/lib/SqlTable";
import { RecChng, RecChngSchema } from "~/schema/rpc-sql-schema";
import { parse } from "valibot";
import { EventMembers, EventRecord, EventRecordSchema } from "~/schema/event-record-schema";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { StageControl } from "~/components/StageControl";
import EventInfo from "~/components/EventInfo";
import Runs from "../components/Runs";
import { useAuth } from "~/context/AuthContext";

export type StageConfig = {
  stageStart?: Date;
}

export class EventConfig {
  name?: string;
  place?: string;
  date?: Date;
  stageCount: number = 1;
  currentStage: number = 1;
  stages: StageConfig[] = [];
  owner?: string;
  members?: EventMembers;
}

interface EventProps {
  event_id_str: string;
}

const OpenedEvent = ({ event_id_str: initialEventId }: EventProps) => {
  const appConfig = useAppConfig();
  const { wsClient, status } = useWsClient();
  const { user } = useAuth();

  const [eventId, _setEventId] = createSignal<number>(parseInt(initialEventId));
  const [eventConfig, setEventConfig] = createStore(new EventConfig());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>("");
  const [recchngReceived, setRecchngReceived] = createSignal<RecChng | null>(null);

  const callRpcMethod = async (shvPath: string | undefined, method: string, params?: RpcValue, requestUserId?: boolean) => {
    const client = wsClient();
    if (!client) {
      throw new Error("WebSocket client not initialized");
    }
    const opts: CallRpcMethodOptions = { requestUserId };
    let result = await client.callRpcMethod(shvPath, method, params, opts);
    if (result instanceof Error) {
      console.error("RPC error:", result);
      throw new Error(result.message);
    }
    if (appConfig.debug) {
      console.log("Event config raw result:", result);
    }
    return result;
  };

  const loadEventConfig = async () => {
    const event_id = eventId();

    if (appConfig.debug) {
      console.log("Loading event config for event ID:", event_id);
    }

    setLoading(true);
    setError("");

    try {
      // open event
      let event_api_shv_path = await callRpcMethod(`${appConfig.eventCtlApiPath()}`, "openEvent", event_id );
      console.log("Loading event_mount_point:", event_api_shv_path);
      if (typeof event_api_shv_path !== 'string') {
        throw new Error(`Cannot open event: ${event_api_shv_path}`);
      }

      const eventApiPath = appConfig.eventCtlApiPath();
      let eventData = await callRpcMethod(eventApiPath, "eventData", event_id);

      let eventRecord = parse(EventRecordSchema, eventData);

      // Then get detailed config and stages
      const event_config_result = await callRpcMethod(appConfig.eventSqlApiPath(event_id), "query", [
        "SELECT * FROM config",
      ]);
      const stages_result = await callRpcMethod(appConfig.eventSqlApiPath(event_id), "query", [
        "SELECT startdateTime FROM stages",
      ]);
      const eventConfig = parseEventConfig(event_config_result, stages_result, eventRecord);
      await syncEventConfig(eventConfig, eventRecord);
      setEventConfig(eventConfig);
    } catch (error) {
      console.error("Failed to load event config:", error);
      setError(`Failed to load event config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  function parseEventConfig(event_config: RpcValue, stagesResult: RpcValue, eventRecord: EventRecord): EventConfig {
    const data = createSqlTable(event_config);

    // Helper to find a config value by key
    const getValue = (key: string): string | undefined => {
      const row = data.rows.find((r: any[]) => r && r[0] === key);
      return row && row[2] ? String(row[2]).replace(/['"]/g, "") : undefined;
    };

    // Use event data from events table if provided, otherwise fall back to config table
    const name = getValue("event.name") || eventRecord?.name;
    const place = getValue("event.place");
    const dateStr = getValue("event.date") || eventRecord?.date;
    const stageCountStr = getValue("event.stageCount") || "1";
    const currentStageStr = getValue("event.currentStageId") || "1";

    // Parse date safely
    const parseDate = (dateStr: string): Date | undefined => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        //throw new Error(`Invalid date string: ${dateStr}`);
        return undefined
      }
      return date;
    };

    // Parse stage count safely
    const stageCount = Math.max(1, parseInt(stageCountStr, 10) || 1);
    const currentStage = Math.max(1, parseInt(currentStageStr, 10) || 1);

    const stages_table = createSqlTable(stagesResult);

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
      date: dateStr ? parseDate(dateStr) : undefined,
      stageCount,
      currentStage,
      stages,
      owner: eventRecord.owner,
      members: eventRecord.config?.members,
    };
  }

  async function syncEventConfig(eventConfig: EventConfig, eventRecord: EventRecord) {
    // Find undefined fields in event_config and set their value from event_record
    const changes: Partial<EventConfig> = {};
    if (eventConfig.name !== undefined && eventRecord.name === undefined) changes.name = eventConfig.name;
    if (Object.keys(changes).length > 0) {
      const params: Record<string, any> = {};
      params.table = "events";
      params.id = eventRecord.id;
      params.record = changes;
      await callRpcMethod(`${appConfig.qxeventdPath}/sql`, "update", makeMap(params));
    }
  }

  // Load event config when WebSocket is connected and event ID changes
  createEffect(() => {
    if (status() === "Connected" && eventId() > 0) {
      loadEventConfig();

      const eid = eventId();
      const client = wsClient()!;
      // Subscribe to event SQL path (used by LateEntries)
      console.log("Subscribing SQL recchng", appConfig.eventSqlApiPath(eid));
      client.subscribe("qxeventweb", ShvRI.fromPathMethodSignal(appConfig.eventSqlApiPath(eid), "", "recchng"), (path: string, signal: string, param?: RpcValue) => {
        // console.log("SUBSCRIBED ======>", path, signal, param);
        const recchng: RecChng = parse(RecChngSchema, param);
        setRecchngReceived(recchng);
      });
    }
  });

  return (
    <div class="flex w-full flex-col items-center justify-center p-4">
      <div class="flex flex-row w-full mb-6 justify-between">
        <p class="text-3xl font-bold">{eventConfig.name}</p>
        <StageControl currentStage={() => eventConfig.currentStage} />
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
          <Tabs defaultValue="runs" class="w-full">
            <TabsList class="flex w-full flex-row">
              <TabsTrigger value="runs">Runs</TabsTrigger>
              <TabsTrigger value="event-info">Event info</TabsTrigger>
              <TabsTrigger value="late_entries" disabled={!user()}>Late entries</TabsTrigger>
            </TabsList>

            <TabsContent value="event-info" class="space-y-4">
              <EventInfo eventConfig={eventConfig} />
            </TabsContent>

            <TabsContent value="runs" class="space-y-4">
              <Runs
                eventId={eventId()}
                eventConfig={() => eventConfig}
                currentStage={eventConfig.currentStage}
                recchngReceived={recchngReceived}
                mode="runs"
              />
            </TabsContent>

            <TabsContent value="late_entries" class="space-y-4">
              <Runs
                eventId={eventId()}
                eventConfig={() => eventConfig}
                currentStage={eventConfig.currentStage}
                recchngReceived={recchngReceived}
                mode="lateEntries"
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default OpenedEvent;
