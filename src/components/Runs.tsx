import { makeMap, RpcValue } from "libshv-js";
import { createSignal, createEffect, onMount, untrack } from "solid-js";

import { Button } from "~/components/ui/button";
import { Table, TableColumn } from "~/components/ui/table";
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
import LateEntryDialog, { type LateEntryField, type LateEntryFieldValue } from "~/components/LateEntryDialog";

export const LateEntryRecordSchema = object({
  class_name: optional(string()),
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
});
// type LateEntryRecord = InferOutput<typeof LateEntryRecordSchema>;

const LateEntrySchema = object({
  run_id: number(),
  record: LateEntryRecordSchema,
});
type LateEntry = InferOutput<typeof LateEntrySchema>;

const QxChangeDataSchema = object({
  LateEntry: optional(LateEntrySchema),
});
type QxChangeData = InferOutput<typeof QxChangeDataSchema>;

const RunSchema = object({
  run_id: number(),
  competitor_id: number(),
  class_name: optional(string()),
  firstname: optional(string()),
  lastname: optional(string()),
  registration: optional(string()),
  siid: optional(number()),
  starttimems: optional(number()),
  qxchange_id: optional(number()),
  qxchange_user_id: optional(string()),
  qxchange_data: optional(LateEntrySchema),
});

type Run = InferOutput<typeof RunSchema>;

function normalizeRunRecord(record: Record<string, unknown>): Record<string, unknown> {
  const rawChange = record.qxchange_data;
  if (typeof rawChange !== "string") return record;

  const parsed = JSON.parse(rawChange);
  const lateEntry = parsed?.LateEntry;
  if (!lateEntry) return record;

  const { run_id, record: lateEntryRecord = {} } = lateEntry;

  return {
    ...record,
    qxchange_data: { run_id, record: lateEntryRecord },
  };
}

function RunsTable(props: {
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
  const { user } = useAuth();

  // null = dialog closed; run_id === 0 = new entry, run_id > 0 = editing existing
  const [formLateEntry, setFormLateEntry] = createSignal<Run | undefined>(undefined);

  const openNewEntryDialog = () => setFormLateEntry({
    run_id: 0,
    competitor_id: 0,
    class_name: props.className(),
    firstname: undefined,
    lastname: undefined,
    registration: undefined,
    siid: undefined,
    starttimems: undefined,
    qxchange_id: undefined,
    qxchange_user_id: undefined,
    qxchange_data: undefined,
  });

  // Register the opener with the parent once on mount
  onMount(() => props.onAddEntry(openNewEntryDialog));

  const openLateEntryEditDialog = (id: number) => {
    const run = props.runs().find(r => r.run_id === id);
    if (run) setFormLateEntry(run);
  };

  const closeDialog = () => setFormLateEntry(undefined);

  const isFieldFromLateEntry = (field: LateEntryField) =>
    formLateEntry()?.qxchange_data?.record?.[field] !== undefined;

  const formField = (field: LateEntryField): LateEntryFieldValue => {
    const run = formLateEntry();
    const newValue = run?.qxchange_data?.record?.[field];
    return newValue !== undefined ? newValue : run?.[field];
  };

  const setFormField = (field: LateEntryField, value: LateEntryFieldValue) => {
    setFormLateEntry(prev => {
      if (!prev) return undefined;

      if (prev.qxchange_data) {
        return {
          ...prev,
          qxchange_data: {
            ...prev.qxchange_data,
            record: {
              ...prev.qxchange_data.record,
              [field]: value === prev[field] ? undefined : value,
            },
          },
        };
      }

      return {
        ...prev,
        qxchange_data: {
          run_id: prev.run_id,
          record: { [field]: value, },
        },
      };
    });
  };

  const acceptDialog = () => {
    const run = formLateEntry();
    if (!run) return;
    const lateEntry = run?.qxchange_data;
    if (lateEntry) {
      updateLateEntry(lateEntry);
    }
    closeDialog();
  };

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (recchng) {
      untrack(() => processRecChng(recchng));
    }
  });

  const processRecChng = (recchng: RecChng, verbose = false) => {
    const { table, id, record, op } = recchng;
    if (verbose) console.log("processRecChng: received change", { table, id, record, op });

    const parseQxChangeData = (rec: typeof record): QxChangeData => {
      if (!rec || typeof rec.data !== "string") throw new Error("Invalid qxchange record: missing or non-string data field");
      return parse(QxChangeDataSchema, JSON.parse(rec.data));
    };

    if (op === SqlOperation.Insert) {
      // A new qxchange record was inserted; update the matching run with the new late entry data
      if (verbose) console.log(`processRecChng: [Insert] Parsing qxchange data for new record with id=${id}`);
      let lateEntry = parseQxChangeData(record).LateEntry;
      if (typeof record!.user_id === "string" && lateEntry) {
        if (verbose) console.log(`processRecChng: [Insert] Attaching late entry to run_id=${lateEntry.run_id}, owned by user_id=${record!.user_id}`);
        props.setRuns(prev =>
          prev.map(r =>
            r.run_id === lateEntry.run_id
              ? { ...r, qxchange_id: id, qxchange_user_id: record!.user_id as string, qxchange_data: lateEntry }
              : r
          )
        );
      } else {
        if (verbose) console.warn(`processRecChng: [Insert] Skipping — lateEntry or user_id missing`, { lateEntry, user_id: record?.user_id });
      }
    } else if (op === SqlOperation.Update) {
      if (table === "runs") {
        // A run record was updated directly; merge the changed fields into the matching run
        if (verbose) console.log(`processRecChng: [Update] Updating run with run_id=${id}`);
        const orig = props.runs().find(r => r.run_id === id);
        if (orig) {
          if (verbose) console.log(`processRecChng: [Update] Found run, applying record changes`, record);
          props.setRuns(prev => prev.map(r => r.run_id === id ? { ...orig, ...record } : r));
        } else {
          if (verbose) console.warn(`processRecChng: [Update] Run with run_id=${id} not found in local state`);
        }
      } else if (table === "competitors") {
        // A competitor record was updated; merge the changed fields into all runs belonging to that competitor
        if (verbose) console.log(`processRecChng: [Update] Updating competitor with competitor_id=${id}`);
        const orig = props.runs().find(r => r.competitor_id === id);
        if (orig) {
          if (verbose) console.log(`processRecChng: [Update] Found competitor, applying record changes`, record);
          props.setRuns(prev => prev.map(r => r.competitor_id === id ? { ...orig, ...record } : r));
        } else {
          if (verbose) console.warn(`processRecChng: [Update] Competitor with competitor_id=${id} not found in local state`);
        }
      } else if (table === "qxchanges") {
        // A qxchange record was updated; replace the late entry data on the matching run
        if (verbose) console.log(`processRecChng: [Update] Updating qxchange with qxchange_id=${id}`);
        let lateEntry = parseQxChangeData(record).LateEntry;
        if (lateEntry) {
          const run = props.runs().find(r => r.qxchange_id === id);
          if (run) {
            if (verbose) console.log(`processRecChng: [Update] Found run for qxchange_id=${id}, updating qxchange_data`, lateEntry);
            props.setRuns(prev => prev.map(r => r.qxchange_id === id ? { ...run, qxchange_data: lateEntry } : r));
          } else {
            if (verbose) console.log("Cannot process RecChng ===============>", table, id, record, op);
          }
        } else {
          if (verbose) console.warn(`processRecChng: [Update] No LateEntry found in qxchange data for qxchange_id=${id}`);
        }
      }
    } else if (op === SqlOperation.Delete) {
      if (table === "qxchanges") {
        // A qxchange record was deleted; clear all late entry fields from the matching run
        if (verbose) console.log(`processRecChng: [Delete] Removing qxchange data from run with qxchange_id=${id}`);
        props.setRuns(prev => prev.map(r =>
          r.qxchange_id === id ? { ...r, qxchange_id: undefined, qxchange_user_id: undefined, qxchange_data: undefined } : r
        ));
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

  const updateLateEntry = async (lateEntry: LateEntry) => {
    const origRun = props.runs().find(r => r.run_id === lateEntry.run_id);
    if (!origRun) return;

    const changes = copyValidFieldsToRpcMap(origRun, lateEntry.record);

    try {
      const params = makeMap({ run_id: lateEntry.run_id, record: makeMap(changes) });
      await callRpcMethod(wsClient()!, appConfig.eventApiPath(props.eventId()), "updateLateEntry", params);
      showToast({ title: "Update late entry success" });
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
        const fullName = [entry.lastname, entry.firstname].filter(n => n?.trim()).join(" ");
        const newFirstname = entry.qxchange_data?.record?.firstname;
        const newLastname = entry.qxchange_data?.record?.lastname;
        if (typeof newFirstname === "string" || typeof newLastname === "string") {
          const newFullName = [
            typeof newLastname === "string" ? newLastname : entry.lastname,
            typeof newFirstname === "string" ? newFirstname : entry.firstname,
          ].filter(n => n?.trim()).join(" ");
          return (
            <div class="flex flex-col leading-tight">
              <span class="line-through text-muted-foreground">{fullName || "—"}</span>
              <span>{newFullName || "—"}</span>
            </div>
          );
        }
        return <span>{fullName || "—"}</span>;
      },
      sortable: true,
      sortFn: (a: Run, b: Run) =>
        [a.lastname, a.firstname].filter(Boolean).join(" ")
          .localeCompare([b.lastname, b.firstname].filter(Boolean).join(" ")),
      width: "200px",
    },
    {
      key: "registration",
      header: "Reg",
      cell: (run: Run) => {
        const registration = run.registration;
        const newRegistration = run.qxchange_data?.record?.registration;
        if (typeof newRegistration === "string") {
          return (
            <div class="flex flex-col leading-tight">
              <span class="line-through text-muted-foreground">{registration || "—"}</span>
              <span>{newRegistration}</span>
            </div>
          );
        }
        return <span>{registration || "—"}</span>;
      },
      sortable: true,
      width: "100px",
    },
    {
      key: "siid",
      header: "SI",
      cell: (run: Run) => {
        const siid = run.siid;
        const newSiid = run.qxchange_data?.record?.siid;
        if (typeof newSiid === "number") {
          return (
            <div class="flex flex-col leading-tight">
              <span class="line-through text-muted-foreground">{siid !== undefined ? siid.toString() : "—"}</span>
              <span>{newSiid.toString()}</span>
            </div>
          );
        }
        return <span>{siid !== undefined ? siid.toString() : "—"}</span>;
      },
      sortable: false,
      width: "100px",
    },
    {
      key: "qxchange_user_id",
      header: "Owner",
      sortable: true,
      width: "100px",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (run: Run) => (
        <Button size="sm" variant="outline"
          onClick={() => openLateEntryEditDialog(run.run_id)}
          disabled={!user()}
        >
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

      <LateEntryDialog
        open={!!formLateEntry()}
        fieldValue={formField}
        isFieldChanged={isFieldFromLateEntry}
        setFieldValue={setFormField}
        onClose={closeDialog}
        onAccept={acceptDialog}
      />
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

const Runs = (props: {
  eventId: number,
  eventConfig: () => EventConfig,
  currentStage: number,
  recchngReceived: () => RecChng | null
}) => {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();

  const [className, setClassName] = createSignal("");
  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [addEntry, setAddEntry] = createSignal<(() => void) | null>(null);

  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;

  const reloadTable = async () => {
    if (!className() || status() !== "Connected") return;
    setLoading(true);
    try {
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [
        `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                classes.name AS class_name,
                qxchanges.id as qxchange_id, qxchanges.data as qxchange_data, qxchanges.user_id as qxchange_user_id
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                INNER JOIN classes ON competitors.classid = classes.id AND classes.name = '${className()}'
                LEFT JOIN qxchanges ON runs.id = qxchanges.foreign_id AND qxchanges.data_type = 'LateEntry'
                WHERE runs.stageid = ${props.currentStage}
                ORDER BY runs.starttimems ASC`,
      ]);
      const table = createSqlTable(result);
      const transformedRuns: Run[] = [];
      for (let i = 0; i < table.rowCount(); i++) {
        try {
          transformedRuns.push(parse(RunSchema, normalizeRunRecord(table.recordAt(i))));
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
      <h1 class="mt-7 mb-7 text-3xl font-bold">Runs</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class="flex items-center justify-between">
          <ClassSelector className={className} setClassName={setClassName} eventId={eventId} currentStage={currentStage} />
          <div class="flex gap-2">
            <Button onClick={() => addEntry()?.()} disabled={!className() || status() !== "Connected"}>Add entry</Button>
            <Button variant="outline" onClick={reloadTable} disabled={loading() || !className() || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <RunsTable
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

export default Runs;
