import { createSignal } from "solid-js";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  TextField,
  TextFieldInput,
  TextFieldLabel,
} from "~/components/ui/text-field";
import { SwitchField } from "~/components/ui/switch";
import { showToast } from "~/components/ui/toast";
import type { ClassDef } from "~/components/ClassSelector";
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
  type RunnerEntryRow,
  type RunInfo,
} from "~/lib/runnerEntry";
import { callRpcMethod } from "~/lib/rpc";
import { createSqlTable } from "~/lib/SqlTable";
import { EventConfig, isEventOrganizer } from "~/lib/eventConfig";

export type LateEntryDialogField = "firstname" | "lastname" | "registration" | "siid" | "note" | "starttimems";
export type LateEntryDialogValue = string | number | undefined;
export type LateEntryDialogDateValue = Date | string | number | undefined;

function formatDateTime(value: LateEntryDialogDateValue): string {
  if (value === undefined) return "—";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? value.toString() : date.toLocaleString();
}

function formatStartTimeInput(msec: number | undefined, stageStart: Date | undefined): string {
  if (msec === undefined || !stageStart) return "";
  const date = new Date(stageStart.getTime() + msec);
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");
  const ss = date.getSeconds().toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** Row being edited in the late entry dialog, `edit` holds the changed fields. */
type LateEntryDraft = RunnerEntryRow & { edit?: LateEntry };

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
  classRows?: () => RunnerEntryRow[];
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

  const canEdit = (row: RunnerEntryRow | undefined) =>
    canEditRunRecords() && canEditLateEntry(row, user()?.email, isOrganizer());

  const openEditDialog = (row: RunnerEntryRow) => setDraft({ ...row, edit: row.change?.lateEntry });

  const openNewEntryDialog = () => setDraft({ class_name: args.className?.() ?? "" });

  const closeDialog = () => setDraft(undefined);

  const formClassName = (): string => args.className?.() || draft()?.class_name || "";

  const stageStart = () => {
    const stage = args.workingStage();
    return stage === undefined ? undefined : args.eventConfig().stages[stage - 1]?.stageStart;
  };

  const possibleStartTimes = () => {
    const form = draft();
    const startSlots: number[] = [];
    // Free start slots of the class, only known when the class and its rows are given.
    const cd = args.classDef?.();
    if (cd?.interval && args.classRows) {
      const isFormRun = (row: RunnerEntryRow) => form?.run !== undefined && row.run?.run_id === form.run.run_id;
      const startTimes = new Set(
        args.classRows()
          .filter(row => !isFormRun(row))
          .map(effectiveStartTime)
          .filter((starttimems): starttimems is number => starttimems !== undefined),
      );
      for (let i = 0; i < cd.mapCount; i++) {
        const startTime = (cd.start + i * cd.interval) * 60 * 1000;
        if (!startTimes.has(startTime)) startSlots.push(startTime);
      }
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

/** Late entry dialog, its state lives in the controller. */
function LateEntryDialog(props: { controller: LateEntryDialogController }) {
  const c = props.controller;

  return (
    <Dialog open={c.isOpen()} onOpenChange={(open) => { if (!open) c.closeDialog(); }}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{"Late Entry "}</DialogTitle>
        </DialogHeader>

        <div class="space-y-4">
          <div class="rounded-md bg-muted px-3 py-2 text-lg font-semibold">
            {c.formClassName()}
          </div>

          <div class="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>change id: <span class="font-medium text-foreground">{c.change()?.id ?? "—"}</span></span>
            <span class="text-right">created: <span class="font-medium text-foreground">{formatDateTime(c.change()?.created)}</span></span>
          </div>

          {(!c.canEditForm() || c.status() || c.change()?.status_message) && (
            <div class="rounded-md border border-border bg-accent/40 px-3 py-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium text-muted-foreground">Status</span>
                <span class="font-semibold">{c.status() || "—"}</span>
              </div>
              {c.change()?.status_message && (
                <p class="mt-1 text-muted-foreground">{c.change()?.status_message}</p>
              )}
            </div>
          )}

          <TextField>
            <TextFieldLabel>Registration</TextFieldLabel>
            <div class="flex gap-2">
              <TextFieldInput
                value={c.formField("registration")?.toString() || ""}
                type="text"
                class={c.isFieldFromLateEntry("registration") ? "text-highlight font-semibold" : ""}
                onInput={(e) => c.setFormField("registration", e.currentTarget.value)}
                disabled={!c.canEditForm()}
              />
              <Button
                variant="secondary"
                onClick={c.loadRegistration}
                disabled={!c.canEditForm() || !c.formField("registration")}
              >
                Load
              </Button>
            </div>
          </TextField>

          <TextField>
            <TextFieldLabel>First Name</TextFieldLabel>
            <TextFieldInput
              value={c.formField("firstname")?.toString() || ""}
              type="text"
              class={c.isFieldFromLateEntry("firstname") ? "text-highlight font-semibold" : ""}
              onInput={(e) => c.setFormField("firstname", e.currentTarget.value)}
              disabled={!c.canEditForm()}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Last Name</TextFieldLabel>
            <TextFieldInput
              value={c.formField("lastname")?.toString() || ""}
              type="text"
              class={c.isFieldFromLateEntry("lastname") ? "text-highlight font-semibold" : ""}
              onInput={(e) => c.setFormField("lastname", e.currentTarget.value)}
              disabled={!c.canEditForm()}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>SI ID</TextFieldLabel>
            <TextFieldInput
              value={c.formField("siid")?.toString() || ""}
              type="number"
              class={c.isFieldFromLateEntry("siid") ? "text-highlight font-semibold" : ""}
              onInput={(e) => c.setFormField("siid", e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined)}
              disabled={!c.canEditForm()}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Start Time</TextFieldLabel>
            <select
              value={c.formField("starttimems")?.toString() || ""}
              class={`w-full rounded-md border border-border bg-input px-3 py-2 text-sm ${c.isFieldFromLateEntry("starttimems") ? "text-highlight font-semibold" : ""}`}
              onChange={(e) => c.setFormField("starttimems", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
              disabled={!c.canEditForm()}
            >
              <option value="" selected={c.formField("starttimems") === undefined}>—</option>
              {c.possibleStartTimes().map((starttimems) => (
                <option value={starttimems.toString()} selected={c.formField("starttimems") === starttimems}>
                  {formatStartTimeInput(starttimems, c.stageStart())}
                </option>
              ))}
            </select>
          </TextField>

          <TextField>
            <TextFieldLabel>Note</TextFieldLabel>
            <TextFieldInput
              value={c.formField("note")?.toString() || ""}
              type="text"
              class={c.isFieldFromLateEntry("note") ? "text-highlight font-semibold" : ""}
              onInput={(e) => c.setFormField("note", e.currentTarget.value)}
              disabled={!c.canEditForm()}
            />
          </TextField>
        </div>

        <DialogFooter class="items-center justify-between sm:justify-between sm:space-x-0">
          <SwitchField
            label="Paid"
            checked={c.change()?.paid === true}
            onChange={() => {}}
            disabled={true}
          />
          <div class="flex gap-2">
            <Button variant="outline" onClick={c.closeDialog}>{c.canEditForm() ? "Cancel" : "Close"}</Button>
            <Button onClick={c.acceptDialog} disabled={!c.canEditForm()}>{"Save Changes"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LateEntryDialog;
