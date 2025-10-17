import { RpcValue, WsClient } from "libshv-js";
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
import { object, number, string, nullable, parse, type InferOutput, undefinedable } from "valibot";

// Valibot schema for Run validation
const RunSchema = object({
  runId: number(),
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

  const [runs, setRuns] = createSignal<Run[]>([]);

  const [loading, setLoading] = createSignal(false);
  const [sortBy, setSortBy] = createSignal<keyof Run>("lastName");
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc");

  // Edit dialog state
  const [editDialogOpen, setEditDialogOpen] = createSignal(false);
  let editingRunId: number | null = null;

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
      // Just seconds
      const sec = timeSegments[0];
      return [0, 0, sec];
    } else if (timeSegments.length === 2) {
      // Format: MM:SS
      const [minutes, secs] = timeSegments;
      return [0, minutes, secs];
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
      return "—";
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
          onClick={() => editRun(run.runId)}
        >
          Edit
        </Button>
      ),
      sortable: false,
      width: "100px",
    },
  ];

  const addEntry = () => {
    const newEntry: Run = {
        runId: Math.max(...runs().map((u) => u.runId)) + 1,
        firstName: `Fanda${runs().length + 1}`,
        lastName: `Vacek${runs().length + 1}`,
        className: "H55",
        startTimeMs: undefined,
        registration: "CHT7001",
        siId: undefined
    };
    setRuns([...runs(), newEntry]);
  };

  const editRun = (id: number) => {
    const runToEdit = runs().find(run => run.runId === id);
    if (runToEdit) {
      editingRunId = id;
      setEditDialogOpen(true);
      
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

  let firstNameRef!: HTMLInputElement;
  let lastNameRef!: HTMLInputElement;
  let registrationRef!: HTMLInputElement;
  let siIdRef!: HTMLInputElement;
  let startTimeRef!: HTMLInputElement;

  const handleSaveRunEdit = () => {
    if (editingRunId === null) return;

    // Collect form values from refs and create updated run
    setRuns(runs().map(run => {
      if (run.runId === editingRunId) {
        return {
          ...run,
          firstName: firstNameRef.value || undefined,
          lastName: lastNameRef.value || undefined,
          registration: registrationRef.value || undefined,
          siId: siIdRef.value ? parseInt(siIdRef.value) : undefined,
          startTimeMs: startTimeRef.value ? parseStartTime(startTimeRef.value) : undefined,
        };
      }
      return run;
    }));

    setEditDialogOpen(false);
    editingRunId = null;
    showToast({
      title: "Success",
      description: "Run updated successfully",
      variant: "default",
    });
  };

  const handleCancelRunEdit = () => {
    setEditDialogOpen(false);
    editingRunId = null;
  };

  const deleteEntry = (id: number) => {
    setRuns(runs().filter((user) => user.runId !== id));
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

  const reloadTable = async () => {
    setLoading(true);

    try {
      const runs_result = await callRpcMethod(appConfig.eventPath, "select", [
        `SELECT runs.id as run_id, runs.siid as si_id, runs.starttimems as start_time_ms,
                competitors.firstname as first_name, competitors.lastname as last_name, competitors.registration,
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
      <Dialog open={editDialogOpen()} onOpenChange={setEditDialogOpen}>
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
              <TextFieldLabel>Start Time (HH:MM:SS)</TextFieldLabel>
              <TextFieldInput
                ref={startTimeRef}
                type="text"
              />
            </TextField>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCancelRunEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveRunEdit}>
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
        appConfig.eventPath,
        "select",
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

  // Watch for WebSocket status changes and load classes when connected
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
