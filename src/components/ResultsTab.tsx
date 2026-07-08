import { createEffect, createMemo, createSignal } from "solid-js";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
import { createSqlTable } from "~/lib/SqlTable";
import { callRpcMethod } from "~/lib/rpc";
import { Table, type TableColumn } from "~/components/ui/table";
import { ClassSelector, type ClassDef } from "~/components/Runs";
import type { EventConfig } from "~/routes/OpenedEvent";

type ResultRow = {
  id: number;
  order?: number;
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
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
  const [, setClassDef] = createSignal<ClassDef | undefined>(undefined);
  const [results, setResults] = createSignal<ResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = createSignal(false);
  const [resultsError, setResultsError] = createSignal("");

  const currentStage = () => props.eventConfig().currentStage;
  const bestTimems = createMemo(() => results().find(row => !row.disqualified)?.timems);

  const formatLoss = (row: ResultRow): string => {
    if (row.disqualified) return "DISQ";
    const best = bestTimems();
    if (best === undefined || row.timems === best) return "";
    return `+${formatResultTime(row.timems - best)}`;
  };

  const resultColumns: TableColumn<ResultRow>[] = [
    {
      key: "order",
      header: "#",
      cell: (row) => row.order === undefined ? "" : `${row.order}.`,
      sortable: false,
      width: "40px",
      align: "right",
    },
    {
      key: "name",
      header: "Name",
      cell: (row) => fullName(row.lastname, row.firstname),
      sortable: false,
      sortFn: (a, b) => fullName(a.lastname, a.firstname).localeCompare(fullName(b.lastname, b.firstname)),
    },
    {
      key: "registration",
      header: "Reg",
      sortable: false,
    },
    {
      key: "timems",
      header: "Time",
      cell: (row) => formatResultTime(row.timems),
      sortable: false,
      align: "right",
      width: "64px",
    },
    {
      key: "loss",
      header: "Loss",
      cell: formatLoss,
      sortable: false,
      align: "right",
      width: "64px",
    },
  ];



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
      let order = 0;
      const rows: ResultRow[] = Array.from({ length: table.rowCount() }, (_, i) => {
        const disqualified = toBoolean(table.get(i, "disqualified"));
        if (!disqualified) order += 1;
        return {
          id: Number(table.get(i, "id")),
          order: disqualified ? undefined : order,
          timems: Number(table.get(i, "timems")),
          disqualified: disqualified,
          competitor_id: Number(table.get(i, "competitor_id")),
          firstname: table.get(i, "firstname")?.toString(),
          lastname: table.get(i, "lastname")?.toString(),
          registration: table.get(i, "registration")?.toString(),
        };
      });
      setResults(rows);
    } catch (error) {
      setResultsError(`Load results error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setResultsLoading(false);
    }
  };



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
        <ClassSelector
          className={className}
          setClassName={setClassName}
          setClassDef={setClassDef}
          eventId={() => props.eventId}
          currentStage={currentStage}
        />
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
