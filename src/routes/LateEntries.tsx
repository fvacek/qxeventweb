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
import { useWsClient } from "~/context/WsClient";
import { showToast, Toast } from "~/components/ui/toast";
import { useStage } from "~/context/StageContext";
import { useAppConfig } from "~/context/AppConfig";
import { useEventConfig } from "~/context/EventConfig";
import { useRecChng } from "~/context/RecChngContext";
import { createSqlTable } from "~/lib/SqlTable";
import { object, number, string, nullable, parse, type InferOutput, undefinedable, safeParse } from "valibot";
import { copyRecordChanges as copyValidFieldsToRpcMap, isRecordEmpty, toRpcValue } from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";

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

function LateEntriesTable(props: { className: () => string }) {
  const { wsClient, status } = useWsClient();
  const { currentStage } = useStage();
  const appConfig = useAppConfig();
  const eventConfig = useEventConfig();
  const { recchngReceived } = useRecChng();

  const [runs, setRuns] = createSignal<Run[]>([]);

  const [loading, setLoading] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<keyof Run>("lastName");
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc");

  // Edit dialog state
  const [runEditDialogOpen, setRunEditDialogOpen] = createSignal(false);
  let editingRunId: number | null = null;

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
    if (op === SqlOperation.Update) {
      const originalRun = (table === "runs")
        ? runs().find(run => run.runId === id)
        : (table === "competitors")
        ? runs().find(run => run.competitorId === id)
        : undefined;
      if (originalRun !== undefined) {
        const updatedRun = { ...originalRun, ...record };
        setRuns(prev => prev.map(run => run.runId === updatedRun.runId ? updatedRun : run));
      }
    } else if (op === SqlOperation.Insert) {
    } else if (op === SqlOperation.Delete) {
    }
  };

  // Reactive sorted data
  const sortedEntries = createMemo(() => {
    const data = [...runs()];
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
    const newEntry: Run = {
        runId: Math.max(...runs().map((u) => u.runId)) + 1,
        firstName: `Fanda${runs().length + 1}`,
        lastName: `Vacek${runs().length + 1}`,
        className: "H55",
        startTimeMs: undefined,
        registration: "CHT7001",
        siId: undefined,
        competitorId: 1234
    };
    setRuns([...runs(), newEntry]);
  };

  let firstNameRef!: HTMLInputElement;
  let lastNameRef!: HTMLInputElement;
  let registrationRef!: HTMLInputElement;
  let siIdRef!: HTMLInputElement;
  let startTimeRef!: HTMLInputElement;

  const openRunEditDialog = (id: number) => {
    editingRunId = null;
    const runToEdit = runs().find(run => run.runId === id);
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

    const originalRun = runs().find(run => run.runId === editingRunId)!;

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
    setRuns(runs().filter((user) => user.runId !== id));
  };

  const updateRunInDb = async (newRun: Run) => {
    try {
      const origRun = runs().find(run => newRun.runId === run.runId)!;

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
        await callRpcMethod(wsClient(), appConfig.eventSqlPath(), "update", createParam('competitors', origRun.competitorId, competitors_record));
      }
      const runs_record = copyValidFieldsToRpcMap(origRun, newRun, ["siId", "startTimeMs"]);
      if (!isRecordEmpty(runs_record)) {
        await callRpcMethod(wsClient(), appConfig.eventSqlPath(), "update", createParam('runs', origRun.runId, runs_record));
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

  const reloadTable = async () => {
    setLoading(true);

    try {
      const runs_result = await callRpcMethod(wsClient(), appConfig.eventSqlPath(), "query", [
        `SELECT runs.id as run_id, runs.siid as si_id, runs.starttimems as start_time_ms,
                competitors.id as competitor_id, competitors.firstname as first_name, competitors.lastname as last_name, competitors.registration,
                classes.name AS class_name
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                INNER JOIN classes ON competitors.classid = classes.id AND classes.name = '${props.className()}'
                WHERE runs.stageid = ${currentStage()}`,
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

    // Update data with fresh timestamps and randomized data
    const refreshedEntries = runs().map((entry) => ({
      ...entry,
    }));

    setRuns(refreshedEntries);
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
  const columns: TableColumn<Run>[] = [
    {
      key: "startTimeMs",
      header: "Start Time",
      cell: (run: Run) => {
        if (run.startTimeMs === undefined) {
          return <span>—</span>;
        }
        const stageStart = eventConfig.eventConfig.stages[currentStage()].stageStart;
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
      header: "Registration",
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
          data={runs()}
          columns={columns}
          loading={loading()}
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
}) {
  const { wsClient, status } = useWsClient();
  const { currentStage } = useStage();
  const appConfig = useAppConfig();
  const { eventOpen } = useEventConfig();

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
        appConfig.eventSqlPath(),
        "query",
        [
          `SELECT classes.name AS class_name FROM classes, classdefs
                  WHERE classdefs.classid = classes.id AND classdefs.stageid = ${currentStage()}
                  ORDER BY classes.name`,
        ],
      );
      const classNames: string[] = (classes_result as any).rows.map(
        (row: any[], rowIndex: number) => row[0],
      );
      setClasses(classNames);
      props.setClassName(classNames[0]);
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
    if (eventOpen() === true) {
      loadClasses();
    }
  });

  return (
    <div class="flex flex-wrap gap-2">
      <For each={classes()}>
        {(cls) => (
          <Button
            variant={props.className() === cls ? "default" : "outline"}
            onClick={() => props.setClassName(cls)}
          >
            {cls}
          </Button>
        )}
      </For>
    </div>
  );
}

const LateEntries = () => {
  const [className, setClassName] = createSignal("");

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Late Entries</h1>
      <div class="w-full max-w-7xl space-y-4">
        <ClassSelector className={className} setClassName={setClassName} />
        <LateEntriesTable className={className} />
      </div>
    </div>
  );
};

export default LateEntries;
