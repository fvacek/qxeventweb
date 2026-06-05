import { makeMap, RpcValue } from "libshv-js";
import { createSignal, createEffect, untrack } from "solid-js";

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
import { showToast } from "~/components/ui/toast";
import { useAppConfig } from "~/context/AppConfig";
import { createSqlTable } from "~/lib/SqlTable";
import { object, number, string, parse, type InferOutput, undefinedable } from "valibot";
import { copyRecordChanges as copyValidFieldsToRpcMap, isRecordEmpty } from "~/lib/utils";
import { RecChng, SqlOperation } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { EventConfig } from "~/routes/Event";


// Valibot schema for Run validation
const RunSchema = object({
  run_id: number(),
  competitor_id: number(),
  class_name: undefinedable(string()),
  firstname: undefinedable(string()),
  lastname: undefinedable(string()),
  registration: undefinedable(string()),
  siid: undefinedable(number()),
  starttimems: undefinedable(number()),
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
  onReload: () => void;
  recchngReceived: () => RecChng | null;
}) {
  const { wsClient } = useWsClient();
  const appConfig = useAppConfig();

  // Edit dialog state — null means closed
  const [formRun, setFormRun] = createSignal<Run | null>(null);

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) {
      untrack(() => {
        processRecChng(recchng);
      });
    }
  });

  const processRecChng = (recchng: RecChng) => {
    const { table, id, record, op } = recchng;
    if (op === SqlOperation.Update) {
      if (table === "runs") {
        const orig = props.runs().find((run: Run) => run.run_id === id);
        if (orig) {
          const updated = { ...orig, ...record };
          props.setRuns((prev: Run[]) => prev.map(r => r.run_id === updated.run_id ? updated : r));
        }
      } else if (table === "competitors") {
        const orig = props.runs().find((run: Run) => run.competitor_id === id);
        if (orig) {
          const updated = { ...orig, ...record };
          props.setRuns((prev: Run[]) => prev.map(r => r.competitor_id === id ? updated : r));
        }
      }
    }
  };

  // Returns undefined instead of throwing so cell renderers degrade gracefully
  function stageStart(): Date | undefined {
    return props.eventConfig().stages[props.currentStage() - 1]?.stageStart;
  }

  function parseHH_MM_SS(hhmmss: string): [number, number, number] | undefined {
    const segments = hhmmss.split(':').map(Number);
    if (segments.some(isNaN)) return undefined;
    if (segments.length === 1) return [0, segments[0], 0];
    if (segments.length === 2) return [segments[0], segments[1], 0];
    if (segments.length === 3) return [segments[0], segments[1], segments[2]];
    return undefined;
  }

  function parseStartTime(s: string): number | undefined {
    const hms = parseHH_MM_SS(s);
    if (!hms) return undefined;
    const [hours, minutes, secs] = hms;
    // Fix #4: was stages[currentStage()] — off by one since stages are 0-indexed
    const start = props.eventConfig().stages[props.currentStage() - 1]?.stageStart;
    if (!start) return undefined;
    const runStart = new Date(start.getTime());
    runStart.setHours(hours, minutes, secs, 0);
    return runStart.getTime() - start.getTime();
  }

  function formatStartTime(msec: number | undefined, start: Date | undefined): string {
    if (msec === undefined || !start) return "";
    const date = new Date(start.getTime() + msec);
    const hh = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  const openRunEditDialog = (id: number) => {
    const run = props.runs().find(r => r.run_id === id);
    if (run) setFormRun(run);
  };

  const closeDialog = () => setFormRun(null);

  const acceptRunEditDialog = () => {
    const run = formRun();
    if (!run) return;
    closeDialog();
    updateRunInDb(run);
  };

  const updateRunInDb = async (newRun: Run) => {
    const origRun = props.runs().find(r => r.run_id === newRun.run_id);
    if (!origRun) return;
    try {
      const createParam = (table: string, id: number, record: Record<string, RpcValue>): RpcValue =>
        makeMap({ table, id, record: makeMap(record), issuer: "fanda" });

      const competitorChanges = copyValidFieldsToRpcMap(origRun, newRun, ["firstname", "lastname", "registration"]);
      if (!isRecordEmpty(competitorChanges)) {
        await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId()), "update",
          createParam('competitors', origRun.competitor_id, competitorChanges));
      }
      const runChanges = copyValidFieldsToRpcMap(origRun, newRun, ["siid", "starttimems"]);
      if (!isRecordEmpty(runChanges)) {
        await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId()), "update",
          createParam('runs', origRun.run_id, runChanges));
      }
      showToast({ title: "Update run success" });
    } catch (error) {
      showToast({ title: "Update run error", description: (error as Error).message, variant: "destructive" });
    }
  };

  createEffect(() => {
    if (props.className()) {
      props.onReload();
    }
  });

  const columns: TableColumn<Run>[] = [
    {
      key: "starttimems",
      header: "Start Time",
      cell: (run: Run) => <span>{formatStartTime(run.starttimems, stageStart()) || "—"}</span>,
      sortable: true,
      width: "120px",
    },
    {
      key: "name",
      header: "Name",
      cell: (entry: Run) => {
        const fullName = [entry.firstname, entry.lastname]
          .filter((n) => n?.trim())
          .join(" ");
        return <span>{fullName || "—"}</span>;
      },
      sortable: true,
      sortFn: (a: Run, b: Run) => {
        const aName = [a.firstname, a.lastname].filter(Boolean).join(" ");
        const bName = [b.firstname, b.lastname].filter(Boolean).join(" ");
        return aName.localeCompare(bName);
      },
      width: "200px",
    },
    {
      key: "registration",
      header: "Reg",
      sortable: true,
      width: "100px",
    },
    {
      key: "siid",
      header: "SI",
      sortable: true,
      width: "100px",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (run: Run) => (
        <Button size="sm" variant="outline" onClick={() => openRunEditDialog(run.run_id)}>
          Edit
        </Button>
      ),
      sortable: false,
      width: "80px",
    },
  ];

  return (
    <div>
      <div class="rounded-md border">
        <Table
          data={props.runs()}
          columns={columns}
          loading={props.loading()}
          emptyMessage="No entries found"
          variant="striped"
          sortable={true}
          globalFilter={true}
        />
      </div>

      <Dialog open={!!formRun()} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent class="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Run</DialogTitle>
          </DialogHeader>

          <div class="space-y-4">
            <TextField>
              <TextFieldLabel>First Name</TextFieldLabel>
              <TextFieldInput
                value={formRun()?.firstname || ""}
                type="text"
                onInput={(e) => setFormRun(prev => prev ? { ...prev, firstname: e.currentTarget.value || undefined } : null)}
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Last Name</TextFieldLabel>
              <TextFieldInput
                value={formRun()?.lastname || ""}
                type="text"
                onInput={(e) => setFormRun(prev => prev ? { ...prev, lastname: e.currentTarget.value || undefined } : null)}
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Registration</TextFieldLabel>
              <TextFieldInput
                value={formRun()?.registration || ""}
                type="text"
                onInput={(e) => setFormRun(prev => prev ? { ...prev, registration: e.currentTarget.value || undefined } : null)}
              />
            </TextField>

            <TextField>
              <TextFieldLabel>SI ID</TextFieldLabel>
              <TextFieldInput
                value={formRun()?.siid?.toString() || ""}
                type="number"
                onInput={(e) => setFormRun(prev => prev ? { ...prev, siid: e.currentTarget.value ? parseInt(e.currentTarget.value) : undefined } : null)}
              />
            </TextField>

            <TextField>
              <TextFieldLabel>Start Time</TextFieldLabel>
              <TextFieldInput
                value={formatStartTime(formRun()?.starttimems, stageStart())}
                type="text"
                placeholder="HH:MM"
                onInput={(e) => setFormRun(prev => prev ? { ...prev, starttimems: parseStartTime(e.currentTarget.value) } : null)}
              />
            </TextField>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={acceptRunEditDialog}>Save Changes</Button>
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
  const [classes, setClasses] = createSignal<string[]>([]);

  async function loadClasses() {
    try {
      const result = await callRpcMethod(
        wsClient()!,
        appConfig.eventSqlApiPath(props.eventId()),
        "query",
        [`SELECT classes.name AS class_name FROM classes, classdefs
          WHERE classdefs.classid = classes.id AND classdefs.stageid = ${props.currentStage()}
          ORDER BY classes.name`],
      );
      const classNames: string[] = (result as any).rows.map((row: any[]) => row[0]);
      setClasses(classNames);
      if (classNames.length > 0) props.setClassName(classNames[0]);
    } catch (error) {
      showToast({ title: "Load classes error", description: (error as Error).message, variant: "destructive" });
    }
  }

  createEffect(() => {
    if (status() === "Connected") loadClasses();
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
  const { wsClient } = useWsClient();
  const appConfig = useAppConfig();

  const [className, setClassName] = createSignal("");
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);

  // Wrap static props as accessors so child components get stable getter signatures
  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;

  const reloadTable = async () => {
    if (!className()) return;
    setLoading(true);
    try {
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [
        `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                classes.name AS class_name
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                INNER JOIN classes ON competitors.classid = classes.id AND classes.name = '${className()}'
                WHERE runs.stageid = ${props.currentStage}
                ORDER BY runs.starttimems ASC`,
      ]);
      const table = createSqlTable(result);
      const transformedRuns: Run[] = [];
      for (let i = 0; i < table.rowCount(); i++) {
        try {
          transformedRuns.push(parse(RunSchema, table.recordAt(i)));
        } catch (error) {
          console.warn(`Skipping invalid row ${i}:`, error);
        }
      }
      setRuns(transformedRuns);
    } catch (error) {
      showToast({ title: "Reload table error", description: (error as Error).message, variant: "destructive" });
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
            <Button variant="outline" onClick={reloadTable} disabled={loading() || !className()}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <EntriesTable
          className={className}
          eventConfig={props.eventConfig}
          eventId={eventId}
          currentStage={currentStage}
          runs={runs}
          setRuns={setRuns}
          loading={loading}
          onReload={reloadTable}
          recchngReceived={props.recchngReceived}
        />
      </div>
    </div>
  );
};

export default Entries;
