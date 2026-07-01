import { makeMap, type RpcValue } from "libshv-js";
import { createSignal, createEffect, onMount, untrack } from "solid-js";

import { Button } from "~/components/ui/button";
import { Table, TableColumn } from "~/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { FlexDropdown } from "~/components/ui/flexdropdown";

import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { createSqlTable } from "~/lib/SqlTable";
import { object, number, string, parse, type InferOutput, optional } from "valibot";
import { copyRecordChanges as copyValidFieldsToRpcMap } from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { EventConfig } from "~/routes/OpenedEvent";

const LateEntryIdSchema = object({
  RunId: optional(number()),
  ClassId: optional(number()),
});

export const LateEntrySchema = object({
  id: LateEntryIdSchema,
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
});

type LateEntry = InferOutput<typeof LateEntrySchema>;

const QxChangeDataSchema = object({
  LateEntry: optional(LateEntrySchema),
});
type QxChangeData = InferOutput<typeof QxChangeDataSchema>;

const RunSchema = object({
  run_id: number(),
  competitor_id: number(),
  class_name: optional(string()),
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
  starttimems: optional(number()),
  qxchange_id: optional(number()),
  qxchange_user_id: optional(string()),
  qxchange_status: optional(string()),
  qxchange_data: optional(QxChangeDataSchema),
});

type Run = InferOutput<typeof RunSchema>;
type RunsMode = "runs" | "lateEntries";
type LateEntryField = "firstname" | "lastname" | "registration" | "siid";

function lateEntryRunId(lateEntry: LateEntry): number | undefined {
  return lateEntry.id.RunId;
}

function formatStartTime(msec: number | undefined, start: Date | undefined): string {
  if (msec === undefined || !start) return "";
  const date = new Date(start.getTime() + msec);
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function normalizeRunRecord(record: Record<string, unknown>): Record<string, unknown> {
  const rawChange = record.qxchange_data;
  if (typeof rawChange !== "string") return record;

  const parsed = JSON.parse(rawChange);
  const lateEntry = parsed?.LateEntry;
  if (!lateEntry) return record;

  const normalizedLateEntry = lateEntry.record
    ? { id: { RunId: lateEntry.run_id }, ...lateEntry.record }
    : lateEntry;

  return {
    ...record,
    qxchange_data: { LateEntry: normalizedLateEntry },
  };
}

function parseRunsQueryResult(result: RpcValue): Run[] {
  const table = createSqlTable(result);
  const transformedRuns: Run[] = [];
  for (let i = 0; i < table.rowCount(); i++) {
    try {
      transformedRuns.push(parse(RunSchema, normalizeRunRecord(table.recordAt(i))));
    } catch (error) {
      console.warn(`Skipping invalid row ${i}:`, error);
    }
  }
  return transformedRuns;
}

function createRunsQuery(mode: RunsMode, className: string, currentStage: number): string {
  const qxchangeJoin = mode === "runs"
    ? `LEFT JOIN qxchanges ON runs.id = qxchanges.foreign_id  AND qxchanges.foreign_table = 'runs'
                AND qxchanges.data_type = 'LateEntry'
                AND qxchanges.status = 'Pending'`
    : `INNER JOIN qxchanges ON runs.id = qxchanges.foreign_id AND qxchanges.foreign_table = 'runs' AND qxchanges.data_type = 'LateEntry'`;

  const classJoin = mode === "runs"
    ? `INNER JOIN classes ON competitors.classid = classes.id AND classes.name = '${className}'`
    : `LEFT JOIN classes ON competitors.classid = classes.id`;

  return `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                classes.name AS class_name,
                qxchanges.id as qxchange_id, qxchanges.status as qxchange_status, qxchanges.data as qxchange_data, qxchanges.user_id as qxchange_user_id
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                ${classJoin}
                ${qxchangeJoin}
                WHERE runs.stageid = ${currentStage}
                ORDER BY runs.starttimems ASC`;
}

function RunsTable(props: {
  eventConfig: () => EventConfig;
  currentStage: () => number;
  runs: () => Run[];
  loading: () => boolean;
  mode: RunsMode;
  canEdit: boolean;
  onEditRun: (run: Run) => void;
}) {
  const isLateEntriesMode = props.mode === "lateEntries";

  function stageStart(): Date | undefined {
    return props.eventConfig().stages[props.currentStage() - 1]?.stageStart;
  }

  const classNameColumn: TableColumn<Run> = {
    key: "class_name",
    header: "Class",
    sortable: true,
    width: "120px",
  };

  const qxChangeStatusColumn: TableColumn<Run> = {
    key: "qxchange_status",
    header: "Status",
    sortable: true,
    width: "100px",
  };

  const columns: TableColumn<Run>[] = [
    ...(isLateEntriesMode ? [classNameColumn] : []),
    {
      key: "starttimems",
      header: "Start Time",
      cell: (run: Run) => <span>{formatStartTime(run.starttimems, stageStart()) || "—"}</span>,
      sortable: true,
      width: "120px",
    },
    {
      key: "name",
      header: "Name",
      cell: (entry: Run) => {
        const fullName = [entry.lastname, entry.firstname].filter(n => n?.trim()).join(" ");
        const newFirstname = entry.qxchange_data?.LateEntry?.firstname;
        const newLastname = entry.qxchange_data?.LateEntry?.lastname;
        if (typeof newFirstname === "string" || typeof newLastname === "string") {
          const newFullName = [
            typeof newLastname === "string" ? newLastname : entry.lastname,
            typeof newFirstname === "string" ? newFirstname : entry.firstname,
          ].filter(n => n?.trim()).join(" ");
          return (
            <div class="flex flex-col leading-tight">
              <span class="line-through text-muted-foreground">{fullName || "—"}</span>
              <span>{newFullName || "—"}</span>
            </div>
          );
        }
        return <span>{fullName || "—"}</span>;
      },
      sortable: true,
      sortFn: (a: Run, b: Run) =>
        [a.lastname, a.firstname].filter(Boolean).join(" ")
          .localeCompare([b.lastname, b.firstname].filter(Boolean).join(" ")),
      width: "200px",
    },
    {
      key: "registration",
      header: "Reg",
      cell: (run: Run) => {
        const registration = run.registration;
        const newRegistration = run.qxchange_data?.LateEntry?.registration;
        if (typeof newRegistration === "string") {
          return (
            <div class="flex flex-col leading-tight">
              <span class="line-through text-muted-foreground">{registration || "—"}</span>
              <span>{newRegistration}</span>
            </div>
          );
        }
        return <span>{registration || "—"}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "siid",
      header: "SI",
      cell: (run: Run) => {
        const siid = run.siid;
        const newSiid = run.qxchange_data?.LateEntry?.siid;
        if (typeof newSiid === "number") {
          return (
            <div class="flex flex-col leading-tight">
              <span class="line-through text-muted-foreground">{siid !== undefined ? siid.toString() : "—"}</span>
              <span>{newSiid.toString()}</span>
            </div>
          );
        }
        return <span>{siid !== undefined ? siid.toString() : "—"}</span>;
      },
      sortable: false,
      width: "100px",
    },
    {
      key: "qxchange_user_id",
      header: "Owner",
      sortable: true,
      width: "100px",
    },
    ...(isLateEntriesMode ? [qxChangeStatusColumn] : []),
    {
      key: "actions",
      header: "Actions",
      cell: (run: Run) => (
        <Button size="sm" variant="outline"
          onClick={() => props.onEditRun(run)}
          disabled={!props.canEdit}
        >
          Edit
        </Button>
      ),
      sortable: false,
      width: "80px",
    },
  ];

  return (
    <div>
      <div class="rounded-md border">
        <Table
          data={props.runs()}
          columns={columns}
          loading={props.loading()}
          emptyMessage="No entries found"
          variant="striped"
          sortable={true}
          globalFilter={true}
        />
      </div>

    </div>
  );
}

function ClassSelector(props: {
  className: () => string;
  setClassName: (name: string) => void;
  eventId: () => number;
  currentStage: () => number;
}) {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const [classes, setClasses] = createSignal<string[]>([]);

  async function loadClasses() {
    try {
      const result = await callRpcMethod(
        wsClient()!,
        appConfig.eventSqlApiPath(props.eventId()),
        "query",
        [`SELECT classes.name AS class_name FROM classes, classdefs
          WHERE classdefs.classid = classes.id AND classdefs.stageid = ${props.currentStage()}
          ORDER BY classes.name`],
      );
      const classNames: string[] = (result as any).rows.map((row: any[]) => row[0]);
      setClasses(classNames);
      if (classNames.length > 0) props.setClassName(classNames[0]);
    } catch (error) {
      showToast({ title: "Load classes error", description: (error as Error).message, variant: "destructive" });
    }
  }

  createEffect(() => {
    if (status() === "Connected") loadClasses();
  });

  return (
    <div class="w-full">
      {props.className() && (
        <FlexDropdown
          value={props.className()}
          options={classes()}
          onSelect={props.setClassName}
          variant="default"
          fullWidth={true}
        />
      )}
    </div>
  );
}

const Runs = (props: {
  eventId: number,
  eventConfig: () => EventConfig,
  currentStage: number,
  recchngReceived: () => RecChng | null,
  mode: RunsMode,
}) => {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();

  const [className, setClassName] = createSignal("");
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [formLateEntry, setFormLateEntry] = createSignal<Run | undefined>(undefined);

  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;
  const isLateEntriesMode = props.mode === "lateEntries";

  const openNewEntryDialog = () => setFormLateEntry({
    run_id: 0,
    competitor_id: 0,
    class_name: className(),
    firstname: undefined,
    lastname: undefined,
    registration: undefined,
    siid: undefined,
    starttimems: undefined,
    qxchange_id: undefined,
    qxchange_user_id: undefined,
    qxchange_data: undefined,
  });

  const closeDialog = () => setFormLateEntry(undefined);

  const isFieldFromLateEntry = (field: LateEntryField) =>
    formLateEntry()?.qxchange_data?.LateEntry?.[field] !== undefined;

  const formField = <K extends LateEntryField>(field: K): Run[K] => {
    const run = formLateEntry();
    const newValue = run?.qxchange_data?.LateEntry?.[field];
    return newValue !== undefined ? newValue as Run[K] : run?.[field] as Run[K];
  };

  const setFormField = <K extends LateEntryField>(field: K, value: Run[K]) => {
    setFormLateEntry(prev => {
      if (!prev) return undefined;

      const lateEntry: LateEntry = {
        ...(prev.qxchange_data?.LateEntry ?? { id: { RunId: prev.run_id } }),
        [field]: value === prev[field] ? undefined : value,
      };

      return {
        ...prev,
        qxchange_data: {
          ...prev.qxchange_data,
          LateEntry: lateEntry,
        },
      };
    });
  };

  const getLateEntry = (record: RecChng["record"]): LateEntry | undefined => {
    if (!record || typeof record.data !== "string") return undefined;
    return parse(QxChangeDataSchema, JSON.parse(record.data)).LateEntry;
  };

  const clearQxChange = (changeId: number) => {
    setRuns(prev => prev.map(r =>
      r.qxchange_id === changeId ? { ...r, qxchange_id: undefined, qxchange_user_id: undefined, qxchange_data: undefined } : r
    ));
  };

  const updateRunRecord = (runId: number, record: RecChng["record"], verbose: boolean) => {
    const orig = runs().find(r => r.run_id === runId);
    if (!orig) {
      if (verbose) console.warn(`processRecChng: [Update] Run with run_id=${runId} not found in local state`);
      return;
    }
    if (verbose) console.log(`processRecChng: [Update] Found run, applying record changes`, record);
    setRuns(prev => prev.map(r => r.run_id === runId ? { ...orig, ...record } : r));
  };

  const updateCompetitorRecord = (competitorId: number, record: RecChng["record"], verbose: boolean) => {
    const orig = runs().find(r => r.competitor_id === competitorId);
    if (!orig) {
      if (verbose) console.warn(`processRecChng: [Update] Competitor with competitor_id=${competitorId} not found in local state`);
      return;
    }
    if (verbose) console.log(`processRecChng: [Update] Found competitor, applying record changes`, record);
    setRuns(prev => prev.map(r => r.competitor_id === competitorId ? { ...orig, ...record } : r));
  };

  const attachLateEntry = (changeId: number, userId: string, lateEntry: LateEntry) => {
    setRuns(prev =>
      prev.map(r =>
        r.run_id === lateEntryRunId(lateEntry)
          ? { ...r, qxchange_id: changeId, qxchange_user_id: userId, qxchange_data: { LateEntry: lateEntry } }
          : r
      )
    );
  };

  const updateQxChangeRecord = (changeId: number, record: RecChng["record"], verbose: boolean) => {
    if (isLateEntriesMode && record?.status && record.status !== "Pending") {
      if (verbose) console.log(`processRecChng: [RESOLVED] Removing qxchange data from run with qxchange_id=${changeId}`);
      clearQxChange(changeId);
      return;
    }

    const lateEntry = getLateEntry(record);
    if (!lateEntry) {
      if (verbose) console.warn(`processRecChng: [Update] No LateEntry found in qxchange data for qxchange_id=${changeId}`);
      return;
    }

    const run = runs().find(r => r.qxchange_id === changeId);
    if (!run) {
      if (verbose) console.log("Cannot process qxchange RecChng", { changeId, record });
      return;
    }

    if (verbose) console.log(`processRecChng: [Update] Found run for qxchange_id=${changeId}, updating qxchange_data`, lateEntry);
    setRuns(prev => prev.map(r => r.qxchange_id === changeId ? { ...run, qxchange_data: { LateEntry: lateEntry } } : r));
  };

  const processRecChng = (recchng: RecChng, verbose = true) => {
    const { table, id, record, op } = recchng;
    if (verbose) console.log("processRecChng: received change", { table, id, record, op });

    if (table === "runs" && op === SqlOperation.Update) return updateRunRecord(id, record, verbose);
    if (table === "competitors" && op === SqlOperation.Update) return updateCompetitorRecord(id, record, verbose);
    if (table !== "qxchanges") return;
    if (op === SqlOperation.Delete) return clearQxChange(id);

    if (op === SqlOperation.Insert) {
      const lateEntry = getLateEntry(record);
      const userId = record?.user_id;
      const runId = lateEntry ? lateEntryRunId(lateEntry) : undefined;
      if (typeof userId === "string" && lateEntry && runId) {
        attachLateEntry(id, userId, lateEntry);
      } else if (verbose) {
        console.warn(`processRecChng: [Insert] Skipping — lateEntry or user_id missing`, { lateEntry, user_id: userId });
      }
      return;
    }

    if (op === SqlOperation.Update) updateQxChangeRecord(id, record, verbose);
  };

  const saveLateEntry = async (change_id: number | undefined, lateEntry: LateEntry) => {
    const origRun = runs().find(r => r.run_id === lateEntryRunId(lateEntry));
    if (!origRun) return;

    const changes = copyValidFieldsToRpcMap(origRun, lateEntry, ["firstname", "lastname", "registration", "siid"]);
    try {
      const params = makeMap({ change_id: change_id, late_entry: makeMap({ id: makeMap(lateEntry.id), ...changes }) });
      await callRpcMethod(wsClient()!, appConfig.eventApiPath(props.eventId), "updateLateEntry", params);
      showToast({ title: "Update late entry success" });
    } catch (error) {
      showToast({ title: "Update run error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const acceptDialog = () => {
    const run = formLateEntry();
    const lateEntry = run?.qxchange_data?.LateEntry;
    if (run && lateEntry) saveLateEntry(run.qxchange_id, lateEntry);
    closeDialog();
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) untrack(() => processRecChng(recchng));
  });

  createEffect(() => {
    if (props.mode === "runs" && className()) reloadTable();
  });

  onMount(() => {
    if (isLateEntriesMode) reloadTable();
  });

  const reloadTable = async () => {
    if (status() !== "Connected") return;
    setLoading(true);
    try {
      const query = createRunsQuery(props.mode, className(), props.currentStage);
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRuns(parseRunsQueryResult(result));
    } catch (error) {
      showToast({ title: "Reload table error", description: (error as Error).message, variant: "destructive" });
    }
    setLoading(false);
  };

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Runs</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class={`flex items-center ${props.mode === "runs" ? "justify-between" : "justify-end"}`}>
          {props.mode === "runs" && <ClassSelector className={className} setClassName={setClassName} eventId={eventId} currentStage={currentStage} />}
          <div class="flex gap-2 justify-end">
            {props.mode === "runs" && <Button onClick={openNewEntryDialog} disabled={!className() || status() !== "Connected"}>Add entry</Button>}
            <Button variant="outline" onClick={reloadTable} disabled={loading() || (props.mode === "runs" && !className()) || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <RunsTable
          eventConfig={props.eventConfig}
          currentStage={currentStage}
          runs={runs}
          loading={loading}
          mode={props.mode}
          canEdit={!!user()}
          onEditRun={setFormLateEntry}
        />

        <Dialog open={!!formLateEntry()} onOpenChange={(open) => { if (!open) closeDialog(); }}>
          <DialogContent class="max-w-md">
            <DialogHeader>
              <DialogTitle>{"Late Entry"}</DialogTitle>
            </DialogHeader>

            <div class="space-y-4">
              <TextField>
                <TextFieldLabel>First Name</TextFieldLabel>
                <TextFieldInput
                  value={formField("firstname") || ""}
                  type="text"
                  class={isFieldFromLateEntry("firstname") ? "text-primary font-semibold" : ""}
                  onInput={(e) => setFormField("firstname", e.currentTarget.value || undefined)}
                />
              </TextField>

              <TextField>
                <TextFieldLabel>Last Name</TextFieldLabel>
                <TextFieldInput
                  value={formField("lastname") || ""}
                  type="text"
                  class={isFieldFromLateEntry("lastname") ? "text-primary font-semibold" : ""}
                  onInput={(e) => setFormField("lastname", e.currentTarget.value || undefined)}
                />
              </TextField>

              <TextField>
                <TextFieldLabel>Registration</TextFieldLabel>
                <TextFieldInput
                  value={formField("registration") || ""}
                  type="text"
                  class={isFieldFromLateEntry("registration") ? "text-primary font-semibold" : ""}
                  onInput={(e) => setFormField("registration", e.currentTarget.value || undefined)}
                />
              </TextField>

              <TextField>
                <TextFieldLabel>SI ID</TextFieldLabel>
                <TextFieldInput
                  value={formField("siid")?.toString() || ""}
                  type="number"
                  class={isFieldFromLateEntry("siid") ? "text-primary font-semibold" : ""}
                  onInput={(e) => setFormField("siid", e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined)}
                />
              </TextField>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Cancel</Button>
              <Button onClick={acceptDialog}>{"Save Changes"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Runs;
