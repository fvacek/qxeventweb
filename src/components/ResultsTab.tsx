import { createEffect, createSignal } from "solid-js";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
import { createSqlTable } from "~/lib/SqlTable";
import { callRpcMethod } from "~/lib/rpc";
import { FlexDropdown } from "~/components/ui/flexdropdown";
import { Table, type TableColumn } from "~/components/ui/table";
import type { EventConfig } from "~/routes/OpenedEvent";

type ResultRow = {
  id: number;
  timems: number;
  disqualified: boolean;
  competitor_id: number;
  firstname?: string;
  lastname?: string;
  registration?: string;
};

function sqlQuotedString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function fullName(lastname?: string, firstname?: string): string {
  return [lastname, firstname].filter(n => n?.trim()).join(" ");
}

function formatResultTime(timems: number): string {
  const totalSeconds = Math.floor(timems / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = timems % 1000;
  return `${minutes}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
}

function toBoolean(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

export default function ResultsTab(props: {
  eventId: number;
  eventConfig: () => EventConfig;
}) {
  const appConfig = useAppConfig();
  const { wsClient, status } = useWsClient();

  const [className, setClassName] = createSignal("");
  const [classOptions, setClassOptions] = createSignal<string[]>([]);
  const [results, setResults] = createSignal<ResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = createSignal(false);
  const [resultsError, setResultsError] = createSignal("");

  const currentStage = () => props.eventConfig().currentStage;

  const resultColumns: TableColumn<ResultRow>[] = [
    {
      key: "id",
      header: "Run",
      sortable: true,
      width: "72px",
    },
    {
      key: "name",
      header: "Name",
      cell: (row) => fullName(row.lastname, row.firstname),
      sortable: true,
      sortFn: (a, b) => fullName(a.lastname, a.firstname).localeCompare(fullName(b.lastname, b.firstname)),
    },
    {
      key: "registration",
      header: "Reg",
      sortable: true,
    },
    {
      key: "timems",
      header: "Time",
      cell: (row) => formatResultTime(row.timems),
      sortable: true,
      align: "right",
    },
    {
      key: "disqualified",
      header: "DSQ",
      cell: (row) => row.disqualified ? "DSQ" : "",
      sortable: true,
      width: "64px",
    },
  ];

  const loadClasses = async () => {
    try {
      const result = await callRpcMethod(wsClient(), appConfig.eventSqlApiPath(props.eventId), "query", [
        `SELECT classes.name
          FROM classes, classdefs
          WHERE classdefs.classid = classes.id AND classdefs.stageid = ${currentStage()}
          ORDER BY classes.name`,
      ]);
      const table = createSqlTable(result);
      const options = Array.from({ length: table.rowCount() }, (_, i) => String(table.get(i, "name")));
      setClassOptions(options);
      if (options.length === 0) {
        setClassName("");
        setResults([]);
      } else if (!options.includes(className())) {
        setClassName(options[0]);
      }
    } catch (error) {
      setResultsError(`Load classes error: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  };

  const loadResults = async (selectedClass: string) => {
    setResultsLoading(true);
    setResultsError("");
    try {
      const result = await callRpcMethod(wsClient(), appConfig.eventSqlApiPath(props.eventId), "query", [
        `SELECT runs.id, runs.timems, runs.disqualified,
            competitors.id as competitor_id, competitors.firstname, competitors.lastname, competitors.registration
          FROM runs
          INNER JOIN competitors ON runs.competitorid = competitors.id
          INNER JOIN classes ON competitors.classid = classes.id AND classes.name = ${sqlQuotedString(selectedClass)}
          WHERE runs.stageid = ${currentStage()}
            AND runs.isRunning = true AND runs.timems > 0
          ORDER BY runs.disqualified, runs.timems ASC`,
      ]);
      const table = createSqlTable(result);
      const rows: ResultRow[] = Array.from({ length: table.rowCount() }, (_, i) => ({
        id: Number(table.get(i, "id")),
        timems: Number(table.get(i, "timems")),
        disqualified: toBoolean(table.get(i, "disqualified")),
        competitor_id: Number(table.get(i, "competitor_id")),
        firstname: table.get(i, "firstname")?.toString(),
        lastname: table.get(i, "lastname")?.toString(),
        registration: table.get(i, "registration")?.toString(),
      }));
      setResults(rows);
    } catch (error) {
      setResultsError(`Load results error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setResultsLoading(false);
    }
  };

  createEffect(() => {
    if (status() !== "Connected" || props.eventId <= 0) return;
    currentStage();
    loadClasses();
  });

  createEffect(() => {
    if (status() !== "Connected") return;
    const selectedClass = className();
    if (!selectedClass) return;
    currentStage();
    loadResults(selectedClass);
  });

  return (
    <div class="space-y-4">
      <div class="w-full max-w-md">
        {classOptions().length > 0 ? (
          <FlexDropdown
            value={className()}
            options={classOptions()}
            onSelect={setClassName}
            variant="default"
            fullWidth={true}
          />
        ) : (
          <div class="text-muted-foreground">No classes found</div>
        )}
      </div>

      {resultsError() && (
        <div class="text-red-600 p-2 border border-red-300 rounded bg-red-50">
          {resultsError()}
        </div>
      )}

      <div class="rounded-md table-border">
        <Table
          data={results()}
          columns={resultColumns}
          loading={resultsLoading()}
          emptyMessage="No results found"
          variant="striped"
          sortable={true}
          globalFilter={true}
        />
      </div>
    </div>
  );
}
