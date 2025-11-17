import { makeMap, RpcValue } from "libshv-js";
import { createMemo, createSignal, createEffect, For, untrack } from "solid-js";

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
import { FlexDropdown } from "~/components/ui/flexdropdown";

import { useWsClient } from "~/context/WsClient";
import { showToast, Toast } from "~/components/ui/toast";

import { useAppConfig } from "~/context/AppConfig";
import { useSubscribe } from "~/context/SubscribeContext";
import { createSqlTable } from "~/lib/SqlTable";
import { object, number, string, nullable, parse, type InferOutput, undefinedable, safeParse } from "valibot";
import { copyRecordChanges as copyValidFieldsToRpcMap, isRecordEmpty, toRpcValue } from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { EventConfig } from "~/routes/Event";


// Valibot schema for Run validation
const RunSchema = object({
  runId: number(),
  competitorId: number(),
  className: undefinedable(string()),
  firstName: undefinedable(string()),
  lastName: undefinedable(string()),
  registration: undefinedable(string()),
  siId: undefinedable(number()),
  startTimeMs: undefinedable(number()),
});

type Run = InferOutput<typeof RunSchema>;

function EntriesTable(props: {
  className: () => string;
  eventConfig: () => EventConfig;
  eventId: () => number;
  currentStage: () => number;
  runs: () => Run[];
  setRuns: (runs: Run[] | ((prev: Run[]) => Run[])) => void;
  loading: () => boolean;
  setLoading: (loading: boolean) => void;
  onReload: () => void;
  onAddEntry: () => void;
  recchngReceived: () => RecChng | null;
}) {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();

  const [sortBy, setSortBy] = createSignal<keyof Run>("lastName");
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc");

  // Edit dialog state
  const [runEditDialogOpen, setRunEditDialogOpen] = createSignal(false);
  let editingRunId: number | null = null;

  createEffect(() => {
    const recchng = props.recchngReceived();
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
    
    if (op === SqlOperation.Update) {
      if (table === "runs") {
        const originalRun = props.runs().find((run: Run) => run.runId === id);
        if (originalRun !== undefined) {
          const updatedRun = { ...originalRun, ...record };
          props.setRuns((prev: Run[]) => prev.map(run => run.runId === updatedRun.runId ? updatedRun : run));
        }
      } else if (table === "competitors") {
        const originalRun = props.runs().find((run: Run) => run.competitorId === id);
        if (originalRun !== undefined) {
          const updatedRun = { ...originalRun, ...record };
          props.setRuns((prev: Run[]) => prev.map(run => run.competitorId === id ? updatedRun : run));
        }
      }
    } else if (op === SqlOperation.Insert) {
    } else if (op === SqlOperation.Delete) {
    }
  };

  // Reactive sorted data
  const sortedEntries = createMemo(() => {
    const data = [...props.runs()];
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
    const stageStart = props.eventConfig().stages[props.currentStage()].stageStart;
    const runStart = new Date(stageStart.getTime());
    runStart.setHours(hours, minutes, secs, 0);
    return runStart.getTime() - stageStart.getTime();
  }

  function formatStartTime(msec: number | undefined): string {
    if (msec === undefined) {
      return "";
    }
    const stageStart = props.eventConfig().stages[props.currentStage()].stageStart;
    const date = new Date(stageStart.getTime() + msec);
    return formatDateToTimeString(date);
  }

  function formatDateToTimeString(date: Date): string {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    const seconds = date.getSeconds().toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }



  let firstNameRef!: HTMLInputElement;
  let lastNameRef!: HTMLInputElement;
  let registrationRef!: HTMLInputElement;
  let siIdRef!: HTMLInputElement;
  let startTimeRef!: HTMLInputElement;

  const openRunEditDialog = (id: number) => {
    editingRunId = null;
    const runToEdit = props.runs().find(run => run.runId === id);
    if (runToEdit) {
      editingRunId = id;
      setRunEditDialogOpen(true);

      // Populate form fields directly using refs
      setTimeout(() => {
        firstNameRef.value = runToEdit.firstName || "";
        lastNameRef.value = runToEdit.lastName || "";
        registrationRef.value = runToEdit.registration || "";
        siIdRef.value = runToEdit.siId?.toString() || "";
        startTimeRef.value = formatStartTime(runToEdit.startTimeMs);
      }, 0);
    }
  };

  const acceptRunEditDialog = () => {
    if (editingRunId === null) return;

    const originalRun = props.runs().find(run => run.runId === editingRunId)!;

    // Collect form values from refs and create updated run
    const updatedRun: Run = {
      ...originalRun,
      firstName: firstNameRef.value || undefined,
      lastName: lastNameRef.value || undefined,
      registration: registrationRef.value || undefined,
      siId: siIdRef.value ? parseInt(siIdRef.value) : undefined,
      startTimeMs: startTimeRef.value ? parseStartTime(startTimeRef.value) : undefined,
    };

    setRunEditDialogOpen(false);
    updateRunInDb(updatedRun);
    editingRunId = null;
  };

  const rejectRunEditDialog = () => {
    setRunEditDialogOpen(false);
    editingRunId = null;
  };

  const deleteEntry = (id: number) => {
    props.setRuns(props.runs().filter((user) => user.runId !== id));
  };

  const updateRunInDb = async (newRun: Run) => {
    try {
      const origRun = props.runs().find(run => newRun.runId === run.runId)!;

      const createParam = (table: string, id: number, record: Record<string, RpcValue>): RpcValue => {
        return makeMap({
          table,
          id,
          record: makeMap(record),
          issuer: "fanda"
        });
      };
      const competitors_record = copyValidFieldsToRpcMap(origRun, newRun, ["firstName", "lastName", "registration"]);
      if (!isRecordEmpty(competitors_record)) {
        await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId()), "update", createParam('competitors', origRun.competitorId, competitors_record));
      }
      const runs_record = copyValidFieldsToRpcMap(origRun, newRun, ["siId", "startTimeMs"]);
      if (!isRecordEmpty(runs_record)) {
        await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId()), "update", createParam('runs', origRun.runId, runs_record));
      }
      showToast({
        title: "Update run success",
      });
    } catch (error) {
      console.error("Error updating run:", error);
      showToast({
        title: "Update run error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  };



  // Watch for WebSocket status changes and reload data when connected
  createEffect(() => {
    if (!!props.className()) {
      console.log("Class name changed - reloading late entries data");
      props.onReload();
    }
  });

  // Table columns configuration with sorting
  const columns: TableColumn<Run>[] = [
    {
      key: "startTimeMs",
      header: "Start Time",
      cell: (run: Run) => {
        if (run.startTimeMs === undefined) {
          return <span>—</span>;
        }
        const eventConfig = props.eventConfig();
        const stageStart = eventConfig.stages[props.currentStage()].stageStart;
        return (
          <span>{formatStartTime(run.startTimeMs)}</span>
        );
      },
      sortable: true,
      width: "250px",
    },
    {
      key: "name",
      header: "Name",
      cell: (entry: Run) => {
        const fullName = [entry.firstName, entry.lastName]
          .filter((name) => name !== undefined && name.trim() !== "")
          .join(" ");
        return <span>{fullName || "—"}</span>;
      },
      sortable: true,
      sortFn: (a: Run, b: Run) => {
        const aName = [a.firstName, a.lastName].filter((n) => n).join(" ");
        const bName = [b.firstName, b.lastName].filter((n) => n).join(" ");
        return aName.localeCompare(bName);
      },
      width: "250px",
    },
    {
      key: "registration",
      header: "Reg",
      sortable: true,
      width: "100px",
    },
    {
      key: "siId",
      header: "SI",
      sortable: true,
      width: "250px",
      // align: "right",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (run: Run) => (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openRunEditDialog(run.runId)}
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
      <div class="rounded-md border">
        <Table
          data={props.runs()}
          columns={columns}
          loading={props.loading()}
          emptyMessage="No users found"
          variant="striped"
          sortable={true}
          globalFilter={true}
          onSortChange={(sort: any) => console.log("Sort changed:", sort)}
        />
      </div>

      {/* Edit Run Dialog */}
      <Dialog open={runEditDialogOpen()} onOpenChange={setRunEditDialogOpen}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Run</DialogTitle>
          </DialogHeader>

          <div class="space-y-4">
            <TextField>
              <TextFieldLabel>First Name</TextFieldLabel>
              <TextFieldInput
                ref={firstNameRef}
                type="text"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Last Name</TextFieldLabel>
              <TextFieldInput
                ref={lastNameRef}
                type="text"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Registration</TextFieldLabel>
              <TextFieldInput
                ref={registrationRef}
                type="text"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>SI ID</TextFieldLabel>
              <TextFieldInput
                ref={siIdRef}
                type="number"
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Start Time</TextFieldLabel>
              <TextFieldInput
                ref={startTimeRef}
                type="text"
                placeholder="HH:MM"
              />
            </TextField>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={rejectRunEditDialog}>
              Cancel
            </Button>
            <Button onClick={acceptRunEditDialog}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ClassSelector(props: {
  className: () => string;
  setClassName: (name: string) => void;
  eventId: () => number;
  currentStage: () => number;
}) {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const [eventOpen, setEventOpen] = createSignal(false);

  const [classes, setClasses] = createSignal<string[]>([]);

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

  async function loadClasses() {
    try {
      const classes_result = await callRpcMethod(
        appConfig.eventSqlApiPath(props.eventId()),
        "query",
        [
          `SELECT classes.name AS class_name FROM classes, classdefs
                  WHERE classdefs.classid = classes.id AND classdefs.stageid = ${props.currentStage()}
                  ORDER BY classes.name`,
        ],
      );
      const classNames: string[] = (classes_result as any).rows.map(
        (row: any[], rowIndex: number) => row[0],
      );
      setClasses(classNames);
      if (classNames.length > 0) {
        props.setClassName(classNames[0]);
      }
    } catch (error) {
      console.error("RPC call failed:", error);
      showToast({
        title: "Load classes error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  createEffect(() => {
    if (status() === "Connected") {
      loadClasses();
      setEventOpen(true);
    }
  });

  return (
    <div class="w-full">
      {props.className() && (
        <FlexDropdown
          value={props.className()}
          options={classes()}
          onSelect={props.setClassName}
          variant="default"
          fullWidth={true}
        />
      )}
    </div>
  );
}

const Entries = (props: {
  eventId: number,
  eventConfig: () => EventConfig,
  currentStage: number,
  recchngReceived: () => RecChng | null
}) => {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const eventConfig = props.eventConfig;
  const [eventId, setEventId] = createSignal(props.eventId);
  const [currentStage, setCurrentStage] = createSignal(props.currentStage);

  const callRpcMethod = async (
    client: any,
    shvPath: string,
    method: string,
    params?: RpcValue,
  ): Promise<RpcValue> => {
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

  const [className, setClassName] = createSignal("");
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);



  const addEntry = () => {
    const currentRuns = runs();
    const maxId = currentRuns.length > 0 ? Math.max(...currentRuns.map((u) => u.runId)) : 0;
    const newEntry: Run = {
        runId: maxId + 1,
        firstName: `Fanda${currentRuns.length + 1}`,
        lastName: `Vacek${currentRuns.length + 1}`,
        className: className() || "H55",
        startTimeMs: undefined,
        registration: "CHT7001",
        siId: undefined,
        competitorId: 1234 + currentRuns.length
    };
    setRuns([...currentRuns, newEntry]);
  };

  const reloadTable = async () => {
    if (!className()) return;

    setLoading(true);

    try {
      const runs_result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(eventId()), "query", [
        `SELECT runs.id as run_id, runs.siid as si_id, runs.starttimems as start_time_ms,
                competitors.id as competitor_id, competitors.firstname as first_name, competitors.lastname as last_name, competitors.registration,
                classes.name AS class_name
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                INNER JOIN classes ON competitors.classid = classes.id AND classes.name = '${className()}'
                WHERE runs.stageid = ${currentStage()}
                ORDER BY runs.starttimems ASC`,
      ]);
      const table = createSqlTable(runs_result);

      const transformedRuns: Run[] = [];
      for (let i = 0; i < table.rowCount(); i++) {
        const record = table.recordAt(i);
        try {
          const validatedRun = parse(RunSchema, record);
          transformedRuns.push(validatedRun);
        } catch (error) {
          console.warn(`Skipping invalid row ${i}:`, error);
        }
      }

      setRuns(transformedRuns);
    } catch (error) {
      console.error("RPC call failed:", error);
      showToast({
        title: "Reload table error",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
    setLoading(false);
  };

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Late Entries</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class="flex items-center justify-between">
          <ClassSelector className={className} setClassName={setClassName} eventId={eventId} currentStage={currentStage} />
          <div class="flex gap-2">
            <Button onClick={addEntry}>Add entry</Button>
            <Button variant="outline" onClick={reloadTable} disabled={loading() || !className()}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <EntriesTable
          className={className}
          eventConfig={eventConfig}
          eventId={eventId}
          currentStage={currentStage}
          runs={runs}
          setRuns={setRuns}
          loading={loading}
          setLoading={setLoading}
          onReload={reloadTable}
          onAddEntry={addEntry}
          recchngReceived={props.recchngReceived}
        />
      </div>
    </div>
  );
};

export default Entries;
