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
  onAddEntry: (open: () => void) => void;
  recchngReceived: () => RecChng | null;
}) {
  const { wsClient } = useWsClient();
  const appConfig = useAppConfig();

  // null = dialog closed; run_id === 0 = new entry, run_id > 0 = editing existing
  const [formRun, setFormRun] = createSignal<Run | null>(null);

  const isNew = () => formRun()?.run_id === 0;

  const openNewEntryDialog = () => setFormRun({
    run_id: 0,
    competitor_id: 0,
    class_name: props.className(),
    firstname: undefined,
    lastname: undefined,
    registration: undefined,
    siid: undefined,
    starttimems: undefined,
  });

  // Register the opener with the parent once on mount
  onMount(() => props.onAddEntry(openNewEntryDialog));

  const openRunEditDialog = (id: number) => {
    const run = props.runs().find(r => r.run_id === id);
    if (run) setFormRun(run);
  };

  const closeDialog = () => setFormRun(null);

  const acceptDialog = () => {
    const run = formRun();
    if (!run) return;
    closeDialog();
    if (isNew()) {
      insertRunInDb(run);
    } else {
      updateRunInDb(run);
    }
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) {
      untrack(() => processRecChng(recchng));
    }
  });

  const processRecChng = (recchng: RecChng) => {
    const { table, id, record, op } = recchng;
    if (op === SqlOperation.Update) {
      if (table === "runs") {
        const orig = props.runs().find(r => r.run_id === id);
        if (orig) {
          const updated = { ...orig, ...record };
          props.setRuns(prev => prev.map(r => r.run_id === updated.run_id ? updated : r));
        }
      } else if (table === "competitors") {
        const orig = props.runs().find(r => r.competitor_id === id);
        if (orig) {
          const updated = { ...orig, ...record };
          props.setRuns(prev => prev.map(r => r.competitor_id === id ? updated : r));
        }
      }
    }
  };

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

  const makeParam = (table: string, id: number, record: Record<string, RpcValue>): RpcValue =>
    makeMap({ table, id, record: makeMap(record), issuer: "fanda" });

  const insertRunInDb = async (newRun: Run) => {
    try {
      const sqlPath = appConfig.eventSqlApiPath(props.eventId());

      // Resolve classid
      const classResult = await callRpcMethod(wsClient()!, sqlPath, "query",
        [`SELECT id FROM classes WHERE name = '${props.className()}'`]);
      const classId: number = (classResult as any).rows?.[0]?.[0];
      if (!classId) throw new Error(`Class '${props.className()}' not found`);

      // Insert competitor — server returns new id
      const competitorRecord: Record<string, RpcValue> = {
        ...(newRun.firstname    !== undefined && { firstname:    newRun.firstname }),
        ...(newRun.lastname     !== undefined && { lastname:     newRun.lastname }),
        ...(newRun.registration !== undefined && { registration: newRun.registration }),
        classid: classId,
      };
      const competitorId = await callRpcMethod(wsClient()!, sqlPath, "insert",
        makeMap({ table: "competitors", record: makeMap(competitorRecord), issuer: "fanda" })) as number;
      if (typeof competitorId !== "number") throw new Error("Insert competitor did not return an id");

      // Resolve stageid
      const stageResult = await callRpcMethod(wsClient()!, sqlPath, "query",
        [`SELECT id FROM stages WHERE stageno = ${props.currentStage()}`]);
      const stageId: number = (stageResult as any).rows?.[0]?.[0];
      if (!stageId) throw new Error(`Stage ${props.currentStage()} not found`);

      // Insert run
      const runRecord: Record<string, RpcValue> = {
        competitorid: competitorId,
        stageid: stageId,
        ...(newRun.siid        !== undefined && { siid:        newRun.siid }),
        ...(newRun.starttimems !== undefined && { starttimems: newRun.starttimems }),
      };
      await callRpcMethod(wsClient()!, sqlPath, "insert",
        makeMap({ table: "runs", record: makeMap(runRecord), issuer: "fanda" }));

      showToast({ title: "New entry added" });
      props.onReload();
    } catch (error) {
      showToast({ title: "Add entry error", description: (error as Error).message, variant: "destructive" });
    }
  };

  const updateRunInDb = async (newRun: Run) => {
    const origRun = props.runs().find(r => r.run_id === newRun.run_id);
    if (!origRun) return;
    try {
      const competitorChanges = copyValidFieldsToRpcMap(origRun, newRun, ["firstname", "lastname", "registration"]);
      if (!isRecordEmpty(competitorChanges)) {
        await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId()), "update",
          makeParam('competitors', origRun.competitor_id, competitorChanges));
      }
      const runChanges = copyValidFieldsToRpcMap(origRun, newRun, ["siid", "starttimems"]);
      if (!isRecordEmpty(runChanges)) {
        await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId()), "update",
          makeParam('runs', origRun.run_id, runChanges));
      }
      showToast({ title: "Update run success" });
    } catch (error) {
      showToast({ title: "Update run error", description: (error as Error).message, variant: "destructive" });
    }
  };

  createEffect(() => {
    if (props.className()) props.onReload();
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
        const fullName = [entry.firstname, entry.lastname].filter(n => n?.trim()).join(" ");
        return <span>{fullName || "—"}</span>;
      },
      sortable: true,
      sortFn: (a: Run, b: Run) =>
        [a.firstname, a.lastname].filter(Boolean).join(" ")
          .localeCompare([b.firstname, b.lastname].filter(Boolean).join(" ")),
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
            <DialogTitle>{isNew() ? "New Entry" : "Edit Run"}</DialogTitle>
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
            <Button onClick={acceptDialog}>{isNew() ? "Add Entry" : "Save Changes"}</Button>
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
  const [addEntry, setAddEntry] = createSignal<(() => void) | null>(null);

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
            <Button onClick={() => addEntry()?.()} disabled={!className()}>Add entry</Button>
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
          onAddEntry={(fn) => setAddEntry(() => fn)}
          recchngReceived={props.recchngReceived}
        />
      </div>
    </div>
  );
};

export default Entries;
