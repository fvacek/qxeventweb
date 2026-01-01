import {
  makeMap,
  RpcValue,
} from "libshv-js";
import { createMemo, createSignal, createEffect, For, onMount, untrack } from "solid-js";
import QRCode from "qrcode";

import { Button } from "~/components/ui/button";
import {
  Table,
  TableColumn,
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
  boolean,
} from "valibot";
import {
  copyRecordChanges as copyValidFieldsToRpcMap,
  isRecordEmpty,
  toRpcValue,
} from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { Switch, SwitchControl, SwitchLabel, SwitchThumb } from "~/components/ui/switch";

const EventDataSchema = object({
  name: undefinedable(string()),
  date: undefinedable(string()),
  owner: undefinedable(string()),
  is_local: undefinedable(boolean()),
});
type EventData = InferOutput<typeof EventDataSchema>;

const FormDataSchema = object({
  id: number(),
  name: undefinedable(string()),
  date: undefinedable(string()),
  api_token: undefinedable(string()),
  owner: undefinedable(string()),
  is_local: undefinedable(boolean()),
});
type FormData = InferOutput<typeof FormDataSchema>;

const EventRecordSchema = object({
  id: number(),
  api_token: undefinedable(string()),
  data: undefinedable(string()),
});
type EventRecord = InferOutput<typeof EventRecordSchema>;

const EventRecordListSchema = array(EventRecordSchema);

// Conversion functions between EventRecord and FormData
function eventRecordToFormData(eventRecord: EventRecord): FormData {
  let eventData: EventData = { name: undefined, date: undefined, owner: undefined, is_local: undefined };

  // Parse the data field if it exists and is a valid JSON string
  if (eventRecord.data) {
    try {
      const parsedData = typeof eventRecord.data === 'string' ? JSON.parse(eventRecord.data) : eventRecord.data;
      eventData = parsedData as EventData;
    } catch (error) {
      console.warn("Failed to parse event data JSON:", error);
    }
  }

  return {
    id: eventRecord.id,
    name: eventData.name,
    date: eventData.date,
    api_token: eventRecord.api_token,
    owner: eventData.owner,
    is_local: eventData.is_local,
  };
}

function formDataToEventRecord(formData: FormData): EventRecord {
  const eventData: EventData = {
      name: formData.name,
      date: formData.date,
      owner: formData.owner,
      is_local: formData.is_local,
  };

  return {
    id: formData.id,
    api_token: formData.api_token,
    data: JSON.stringify(eventData),
  };
}

// Helper function to convert FormData changes to database update format
function formDataChangesToEventRecord(changes: Partial<FormData>, origRecord: FormData): Record<string, any> {
  const result: Record<string, any> = {};

  if (changes.api_token !== undefined) {
    result.api_token = changes.api_token;
  }

  // Handle data field - only include if name, date, or owner changed
  const dataFields: EventData = {
    name: origRecord.name,
    date: origRecord.date,
    owner: origRecord.owner,
    is_local: origRecord.is_local
  };
  let hasDataChanges = false;

  if (changes.name !== undefined) {
    dataFields.name = changes.name;
    hasDataChanges = true;
  }
  if (changes.date !== undefined) {
    dataFields.date = changes.date;
    hasDataChanges = true;
  }
  if (changes.owner !== undefined) {
    dataFields.owner = changes.owner;
    hasDataChanges = true;
  }

  if (hasDataChanges) {
    result.data = JSON.stringify(dataFields);
  }

  return result;
}

// Helper function to convert FormData to create record format for new events
// function formDataToCreateRecord(formData: FormData): Record<string, any> {
//   const eventData: EventData = {
//     name: formData.name,
//     date: formData.date,
//     owner: formData.owner,
//   };

//   return {
//     api_token: formData.api_token,
//     data: JSON.stringify(eventData),
//   };
// }

function EventsTable() {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();
  const { recchngReceived } = useSubscribe();

  const [tableRecords, setTableRecords] = createSignal<FormData[]>([]);

  const [loading, setLoading] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<keyof FormData>("name");
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
      const aVal = a?.[sortBy() as keyof FormData];
      const bVal = b?.[sortBy() as keyof FormData];

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
        makeMap({"table": "events", "fields": ["id", "api_token", "data"]}),

      );
      const table = parse(EventRecordListSchema, sql_select_result);

      const transformedRecords: FormData[] = [];
      for (const record of table) {
        try {
          transformedRecords.push(eventRecordToFormData(record));
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

    // // Update data with fresh timestamps and randomized data
    // const refreshedEntries = tableRecords().map((entry) => ({
    //   ...entry,
    // }));

    // setTableRecords(refreshedEntries);
    // setLoading(false);
  };

  const createEvent = async () => {
    const currentUser = user();
    const result = await callRpcMethod(
      wsClient(),
      `${appConfig.qxeventdPath}/event`,
      "createEvent",
      currentUser?.email || "",
    );
    if (Array.isArray(result)) {
      if (typeof result[0] === 'number') {
        const eventId = result[0];
        showToast({
          title: `Create event ${eventId} success`,
        });
        // Reload table to show new record
        await reloadTable();
        openEditRecordDialog(eventId);
      }
    }
  };

  // Edit dialog state
  const [editRecordDialogOpen, setEditRecordDialogOpen] = createSignal(false);
  const [originalRecord, setOriginalRecord] = createSignal<FormData | null>(null);
  const [formData, setFormData] = createSignal<FormData | null>(null);

  const deleteRecord = (id: number) => {
    setTableRecords(tableRecords().filter((user) => user.id !== id));
  };

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
      generateQRCode(formData()?.api_token || "");
    }
  });

  // Check if form has been modified
  const isFormDirty = createMemo(() => {
    const orig = originalRecord();
    const current = formData();
    if (!current) {
      // For new entries, form is dirty if any field has content
      return false;
    }
    if (!orig) {
      // For new entries, form is dirty if any field has content
      return !!(current.name || current.date || current.api_token || current.owner || current.is_local);
    }

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
    if (!current) {
      return false;
    }
    const isValid = !!(current.name && current.name.trim().length > 0);
    console.log('Form validation:', { current, isValid });
    return isValid;
  });

  const openEditRecordDialog = async (id: number) => {
    setOriginalRecord(null);
    const eventItem = tableRecords().find((record) => record.id === id);
    if (eventItem) {
      setEditRecordDialogOpen(true);

      const formRecord: FormData = {
        id: id,
        name: eventItem.name,
        date: eventItem.date,
        api_token: eventItem.api_token,
        owner: eventItem.owner,
        is_local: eventItem.is_local,
      };

      setOriginalRecord(formRecord);

      // Populate form data signal
      setFormData(formRecord);
    }
  };

  const acceptEditRecordDialog = () => {
    if (!isFormValid()) return;

    const orig = originalRecord();
    assert(!!orig)

    const updatedRecord = formData();
    if (!updatedRecord) {
      return;
    }
    setEditRecordDialogOpen(false);

    // Update existing record
    updateRecordInDb(orig, updatedRecord);

    setOriginalRecord(null);
  };

  const clearFormData = () => {
    setFormData(null);
  };

  const rejectEditRecordDialog = () => {
    setEditRecordDialogOpen(false);
    setOriginalRecord(null);
    clearFormData();
  };

  const deleteEditedRecord = async () => {
    const record = originalRecord();
    if (record) {
      setEditRecordDialogOpen(false);
      setOriginalRecord(null);
      clearFormData();
      await deleteRecordInDb(record.id);
      reloadTable();
    }
  };

  const updateRecordInDb = async (origRecord: FormData, updatedRecord: FormData) => {
    try {
      const formChanges = copyValidFieldsToRpcMap(origRecord, updatedRecord);
      const dbChanges = formDataChangesToEventRecord(formChanges, origRecord);

      if (!isRecordEmpty(dbChanges)) {
        await callRpcMethod(
          wsClient(),
          `${appConfig.qxeventdPath}/sql`,
          "update",
          makeMap({table: "events", id: origRecord.id, record: makeMap(dbChanges)}),
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

  const deleteRecordInDb = async (id: number) => {
    try {
      if (await callRpcMethod(
        wsClient(),
        `${appConfig.qxeventdPath}/sql`,
        "delete",
        makeMap({ table: "events", id: id }),
      )) {
        showToast({
          title: "Delete event success",
        });
      } else {
        throw new Error("Failed to delete event");
      }
    } catch (error) {
      console.error("Error deleting event:", error);
      showToast({
        title: "Delete event error",
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
  const columns: TableColumn<FormData>[] = [
    {
      key: "id",
      header: "ID",
      cell: (rec: FormData) => {
        return <span class="text-sm">{rec.id}</span>;
      },
      sortable: true,
      width: "50px",
      hidden: "hidden sm:table-cell",
    },
    {
      key: "name",
      header: "Name",
      cell: (rec: FormData) => {
        return <span class="text-sm truncate max-w-[120px] block" title={rec.name}><a href={`event/${rec.id}`}>{rec.name}</a></span>;
      },
      sortable: true,
      width: "120px",
    },
    {
      key: "date",
      header: "Date",
      cell: (rec: FormData) => {
        return <span class="text-sm truncate max-w-[100px] block" title={rec.date}>{rec.date}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "owner",
      header: "Owner",
      cell: (rec: FormData) => {
        return <span class="text-sm truncate max-w-[100px] block" title={rec.owner}>{rec.owner}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "actions",
      header: "Edit",
      cell: (rec: FormData) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openEditRecordDialog(rec.id)}
          disabled={user()?.email != rec.owner}
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
          <Button onClick={createEvent} size="sm" class="text-xs" disabled={!user()?.email}>Create event</Button>
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
                  value={formData()?.id.toString() || ""}
                  type="number"
                  readOnly={true}
                />
              </TextField>
            )}

            <TextField>
              <TextFieldLabel>Name *</TextFieldLabel>
              <TextFieldInput
                value={formData()?.name || ""}
                type="text"
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setFormData(prev => prev ? { ...prev, name: value || undefined } : null);
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
                value={formData()?.date || ""}
                type="text"
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setFormData(prev => prev ? { ...prev, date: value || undefined } : null);
                }}
              />
            </TextField>
            <TextField>
              <TextFieldLabel>API token</TextFieldLabel>
              <TextFieldInput
                value={formData()?.api_token || ""}
                type="text"
                readOnly={true}
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
                  {formData()?.api_token ? `https://qxqx.org/event?api_token=${formData()?.api_token}` : "Enter API token to generate QR code"}
                </div>
              </div>
            )}

            <TextField>
              <TextFieldLabel>Owner</TextFieldLabel>
              <TextFieldInput
                value={formData()?.owner || ""}
                type="text"
                onInput={(e) => {
                  const value = (e.target as HTMLInputElement).value;
                  setFormData(prev => prev ? { ...prev, owner: value || undefined } : null);
                }}
              />
            </TextField>
            <Switch class="flex items-center space-x-2"
              checked={formData()?.is_local || false}
              onChange={(checked) => {
                setFormData(prev => prev ? { ...prev, is_local: checked } : null);
              }}
            >
              <SwitchLabel>Local Event DB</SwitchLabel>
              <SwitchControl>
                <SwitchThumb />
              </SwitchControl>
            </Switch>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={rejectEditRecordDialog}> Cancel </Button>
            <Button variant="destructive" onClick={() => {
              const record = originalRecord();
              if (record && confirm(`Are you sure you want to delete the event "${record.name || 'this event'}"?\n\nThis action cannot be undone.`)) {
                deleteEditedRecord();
              }
            }}> Delete </Button>
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
