import { createEffect, createSignal } from "solid-js";

import { Button } from "~/components/ui/button";
import { FlexDropdown } from "~/components/ui/flexdropdown";
import { showToast } from "~/components/ui/toast";
import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { useAppConfig } from "~/context/AppConfig";
import { createSqlTable } from "~/lib/SqlTable";
import { callRpcMethod } from "~/lib/rpc";
import { RecChng } from "~/schema/rpc-sql-schema";
import { EventConfig } from "~/routes/OpenedEvent";
import LateEntryDialog, { type LateEntryDialogField, type LateEntryDialogValue } from "~/components/LateEntryDialog";
import {
  STATUS_FILTERS,
  RunsTable,
  applyRecChngToRuns,
  createLateEntriesQuery,
  lateEntryRpcParams,
  parseRunsQueryResult,
  sqlQuotedString,
  type ClassDef,
  type LateEntry,
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
  const [formLateEntry, setFormLateEntry] = createSignal<Run | undefined>(undefined);
  const [classDef] = createSignal<ClassDef | undefined>(undefined);
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

  const canEditFormRun = () => canEditRun(formLateEntry());
  const closeDialog = () => setFormLateEntry(undefined);

  const formClassName = (): string => formLateEntry()?.class_name ?? "";
  const stageStart = () => {
    const stage = workingStage();
    return stage === undefined ? undefined : props.eventConfig().stages[stage - 1]?.stageStart;
  };

  const possibleStartTimes = () => {
    const cd = classDef();
    if (!cd || !cd.interval) return [];

    const startTimes = new Set(
      runs()
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
            ...(prev.qxchange_data?.LateEntry ?? { id: prev.run_id ? { RunId: prev.run_id } : { ClassId: classDef()?.id } }),
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
        appConfig.eventSqlApiPath(props.eventId),
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
              ...(prev.qxchange_data?.LateEntry ?? { id: prev.run_id ? { RunId: prev.run_id } : { ClassId: classDef()?.id } }),
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
      await callRpcMethod(wsClient()!, appConfig.eventApiPath(props.eventId), "updateLateEntry", params);
      showToast({ title: "Update late entry success" });
      return true;
    } catch (error) {
      showToast({ title: "Update late entry error", description: (error as Error).message, variant: "destructive" });
      return false;
    }
  };

  const acceptDialog = async () => {
    const formRun = formLateEntry();
    const lateEntry = formRun?.qxchange_data?.LateEntry;

    if (lateEntry) {
      await saveLateEntry(formRun.qxchange_id, lateEntry);
    }
    closeDialog();
  };

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
          stageStart={stageStart}
          runs={tableRuns}
          loading={loading}
          mode="lateEntries"
          canEdit={canEditRun}
          currentUserIsOrganizer={currentUserIsOrganizer}
          onEditRun={setFormLateEntry}
        />

        <LateEntryDialog
          open={!!formLateEntry()}
          className={formClassName}
          stageStart={stageStart}
          possibleStartTimes={possibleStartTimes}
          qxchangeId={() => formLateEntry()?.qxchange_id}
          qxchangeCreated={() => formLateEntry()?.qxchange_created}
          status={() => formLateEntry()?.qxchange_status}
          statusMessage={() => formLateEntry()?.qxchange_status_message}
          fieldValue={formField}
          isFieldChanged={isFieldFromLateEntry}
          setFieldValue={setFormField}
          canEdit={canEditFormRun}
          canEditPaid={currentUserIsOrganizer}
          onLoadRegistration={loadRegistration}
          onClose={closeDialog}
          onAccept={acceptDialog}
        />
      </div>
    </div>
  );
};

export default LateEntries;
