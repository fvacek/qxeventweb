import {
  makeMap,
  RpcValue,
} from "libshv-js";
import { createMemo, createSignal, createEffect, For, onMount, untrack } from "solid-js";
import QRCode from "qrcode";

import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
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
import { useWsClient } from "~/context/WsClient";
import { showToast, Toast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { useAuth } from "~/context/AuthContext";

import { useSubscribe } from "~/context/SubscribeContext";
import { createSqlTable } from "~/lib/SqlTable";
import {
  object,
  number,
  string,
  nullable,
  parse,
  type InferOutput,
  undefinedable,
  safeParse,
  array,
} from "valibot";
import {
  copyRecordChanges as copyValidFieldsToRpcMap,
  isRecordEmpty,
  toRpcValue,
} from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";

const EventListItemSchema = object({
  id: number(),
  name: undefinedable(string()),
  date: undefinedable(string()),
  owner: undefinedable(string()),
});
type EventListItem = InferOutput<typeof EventListItemSchema>;

const EventListSchema = array(EventListItemSchema);

const EventSchema = object({
  id: number(),
  name: undefinedable(string()),
  api_token: undefinedable(string()),
  date: undefinedable(string()),
  owner: undefinedable(string()),
});
type Event = InferOutput<typeof EventSchema>;

function EventsTable() {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();
  const { recchngReceived } = useSubscribe();

  const [tableRecords, setTableRecords] = createSignal<EventListItem[]>([]);

  const [loading, setLoading] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<keyof EventListItem>("name");
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc");

  createEffect(() => {
    const recchng = recchngReceived();
    if (recchng) {
      untrack(() => {
        // setTableRecords() causes infinite reactive recursion without this untrack
        // nobody knows why
        processRecChng(recchng);
      });
    }
  });

  const processRecChng = (recchng: RecChng) => {
    const { table, id, record, op } = recchng;
    if (table === "events") {
      if (op === SqlOperation.Update) {
        const originalEvent = tableRecords().find(rec => rec.id === id);
        if (!!originalEvent) {
          const updatedEvent = { ...originalEvent, ...record };
          setTableRecords(prev => prev.map(event => event.id === updatedEvent.id ? updatedEvent : event));
        }
      } else if (op === SqlOperation.Insert) {
      } else if (op === SqlOperation.Delete) {
      }
    }
  };

  // Reactive sorted data
  const sortedEntries = createMemo(() => {
    const data = [...tableRecords()];
    return data.sort((a, b) => {
      const aVal = a[sortBy()];
      const bVal = b[sortBy()];

      // Handle null values - put nulls at the beginnig
      if (
        (aVal === null || aVal === undefined) &&
        (bVal === null || bVal === undefined)
      )
        return 0;
      if (aVal === null || aVal === undefined)
        return sortOrder() === "asc" ? -1 : 1;
      if (bVal === null || bVal === undefined)
        return sortOrder() === "asc" ? 1 : -1;

      if (aVal < bVal) return sortOrder() === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder() === "asc" ? 1 : -1;
      return 0;
    });
  });

  const reloadTable = async () => {
    setLoading(true);

    try {
      const sql_select_result = await callRpcMethod(
        wsClient(),
        `${appConfig.qxeventdPath}/sql`,
        "list",
        makeMap({"table": "events", "fields": ["id", "name", "date", "owner"]}),

      );
      const table = parse(EventListSchema, sql_select_result);

      const transformedRecords: EventListItem[] = [];
      for (const record of table) {
        try {
          const validatedRecord = parse(EventListItemSchema, record);
          transformedRecords.push(validatedRecord);
        } catch (error) {
          console.warn(`Skipping invalid record ${record}:`, error);
        }
      }

      setTableRecords(transformedRecords);
    } catch (error) {
      console.error("RPC call failed:", error);
      showToast({
        title: "Reload table error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
    setLoading(false);

    // Update data with fresh timestamps and randomized data
    const refreshedEntries = tableRecords().map((entry) => ({
      ...entry,
    }));

    setTableRecords(refreshedEntries);
    setLoading(false);
  };

  const addEntry = () => {
    const newId = tableRecords().length > 0 ? Math.max(...tableRecords().map((u) => u.id)) + 1 : 1;
    const currentUser = user();

    // Set up form with default values for new entry
    setFormData({
      id: newId,
      name: "",
      date: new Date().toISOString().split('T')[0], // Today's date as default
      api_token: "",
      owner: currentUser?.email || "",
    });

    // Clear original record to indicate this is a new entry
    setOriginalRecord(null);

    // Open the edit dialog
    setEditRecordDialogOpen(true);
  };

  // Edit dialog state
  const [editRecordDialogOpen, setEditRecordDialogOpen] = createSignal(false);
  const [originalRecord, setOriginalRecord] = createSignal<Event | null>(null);

  const deleteRecord = (id: number) => {
    setTableRecords(tableRecords().filter((user) => user.id !== id));
  };

  // Form state signals
  const [formData, setFormData] = createSignal<Event>({
    id: 0,
    name: undefined,
    date: undefined,
    api_token: undefined,
    owner: undefined,
  });

  const [qrCodeDataURL, setQrCodeDataURL] = createSignal<string>("");

  const generateQRCode = async (apiToken: string) => {
    if (apiToken && apiToken.trim()) {
      try {
        const url = `https://qxqx.org/event?api_token=${apiToken.trim()}`;
        const dataURL = await QRCode.toDataURL(url, {
          width: 200,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
        setQrCodeDataURL(dataURL);
      } catch (error) {
        console.error('Error generating QR code:', error);
        setQrCodeDataURL("");
      }
    } else {
      setQrCodeDataURL("");
    }
  };

  // Reactive QR code generation
  createEffect(() => {
    if (editRecordDialogOpen()) {
      generateQRCode(formData().api_token || "");
    }
  });

  // Check if form has been modified
  const isFormDirty = createMemo(() => {
    const orig = originalRecord();
    if (!orig) {
      // For new entries, form is dirty if any field has content
      const current = formData();
      return !!(current.name || current.date || current.api_token || current.owner);
    }
    const current = formData();

    // Normalize undefined/empty values for comparison
    const normalize = (val: string | undefined) => val || "";

    const isDirty = (
      normalize(orig.name) !== normalize(current.name) ||
      normalize(orig.date) !== normalize(current.date) ||
      normalize(orig.api_token) !== normalize(current.api_token) ||
      normalize(orig.owner) !== normalize(current.owner)
    );

    console.log('Dirty check:', {
      originalRecord: orig,
      current,
      isDirty,
      nameChanged: normalize(orig.name) !== normalize(current.name),
      dateChanged: normalize(orig.date) !== normalize(current.date),
      tokenChanged: normalize(orig.api_token) !== normalize(current.api_token),
      ownerChanged: normalize(orig.owner) !== normalize(current.owner)
    });

    return isDirty;
  });

  // Form validation
  const isFormValid = createMemo(() => {
    const current = formData();
    const isValid = !!(current.name && current.name.trim().length > 0);
    console.log('Form validation:', { current, isValid });
    return isValid;
  });

  const openEditRecordDialog = async (id: number) => {
    setOriginalRecord(null);
    const eventItem = tableRecords().find((record) => record.id === id);
    if (eventItem) {
      setEditRecordDialogOpen(true);

      const result = await callRpcMethod(
        wsClient(),
        `${appConfig.qxeventdPath}/sql`,
        "read",
        makeMap({"table": "events", "id": id}),
      );
      const parsedRecord = parse(EventSchema, result);
      setOriginalRecord(parsedRecord);

      // Populate form data signal
      setFormData({
        id: parsedRecord.id,
        name: parsedRecord.name,
        date: parsedRecord.date,
        api_token: parsedRecord.api_token,
        owner: parsedRecord.owner,
      });
    }
  };

  const acceptEditRecordDialog = () => {
    if (!isFormValid()) return;

    const updatedRecord: Event = formData();
    const orig = originalRecord();

    setEditRecordDialogOpen(false);

    if (orig) {
      // Update existing record
      updateRecordInDb(orig, updatedRecord);
    } else {
      // Create new record
      createRecordInDb(updatedRecord);
    }

    setOriginalRecord(null);
  };

  const rejectEditRecordDialog = () => {
    setEditRecordDialogOpen(false);
    setOriginalRecord(null);
    setFormData({
      id: 0,
      name: undefined,
      date: undefined,
      api_token: undefined,
      owner: undefined,
    });
  };

  const createRecordInDb = async (newRecord: Event) => {
    try {
      const recordData = {
        name: newRecord.name,
        date: newRecord.date,
        api_token: newRecord.api_token,
        owner: newRecord.owner,
      };

      await callRpcMethod(
        wsClient(),
        `${appConfig.qxeventdPath}/sql`,
        "create",
        makeMap({table: "events", record: makeMap(recordData)}),
      );

      showToast({
        title: "Create event success",
      });

      // Reload table to show new record
      reloadTable();
    } catch (error) {
      console.error("Error creating event:", error);
      showToast({
        title: "Create event error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  const updateRecordInDb = async (origRecord: Event, newRecord: Event) => {
    try {
      const changes = copyValidFieldsToRpcMap(origRecord, newRecord);
      if (!isRecordEmpty(changes)) {
        await callRpcMethod(
          wsClient(),
          `${appConfig.qxeventdPath}/sql`,
          "update",
          makeMap({table: "events", id: origRecord.id, record: makeMap(changes)}),
        );
      }
      showToast({
        title: "Update event success",
      });
    } catch (error) {
      console.error("Error updating event:", error);
      showToast({
        title: "Update event error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };

  onMount(() => {
    // console.log("EVENTS MOUNTED");
  });

  createEffect(() => {
    if (status() === "Connected") {
      reloadTable();
    }
  });

  // Table columns configuration with sorting - optimized for mobile
  const columns: TableColumn<EventListItem>[] = [
    {
      key: "id",
      header: "ID",
      cell: (rec: EventListItem) => {
        return <span class="text-sm">{rec.id}</span>;
      },
      sortable: true,
      width: "50px",
      hidden: "hidden sm:table-cell",
    },
    {
      key: "name",
      header: "Name",
      cell: (rec: EventListItem) => {
        return <span class="text-sm truncate max-w-[120px] block" title={rec.name}>{rec.name}</span>;
      },
      sortable: true,
      width: "120px",
    },
    {
      key: "date",
      header: "Date",
      cell: (rec: EventListItem) => {
        return <span class="text-sm truncate max-w-[100px] block" title={rec.date}>{rec.date}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "owner",
      header: "Owner",
      cell: (rec: EventListItem) => {
        return <span class="text-sm truncate max-w-[100px] block" title={rec.owner}>{rec.owner}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "actions",
      header: "Edit",
      cell: (rec: EventListItem) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openEditRecordDialog(rec.id)}
          class="text-xs px-2 py-1 h-7"
        >
          Edit
        </Button>
      ),
      sortable: false,
      width: "60px",
    },
  ];

  return (
    <div class="w-full">
      <div class="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 class="text-xl sm:text-2xl font-bold">Events</h2>
        <div class="flex gap-2 flex-wrap">
          <Button onClick={addEntry} size="sm" class="text-xs">Create event</Button>
          <Button variant="outline" onClick={reloadTable} disabled={loading()} size="sm" class="text-xs">
            {loading() ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Mobile-optimized table with compact styling */}
      <div class="rounded-md border overflow-x-auto min-w-0">
        <div class="min-w-[420px]">
          <Table
            data={tableRecords()}
            columns={columns}
            loading={loading()}
            emptyMessage="No events found"
            variant="striped"
            sortable={true}
            globalFilter={true}
            onSortChange={(sort: any) => console.log("Sort changed:", sort)}
            class="text-sm w-full table-fixed"
          />
        </div>
      </div>

      <Dialog
        open={editRecordDialogOpen()}
        onOpenChange={setEditRecordDialogOpen}
      >
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>{originalRecord() ? "Edit Event" : "Create New Event"}</DialogTitle>
          </DialogHeader>

          <div class="space-y-4">
            {originalRecord() && (
              <TextField>
                <TextFieldLabel>ID</TextFieldLabel>
                <TextFieldInput
                  value={formData().id?.toString() || ""}
                  type="number"
                  readOnly={true}
                />
              </TextField>
            )}

            <TextField>
              <TextFieldLabel>Name *</TextFieldLabel>
              <TextFieldInput
                value={formData().name || ""}
                type="text"
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setFormData(prev => ({ ...prev, name: value || undefined }));
                }}
                class={!isFormValid() ? "border-red-500" : ""}
              />
              {!isFormValid() && (
                <div class="text-sm text-red-500 mt-1">Name is required</div>
              )}
            </TextField>

            <TextField>
              <TextFieldLabel>Date</TextFieldLabel>
              <TextFieldInput
                value={formData().date || ""}
                type="text"
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setFormData(prev => ({ ...prev, date: value || undefined }));
                }}
              />
            </TextField>

            <TextField>
              <TextFieldLabel>API token</TextFieldLabel>
              <TextFieldInput
                value={formData().api_token || ""}
                type="text"
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setFormData(prev => ({ ...prev, api_token: value || undefined }));
                }}
              />
            </TextField>

            {qrCodeDataURL() && (
              <div class="flex flex-col items-center space-y-2">
                <div class="text-sm font-medium text-gray-700">Event URL QR Code</div>
                <img
                  src={qrCodeDataURL()}
                  alt="Event QR Code"
                  class="border rounded-lg shadow-sm"
                />
                <div class="text-xs text-gray-500 text-center max-w-xs break-all">
                  {formData().api_token ? `https://qxqx.org/event?api_token=${formData().api_token}` : "Enter API token to generate QR code"}
                </div>
              </div>
            )}

            <TextField>
              <TextFieldLabel>Owner</TextFieldLabel>
              <TextFieldInput
                value={formData().owner || ""}
                type="text"
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setFormData(prev => ({ ...prev, owner: value || undefined }));
                }}
              />
            </TextField>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={rejectEditRecordDialog}>
              Cancel
            </Button>
            <Button
              onClick={acceptEditRecordDialog}
              disabled={!isFormValid() || (!originalRecord() && !isFormDirty())}
            >
              {!isFormValid() ? "Invalid data" : (!originalRecord() && !isFormDirty()) ? "Enter data" : originalRecord() ? "Save Changes" : "Create Event"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Events = () => {
  return (
    <div class="flex w-full flex-col items-center justify-center px-2 sm:px-4">
      <h1 class="mt-7 mb-7 text-2xl sm:text-3xl font-bold">Events</h1>
      <div class="w-full max-w-full sm:max-w-7xl space-y-4">
        <EventsTable />
      </div>
    </div>
  );
};

export default Events;
