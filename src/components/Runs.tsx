import type { RpcValue } from "libshv-js";
import { createSignal, createEffect, createMemo, Show } from "solid-js";

import { Button } from "~/components/ui/button";
import { Table, TableColumn } from "~/components/ui/table";

import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { createSqlTable } from "~/lib/SqlTable";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { EventConfig, isEventOrganizer } from "~/routes/OpenedEvent";
import { ClassSelector, type ClassDef } from "~/components/ClassSelector";
import LateEntryDialog, { type LateEntryDialogField, type LateEntryDialogValue } from "~/components/LateEntryDialog";
import {
  applyRunRecChng,
  canEditLateEntry,
  changeFromRecChng,
  changeFromSqlRow,
  changeRunId,
  effectiveStartTime,
  lateEntryKind,
  lateEntryRpcParams,
  normalizedRecChngRecord,
  parseSqlRows,
  patchChange,
  runInfoFromSqlRow,
  sqlQuotedString,
  str,
  type LateEntry,
  type LateEntryRowBase,
  type QxChange,
  type RunInfo,
} from "~/lib/lateEntry";


export function fullName(lastname?: string, firstname?: string): string {
  return [lastname, firstname].filter(n => n?.trim()).join(" ");
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

/** Compares possibly missing values, missing ones sort last. */
export function compareOptional<V extends string | number>(a: V | undefined, b: V | undefined): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  return typeof a === "string" ? a.localeCompare(b as string) : (a as number) - (b as number);
}

/** Start time, name, registration and SI columns showing the original value and its change. */
export function changedValueColumns<T extends LateEntryRowBase>(stageStart: () => Date | undefined): TableColumn<T>[] {
  const originalName = (row: T) => fullName(row.run?.lastname, row.run?.firstname);
  return [
    {
      key: "starttimems",
      header: "Start Time",
      cell: (row: T) => {
        const changed = row.change?.lateEntry.starttimems;
        return (
          <ChangedValue
            original={formatStartTime(row.run?.starttimems, stageStart())}
            changed={changed !== undefined ? formatStartTime(changed, stageStart()) : undefined}
          />
        );
      },
      sortable: true,
      sortFn: (a: T, b: T) => compareOptional(effectiveStartTime(a), effectiveStartTime(b)),
    },
    {
      key: "name",
      header: "Name",
      cell: (row: T) => {
        const le = row.change?.lateEntry;
        const changedName = le?.firstname !== undefined || le?.lastname !== undefined
          ? fullName(le?.lastname ?? row.run?.lastname, le?.firstname ?? row.run?.firstname)
          : undefined;

        return <ChangedValue original={originalName(row)} changed={changedName} />;
      },
      sortable: true,
      sortFn: (a: T, b: T) => originalName(a).localeCompare(originalName(b)),
    },
    {
      key: "registration",
      header: "Reg",
      cell: (row: T) => <ChangedValue original={row.run?.registration || ""} changed={row.change?.lateEntry.registration} />,
      sortable: true,
      sortFn: (a: T, b: T) => compareOptional(a.run?.registration, b.run?.registration),
    },
    {
      key: "siid",
      header: "SI",
      cell: (row: T) => <ChangedValue original={row.run?.siid?.toString() || ""} changed={row.change?.lateEntry.siid?.toString()} />,
      sortable: false,
    },
  ];
}

/** Runs table row: a run, optionally with its pending change. */
type RunRow = {
  run: RunInfo;
  class_name: string;
  change?: QxChange;
};

function parseRunRows(result: RpcValue): RunRow[] {
  return parseSqlRows(result).flatMap(row => {
    const run = runInfoFromSqlRow(row);
    if (!run || row.class_name === undefined) {
      console.warn("Skipping run row without run_id, competitor_id or class_name", row);
      return [];
    }
    return [{ run, class_name: row.class_name, change: changeFromSqlRow(row) }];
  });
}

function createRunsQuery(className: string, workingStage: number): string {
  return `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                  competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                  qxchanges.id as qxchange_id, qxchanges.created as qxchange_created,
                  qxchanges.status as qxchange_status, qxchanges.status_message as qxchange_status_message,
                  qxchanges.paid as qxchange_paid,
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

function clearChange(rows: RunRow[], changeId: number): RunRow[] {
  return rows.map(r => r.change?.id === changeId ? { ...r, change: undefined } : r);
}

function applyRecChngToRuns(rows: RunRow[], recchng: RecChng): RunRow[] {
  const { table, id, op } = recchng;
  const record = normalizedRecChngRecord(recchng);

  const runsChanged = applyRunRecChng(rows, recchng, record, () => undefined);
  if (runsChanged) return runsChanged;
  if (table !== "qxchanges") return rows;

  switch (op) {
    case SqlOperation.Delete:
      return clearChange(rows, id);

    case SqlOperation.Insert: {
      const change = changeFromRecChng(id, record);
      const runId = change && changeRunId(change.lateEntry);
      if (!change || runId === undefined) return rows;
      return rows.map(r => r.run.run_id === runId ? { ...r, change } : r);
    }

    case SqlOperation.Update: {
      // Update signals are partial: a data-only change carries no `status`.
      // Only a status that left Pending means the change is resolved.
      const status = str(record?.status);
      if (status !== undefined && status !== "Pending") {
        return clearChange(rows, id);
      }
      return rows.map(r => r.change?.id === id ? { ...r, change: patchChange(r.change, record) } : r);
    }

    default:
      return rows;
  }
}

function createRunColumns(args: {
  stageStart: () => Date | undefined;
  canEdit: (row: RunRow) => boolean;
  onEditRun: (row: RunRow) => void;
  showActions: boolean;
}): TableColumn<RunRow>[] {
  const columns: TableColumn<RunRow>[] = [
    {
      key: "run_id",
      header: "ID",
      cell: (row: RunRow) => row.run.run_id.toString(),
      sortable: true,
      sortFn: (a: RunRow, b: RunRow) => a.run.run_id - b.run.run_id,
      hidden: "hidden lg:table-cell",
    },
    ...changedValueColumns<RunRow>(args.stageStart),
  ];
  if (!args.showActions) return columns;
  columns.push(
    {
      key: "actions",
      header: "Action",
      cell: (row: RunRow) => {
        const canEditRun = args.canEdit(row);
        return (
          <Button size="sm" variant="outline"
            onClick={() => args.onEditRun(row)}
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
  );
  return columns;
}

function RunsTable(props: {
  stageStart: () => Date | undefined;
  rows: () => RunRow[];
  loading: () => boolean;
  canEdit: (row: RunRow) => boolean;
  onEditRun: (row: RunRow) => void;
  showActions: () => boolean;
}) {
  const columns = createMemo(() => createRunColumns({
    stageStart: props.stageStart,
    canEdit: props.canEdit,
    onEditRun: props.onEditRun,
    showActions: props.showActions(),
  }));

  return (
    <div class="rounded-md table-border">
      <Table
        data={props.rows()}
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

/** Row being edited in the late entry dialog, `edit` holds the changed fields. */
type LateEntryDraft = LateEntryRowBase & { edit?: LateEntry };

export function createLateEntryDialogController(args: {
  eventId: () => number;
  eventConfig: () => EventConfig;
  workingStage: () => number | undefined;
  className?: () => string;
  /** Class and its rows, needed to offer free start times and to create new entries. */
  classDef?: () => ClassDef | undefined;
  classRows?: () => LateEntryRowBase[];
  canEdit: (row: LateEntryRowBase | undefined) => boolean;
  onNewLateEntrySaved?: () => void;
  updateErrorTitle?: string;
}) {
  const { wsClient } = useWsClient();
  const appConfig = useAppConfig();
  const [draft, setDraft] = createSignal<LateEntryDraft | undefined>(undefined);

  const openEditDialog = (row: LateEntryRowBase) => setDraft({
    run: row.run,
    class_name: row.class_name,
    change: row.change,
    edit: row.change?.lateEntry,
  });

  const openNewEntryDialog = () => setDraft({ class_name: args.className?.() ?? "" });

  const closeDialog = () => setDraft(undefined);

  const formClassName = (): string => args.className?.() || draft()?.class_name || "";

  const stageStart = () => {
    const stage = args.workingStage();
    return stage === undefined ? undefined : args.eventConfig().stages[stage - 1]?.stageStart;
  };

  const possibleStartTimes = () => {
    const cd = args.classDef?.();
    if (!cd || !cd.interval || !args.classRows) return [];

    const form = draft();
    const isFormRun = (row: LateEntryRowBase) => form?.run !== undefined && row.run?.run_id === form.run.run_id;
    const startTimes = new Set(
      args.classRows()
        .filter(row => !isFormRun(row))
        .map(effectiveStartTime)
        .filter((starttimems): starttimems is number => starttimems !== undefined),
    );
    const startSlots = [];
    for (let i = 0; i < cd.mapCount; i++) {
      const startTime = (cd.start + i * cd.interval) * 60 * 1000;
      if (startTimes.has(startTime)) continue;
      startSlots.push(startTime);
    }
    // Always offer the entry's own original and edited start times, even if off-grid.
    for (const own of [form?.run?.starttimems, form?.edit?.starttimems]) {
      if (own !== undefined && !startSlots.includes(own)) startSlots.push(own);
    }
    return startSlots.sort((a, b) => a - b);
  };

  const isFieldFromLateEntry = (field: LateEntryDialogField) => draft()?.edit?.[field] !== undefined;

  const formField = (field: LateEntryDialogField): LateEntryDialogValue => {
    const form = draft();
    return form?.edit?.[field] ?? form?.run?.[field];
  };

  const editOf = (form: LateEntryDraft): LateEntry =>
    form.edit ?? { kind: lateEntryKind(form.run?.run_id, args.classDef?.()?.id) };

  const setFormField = (field: LateEntryDialogField, value: LateEntryDialogValue) => {
    setDraft(prev => prev && {
      ...prev,
      edit: { ...editOf(prev), [field]: value === prev.run?.[field] ? undefined : value },
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

      setDraft(prev => prev && {
        ...prev,
        edit: {
          ...editOf(prev),
          registration: registration,
          firstname: regFirstname ?? prev.run?.firstname,
          lastname: regLastname ?? prev.run?.lastname,
          siid: regSiid ?? prev.run?.siid,
        },
      });
    } catch (error) {
      showToast({ title: "Load registration error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const errorTitle = () => args.updateErrorTitle ?? "Update late entry error";

  const saveLateEntry = async (changeId: number | undefined, lateEntry: LateEntry): Promise<boolean> => {
    const stageId = args.workingStage();
    if (stageId === undefined) {
      showToast({ title: errorTitle(), description: "Working stage is not set", variant: "destructive" });
      return false;
    }
    try {
      const params = lateEntryRpcParams(stageId, changeId, lateEntry);
      await callRpcMethod(wsClient()!, appConfig.eventApiPath(args.eventId()), "updateLateEntry", params);
      return true;
    } catch (error) {
      showToast({ title: errorTitle(), description: (error as Error).message, variant: "destructive" });
      return false;
    }
  };

  const acceptDialog = async () => {
    const form = draft();
    closeDialog();
    if (!form?.edit) return;

    const isNewLateEntry = form.change === undefined;
    const saved = await saveLateEntry(form.change?.id, form.edit);
    if (!saved) return;
    showToast({ title: "Update late entry success" });
    if (isNewLateEntry) args.onNewLateEntrySaved?.();
  };

  return {
    isOpen: () => draft() !== undefined,
    change: () => draft()?.change,
    /** A new entry, not yet saved, is shown as Pending. */
    status: () => draft()?.change?.status ?? (draft()?.run ? undefined : "Pending"),
    openEditDialog,
    openNewEntryDialog,
    formClassName,
    stageStart,
    possibleStartTimes,
    isFieldFromLateEntry,
    formField,
    setFormField,
    canEditForm: () => args.canEdit(draft()),
    loadRegistration,
    closeDialog,
    acceptDialog,
  };
}

export type LateEntryDialogController = ReturnType<typeof createLateEntryDialogController>;

/** LateEntryDialog bound to a dialog controller. */
export function LateEntryControllerDialog(props: { controller: LateEntryDialogController }) {
  const c = props.controller;
  return (
    <LateEntryDialog
      open={c.isOpen()}
      className={c.formClassName}
      stageStart={c.stageStart}
      possibleStartTimes={c.possibleStartTimes}
      qxchangeId={() => c.change()?.id}
      qxchangeCreated={() => c.change()?.created}
      status={c.status}
      statusMessage={() => c.change()?.status_message}
      fieldValue={c.formField}
      isFieldChanged={c.isFieldFromLateEntry}
      setFieldValue={c.setFormField}
      canEdit={c.canEditForm}
      paid={() => c.change()?.paid}
      onLoadRegistration={c.loadRegistration}
      onClose={c.closeDialog}
      onAccept={c.acceptDialog}
    />
  );
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
  const [rows, setRows] = createSignal<RunRow[]>([]);
  const [loading, setLoading] = createSignal(false);

  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;
  const workingStage = () => props.workingStage;

  const currentUserIsOrganizer = () => isEventOrganizer(props.eventConfig(), user()?.email);

  const canEditRunRecords = () => {
    return (workingStage() ?? 0) >= (currentStage() ?? 1);
  };

  const canEdit = (row: LateEntryRowBase | undefined) =>
    canEditRunRecords() && canEditLateEntry(row, user()?.email, currentUserIsOrganizer());

  const lateEntryDialog = createLateEntryDialogController({
    eventId,
    eventConfig: props.eventConfig,
    workingStage,
    className,
    classDef,
    classRows: rows,
    canEdit,
    onNewLateEntrySaved: props.onNewLateEntrySaved,
    updateErrorTitle: "Update run error",
  });

  const reloadTable = async () => {
    if (status() !== "Connected") return;
    setLoading(true);
    try {
      const query = createRunsQuery(className(), workingStage() ?? 0);
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRows(parseRunRows(result));
    } catch (error) {
      showToast({ title: "Reload table error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) setRows(prev => applyRecChngToRuns(prev, recchng));
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
            <Show when={user()?.email}>
              <Button onClick={lateEntryDialog.openNewEntryDialog} disabled={!className() || status() !== "Connected" || !canEditRunRecords()}>New entry</Button>
            </Show>
            <Button variant="outline" onClick={reloadTable} disabled={loading() || !className() || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <RunsTable
          stageStart={lateEntryDialog.stageStart}
          rows={rows}
          loading={loading}
          canEdit={canEdit}
          onEditRun={lateEntryDialog.openEditDialog}
          showActions={() => !!user()?.email}
        />

        <LateEntryControllerDialog controller={lateEntryDialog} />
      </div>
    </div>
  );
};

export default Runs;
