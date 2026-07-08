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

export type LateEntryDialogField = "firstname" | "lastname" | "registration" | "siid" | "note" | "starttimems" | "paid";
export type LateEntryDialogValue = string | number | boolean | undefined;
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

function LateEntryDialog(props: {
  open: boolean;
  className: () => string;
  stageStart: () => Date | undefined;
  possibleStartTimes: () => number[];
  qxchangeId: () => number | undefined;
  qxchangeCreated: () => LateEntryDialogDateValue;
  status: () => string | undefined;
  statusMessage: () => string | undefined;
  fieldValue: (field: LateEntryDialogField) => LateEntryDialogValue;
  isFieldChanged: (field: LateEntryDialogField) => boolean;
  setFieldValue: (field: LateEntryDialogField, value: LateEntryDialogValue) => void;
  canEdit: () => boolean;
  canEditPaid: () => boolean;
  onLoadRegistration: () => void;
  onClose: () => void;
  onAccept: () => void;
}) {
  const isEditable = () => props.canEdit();

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{"Late Entry "}</DialogTitle>
        </DialogHeader>

        <div class="space-y-4">
          <div class="rounded-md bg-muted px-3 py-2 text-lg font-semibold">
            {props.className()}
          </div>

          <div class="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>change id: <span class="font-medium text-foreground">{props.qxchangeId() ?? "—"}</span></span>
            <span class="text-right">created: <span class="font-medium text-foreground">{formatDateTime(props.qxchangeCreated())}</span></span>
          </div>

          {(!isEditable() || props.status() || props.statusMessage()) && (
            <div class="rounded-md border border-border bg-accent/40 px-3 py-2 text-sm">
              <div class="flex items-center justify-between gap-3">
                <span class="font-medium text-muted-foreground">Status</span>
                <span class="font-semibold">{props.status() || "—"}</span>
              </div>
              {props.statusMessage() && (
                <p class="mt-1 text-muted-foreground">{props.statusMessage()}</p>
              )}
            </div>
          )}

          <TextField>
            <TextFieldLabel>Registration</TextFieldLabel>
            <div class="flex gap-2">
              <TextFieldInput
                value={props.fieldValue("registration")?.toString() || ""}
                type="text"
                class={props.isFieldChanged("registration") ? "text-highlight font-semibold" : ""}
                onInput={(e) => props.setFieldValue("registration", e.currentTarget.value)}
                disabled={!isEditable()}
              />
              <Button
                variant="outline"
                onClick={props.onLoadRegistration}
                disabled={!isEditable() || !props.fieldValue("registration")}
              >
                Load
              </Button>
            </div>
          </TextField>

          <TextField>
            <TextFieldLabel>First Name</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("firstname")?.toString() || ""}
              type="text"
              class={props.isFieldChanged("firstname") ? "text-highlight font-semibold" : ""}
              onInput={(e) => props.setFieldValue("firstname", e.currentTarget.value)}
              disabled={!isEditable()}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Last Name</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("lastname")?.toString() || ""}
              type="text"
              class={props.isFieldChanged("lastname") ? "text-highlight font-semibold" : ""}
              onInput={(e) => props.setFieldValue("lastname", e.currentTarget.value)}
              disabled={!isEditable()}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>SI ID</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("siid")?.toString() || ""}
              type="number"
              class={props.isFieldChanged("siid") ? "text-highlight font-semibold" : ""}
              onInput={(e) => props.setFieldValue("siid", e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined)}
              disabled={!isEditable()}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Start Time</TextFieldLabel>
            <select
              value={props.fieldValue("starttimems")?.toString() || ""}
              class={`w-full rounded-md border border-border bg-input px-3 py-2 text-sm ${props.isFieldChanged("starttimems") ? "text-highlight font-semibold" : ""}`}
              onChange={(e) => props.setFieldValue("starttimems", e.currentTarget.value ? Number(e.currentTarget.value) : undefined)}
              disabled={!isEditable()}
            >
              <option value="">—</option>
              {props.possibleStartTimes().map((starttimems) => (
                <option value={starttimems.toString()}>
                  {formatStartTimeInput(starttimems, props.stageStart())}
                </option>
              ))}
            </select>
          </TextField>

          <TextField>
            <TextFieldLabel>Note</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("note")?.toString() || ""}
              type="text"
              class={props.isFieldChanged("note") ? "text-highlight font-semibold" : ""}
              onInput={(e) => props.setFieldValue("note", e.currentTarget.value)}
              disabled={!isEditable()}
            />
          </TextField>
        </div>

        <DialogFooter class="items-center justify-between sm:justify-between sm:space-x-0">
          <SwitchField
            label="Paid"
            checked={props.fieldValue("paid") === true}
            onChange={(checked) => props.setFieldValue("paid", checked)}
            disabled={!isEditable() || !props.canEditPaid()}
            class={props.isFieldChanged("paid") ? "text-highlight font-semibold" : ""}
          />
          <div class="flex gap-2">
            <Button variant="outline" onClick={props.onClose}>{isEditable() ? "Cancel" : "Close"}</Button>
            <Button onClick={props.onAccept} disabled={!isEditable() || !(props.status() === "Pending" || props.status() === undefined)}>{"Save Changes"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LateEntryDialog;
