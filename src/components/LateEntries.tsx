import { createEffect, createMemo, createSignal, untrack } from "solid-js";

import { Button } from "~/components/ui/button";
import { FlexDropdown } from "~/components/ui/flexdropdown";
import { Table, type TableColumn } from "~/components/ui/table";
import { showToast } from "~/components/ui/toast";
import { changedValueColumns, compareOptional } from "~/components/lateEntryColumns";
import LateEntryDialog, { createLateEntryDialogController } from "~/components/LateEntryDialog";
import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { useAppConfig } from "~/context/AppConfig";
import { RUNNER_ROW_COLUMNS as RUNNER_ENTRY_ROW_COLUMNS, sqlQuotedString, type RunnerEntryRow } from "~/lib/runnerEntry";
import { applyRecChngToLateEntries, parseRunnerEntryRows } from "~/lib/lateEntryRows";
import { callRpcMethod } from "~/lib/rpc";
import type { RecChng } from "~/schema/rpc-sql-schema";
import type { EventConfig } from "~/routes/OpenedEvent";

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

function createLateEntriesQuery(workingStage: number, userId: string, currentUserIsOrganizer: boolean): string {
  const ownerFilter = currentUserIsOrganizer ? "" : `AND qxchanges.user_id = ${sqlQuotedString(userId)}`;
  return `SELECT ${RUNNER_ENTRY_ROW_COLUMNS},
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
  rows: () => RunnerEntryRow[];
  loading: () => boolean;
  canShowOwner: () => boolean;
  onEditRow: (row: RunnerEntryRow) => void;
}) {
  const columns = createMemo<TableColumn<RunnerEntryRow>[]>(() => [
    {
      key: "id",
      header: "ID",
      cell: (row: RunnerEntryRow) => row.change?.id.toString() ?? "",
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => compareOptional(a.change?.id, b.change?.id),
      width: "64px",
      hidden: "hidden lg:table-cell",
    },
    {
      key: "operation",
      header: "Op",
      cell: (row: RunnerEntryRow) => {
        const kind = row.change?.lateEntry.kind;
        const [label, icon] = kind?.DeleteEntry ? ["Delete", "✕"] : kind?.Update ? ["Change", "✎"] : ["New", "+"];
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
      cell: (row: RunnerEntryRow) => (
        <span class="inline-flex w-full justify-center">
          <StatusIcon status={row.change?.status} />
        </span>
      ),
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => compareOptional(a.change?.status, b.change?.status),
      width: "56px",
    },
    {
      key: "class_name",
      header: "Class",
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => compareOptional(a.class_name, b.class_name),
    },
    ...changedValueColumns(props.stageStart),
    {
      key: "paid",
      header: "Paid",
      cell: (row: RunnerEntryRow) => (
        <span class="inline-flex w-full justify-center">
          <PaidIcon paid={row.change?.paid} />
        </span>
      ),
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => Number(a.change?.paid) - Number(b.change?.paid),
      width: "56px",
    },
    ...(props.canShowOwner() ? [{
      key: "owner",
      header: "Owner",
      cell: (row: RunnerEntryRow) => row.change?.user_id ?? "",
      sortable: true,
      sortFn: (a: RunnerEntryRow, b: RunnerEntryRow) => compareOptional(a.change?.user_id, b.change?.user_id),
    } satisfies TableColumn<RunnerEntryRow>] : []),
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

  const [rows, setRows] = createSignal<RunnerEntryRow[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [statusFilter, setStatusFilter] = createSignal<LateEntryStatusFilter | undefined>("Pending");

  const workingStage = () => props.workingStage;

  const lateEntryDialog = createLateEntryDialogController({
    eventId: () => props.eventId,
    eventConfig: props.eventConfig,
    currentStage: () => props.currentStage,
    workingStage,
  });
  const currentUserIsOrganizer = lateEntryDialog.isOrganizer;

  const reloadTable = async () => {
    if (status() !== "Connected" || workingStage() === undefined) return;
    setLoading(true);
    try {
      const query = createLateEntriesQuery(workingStage() ?? 0, user()?.email ?? "", currentUserIsOrganizer());
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRows(parseRunnerEntryRows(result));
    } catch (error) {
      showToast({ title: "Reload late entries error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const tableRows = () => {
    const filter = statusFilter();
    return filter ? rows().filter(row => row.change?.status === filter) : rows();
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

        <LateEntryDialog controller={lateEntryDialog} />
      </div>
    </div>
  );
};

export default LateEntries;
