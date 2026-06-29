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
import { parse } from "valibot";
import { copyRecordChanges as copyValidFieldsToRpcMap, isRecordEmpty } from "~/lib/utils";
import { RecChng } from "~/schema/rpc-sql-schema";
import { callRpcMethod } from "~/lib/rpc";
import { EventConfig } from "~/routes/OpenedEvent";
import LateEntryDialog, { type LateEntryField, type LateEntryFieldValue } from "~/components/LateEntryDialog";
import {
  RunSchema,
  normalizeRunRecord,
  processRunRecChng,
  type LateEntry,
  type Run,
} from "~/components/Runs";

function RunsTable(props: {
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
  const { user } = useAuth();

  // null = dialog closed; run_id === 0 = new entry, run_id > 0 = editing existing
  const [formLateEntry, setFormLateEntry] = createSignal<Run | undefined>(undefined);

  const openNewEntryDialog = () => setFormLateEntry({
    run_id: 0,
    competitor_id: 0,
    firstname: undefined,
    lastname: undefined,
    registration: undefined,
    siid: undefined,
    starttimems: undefined,
    qxchange_id: undefined,
    qxchange_user_id: undefined,
    qxchange_data: undefined,
  });

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
      untrack(() => processRunRecChng({ recchng, runs: props.runs, setRuns: props.setRuns }));
    }
  });


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

  const columns: TableColumn<Run>[] = [
    {
      key: "class_name",
      header: "Class name",
      cell: (run: Run) => <span>{run.class_name || "—"}</span>,
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

const LateEntries = (props: {
  eventId: number,
  eventConfig: () => EventConfig,
  currentStage: number,
  recchngReceived: () => RecChng | null
}) => {
  const { wsClient, status } = useWsClient();
  const appConfig = useAppConfig();
  const { user } = useAuth();

  const [runs, setRuns] = createSignal<Run[]>([]);
  const [loading, setLoading] = createSignal(false);

  const eventId = () => props.eventId;
  const currentStage = () => props.currentStage;

  const reloadTable = async () => {
    const userId = user()?.email;
    if (status() !== "Connected" || !userId) return;
    setLoading(true);
    try {
      const result = await callRpcMethod(wsClient()!, appConfig.eventSqlApiPath(props.eventId), "query", [
        `SELECT runs.id as run_id, runs.siid, runs.starttimems,
                competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration,
                classes.name AS class_name,
                qxchanges.id as qxchange_id, qxchanges.data as qxchange_data, qxchanges.user_id as qxchange_user_id
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                LEFT JOIN classes ON competitors.classid = classes.id
                INNER JOIN qxchanges ON runs.id = qxchanges.foreign_id AND qxchanges.data_type = 'LateEntry' AND qxchanges.user_id = '${userId}'
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

  onMount(() => reloadTable());

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Late entries</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class="flex items-center justify-end">
          <div class="flex gap-2">
            <Button variant="outline" onClick={reloadTable} disabled={loading() || status() !== "Connected"}>
              {loading() ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </div>
        <RunsTable
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

export default LateEntries;
