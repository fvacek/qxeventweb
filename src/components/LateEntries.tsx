import { createEffect, createMemo, createSignal } from "solid-js";

import { Button } from "~/components/ui/button";
import { FlexDropdown } from "~/components/ui/flexdropdown";
import { Table, type TableColumn } from "~/components/ui/table";
import { showToast } from "~/components/ui/toast";
import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { useAppConfig } from "~/context/AppConfig";
import { callRpcMethod } from "~/lib/rpc";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { EventConfig } from "~/routes/OpenedEvent";
import LateEntryDialog from "~/components/LateEntryDialog";
import {
  ChangedValue,
  LateEntrySchema,
  createLateEntryDialogController,
  formatStartTime,
  fullName,
  parseRunsQueryResult,
  type Run,
} from "~/components/Runs";
import { parse } from "valibot";

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

const str = (value: unknown, fallback?: string): string | undefined =>
  typeof value === "string" ? value : fallback;

function parseLateEntryFromRecChng(record: RecChng["record"]) {
  if (!record || typeof record.data !== "string") return undefined;

  try {
    return parse(LateEntrySchema, JSON.parse(record.data).LateEntry);
  } catch (error) {
    console.warn("Invalid qxchange LateEntry data:", error, record.data);
    return undefined;
  }
}

function applyRecChngToLateEntries(runs: Run[], recchng: RecChng): Run[] {
  const { table, id, record, op } = recchng;

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
      return runs.filter(r => r.qxchange_id !== id);

    case SqlOperation.Insert: {
      const lateEntry = parseLateEntryFromRecChng(record);
      const userId = str(record?.user_id);

      if (!lateEntry || !userId) {
        console.warn("processRecChng: [Insert] Skipping — lateEntry or user_id missing", { lateEntry, user_id: userId });
        return runs;
      }
      const runId = lateEntry.id.RunId;
      const updatedRun = {
        ...runs.find(r => r.run_id === runId),
        qxchange_id: id,
        qxchange_user_id: userId,
        qxchange_status: str(record?.status),
        qxchange_status_message: str(record?.status_message),
        qxchange_data: { LateEntry: lateEntry },
      };
      return [...runs, updatedRun];
    }

    case SqlOperation.Update: {
      const lateEntry = parseLateEntryFromRecChng(record);
      return runs.map(r =>
        r.qxchange_id === id
          ? {
            ...r,
            qxchange_status: str(record?.status, r.qxchange_status),
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

function createLateEntriesQuery(workingStage: number, userId: string, currentUserIsOrganizer: boolean): string {
  const ownerFilter = currentUserIsOrganizer ? "" : `AND qxchanges.user_id = '${userId.replaceAll("'", "''")}'`;
  return `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                  competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                  qxchanges.id as qxchange_id, qxchanges.created as qxchange_created,
                  qxchanges.status as qxchange_status, qxchanges.status_message as qxchange_status_message,
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
  runs: () => Run[];
  loading: () => boolean;
  canShowOwner: () => boolean;
  onEditRun: (run: Run) => void;
}) {
  const columns = createMemo<TableColumn<Run>[]>(() => [
    {
      key: "qxchange_id",
      header: "ID",
      sortable: true,
      width: "64px",
      hidden: "hidden lg:table-cell",
    },
    {
      key: "operation",
      header: "Op",
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
      width: "20px",
    },
    {
      key: "qxchange_status",
      header: "St",
      cell: (run: Run) => (
        <span class="inline-flex w-full justify-center">
          <StatusIcon status={run.qxchange_status} />
        </span>
      ),
      sortable: true,
      width: "56px",
    },
    {
      key: "class_name",
      header: "Class",
      sortable: true,
    },
    {
      key: "starttimems",
      header: "Start Time",
      cell: (run: Run) => (
        <ChangedValue
          original={formatStartTime(run.starttimems, props.stageStart())}
          changed={run.qxchange_data?.LateEntry?.starttimems !== undefined
            ? formatStartTime(run.qxchange_data.LateEntry.starttimems, props.stageStart())
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
    ...(props.canShowOwner() ? [{
      key: "qxchange_user_id",
      header: "Owner",
      sortable: true,
    } satisfies TableColumn<Run>] : []),
  ]);

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
        onRowClick={props.onEditRun}
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

  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [statusFilter, setStatusFilter] = createSignal<LateEntryStatusFilter | undefined>("Pending");

  const currentStage = () => props.currentStage;
  const workingStage = () => props.workingStage;
  const currentUserIsOrganizer = () => props.eventConfig().members?.[user()?.email ?? ""] === "Organizer";
  const canEditRunRecords = () => (workingStage() ?? 0) >= (currentStage() ?? 1);

  const canEditRun = (run: Run | undefined) => {
    const email = user()?.email;
    if (!email || !run || !canEditRunRecords()) return false;
    if (run.qxchange_status !== undefined && run.qxchange_status !== "Pending") return false;
    return currentUserIsOrganizer() || run.qxchange_user_id === email || run.qxchange_id === undefined;
  };

  const lateEntryDialog = createLateEntryDialogController({
    eventId: () => props.eventId,
    eventConfig: props.eventConfig,
    workingStage,
    classDef: () => undefined,
    runs,
    canEditRun,
  });

  const reloadTable = async () => {
    if (status() !== "Connected" || workingStage() === undefined) return;
    setLoading(true);
    try {
      const query = createLateEntriesQuery(workingStage() ?? 0, user()?.email ?? "", currentUserIsOrganizer());
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [query]);
      setRuns(parseRunsQueryResult(result));
    } catch (error) {
      showToast({ title: "Reload late entries error", description: (error as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const tableRuns = () => {
    const filter = statusFilter();
    return filter ? runs().filter(run => run.qxchange_status === filter) : runs();
  };

  const selectStatusFilter = (filter: string) => {
    setStatusFilter(filter === "All" ? undefined : filter as LateEntryStatusFilter);
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) setRuns(prev => applyRecChngToLateEntries(prev, recchng));
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
          runs={tableRuns}
          loading={loading}
          canShowOwner={currentUserIsOrganizer}
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

export default LateEntries;
