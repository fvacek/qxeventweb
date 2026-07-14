import { makeMap, type RpcValue } from "libshv-js";
import { createSignal, createEffect, createMemo } from "solid-js";

import { Button } from "~/components/ui/button";
import { Table, TableColumn } from "~/components/ui/table";

import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { createSqlTable } from "~/lib/SqlTable";
import { object, number, string, parse, type InferOutput, optional, boolean } from "valibot";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { EventConfig } from "~/routes/OpenedEvent";
import { ClassSelector, type ClassDef } from "~/components/ClassSelector";
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
  starttimems: optional(number()),
  paid: optional(boolean()),
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
  qxchange_created: optional(string()),
  qxchange_user_id: optional(string()),
  qxchange_status: optional(string()),
  qxchange_status_message: optional(string()),
  qxchange_data: optional(QxChangeDataSchema),
});

export type Run = InferOutput<typeof RunSchema>;
export function fullName(lastname?: string, firstname?: string): string {
  return [lastname, firstname].filter(n => n?.trim()).join(" ");
}

function sqlQuotedString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function ChangedValue(props: { original: string; changed?: string }) {
  if (props.changed === undefined) return <span>{props.original || "—"}</span>;

  return (
    <div class="flex flex-col leading-tight">
      <span class="line-through text-muted-foreground">{props.original || ""}</span>
      <span class="font-bold">{props.changed || ""}</span>
    </div>
  );
}

export function formatStartTime(msec: number | undefined, start: Date | undefined): string {
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

export function parseRunsQueryResult(result: RpcValue): Run[] {
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

function createRunsQuery(className: string, workingStage: number): string {
  return `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                  competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                  qxchanges.id as qxchange_id, qxchanges.created as qxchange_created,
                  qxchanges.status as qxchange_status, qxchanges.status_message as qxchange_status_message,
                  qxchanges.data as qxchange_data, qxchanges.user_id as qxchange_user_id,
                  classes.name AS class_name
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                INNER JOIN classes ON competitors.classid = classes.id AND classes.name = ${sqlQuotedString(className)}
                LEFT JOIN qxchanges ON runs.id = qxchanges.foreign_id  AND qxchanges.foreign_table = 'runs'
                  AND qxchanges.data_type = 'LateEntry'
                  AND qxchanges.status = 'Pending'
                WHERE runs.stageid = ${workingStage}
                  AND runs.isRunning = true
                ORDER BY runs.starttimems ASC`;
}



function parseLateEntryFromRecChng(record: RecChng["record"]): LateEntry | undefined {
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
      ? { ...r, qxchange_id: undefined, qxchange_user_id: undefined, qxchange_status: undefined, qxchange_status_message: undefined, qxchange_data: undefined }
      : r
  );
}

const str = (value: unknown, fallback?: string): string | undefined =>
  typeof value === "string" ? value : fallback;

function applyRecChngToRuns(runs: Run[], recchng: RecChng): Run[] {
  const { table, id, record, op } = recchng;
  console.log("processRecChng: received change", { table, id, record, op });

  if (table === "runs") {
    if (op === SqlOperation.Update) {
      return runs.map(r => r.run_id === id ? { ...r, ...record } : r);
    }
    if (op === SqlOperation.Delete) {
      return runs.filter(r => r.run_id !== id);
    }
  }

  if (table === "competitors" && op === SqlOperation.Update) {
    return runs.map(r => r.competitor_id === id ? { ...r, ...record } : r);
  }

  if (table !== "qxchanges") return runs;

  switch (op) {
    case SqlOperation.Delete:
      return clearQxChange(runs, id);

    case SqlOperation.Insert: {
      const lateEntry = parseLateEntryFromRecChng(record);
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
            qxchange_status_message: str(record?.status_message, r.qxchange_status_message),
            qxchange_data: { LateEntry: lateEntry },
          }
          : r
      );
    }

    case SqlOperation.Update: {
      if (record?.status !== "Pending") {
        return clearQxChange(runs, id);
      }
      const lateEntry = parseLateEntryFromRecChng(record);
      return runs.map(r =>
        r.qxchange_id === id
          ? {
            ...r,
            qxchange_status_message: str(record?.status_message, r.qxchange_status_message),
            qxchange_data: lateEntry !== undefined ? { LateEntry: lateEntry } : r.qxchange_data,
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
  stageStart: () => Date | undefined;
  canEdit: (run: Run) => boolean;
  onEditRun: (run: Run) => void;
}): TableColumn<Run>[] {
  return [
    {
      key: "starttimems",
      header: "Start Time",
      cell: (run: Run) => (
        <ChangedValue
          original={formatStartTime(run.starttimems, args.stageStart())}
          changed={run.qxchange_data?.LateEntry?.starttimems !== undefined
            ? formatStartTime(run.qxchange_data.LateEntry.starttimems, args.stageStart())
            : undefined}
        />
      ),
      sortable: true,
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
    },
    {
      key: "registration",
      header: "Reg",
      cell: (run: Run) => <ChangedValue original={run.registration || ""} changed={run.qxchange_data?.LateEntry?.registration} />,
      sortable: true,
    },
    {
      key: "siid",
      header: "SI",
      cell: (run: Run) => <ChangedValue original={run.siid?.toString() || ""} changed={run.qxchange_data?.LateEntry?.siid?.toString()} />,
      sortable: false,
    },
    {
      key: "actions",
      header: "Action",
      cell: (run: Run) => {
        const canEditRun = args.canEdit(run);
        return (
          <Button size="sm" variant="outline"
            onClick={() => args.onEditRun(run)}
            disabled={!canEditRun}
            title={canEditRun ? "Edit" : "Only the change owner or an organizer can edit"}
          >
            Edit
          </Button>
        );
      },
      sortable: false,
      width: "80px",
    },
  ];
}

function RunsTable(props: {
  stageStart: () => Date | undefined;
  runs: () => Run[];
  loading: () => boolean;
  canEdit: (run: Run) => boolean;
  onEditRun: (run: Run) => void;
}) {
  const columns = createMemo(() => createRunColumns({
    stageStart: props.stageStart,
    canEdit: props.canEdit,
    onEditRun: props.onEditRun,
  }));

  return (
    <div class="rounded-md table-border">
      <Table
        data={props.runs()}
        columns={columns()}
        loading={props.loading()}
        emptyMessage="No entries found"
        variant="striped"
        sortable={true}
        globalFilter={true}

      />
    </div>
  );
}

export function createLateEntryDialogController(args: {
  eventId: () => number;
  eventConfig: () => EventConfig;
  workingStage: () => number | undefined;
  className?: () => string;
  classDef: () => ClassDef | undefined;
  runs: () => Run[];
  canEditRun: (run: Run | undefined) => boolean;
  onNewLateEntrySaved?: () => void;
  updateErrorTitle?: string;
}) {
  const { wsClient } = useWsClient();
  const appConfig = useAppConfig();
  const [formLateEntry, setFormLateEntry] = createSignal<Run | undefined>(undefined);

  const openNewEntryDialog = () => setFormLateEntry({
    run_id: 0,
    competitor_id: 0,
    class_name: args.className?.() ?? "",
    firstname: undefined,
    lastname: undefined,
    registration: undefined,
    siid: undefined,
    starttimems: undefined,
    qxchange_id: undefined,
    qxchange_created: undefined,
    qxchange_user_id: undefined,
    qxchange_status: "Pending",
    qxchange_status_message: undefined,
    qxchange_data: undefined,
  });

  const closeDialog = () => setFormLateEntry(undefined);

  const formClassName = (): string => {
    if (args.className?.()) return args.className();
    const run = formLateEntry();
    return run?.class_name ?? "";
  };

  const stageStart = () => {
    const stage = args.workingStage();
    return stage === undefined ? undefined : args.eventConfig().stages[stage - 1]?.stageStart;
  };

  const possibleStartTimes = () => {
    const cd = args.classDef();
    if (!cd || !cd.interval) return [];

    const startTimes = new Set(
      args.runs()
        .map(run => run.qxchange_data?.LateEntry?.starttimems === undefined ? run.starttimems : run.qxchange_data?.LateEntry?.starttimems)
        .filter((starttimems): starttimems is number => starttimems !== undefined),
    );
    const startSlots = [];
    for (let i = 0; i < cd.mapCount; i++) {
      const startTime = (cd.start + i * cd.interval) * 60 * 1000;
      if (startTimes.has(startTime)) continue;
      startSlots.push(startTime);
    }
    return startSlots;
  };

  const isFieldFromLateEntry = (field: LateEntryDialogField) =>
    formLateEntry()?.qxchange_data?.LateEntry?.[field] !== undefined;

  const formField = (field: LateEntryDialogField): LateEntryDialogValue => {
    const run = formLateEntry();
    const originalValue = field === "paid" ? undefined : run?.[field];
    return run?.qxchange_data?.LateEntry?.[field] ?? originalValue;
  };

  const setFormField = (field: LateEntryDialogField, value: LateEntryDialogValue) => {
    setFormLateEntry(prev => {
      if (!prev) return undefined;

      const originalValue = field === "paid" ? undefined : prev[field];

      return {
        ...prev,
        qxchange_data: {
          ...prev.qxchange_data,
          LateEntry: {
            ...(prev.qxchange_data?.LateEntry ?? { id: prev.run_id ? { RunId: prev.run_id } : { ClassId: args.classDef()?.id } }),
            [field]: value === originalValue ? undefined : value,
          },
        },
      };
    });
  };

  const loadRegistration = async () => {
    const registration = formField("registration")?.toString().trim().toUpperCase();
    if (!registration) return;

    try {
      const result = await callRpcMethod(
        wsClient()!,
        appConfig.eventSqlApiPath(args.eventId()),
        "query",
        [`SELECT * FROM registrations WHERE registrations.registration = ${sqlQuotedString(registration)}`],
      );
      const table = createSqlTable(result);
      if (table.rowCount() === 0) {
        showToast({ title: "Registration not found", description: `No record found for registration ${registration}`, variant: "destructive" });
        return;
      }
      if (table.rowCount() > 1) {
        showToast({ title: "Registration not found", description: `Multiple records found for registration ${registration}`, variant: "destructive" });
        return;
      }

      const regrec = table.recordAt(0);
      const regFirstname = regrec.firstname?.toString();
      const regLastname = regrec.lastname?.toString();
      const regSiid = regrec.siid === undefined || regrec.siid === null ? undefined : Number(regrec.siid);

      setFormLateEntry(prev => {
        if (!prev) return undefined;
        return {
          ...prev,
          qxchange_data: {
            ...prev.qxchange_data,
            LateEntry: {
              ...(prev.qxchange_data?.LateEntry ?? { id: prev.run_id ? { RunId: prev.run_id } : { ClassId: args.classDef()?.id } }),
              registration: registration,
              firstname: regFirstname === undefined ? prev.firstname : regFirstname,
              lastname: regLastname === undefined ? prev.lastname : regLastname,
              siid: regSiid === undefined ? prev.siid : regSiid,
            },
          },
        };
      });
    } catch (error) {
      showToast({ title: "Load registration error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const saveLateEntry = async (changeId: number | undefined, lateEntry: LateEntry): Promise<boolean> => {
    try {
      const params = lateEntryRpcParams(changeId, lateEntry);
      await callRpcMethod(wsClient()!, appConfig.eventApiPath(args.eventId()), "updateLateEntry", params);
      showToast({ title: "Update late entry success" });
      return true;
    } catch (error) {
      showToast({ title: args.updateErrorTitle ?? "Update late entry error", description: (error as Error).message, variant: "destructive" });
      return false;
    }
  };

  const acceptDialog = async () => {
    const formRun = formLateEntry();
    const lateEntry = formRun?.qxchange_data?.LateEntry;
    const isNewLateEntry = formRun?.qxchange_id === undefined;
    let saved = false;

    if (lateEntry) {
      saved = await saveLateEntry(formRun.qxchange_id, lateEntry);
    }
    closeDialog();

    if (saved && isNewLateEntry) {
      args.onNewLateEntrySaved?.();
    }
  };

  return {
    formLateEntry,
    setFormLateEntry,
    openNewEntryDialog,
    formClassName,
    stageStart,
    possibleStartTimes,
    isFieldFromLateEntry,
    formField,
    setFormField,
    canEditFormRun: () => args.canEditRun(formLateEntry()),
    loadRegistration,
    closeDialog,
    acceptDialog,
  };
}

const Runs = (props: {
  eventId: number,
  eventConfig: () => EventConfig,
  currentStage: number | undefined,
  workingStage: number | undefined,
  recchngReceived: () => RecChng | null,
  onNewLateEntrySaved?: () => void,
}) => {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();

  const [className, setClassName] = createSignal("");
  const [classDef, setClassDef] = createSignal<ClassDef | undefined>(undefined);
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);

  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;
  const workingStage = () => props.workingStage;

  const currentUserIsOrganizer = () => props.eventConfig().members?.[user()?.email ?? ""] === "Organizer";

  const canEditRunRecords = () => {
    return (workingStage() ?? 0) >= (currentStage() ?? 1);
  };

  const canEditRun = (run: Run | undefined) => {
    const email = user()?.email;
    if (!email || !run || !canEditRunRecords()) return false;
    if (run.qxchange_status !== undefined && run.qxchange_status !== "Pending") return false;
    return currentUserIsOrganizer() || run.qxchange_user_id === email || run.qxchange_id === undefined;
  };

  const lateEntryDialog = createLateEntryDialogController({
    eventId,
    eventConfig: props.eventConfig,
    workingStage,
    className,
    classDef,
    runs,
    canEditRun,
    onNewLateEntrySaved: props.onNewLateEntrySaved,
    updateErrorTitle: "Update run error",
  });

  const reloadTable = async () => {
    if (status() !== "Connected") return;
    setLoading(true);
    try {
      const query = createRunsQuery(className(), workingStage() ?? 0);
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRuns(parseRunsQueryResult(result));
    } catch (error) {
      showToast({ title: "Reload table error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) setRuns(prev => applyRecChngToRuns(prev, recchng));
  });

  createEffect(() => {
    if (status() !== "Connected") return;
    if (workingStage() === undefined) return;
    if (!className()) return;
    reloadTable();
  });

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Runs</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class="flex items-center justify-between">
          <ClassSelector className={className} setClassName={setClassName} setClassDef={setClassDef} eventId={eventId} workingStage={workingStage} />
          <div class="flex gap-2 justify-end">
            <Button onClick={lateEntryDialog.openNewEntryDialog} disabled={!className() || status() !== "Connected" || !user()?.email || !canEditRunRecords()}>New entry</Button>
            <Button variant="outline" onClick={reloadTable} disabled={loading() || !className() || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <RunsTable
          stageStart={lateEntryDialog.stageStart}
          runs={runs}
          loading={loading}
          canEdit={canEditRun}
          onEditRun={lateEntryDialog.setFormLateEntry}
        />

        <LateEntryDialog
          open={!!lateEntryDialog.formLateEntry()}
          className={lateEntryDialog.formClassName}
          stageStart={lateEntryDialog.stageStart}
          possibleStartTimes={lateEntryDialog.possibleStartTimes}
          qxchangeId={() => lateEntryDialog.formLateEntry()?.qxchange_id}
          qxchangeCreated={() => lateEntryDialog.formLateEntry()?.qxchange_created}
          status={() => lateEntryDialog.formLateEntry()?.qxchange_status}
          statusMessage={() => lateEntryDialog.formLateEntry()?.qxchange_status_message}
          fieldValue={lateEntryDialog.formField}
          isFieldChanged={lateEntryDialog.isFieldFromLateEntry}
          setFieldValue={lateEntryDialog.setFormField}
          canEdit={lateEntryDialog.canEditFormRun}
          canEditPaid={currentUserIsOrganizer}
          onLoadRegistration={lateEntryDialog.loadRegistration}
          onClose={lateEntryDialog.closeDialog}
          onAccept={lateEntryDialog.acceptDialog}
        />
      </div>
    </div>
  );
};

export default Runs;
