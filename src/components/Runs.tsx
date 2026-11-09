import { createSignal, createEffect, createMemo, onCleanup, Show, untrack } from "solid-js";

import { Button } from "~/components/ui/button";
import { Table, type TableColumn } from "~/components/ui/table";
import { showToast } from "~/components/ui/toast";
import { ClassSelector, type ClassDef } from "~/components/ClassSelector";
import { changedValueColumns } from "~/components/lateEntryColumns";
import LateEntryDialog, { createLateEntryDialogController } from "~/components/LateEntryDialog";
import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { useAppConfig } from "~/context/AppConfig";
import { RUNNER_ROW_COLUMNS, sqlQuotedString } from "~/lib/lateEntry";
import { applyRecChngToRuns, parseRunnerRows, type RunRow } from "~/lib/lateEntryRows";
import { num } from "~/lib/recChng";
import { callRpcMethod } from "~/lib/rpc";
import type { RecChng } from "~/schema/rpc-sql-schema";
import type { EventConfig } from "~/routes/OpenedEvent";

function createRunsQuery(className: string, workingStage: number): string {
  return `SELECT ${RUNNER_ROW_COLUMNS},
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

const NEW_COMPETITOR_RELOAD_DELAY_MS = 1000;

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

  const lateEntryDialog = createLateEntryDialogController({
    eventId,
    eventConfig: props.eventConfig,
    currentStage,
    workingStage,
    className,
    classDef,
    classRows: rows,
    onNewLateEntrySaved: props.onNewLateEntrySaved,
    updateErrorTitle: "Update run error",
  });

  const reloadTable = async () => {
    if (status() !== "Connected") return;
    setLoading(true);
    try {
      const query = createRunsQuery(className(), workingStage() ?? 0);
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRows(parseRunnerRows(result));
    } catch (error) {
      showToast({ title: "Reload table error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // A new competitor's runs arrive as separate inserts followed by updates (e.g. siId),
  // so the reload waits for them; further inserts postpone it again.
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(reloadTable, NEW_COMPETITOR_RELOAD_DELAY_MS);
  };
  onCleanup(() => clearTimeout(reloadTimer));

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (!recchng) return;
    // Untracked, re-running on class change would apply the same recchng twice.
    untrack(() => setRows(applyRecChngToRuns(rows(), recchng, record => {
      const classId = num(record?.classid);
      if (classId !== undefined && classId === classDef()?.id) scheduleReload();
    })));
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
              <Button onClick={lateEntryDialog.openNewEntryDialog} disabled={!className() || status() !== "Connected" || !lateEntryDialog.canEditRunRecords()}>New entry</Button>
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
          canEdit={lateEntryDialog.canEdit}
          onEditRun={lateEntryDialog.openEditDialog}
          showActions={() => !!user()?.email}
        />

        <LateEntryDialog controller={lateEntryDialog} />
      </div>
    </div>
  );
};

export default Runs;
