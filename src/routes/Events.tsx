import {
  makeMap,
  RpcValue,
} from "libshv-js";
import { createMemo, createSignal, createEffect, For, onMount, untrack } from "solid-js";

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
import { useStage } from "~/context/StageContext";
import { useAppConfig } from "~/context/AppConfig";
import { useEventConfig } from "~/context/EventConfig";
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
  const { currentStage } = useStage();
  const appConfig = useAppConfig();
  const eventConfig = useEventConfig();
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
        `${appConfig.qxEventShvPath()}/sql`,
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
    const newEntry: EventListItem = {
      id: Math.max(...tableRecords().map((u) => u.id)) + 1,
      name: "",
      date: "",
      owner: "",
    };
    setTableRecords([...tableRecords(), newEntry]);
  };

  // Edit dialog state
  const [editRecordDialogOpen, setEditRecordDialogOpen] = createSignal(false);
  let originalRecord: Event | null = null;

  const deleteRecord = (id: number) => {
    setTableRecords(tableRecords().filter((user) => user.id !== id));
  };

  let idRef!: HTMLInputElement;
  let nameRef!: HTMLInputElement;
  let dateRef!: HTMLInputElement;
  let apiTokenRef!: HTMLInputElement;
  let ownerRef!: HTMLInputElement;

  const openEditRecordDialog = async (id: number) => {
    originalRecord = null;
    const eventItem = tableRecords().find((record) => record.id === id);
    if (eventItem) {
      setEditRecordDialogOpen(true);

      const result = await callRpcMethod(
        wsClient(),
        `${appConfig.qxEventShvPath()}/sql`,
        "read",
        makeMap({"table": "events", "id": id}),
      );
      originalRecord = parse(EventSchema, result);

      // Populate form fields directly using refs
      idRef.value = originalRecord.id?.toString() || "";
      nameRef.value = originalRecord.name || "";
      dateRef.value = originalRecord.date || "";
      apiTokenRef.value = originalRecord.api_token || "";
      ownerRef.value = originalRecord.owner || "";
    }
  };

  const acceptEditRecordDialog = () => {
    if (originalRecord === null) return;

    const updatedRecord: Event = {
      ...originalRecord,
      name: nameRef.value || undefined,
      date: dateRef.value || undefined,
      api_token: apiTokenRef.value || undefined,
      owner: ownerRef.value || undefined,
    };

    setEditRecordDialogOpen(false);
    updateRecordInDb(originalRecord, updatedRecord);
    originalRecord = null;
  };

  const rejectEditRecordDialog = () => {
    setEditRecordDialogOpen(false);
    originalRecord = null;
  };

  const updateRecordInDb = async (origRecord: Event, newRecord: Event) => {
    try {
      const changes = copyValidFieldsToRpcMap(origRecord, newRecord);
      if (!isRecordEmpty(changes)) {
        await callRpcMethod(
          wsClient(),
          `${appConfig.qxEventShvPath()}/sql`,
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

  // Table columns configuration with sorting
  const columns: TableColumn<EventListItem>[] = [
    {
      key: "id",
      header: "ID",
      cell: (rec: EventListItem) => {
        return <span>{rec.id}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "name",
      header: "Name",
      cell: (rec: EventListItem) => {
        return <span>{rec.name}</span>;
      },
      sortable: true,
    },
    {
      key: "date",
      header: "Date",
      cell: (rec: EventListItem) => {
        return <span>{rec.date}</span>;
      },
      sortable: true,
    },
    {
      key: "owner",
      header: "Owner",
      cell: (rec: EventListItem) => {
        return <span>{rec.owner}</span>;
      },
      sortable: true,
      width: "250px",
      // align: "right",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (rec: EventListItem) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openEditRecordDialog(rec.id)}
        >
          Edit
        </Button>
      ),
      sortable: false,
      width: "100px",
    },
  ];

  return (
    <div>
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-2xl font-bold">Events</h2>
        <div class="flex gap-2">
          <Button onClick={addEntry}>Add entry</Button>
          <Button variant="outline" onClick={reloadTable} disabled={loading()}>
            {loading() ? "Loading..." : "Refresh"}
          </Button>
        </div>
      </div>

      {/* Example 1: Auto-rendered table with sorting and global search */}
      <div class="rounded-md border">
        <Table
          data={tableRecords()}
          columns={columns}
          loading={loading()}
          emptyMessage="No users found"
          variant="striped"
          sortable={true}
          globalFilter={true}
          onSortChange={(sort: any) => console.log("Sort changed:", sort)}
        />
      </div>

      <Dialog
        open={editRecordDialogOpen()}
        onOpenChange={setEditRecordDialogOpen}
      >
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>

          <div class="space-y-4">
            <TextField>
              <TextFieldLabel>ID</TextFieldLabel>
              <TextFieldInput ref={idRef} type="number" readOnly={true} />
            </TextField>
            <TextField>
              <TextFieldLabel>Name</TextFieldLabel>
              <TextFieldInput ref={nameRef} type="text" />
            </TextField>
            <TextField>
              <TextFieldLabel>Date</TextFieldLabel>
              <TextFieldInput ref={dateRef} type="text" />
            </TextField>
            <TextField>
              <TextFieldLabel>API token</TextFieldLabel>
              <TextFieldInput ref={apiTokenRef} type="text" />
            </TextField>
            <TextField>
              <TextFieldLabel>Owner</TextFieldLabel>
              <TextFieldInput ref={ownerRef} type="text" />
            </TextField>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={rejectEditRecordDialog}>
              Cancel
            </Button>
            <Button onClick={acceptEditRecordDialog}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Events = () => {
  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Events</h1>
      <div class="w-full max-w-7xl space-y-4">
        <EventsTable />
      </div>
    </div>
  );
};

export default Events;
