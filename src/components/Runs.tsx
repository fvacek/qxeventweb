import { makeMap, type RpcValue } from "libshv-js";
import { createSignal, createEffect, For } from "solid-js";

import { Button } from "~/components/ui/button";
import { Table, TableColumn } from "~/components/ui/table";
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
import LateEntryDialog, { type LateEntryDialogField, type LateEntryDialogValue } from "~/components/LateEntryDialog";

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
  note: optional(string()),
});

type LateEntry = InferOutput<typeof LateEntrySchema>;

const QxChangeDataSchema = object({
  LateEntry: optional(LateEntrySchema),
});
type QxChangeData = InferOutput<typeof QxChangeDataSchema>;

const RunSchema = object({
  run_id: optional(number()),
  competitor_id: optional(number()),
  class_name: optional(string()),
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
  note: optional(string()),
  starttimems: optional(number()),
  qxchange_id: optional(number()),
  qxchange_user_id: optional(string()),
  qxchange_status: optional(string()),
  qxchange_data: optional(QxChangeDataSchema),
});

type Run = InferOutput<typeof RunSchema>;
type RunsMode = "runs" | "lateEntries";
type LateEntryStatusFilter = "Pending" | "Accepted" | "Rejected";

const STATUS_FILTERS: LateEntryStatusFilter[] = ["Pending", "Accepted", "Rejected"];

function fullName(lastname?: string, firstname?: string): string {
  return [lastname, firstname].filter(n => n?.trim()).join(" ");
}

function sqlQuotedString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function ChangedValue(props: { original: string; changed?: string }) {
  if (props.changed === undefined) return <span>{props.original || "—"}</span>;

  return (
    <div class="flex flex-col leading-tight">
      <span class="line-through text-muted-foreground">{props.original || ""}</span>
      <span class="font-bold">{props.changed || ""}</span>
    </div>
  );
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

  // Two wire shapes exist: a legacy one carrying `{ run_id, record: {...} }`,
  // and the current one that already matches LateEntrySchema (`{ id: { RunId }, ... }`).
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

function createRunsQuery(mode: RunsMode, className: string, currentStage: number, userId: string): string {
  const fields = `runs.id as run_id, runs.siid, runs.starttimems,
              competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
              qxchanges.id as qxchange_id, qxchanges.status as qxchange_status, qxchanges.data as qxchange_data, qxchanges.user_id as qxchange_user_id`;
  if (mode === "runs") {
    return `SELECT ${fields},
                  classes.name AS class_name
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                INNER JOIN classes ON competitors.classid = classes.id AND classes.name = ${sqlQuotedString(className)}
                LEFT JOIN qxchanges ON runs.id = qxchanges.foreign_id  AND qxchanges.foreign_table = 'runs'
                  AND qxchanges.data_type = 'LateEntry'
                  AND qxchanges.status = 'Pending'
                WHERE runs.stageid = ${currentStage}
                  AND runs.isRunning = true
                ORDER BY runs.starttimems ASC`;
  }

  return `SELECT ${fields},
                  COALESCE(classes.name, qxclasses.name) AS class_name
                FROM qxchanges
                LEFT JOIN runs ON runs.id = qxchanges.foreign_id AND qxchanges.foreign_table = 'runs' AND qxchanges.data_type = 'LateEntry'
                LEFT JOIN competitors ON runs.competitorid = competitors.id
                LEFT JOIN classes ON competitors.classid = classes.id
                LEFT JOIN classes AS qxclasses ON qxclasses.id = qxchanges.foreign_id AND qxchanges.foreign_table = 'classes' AND qxchanges.data_type = 'LateEntry'
                WHERE qxchanges.stage_id = ${currentStage} AND qxchanges.user_id = ${sqlQuotedString(userId)}
                ORDER BY qxchanges.id ASC`;
}

function getLateEntry(record: RecChng["record"]): LateEntry | undefined {
  if (!record || typeof record.data !== "string") return undefined;

  try {
    return parse(QxChangeDataSchema, JSON.parse(record.data)).LateEntry;
  } catch (error) {
    console.warn("Invalid qxchange LateEntry data:", error, record.data);
    return undefined;
  }
}

function clearQxChange(runs: Run[], changeId: number): Run[] {
  return runs.map(r =>
    r.qxchange_id === changeId
      ? { ...r, qxchange_id: undefined, qxchange_user_id: undefined, qxchange_data: undefined }
      : r
  );
}

const str = (value: unknown, fallback?: string): string | undefined =>
  typeof value === "string" ? value : fallback;

function applyRecChngToRuns(runs: Run[], recchng: RecChng, mode: RunsMode): Run[] {
  const { table, id, record, op } = recchng;
  console.log("processRecChng: received change", { table, id, record, op });

  if (table === "runs" && op === SqlOperation.Update) {
    return runs.map(r => r.run_id === id ? { ...r, ...record } : r);
  }

  if (table === "competitors" && op === SqlOperation.Update) {
    return runs.map(r => r.competitor_id === id ? { ...r, ...record } : r);
  }

  if (table !== "qxchanges") return runs;

  switch (op) {
    case SqlOperation.Delete:
      return clearQxChange(runs, id);

    case SqlOperation.Insert: {
      const lateEntry = getLateEntry(record);
      const userId = str(record?.user_id);
      const runId = lateEntry?.id.RunId;

      if (!userId || !lateEntry || !runId) {
        console.warn("processRecChng: [Insert] Skipping — lateEntry or user_id missing", { lateEntry, user_id: userId });
        return runs;
      }

      return runs.map(r =>
        r.run_id === runId
          ? {
            ...r,
            qxchange_id: id,
            qxchange_user_id: userId,
            qxchange_status: str(record?.status, r.qxchange_status),
            qxchange_data: { LateEntry: lateEntry },
          }
          : r
      );
    }

    case SqlOperation.Update: {
      if (mode === "lateEntries" && record?.status && record.status !== "Pending") {
        console.log(`processRecChng: [RESOLVED] Removing qxchange data from run with qxchange_id=${id}`);
        return clearQxChange(runs, id);
      }

      const lateEntry = getLateEntry(record);
      if (!lateEntry) {
        console.warn(`processRecChng: [Update] No LateEntry found in qxchange data for qxchange_id=${id}`);
        return runs;
      }

      return runs.map(r =>
        r.qxchange_id === id
          ? {
            ...r,
            qxchange_user_id: str(record?.user_id, r.qxchange_user_id),
            qxchange_status: str(record?.status, r.qxchange_status),
            qxchange_data: { LateEntry: lateEntry },
          }
          : r
      );
    }

    default:
      return runs;
  }
}

function lateEntryRpcParams(changeId: number | undefined, lateEntry: LateEntry) {
  return makeMap({
    change_id: changeId,
    late_entry: makeMap({
      ...lateEntry,
      id: makeMap(lateEntry.id),
    }),
  });
}

function createRunColumns(args: {
  mode: RunsMode;
  stageStart: () => Date | undefined;
  canEdit: () => boolean;
  onEditRun: (run: Run) => void;
}): TableColumn<Run>[] {
  const isLateEntriesMode = args.mode === "lateEntries";

  const classNameColumn: TableColumn<Run> = {
    key: "class_name",
    header: "Class",
    sortable: true,
    width: "120px",
  };

  const operationColumn: TableColumn<Run> = {
    key: "operation",
    header: "Operation",
    cell: (run: Run) => {
      const isChange = (run.qxchange_data?.LateEntry?.id?.RunId ?? 0) > 0;
      const label = isChange ? "Change" : "New";
      return (
        <span class="inline-flex w-full justify-center">
          <span
            title={label}
            aria-label={label}
            class="inline-flex size-6 items-center justify-center rounded-md bg-highlight text-background text-lg font-bold"
          >
            {isChange ? "✎" : "+"}
          </span>
        </span>
      );
    },
    width: "100px",
  };

  const qxChangeStatusColumn: TableColumn<Run> = {
    key: "qxchange_status",
    header: "Status",
    sortable: true,
    width: "100px",
  };

  return [
    ...(isLateEntriesMode ? [operationColumn, classNameColumn] : []),
    {
      key: "starttimems",
      header: "Start Time",
      cell: (run: Run) => <span>{formatStartTime(run.starttimems, args.stageStart()) || "—"}</span>,
      sortable: true,
      width: "120px",
    },
    {
      key: "name",
      header: "Name",
      cell: (run: Run) => {
        const le = run.qxchange_data?.LateEntry;
        const changedName = le?.firstname !== undefined || le?.lastname !== undefined
          ? fullName(le?.lastname ?? run.lastname, le?.firstname ?? run.firstname)
          : undefined;

        return <ChangedValue original={fullName(run.lastname, run.firstname)} changed={changedName} />;
      },
      sortable: true,
      sortFn: (a: Run, b: Run) => fullName(a.lastname, a.firstname).localeCompare(fullName(b.lastname, b.firstname)),
      width: "200px",
    },
    {
      key: "registration",
      header: "Reg",
      cell: (run: Run) => <ChangedValue original={run.registration || ""} changed={run.qxchange_data?.LateEntry?.registration} />,
      sortable: true,
      width: "100px",
    },
    {
      key: "siid",
      header: "SI",
      cell: (run: Run) => <ChangedValue original={run.siid?.toString() || ""} changed={run.qxchange_data?.LateEntry?.siid?.toString()} />,
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
          onClick={() => args.onEditRun(run)}
          disabled={!args.canEdit()}
        >
          Edit
        </Button>
      ),
      sortable: false,
      width: "80px",
    },
  ];
}

function RunsTable(props: {
  eventConfig: () => EventConfig;
  currentStage: () => number;
  runs: () => Run[];
  loading: () => boolean;
  mode: RunsMode;
  canEdit: () => boolean;
  onEditRun: (run: Run) => void;
}) {
  const columns = createRunColumns({
    mode: props.mode,
    stageStart: () => props.eventConfig().stages[props.currentStage() - 1]?.stageStart,
    canEdit: props.canEdit,
    onEditRun: props.onEditRun,
  });

  return (
    <div class="rounded-md table-border">
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
  );
}

function ClassSelector(props: {
  className: () => string;
  setClassName: (name: string) => void;
  setClassId: (id: number) => void;
  eventId: () => number;
  currentStage: () => number;
}) {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const [classes, setClasses] = createSignal<{ id: number; name: string }[]>([]);

  async function loadClasses() {
    try {
      const result = await callRpcMethod(
        wsClient()!,
        appConfig.eventSqlApiPath(props.eventId()),
        "query",
        [`SELECT classes.id, classes.name FROM classes, classdefs
          WHERE classdefs.classid = classes.id AND classdefs.stageid = ${props.currentStage()}
          ORDER BY classes.name`],
      );
      const table = createSqlTable(result);
      const classlist = Array.from({ length: table.rowCount() }, (_, i) =>
        ({ id: Number(table.get(i, "id")), name: String(table.get(i, "name")) }),
      );
      setClasses(classlist);
      if (classlist.length > 0) {
        props.setClassName(classlist[0].name);
        props.setClassId(classlist[0].id);
      }
    } catch (error) {
      showToast({ title: "Load classes error", description: (error as Error).message, variant: "destructive" });
    }
  }

  createEffect(() => {
    if (status() === "Connected") loadClasses();
  });

  const selectClass = (name: string) => {
    const selectedClass = classes().find(c => c.name === name);
    props.setClassName(name);
    props.setClassId(selectedClass?.id ?? 0);
  };

  return (
    <div class="w-full">
      {props.className() && (
        <FlexDropdown
          value={props.className()}
          options={classes().map(c => c.name)}
          onSelect={selectClass}
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
  const [classId, setClassId] = createSignal(0);
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [formLateEntry, setFormLateEntry] = createSignal<Run | undefined>(undefined);
  const [statusFilter, setStatusFilter] = createSignal<LateEntryStatusFilter | undefined>(undefined);

  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;

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

  const formClassName = (): string => {
    if (className()) return className();
    const run = formLateEntry();
    return run?.class_name ?? "";
  };

  const isFieldFromLateEntry = (field: LateEntryDialogField) =>
    formLateEntry()?.qxchange_data?.LateEntry?.[field] !== undefined;

  const formField = (field: LateEntryDialogField): LateEntryDialogValue => {
    const run = formLateEntry();
    return run?.qxchange_data?.LateEntry?.[field] ?? run?.[field];
  };

  const setFormField = (field: LateEntryDialogField, value: LateEntryDialogValue) => {
    setFormLateEntry(prev => {
      if (!prev) return undefined;

      return {
        ...prev,
        qxchange_data: {
          ...prev.qxchange_data,
          LateEntry: {
            ...(prev.qxchange_data?.LateEntry ?? { id: prev.run_id ? { RunId: prev.run_id } : { ClassId: classId() } }),
            [field]: value === prev[field] ? undefined : value,
          },
        },
      };
    });
  };

  const saveLateEntry = async (change_id: number | undefined, lateEntry: LateEntry) => {
    // const changes = copyValidFieldsToRpcMap(origRun, lateEntry, ["firstname", "lastname", "registration", "siid"]);
    try {
      const params = lateEntryRpcParams(change_id, lateEntry);
      await callRpcMethod(wsClient()!, appConfig.eventApiPath(props.eventId), "updateLateEntry", params);
      showToast({ title: "Update late entry success" });
    } catch (error) {
      showToast({ title: "Update run error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const acceptDialog = () => {
    const run = formLateEntry();
    const lateEntry = run?.qxchange_data?.LateEntry;
    if (run && lateEntry) {
      saveLateEntry(run.qxchange_id, lateEntry);
    }
    closeDialog();
  };

  const reloadTable = async () => {
    if (status() !== "Connected") return;
    setLoading(true);
    try {
      const query = createRunsQuery(props.mode, className(), props.currentStage, user()?.email ?? "");
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRuns(parseRunsQueryResult(result));
    } catch (error) {
      showToast({ title: "Reload table error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const tableRuns = () => {
    const filter = statusFilter();
    return filter ? runs().filter(run => run.qxchange_status === filter) : runs();
  };

  const toggleStatusFilter = (filter: LateEntryStatusFilter) => {
    setStatusFilter(prev => prev === filter ? undefined : filter);
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) setRuns(prev => applyRecChngToRuns(prev, recchng, props.mode));
  });

  createEffect(() => {
    if (status() !== "Connected") return;
    if (props.mode === "runs" && !className()) return;
    reloadTable();
  });

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">{props.mode === "lateEntries" ? "Late Entries" : "Runs"}</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class={`flex items-center ${props.mode === "runs" ? "justify-between" : "justify-end"}`}>
          {props.mode === "runs" && <ClassSelector className={className} setClassName={setClassName} setClassId={setClassId} eventId={eventId} currentStage={currentStage} />}
          <div class="flex gap-2 justify-end">
            {props.mode === "runs" && <Button onClick={openNewEntryDialog} disabled={!className() || status() !== "Connected"}>New entry</Button>}
            {props.mode === "lateEntries" && (
              <For each={STATUS_FILTERS}>{(filter) => (
                <Button
                  variant={statusFilter() === filter ? "default" : "outline"}
                  onClick={() => toggleStatusFilter(filter)}
                  disabled={status() !== "Connected"}
                >
                  {filter}
                </Button>
              )}</For>
            )}
            <Button variant="outline" onClick={reloadTable} disabled={loading() || (props.mode === "runs" && !className()) || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <RunsTable
          eventConfig={props.eventConfig}
          currentStage={currentStage}
          runs={tableRuns}
          loading={loading}
          mode={props.mode}
          canEdit={() => !!user()}
          onEditRun={setFormLateEntry}
        />

        <LateEntryDialog
          open={!!formLateEntry()}
          className={formClassName}
          fieldValue={formField}
          isFieldChanged={isFieldFromLateEntry}
          setFieldValue={setFormField}
          onClose={closeDialog}
          onAccept={acceptDialog}
        />
      </div>
    </div>
  );
};

export default Runs;
