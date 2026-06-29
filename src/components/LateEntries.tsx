import { makeMap, RpcValue } from "libshv-js";
import { createSignal, createEffect, onMount, untrack } from "solid-js";

import { Button } from "~/components/ui/button";
import { Table, TableColumn } from "~/components/ui/table";
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
import { FlexDropdown } from "~/components/ui/flexdropdown";

import { useWsClient } from "~/context/WsClient";
import { useAuth } from "~/context/AuthContext";
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { createSqlTable } from "~/lib/SqlTable";
import { object, number, string, parse, type InferOutput, undefinedable, optional, undefinedableAsync } from "valibot";
import { copyRecordChanges as copyValidFieldsToRpcMap, isRecordEmpty } from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { EventConfig } from "~/routes/OpenedEvent";
import { LateEntryRecordSchema } from "~/components/Runs";

const QxChangeRecordSchema = object({
  id: number(),
  data: LateEntryRecordSchema,
  user_id: optional(string()),
  status: optional(string()),
  status_message: optional(string()),
});
type QxChangeRecord = InferOutput<typeof QxChangeRecordSchema>;

function normalizeQxChangeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const rawChange = record.data;
  if (typeof rawChange !== "string") return record;

  const parsed = JSON.parse(rawChange);
  const lateEntry = parsed?.LateEntry?.record;
  if (!lateEntry) return record;

  const { run_id, record: lateEntryRecord = {} } = lateEntry;

  return {
    ...record,
    data: lateEntryRecord,
  };
}

function EntriesTable(props: {
  className: () => string;
  eventConfig: () => EventConfig;
  eventId: () => number;
  currentStage: () => number;
  rows: () => QxChangeRecord[];
  setRows: (runs: QxChangeRecord[] | ((prev: QxChangeRecord[]) => QxChangeRecord[])) => void;
  loading: () => boolean;
  onReload: () => void;
  recchngReceived: () => RecChng | null;
}) {
  const { wsClient } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) {
      untrack(() => processRecChng(recchng));
    }
  });

  const processRecChng = (recchng: RecChng, verbose = false) => {
    const { table, id, record, op } = recchng;
    if (verbose) console.log("processRecChng: received change", { table, id, record, op });
  };

  const columns: TableColumn<QxChangeRecord>[] = [
    {
      key: "user_id",
      header: "Owner",
      cell: (entry: QxChangeRecord) => {
        return (
          <div class="flex flex-col leading-tight">
            <span>{entry.user_id ?? "—"}</span>
          </div>
        );
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "status",
      header: "Status",
      cell: (entry: QxChangeRecord) => {
        const status = entry.status;
        return (
          <div class="flex flex-col leading-tight">
            <span>{status ?? "—"}</span>
          </div>
        );
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "status_message",
      header: "Message",
      cell: (entry: QxChangeRecord) => {
        const statusMessage = entry.status_message;
        return (
          <div class="flex flex-col leading-tight">
            <span>{statusMessage ?? "—"}</span>
          </div>
        );
      },
      sortable: true,
      width: "200px",
    },
  ];

  return (
    <div>
      <div class="rounded-md border">
        <Table
          data={props.rows()}
          columns={columns}
          loading={props.loading()}
          emptyMessage="No entries found"
          variant="striped"
          sortable={true}
          globalFilter={true}
        />
      </div>

    </div>
  );
}

const LateEntries = (props: {
  eventId: number,
  eventConfig: () => EventConfig,
  currentStage: number,
  recchngReceived: () => RecChng | null
}) => {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();

  const [className, setClassName] = createSignal("");
  const [rows, setRows] = createSignal<QxChangeRecord[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [addEntry, setAddEntry] = createSignal<(() => void) | null>(null);

  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;

  const reloadTable = async () => {
    if (status() !== "Connected") return;
    setLoading(true);
    try {
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [
        `SELECT * FROM qxchanges
                WHERE qxchanges.stage_id = ${currentStage()} AND qxchanges.data_type = 'LateEntry'
                ORDER BY qxchanges.id`,
      ]);
      const table = createSqlTable(result);
      const transformedRuns: QxChangeRecord[] = [];
      for (let i = 0; i < table.rowCount(); i++) {
        try {
          transformedRuns.push(parse(QxChangeRecordSchema, normalizeQxChangeRecord(table.recordAt(i))));
        } catch (error) {
          console.warn(`Skipping invalid row ${i}:`, error);
        }
      }
      setRows(transformedRuns);
    } catch (error) {
      showToast({ title: "Reload table error", description: (error as Error).message, variant: "destructive" });
    }
    setLoading(false);
  };

  onMount(() => reloadTable());

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Late Entries</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class="flex items-center justify-end">
          <div class="flex gap-2">
            <Button variant="outline" onClick={reloadTable} disabled={loading() || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <EntriesTable
          className={className}
          eventConfig={props.eventConfig}
          eventId={eventId}
          currentStage={currentStage}
          rows={rows}
          setRows={setRows}
          loading={loading}
          onReload={reloadTable}
          recchngReceived={props.recchngReceived}
        />
      </div>
    </div>
  );
};

export default LateEntries;
