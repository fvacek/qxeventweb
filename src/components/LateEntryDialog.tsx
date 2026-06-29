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

export type LateEntryField = "firstname" | "lastname" | "registration" | "siid";
export type LateEntryFieldValue = string | number | undefined;

function LateEntryDialog(props: {
  open: boolean;
  fieldValue: (field: LateEntryField) => LateEntryFieldValue;
  isFieldChanged: (field: LateEntryField) => boolean;
  setFieldValue: (field: LateEntryField, value: LateEntryFieldValue) => void;
  onClose: () => void;
  onAccept: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!open) props.onClose(); }}>
      <DialogContent class="max-w-md">
        <DialogHeader>
          <DialogTitle>{"Late Entry"}</DialogTitle>
        </DialogHeader>

        <div class="space-y-4">
          <TextField>
            <TextFieldLabel>First Name</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("firstname")?.toString() || ""}
              type="text"
              class={props.isFieldChanged("firstname") ? "text-primary font-semibold" : ""}
              onInput={(e) => props.setFieldValue("firstname", e.currentTarget.value || undefined)}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Last Name</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("lastname")?.toString() || ""}
              type="text"
              class={props.isFieldChanged("lastname") ? "text-primary font-semibold" : ""}
              onInput={(e) => props.setFieldValue("lastname", e.currentTarget.value || undefined)}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>Registration</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("registration")?.toString() || ""}
              type="text"
              class={props.isFieldChanged("registration") ? "text-primary font-semibold" : ""}
              onInput={(e) => props.setFieldValue("registration", e.currentTarget.value || undefined)}
            />
          </TextField>

          <TextField>
            <TextFieldLabel>SI ID</TextFieldLabel>
            <TextFieldInput
              value={props.fieldValue("siid")?.toString() || ""}
              type="number"
              class={props.isFieldChanged("siid") ? "text-primary font-semibold" : ""}
              onInput={(e) => props.setFieldValue("siid", e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined)}
            />
          </TextField>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button onClick={props.onAccept}>{"Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default LateEntryDialog;
