import { createEffect, createSignal } from "solid-js";

import { Button } from "~/components/ui/button";
import { FlexDropdown } from "~/components/ui/flexdropdown";
import { showToast } from "~/components/ui/toast";
import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { useAppConfig } from "~/context/AppConfig";
import { callRpcMethod } from "~/lib/rpc";
import { RecChng } from "~/schema/rpc-sql-schema";
import { EventConfig } from "~/routes/OpenedEvent";
import LateEntryDialog from "~/components/LateEntryDialog";
import {
  STATUS_FILTERS,
  RunsTable,
  applyRecChngToRuns,
  createLateEntriesQuery,
  createLateEntryDialogController,
  parseRunsQueryResult,
  type LateEntryStatusFilter,
  type Run,
} from "~/components/Runs";

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

        <RunsTable
          stageStart={lateEntryDialog.stageStart}
          runs={tableRuns}
          loading={loading}
          mode="lateEntries"
          canEdit={canEditRun}
          currentUserIsOrganizer={currentUserIsOrganizer}
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
