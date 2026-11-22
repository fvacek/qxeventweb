import { For, createSignal, createEffect, onCleanup, untrack } from "solid-js";
import { createStore } from "solid-js/store";
import { RpcValue, ShvRI, CallRpcMethodOptions } from "libshv-js";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
import { createSqlTable } from "~/lib/SqlTable";
import { RecChng, RecChngSchema, SqlOperation } from "~/schema/rpc-sql-schema";
import { parse } from "valibot";
import { EventIdParamSchema, EventMembers, EventRecord, EventRecordSchema, OpenEventResultSchema } from "~/schema/event-record-schema";
import { makeMapRecursive, rpcMapToObject } from "~/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "~/components/ui/tabs";
import { StageControl } from "~/components/StageControl";
import EventInfo from "~/components/EventInfo";
import Runs from "../components/Runs";
import LateEntries from "~/components/LateEntries";
import { useAuth } from "~/context/AuthContext";
import { useSubscribe } from "~/context/SubscribeContext";
import ResultsTab from "~/components/ResultsTab";

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

export function isEventOrganizer(config: EventConfig, email: string | undefined): boolean {
  if (!email) return false;
  return config.owner === email || config.members?.[email] === "Organizer";
}

const CONFIG_RELOAD_DEBOUNCE_MS = 300;

interface EventProps {
  event_id_str: string;
}



const OpenedEvent = ({ event_id_str: initialEventId }: EventProps) => {
  const appConfig = useAppConfig();
  const { wsClient, status } = useWsClient();
  const { user } = useAuth();
  const { recchngReceived: eventsRecchng } = useSubscribe();

  const [eventId, _setEventId] = createSignal<number>(parseInt(initialEventId));
  const [currentStage, setCurrentStage] = createSignal<number | undefined>(undefined);
  const [workingStage, setWorkingStage] = createSignal<number | undefined>(undefined);
  const [eventConfig, setEventConfig] = createStore(new EventConfig());
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal<string>("");
  const [recchngReceived, setRecchngReceived] = createSignal<RecChng | null>(null);
  const [activeTab, setActiveTab] = createSignal("runs");

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

  // Latest server state; the store is derived from both by applyEventConfig().
  let eventRecord: EventRecord | undefined;
  let configTable: RpcValue | undefined;

  const applyEventConfig = () => {
    if (!eventRecord || configTable === undefined) return;
    const eventConfig = parseEventConfig(configTable, eventRecord);
    setEventConfig(eventConfig);
    setCurrentStage(eventConfig.currentStage);
    setWorkingStage(prev => prev ?? eventConfig.currentStage);
  };

  // Each reload bumps its sequence number; a response that is no longer the latest one is dropped,
  // so overlapping reloads (recchng vs. reconnect) can't leave stale data behind.
  let eventRecordSeq = 0;
  const reloadEventRecord = async () => {
    const seq = ++eventRecordSeq;
    const eventIdParam = makeMapRecursive(parse(EventIdParamSchema, { event_id: eventId() }));
    const eventData = await callRpcMethod(appConfig.eventCtlApiPath(), "eventData", eventIdParam);
    if (seq !== eventRecordSeq) return;
    eventRecord = parse(EventRecordSchema, rpcMapToObject(eventData));
    applyEventConfig();
  };

  // Re-reads the config table; does not touch `loading`, so it can run on recchng without remounting the tabs.
  let configSeq = 0;
  const reloadConfigTable = async () => {
    const seq = ++configSeq;
    const result = await callRpcMethod(appConfig.eventSqlApiPath(eventId()), "query", [
      "SELECT * FROM config",
    ]);
    if (seq !== configSeq) return;
    configTable = result;
    applyEventConfig();
  };

  const loadEventConfig = async () => {
    const event_id = eventId();
    // Only the first load of an event shows the loading state; reloads after a reconnect
    // update the config in place, so the tabs (and their selections) stay mounted.
    const initial = eventRecord?.id !== event_id;

    if (appConfig.debug) {
      console.log("Loading event config for event ID:", event_id);
    }

    if (initial) {
      eventRecord = undefined;
      configTable = undefined;
      setLoading(true);
    }
    setError("");

    try {
      // open event
      const eventIdParam = makeMapRecursive(parse(EventIdParamSchema, { event_id }));
      const open_event_result = await callRpcMethod(`${appConfig.eventCtlApiPath()}`, "openEvent", eventIdParam);
      const { mount_point } = parse(OpenEventResultSchema, rpcMapToObject(open_event_result));
      console.log("Loading event_mount_point:", mount_point);

      await Promise.all([reloadEventRecord(), reloadConfigTable()]);
    } catch (error) {
      console.error("Failed to load event config:", error);
      setError(`Failed to load event config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  function parseEventConfig(event_config: RpcValue, eventRecord: EventRecord): EventConfig {
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
    const currentStage = Math.min(stageCount, Math.max(1, parseInt(currentStageStr, 10) || 1));

    let stages: StageConfig[] = [];
    for (let i = 0; i < stageCount; i++) {
      const stageStart = getValue(`stage.${i + 1}.startDateTime`);
      stages.push({
        stageStart: parseDate(stageStart?.toString() || ""),
      });
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

  // async function syncEventConfig(eventConfig: EventConfig, eventRecord: EventRecord) {
  //   // Find undefined fields in event_config and set their value from event_record
  //   const changes: Partial<EventConfig> = {};
  //   if (eventConfig.name !== undefined && eventRecord.name === undefined) changes.name = eventConfig.name;
  //   if (Object.keys(changes).length > 0) {
  //     const params: Record<string, any> = {};
  //     params.table = "events";
  //     params.id = eventRecord.id;
  //     params.record = changes;
  //     await callRpcMethod(`${appConfig.qxeventdPath}/sql`, "update", makeMap(params));
  //   }
  // }

  // Load event config when WebSocket is connected and event ID changes
  createEffect(() => {
    if (status() === "Connected" && eventId() > 0) {
      // Untracked so the signals read inside the load (before its first await) don't become dependencies.
      untrack(() => void loadEventConfig());

      const eid = eventId();
      const client = wsClient()!;
      // Subscribe to event SQL path (used by LateEntries)
      console.log("Subscribing SQL recchng", appConfig.eventSqlApiPath(eid));
      const ri = ShvRI.fromPathMethodSignal(appConfig.eventSqlApiPath(eid), "", "recchng");
      client.subscribe("qxeventweb", ri, (path: string, signal: string, param?: RpcValue) => {
        try {
          setRecchngReceived(parse(RecChngSchema, param));
        } catch (error) {
          console.error("Error parsing event recchng:", error, param);
        }
      });
      // libshv-js ignores a repeated subscribe for the same subscriber/path/signal and keeps
      // the first callback, so a remounted OpenedEvent would never get signals unless the
      // previous instance unsubscribes.
      onCleanup(() => { void client.unsubscribe("qxeventweb", ri); });
    }
  });

  // Config table rows are keyed by `ckey`, not a numeric id, so the recchng payload can't be applied
  // directly; re-read the config instead (e.g. QuickEvent changing event.currentStageId).
  // Config is saved in batches (one recchng per key), so the reload is debounced.
  const debounced = (fn: () => Promise<void>, what: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    onCleanup(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fn().catch(error => console.error(`Failed to reload ${what}:`, error));
      }, CONFIG_RELOAD_DEBOUNCE_MS);
    };
  };
  const scheduleConfigReload = debounced(reloadConfigTable, "event config");
  const scheduleEventRecordReload = debounced(reloadEventRecord, "event record");

  createEffect(() => {
    const recchng = recchngReceived();
    if (recchng?.table.toLowerCase() !== "config") return;
    scheduleConfigReload();
  });

  // The events table lives in qxeventd's DB (SubscribeContext), not the event DB; owner and members
  // come from there, so organizer rights follow changes made while the event is open.
  createEffect(() => {
    const recchng = eventsRecchng();
    if (recchng?.table !== "events" || recchng.op !== SqlOperation.Update) return;
    if (recchng.id !== untrack(eventId)) return;
    scheduleEventRecordReload();
  });

  return (
    <div class="flex w-full flex-col items-center justify-center p-4">
      <div class="flex flex-row w-full mb-6 justify-between">
        <p class="text-3xl font-bold">{eventConfig.name}</p>
        <div class="flex items-center gap-3">
          <StageControl currentStage={() => currentStage() ?? eventConfig.currentStage} />
          <label class="flex items-center gap-2 text-sm font-medium">
            Working stage
            <select
              value={workingStage()?.toString()}
              onChange={(e) => setWorkingStage(Number(e.currentTarget.value))}
              disabled={loading() || status() !== "Connected"}
              class="rounded-md border border-border bg-input px-3 py-2 text-sm"
            >
              <For each={Array.from({ length: eventConfig.stageCount }, (_, index) => index + 1)}>{stage => (
                <option value={stage.toString()}>{stage}</option>
              )}</For>
            </select>
          </label>
        </div>
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
          <Tabs value={activeTab()} onChange={setActiveTab} class="w-full">
            <TabsList class="flex w-full flex-row">
              <TabsTrigger value="runs">Runs</TabsTrigger>
              <TabsTrigger value="results">Results</TabsTrigger>
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
                currentStage={currentStage()}
                workingStage={workingStage()}
                recchngReceived={recchngReceived}
                onNewLateEntrySaved={() => setActiveTab("late_entries")}
              />
            </TabsContent>

            <TabsContent value="results" class="space-y-4">
              <ResultsTab eventId={eventId()} workingStage={workingStage} />
            </TabsContent>

            <TabsContent value="late_entries" class="space-y-4">
              <LateEntries
                eventId={eventId()}
                eventConfig={() => eventConfig}
                currentStage={currentStage()}
                workingStage={workingStage()}
                recchngReceived={recchngReceived}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default OpenedEvent;
