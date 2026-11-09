import { createSignal } from "solid-js";

import LateEntryDialog, { type LateEntryDialogField, type LateEntryDialogValue } from "~/components/LateEntryDialog";
import type { ClassDef } from "~/components/ClassSelector";
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { useAuth } from "~/context/AuthContext";
import { useWsClient } from "~/context/WsClient";
import {
  canEditLateEntry,
  effectiveStartTime,
  lateEntryKind,
  lateEntryRpcParams,
  sqlQuotedString,
  type LateEntry,
  type LateEntryRowBase,
  type RunInfo,
} from "~/lib/lateEntry";
import { callRpcMethod } from "~/lib/rpc";
import { createSqlTable } from "~/lib/SqlTable";
import { EventConfig, isEventOrganizer } from "~/routes/OpenedEvent";

/** Row being edited in the late entry dialog, `edit` holds the changed fields. */
type LateEntryDraft = LateEntryRowBase & { edit?: LateEntry };

/**
 * State of the late entry dialog shared by the runs and late entries tables,
 * including who may edit which row.
 */
export function createLateEntryDialogController(args: {
  eventId: () => number;
  eventConfig: () => EventConfig;
  currentStage: () => number | undefined;
  workingStage: () => number | undefined;
  className?: () => string;
  /** Class and its rows, needed to offer free start times and to create new entries. */
  classDef?: () => ClassDef | undefined;
  classRows?: () => LateEntryRowBase[];
  onNewLateEntrySaved?: () => void;
  updateErrorTitle?: string;
}) {
  const { wsClient } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();
  const [draft, setDraft] = createSignal<LateEntryDraft | undefined>(undefined);

  const isOrganizer = () => isEventOrganizer(args.eventConfig(), user()?.email);

  /** Runs of a stage already started cannot be changed. */
  const canEditRunRecords = () => (args.workingStage() ?? 0) >= (args.currentStage() ?? 1);

  const canEdit = (row: LateEntryRowBase | undefined) =>
    canEditRunRecords() && canEditLateEntry(row, user()?.email, isOrganizer());

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

  /** Original run value of a dialog field, a note exists only in the late entry. */
  const runValue = (run: RunInfo | undefined, field: LateEntryDialogField): LateEntryDialogValue =>
    field === "note" ? undefined : run?.[field];

  const isFieldFromLateEntry = (field: LateEntryDialogField) => draft()?.edit?.[field] !== undefined;

  const formField = (field: LateEntryDialogField): LateEntryDialogValue => {
    const form = draft();
    return form?.edit?.[field] ?? runValue(form?.run, field);
  };

  const editOf = (form: LateEntryDraft): LateEntry =>
    form.edit ?? { kind: lateEntryKind(form.run?.run_id, args.classDef?.()?.id) };

  const setFormField = (field: LateEntryDialogField, value: LateEntryDialogValue) => {
    setDraft(prev => prev && {
      ...prev,
      edit: { ...editOf(prev), [field]: value === runValue(prev.run, field) ? undefined : value },
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
    isOrganizer,
    canEditRunRecords,
    canEdit,
    canEditForm: () => canEdit(draft()),
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
