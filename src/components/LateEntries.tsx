import { createEffect, createMemo, createSignal } from "solid-js";

import { Button } from "~/components/ui/button";
import { FlexDropdown } from "~/components/ui/flexdropdown";
import { Table, type TableColumn } from "~/components/ui/table";
import { showToast } from "~/components/ui/toast";
import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { useAppConfig } from "~/context/AppConfig";
import { callRpcMethod } from "~/lib/rpc";
import { RecChng } from "~/schema/rpc-sql-schema";
import { EventConfig } from "~/routes/OpenedEvent";
import LateEntryDialog from "~/components/LateEntryDialog";
import {
  ChangedValue,
  STATUS_FILTERS,
  StatusIcon,
  applyRecChngToRuns,
  createLateEntriesQuery,
  createLateEntryDialogController,
  formatStartTime,
  fullName,
  parseRunsQueryResult,
  type LateEntryStatusFilter,
  type Run,
} from "~/components/Runs";

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
    if (recchng) setRuns(prev => applyRecChngToRuns(prev, recchng, "lateEntries"));
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
