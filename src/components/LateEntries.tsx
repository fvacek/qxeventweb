import type { RpcValue } from "libshv-js";
import { createEffect, createMemo, createSignal, untrack } from "solid-js";

import { Button } from "~/components/ui/button";
import { FlexDropdown } from "~/components/ui/flexdropdown";
import { Table, type TableColumn } from "~/components/ui/table";
import { showToast } from "~/components/ui/toast";
import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { useAppConfig } from "~/context/AppConfig";
import { callRpcMethod } from "~/lib/rpc";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { EventConfig, isEventOrganizer } from "~/routes/OpenedEvent";
import {
  changedValueColumns,
  compareOptional,
  createLateEntryDialogController,
  LateEntryControllerDialog,
} from "~/components/Runs";
import {
  applyRunRecChng,
  canEditLateEntry,
  changeFromRecChng,
  changeFromSqlRow,
  changeRunId,
  normalizedRecChngRecord,
  parseSqlRows,
  patchChange,
  runInfoFromSqlRow,
  type LateEntryRowBase,
  type QxChange,
  type RunInfo,
} from "~/lib/lateEntry";

type LateEntryStatusFilter = "Pending" | "Accepted" | "Rejected";

const STATUS_FILTERS: LateEntryStatusFilter[] = ["Pending", "Accepted", "Rejected"];

function StatusIcon(props: { status?: string }) {
  switch (props.status) {
    case "Rejected":
      return (
        <span class="inline-flex size-6 items-center justify-center rounded-full bg-red-600 text-white text-sm font-bold" title="Rejected" aria-label="Rejected">
          R
        </span>
      );
    case "Accepted":
      return (
        <span class="inline-flex size-6 items-center justify-center rounded-full bg-green-600 text-white text-sm font-bold" title="Accepted" aria-label="Accepted">
          A
        </span>
      );
    case "Pending":
      return (
        <span class="inline-flex size-6 items-center justify-center rounded-full bg-orange-500 text-white text-sm font-bold" title="Pending" aria-label="Pending">
          P
        </span>
      );
    default:
      return <span class="text-muted-foreground">—</span>;
  }
}

function PaidIcon(props: { paid?: boolean }) {
  return props.paid
    ? (
      <span class="inline-flex size-6 items-center justify-center rounded-full bg-green-600 text-white text-sm font-bold" title="Paid" aria-label="Paid">
        ✓
      </span>
    )
    : <span class="text-muted-foreground" title="Unpaid" aria-label="Unpaid">—</span>;
}

/** Late entries table row: a change, with the run it applies to, if any (a new entry has none). */
type LateEntryRow = {
  run?: RunInfo;
  class_name?: string;
  change: QxChange;
};

function parseLateEntryRows(result: RpcValue): LateEntryRow[] {
  return parseSqlRows(result).flatMap(row => {
    const change = changeFromSqlRow(row);
    if (!change) return [];
    return [{ run: runInfoFromSqlRow(row), class_name: row.class_name, change }];
  });
}

/**
 * @param ownerId when set, inserted changes of other users are ignored, the same way the query filters them.
 */
function applyRecChngToLateEntries(rows: LateEntryRow[], recchng: RecChng, ownerId: string | undefined): LateEntryRow[] {
  const { table, id, op } = recchng;
  const record = normalizedRecChngRecord(recchng);

  // A deleted run keeps its changes, e.g. an accepted DeleteEntry, only the run data is gone.
  const runsChanged = applyRunRecChng(rows, recchng, record, row => ({ ...row, run: undefined }));
  if (runsChanged) return runsChanged;
  if (table !== "qxchanges") return rows;

  switch (op) {
    case SqlOperation.Delete:
      return rows.filter(r => r.change.id !== id);

    case SqlOperation.Insert: {
      const change = changeFromRecChng(id, record);
      if (!change) return rows;
      if (ownerId !== undefined && change.user_id !== ownerId) return rows;

      // Take the original run data from another change of the same run, a new entry
      // has no run, only the class name from another new entry in the same class.
      const runId = changeRunId(change.lateEntry);
      const classId = change.lateEntry.kind.NewEntry?.classId;
      const base = runId !== undefined
        ? rows.find(r => r.run?.run_id === runId)
        : rows.find(r => classId !== undefined && r.change.lateEntry.kind.NewEntry?.classId === classId);
      const inserted: LateEntryRow = {
        run: runId !== undefined ? base?.run : undefined,
        class_name: base?.class_name,
        change,
      };
      // The query orders by qxchanges.id DESC.
      return [inserted, ...rows];
    }

    case SqlOperation.Update:
      return rows.map(r => r.change.id === id ? { ...r, change: patchChange(r.change, record) } : r);

    default:
      return rows;
  }
}

function createLateEntriesQuery(workingStage: number, userId: string, currentUserIsOrganizer: boolean): string {
  const ownerFilter = currentUserIsOrganizer ? "" : `AND qxchanges.user_id = '${userId.replaceAll("'", "''")}'`;
  return `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                  competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                  qxchanges.id as qxchange_id, qxchanges.created as qxchange_created,
                  qxchanges.status as qxchange_status, qxchanges.status_message as qxchange_status_message,
                  qxchanges.paid as qxchange_paid,
                  qxchanges.data as qxchange_data, qxchanges.user_id as qxchange_user_id,
                  COALESCE(classes.name, qxclasses.name) AS class_name
                FROM qxchanges
                LEFT JOIN runs ON runs.id = qxchanges.foreign_id AND qxchanges.foreign_table = 'runs' AND qxchanges.data_type = 'LateEntry'
                LEFT JOIN competitors ON runs.competitorid = competitors.id
                LEFT JOIN classes ON competitors.classid = classes.id
                LEFT JOIN classes AS qxclasses ON qxclasses.id = qxchanges.foreign_id AND qxchanges.foreign_table = 'classes' AND qxchanges.data_type = 'LateEntry'
                WHERE qxchanges.stage_id = ${workingStage}
                  ${ownerFilter}
                ORDER BY qxchanges.id DESC`;
}

function LateEntriesTable(props: {
  stageStart: () => Date | undefined;
  rows: () => LateEntryRow[];
  loading: () => boolean;
  canShowOwner: () => boolean;
  onEditRow: (row: LateEntryRow) => void;
}) {
  const columns = createMemo<TableColumn<LateEntryRow>[]>(() => [
    {
      key: "id",
      header: "ID",
      cell: (row: LateEntryRow) => row.change.id.toString(),
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => a.change.id - b.change.id,
      width: "64px",
      hidden: "hidden lg:table-cell",
    },
    {
      key: "operation",
      header: "Op",
      cell: (row: LateEntryRow) => {
        const kind = row.change.lateEntry.kind;
        const [label, icon] = kind.DeleteEntry ? ["Delete", "✕"] : kind.Update ? ["Change", "✎"] : ["New", "+"];
        return (
          <span class="inline-flex w-full justify-center">
            <span
              title={label}
              aria-label={label}
              class="inline-flex size-6 items-center justify-center rounded-md bg-highlight text-background text-lg font-bold"
            >
              {icon}
            </span>
          </span>
        );
      },
      width: "20px",
    },
    {
      key: "status",
      header: "St",
      cell: (row: LateEntryRow) => (
        <span class="inline-flex w-full justify-center">
          <StatusIcon status={row.change.status} />
        </span>
      ),
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => a.change.status.localeCompare(b.change.status),
      width: "56px",
    },
    {
      key: "class_name",
      header: "Class",
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => compareOptional(a.class_name, b.class_name),
    },
    ...changedValueColumns<LateEntryRow>(props.stageStart),
    {
      key: "paid",
      header: "Paid",
      cell: (row: LateEntryRow) => (
        <span class="inline-flex w-full justify-center">
          <PaidIcon paid={row.change.paid} />
        </span>
      ),
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => Number(a.change.paid) - Number(b.change.paid),
      width: "56px",
    },
    ...(props.canShowOwner() ? [{
      key: "owner",
      header: "Owner",
      cell: (row: LateEntryRow) => row.change.user_id ?? "",
      sortable: true,
      sortFn: (a: LateEntryRow, b: LateEntryRow) => compareOptional(a.change.user_id, b.change.user_id),
    } satisfies TableColumn<LateEntryRow>] : []),
  ]);

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
        onRowClick={props.onEditRow}
      />
    </div>
  );
}

const LateEntries = (props: {
  eventId: number;
  eventConfig: () => EventConfig;
  currentStage: number | undefined;
  workingStage: number | undefined;
  recchngReceived: () => RecChng | null;
}) => {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();

  const [rows, setRows] = createSignal<LateEntryRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [statusFilter, setStatusFilter] = createSignal<LateEntryStatusFilter | undefined>("Pending");

  const currentStage = () => props.currentStage;
  const workingStage = () => props.workingStage;
  const currentUserIsOrganizer = () => isEventOrganizer(props.eventConfig(), user()?.email);
  const canEditRunRecords = () => (workingStage() ?? 0) >= (currentStage() ?? 1);

  const canEdit = (row: LateEntryRowBase | undefined) =>
    canEditRunRecords() && canEditLateEntry(row, user()?.email, currentUserIsOrganizer());

  const lateEntryDialog = createLateEntryDialogController({
    eventId: () => props.eventId,
    eventConfig: props.eventConfig,
    workingStage,
    canEdit,
  });

  const reloadTable = async () => {
    if (status() !== "Connected" || workingStage() === undefined) return;
    setLoading(true);
    try {
      const query = createLateEntriesQuery(workingStage() ?? 0, user()?.email ?? "", currentUserIsOrganizer());
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRows(parseLateEntryRows(result));
    } catch (error) {
      showToast({ title: "Reload late entries error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const tableRows = () => {
    const filter = statusFilter();
    return filter ? rows().filter(row => row.change.status === filter) : rows();
  };

  const selectStatusFilter = (filter: string) => {
    setStatusFilter(filter === "All" ? undefined : filter as LateEntryStatusFilter);
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (!recchng) return;
    // Untracked, re-running on user / config change would apply the same recchng twice.
    const ownerId = untrack(() => currentUserIsOrganizer() ? undefined : user()?.email ?? "");
    setRows(prev => applyRecChngToLateEntries(prev, recchng, ownerId));
  });

  createEffect(() => {
    if (status() !== "Connected") return;
    if (workingStage() === undefined) return;
    reloadTable();
  });

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Late Entries</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class="flex items-center justify-end">
          <div class="flex gap-2 justify-end">
            <FlexDropdown
              value={statusFilter() ?? "All"}
              options={["All", ...STATUS_FILTERS]}
              onSelect={selectStatusFilter}
              disabled={status() !== "Connected"}
              variant="outline"
              size="sm"
            />
            <Button variant="outline" onClick={reloadTable} disabled={loading() || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>

        <LateEntriesTable
          stageStart={lateEntryDialog.stageStart}
          rows={tableRows}
          loading={loading}
          canShowOwner={currentUserIsOrganizer}
          onEditRow={lateEntryDialog.openEditDialog}
        />

        <LateEntryControllerDialog controller={lateEntryDialog} />
      </div>
    </div>
  );
};

export default LateEntries;
