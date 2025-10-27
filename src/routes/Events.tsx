import { fromJson, IMap, makeIMap, makeMap, makeMetaMap, RPC_MESSAGE_CALLER_IDS, RPC_MESSAGE_METHOD, RPC_MESSAGE_PARAMS, RPC_MESSAGE_REQUEST_ID, RPC_MESSAGE_SHV_PATH, RpcMessage, RpcRequest, RpcSignal, RpcValue, RpcValueWithMetaData, WsClient } from "libshv-js";
import { createMemo, createSignal, createEffect, For } from "solid-js";
import { Badge } from "~/components/ui/badge";
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
import { createSqlTable } from "~/lib/SqlTable";
import { object, number, string, nullable, parse, type InferOutput, undefinedable, safeParse } from "valibot";
import { copyRecordChanges as copyValidFieldsToRpcMap, isRecordEmpty, toRpcValue } from "~/lib/utils";
import { RecChng, RecChngSchema, SqlOperation } from "~/schema/rpc-sql-schema";

const EventSchema = object({
  id: number(),
  name: undefinedable(string()),
  apiToken: undefinedable(string()),
  date: undefinedable(string()),
  owner: undefinedable(string()),
});

type Event = InferOutput<typeof EventSchema>;

function EventsTable(props: { className: () => string }) {
  const { wsClient, status, recChng } = useWsClient();
  const { currentStage } = useStage();
  const appConfig = useAppConfig();
  const eventConfig = useEventConfig();

  const [tableRecords, setTableRecords] = createSignal<Event[]>([]);

  const [loading, setLoading] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<keyof Event>("name");
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc");

  // Edit dialog state
  const [editRecordDialogOpen, setEditRecordDialogOpen] = createSignal(false);
  let editingRecordId: number | null = null;

  // Reactive sorted data
  const sortedEntries = createMemo(() => {
    const data = [...tableRecords()];
    return data.sort((a, b) => {
      const aVal = a[sortBy()];
      const bVal = b[sortBy()];

      // Handle null values - put nulls at the beginnig
      if ((aVal === null || aVal === undefined) && (bVal === null || bVal === undefined)) return 0;
      if (aVal === null || aVal === undefined) return sortOrder() === "asc" ? -1 : 1;
      if (bVal === null || bVal === undefined) return sortOrder() === "asc" ? 1 : -1;

      if (aVal < bVal) return sortOrder() === "asc" ? -1 : 1;
      if (aVal > bVal) return sortOrder() === "asc" ? 1 : -1;
      return 0;
    });
  });

  function parseHH_MM_SS(hhmmss: string): [number, number, number] | undefined {

    const timeSegments = hhmmss.split(':').map(Number);

    if (timeSegments.length === 1) {
      // Just minutes
      const min = timeSegments[0];
      return [0, min, 0];
    } else if (timeSegments.length === 2) {
      // Format: HH:MM
      const [hours, minutes] = timeSegments;
      return [hours, minutes, 0];
    } else if (timeSegments.length === 3) {
      // Format: HH:MM:SS
      const [hours, minutes, secs] = timeSegments;
      return [hours, minutes, secs];
    }
    // throw new Error(`Invalid time format: ${hhmmss}`);
    return undefined;
  }

  function parseStartTime(s: string): number | undefined {
    const hms = parseHH_MM_SS(s);
    if (!hms) {
      return undefined;
    }
    const [hours, minutes, secs] = hms;
    const stageStart = eventConfig.eventConfig.stages[currentStage()].stageStart;
    const runStart = new Date(stageStart.getTime());
    runStart.setHours(hours, minutes, secs, 0);
    return runStart.getTime() - stageStart.getTime();
  }

  function formatStartTime(msec: number | undefined): string {
    if (msec === undefined) {
      return "";
    }
    const stageStart = eventConfig.eventConfig.stages[currentStage()].stageStart;
    const date = new Date(stageStart.getTime() + msec);
    return formatDateToTimeString(date);
  }

  function formatDateToTimeString(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  const addEntry = () => {
    const newEntry: Event = {
        id: Math.max(...tableRecords().map((u) => u.id)) + 1,
        name: undefined,
        apiToken: undefined,
        date: undefined,
        owner: undefined
    };
    setTableRecords([...tableRecords(), newEntry]);
  };

  let nameRef!: HTMLInputElement;
  let dateRef!: HTMLInputElement;
  let apiTokenRef!: HTMLInputElement;
  let idRef!: HTMLInputElement;

  const openEditRecordDialog = (id: number) => {
    editingRecordId = null;
    const recordToEdit = tableRecords().find(record => record.id === id);
    if (recordToEdit) {
      editingRecordId = id;
      setEditRecordDialogOpen(true);

      // Populate form fields directly using refs
      setTimeout(() => {
        idRef.value = recordToEdit.id?.toString() || "";
        nameRef.value = recordToEdit.name || "";
        dateRef.value = recordToEdit.date || "";
        apiTokenRef.value = recordToEdit.apiToken || "";
      }, 0);
    }
  };

  const acceptEditRecordDialog = () => {
    if (editingRecordId === null) return;

    const originalRecord = tableRecords().find(record => record.id === editingRecordId)!;

    const updatedRecord: Event = {
      ...originalRecord,
      name: nameRef.value || undefined,
      date: dateRef.value || undefined,
      apiToken: apiTokenRef.value || undefined,
      id: parseInt(idRef.value),
    };

    setEditRecordDialogOpen(false);
    updateRecordInDb(updatedRecord);
    editingRecordId = null;
  };

  const rejectEditRecordDialog = () => {
    setEditRecordDialogOpen(false);
    editingRecordId = null;
  };

  const deleteRecord = (id: number) => {
    setTableRecords(tableRecords().filter((user) => user.id !== id));
  };

  const callRpcMethod = async (
    shvPath: string,
    method: string,
    params?: RpcValue,
  ): Promise<RpcValue> => {
    const client = wsClient();
    if (!client) {
      throw new Error("WebSocket client is not available");
    }
    const result = await client.callRpcMethod(shvPath, method, params);
    if (result instanceof Error) {
      console.error("RPC error:", result);
      throw new Error(result.message);
    }
    return result;
  };

  const sendRpcMessage = (msg: RpcMessage) => {
    const client = wsClient();
    if (!client) {
      throw new Error("WebSocket client is not available");
    }
    client.sendRpcMessage(msg);
  };

  const updateRecordInDb = async (newRecord: Event) => {
    try {
      const origRecord = tableRecords().find(record => newRecord.id === record.id)!;

      const createParam = (table: string, id: number, record: Record<string, RpcValue>): RpcValue => {
        return makeMap({
          table,
          id,
          record: makeMap(record),
          issuer: "fanda"
        });
      };
      const events_table_record = copyValidFieldsToRpcMap(origRecord, newRecord, ["firstName", "lastName", "registration"]);
      if (!isRecordEmpty(events_table_record)) {
        await callRpcMethod(appConfig.eventSqlPath(), "update", createParam('competitors', origRecord.id, events_table_record));
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

  const reloadTable = async () => {
    setLoading(true);

    try {
      const sql_select_result = await callRpcMethod(`${appConfig.qxEventShvPath()}/events`, "list");
      const table = createSqlTable(sql_select_result);

      const transformedRecords: Event[] = [];
      for (let i = 0; i < table.rowCount(); i++) {
        const record = table.recordAt(i);
        try {
          const validatedRecord = parse(EventSchema, record);
          transformedRecords.push(validatedRecord);
        } catch (error) {
          console.warn(`Skipping invalid row ${i}:`, error);
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

  // Watch for WebSocket status changes and reload data when connected
  createEffect(() => {
    if (!!props.className()) {
      console.log("Class name changed - reloading late entries data");
      reloadTable();
    }
  });

  // Table columns configuration with sorting
  const columns: TableColumn<Event>[] = [
    {
      key: "id",
      header: "ID",
      cell: (rec: Event) => {
        return <span>{rec.id}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "name",
      header: "Name",
      cell: (rec: Event) => {
        return <span>{rec.name}</span>;
      },
      sortable: true,
    },
    {
      key: "date",
      header: "Date",
      cell: (rec: Event) => {
        return <span>{rec.date}</span>;
      },
      sortable: true,
    },
    {
      key: "owner",
      header: "Owner",
      cell: (rec: Event) => {
        return <span>{rec.owner}</span>;
      },
      sortable: true,
      width: "250px",
      // align: "right",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (rec: Event) => (
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
        <h2 class="text-2xl font-bold">Class {props.className()}</h2>
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

      <Dialog open={editRecordDialogOpen()} onOpenChange={setEditRecordDialogOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Event</DialogTitle>
          </DialogHeader>

          <div class="space-y-4">
            <TextField>
              <TextFieldLabel>First Name</TextFieldLabel>
              <TextFieldInput
                ref={nameRef}
                type="text"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Last Name</TextFieldLabel>
              <TextFieldInput
                ref={dateRef}
                type="text"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Registration</TextFieldLabel>
              <TextFieldInput
                ref={apiTokenRef}
                type="text"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>SI ID</TextFieldLabel>
              <TextFieldInput
                ref={idRef}
                type="number"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Start Time</TextFieldLabel>
              <TextFieldInput
                ref={dateRef}
                type="text"
                placeholder="HH:MM"
              />
            </TextField>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={rejectEditRecordDialog}>
              Cancel
            </Button>
            <Button onClick={acceptEditRecordDialog}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Events = () => {
  const [className, setClassName] = createSignal("");

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Late Entries</h1>
      <div class="w-full max-w-7xl space-y-4">
        <EventsTable className={className} />
      </div>
    </div>
  );
};

export default Events;
