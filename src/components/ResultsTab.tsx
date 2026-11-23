import { createEffect, createMemo, createSignal, onCleanup, untrack } from "solid-js";
import { useAppConfig } from "~/context/AppConfig";
import { useWsClient } from "~/context/WsClient";
import { createSqlTable } from "~/lib/SqlTable";
import { callRpcMethod } from "~/lib/rpc";
import { Button } from "~/components/ui/button";
import { Table, type TableColumn } from "~/components/ui/table";
import { ClassSelector, type ClassDef } from "~/components/ClassSelector";
import { fullName, sqlQuotedString } from "~/lib/runnerEntry";
import { applyRecChngToResults, rankResults, toBoolean, type ResultRow } from "~/lib/results";
import type { RecChng } from "~/schema/rpc-sql-schema";

// Finishing writes several run updates in a row, so the reload waits for them.
const RESULTS_RELOAD_DELAY_MS = 1000;

function formatResultTime(timems: number): string {
  const totalSeconds = Math.floor(timems / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export default function ResultsTab(props: {
  eventId: number;
  workingStage: () => number | undefined;
  recchngReceived: () => RecChng | null;
}) {
  const appConfig = useAppConfig();
  const { wsClient, status } = useWsClient();

  const [className, setClassName] = createSignal("");
  const [, setClassDef] = createSignal<ClassDef | undefined>(undefined);
  const [results, setResults] = createSignal<ResultRow[]>([]);
  const [resultsLoading, setResultsLoading] = createSignal(false);
  const [resultsError, setResultsError] = createSignal("");

  const workingStage = () => props.workingStage();
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
          WHERE runs.stageid = ${workingStage()}
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
      setResults(rankResults(rows));
    } catch (error) {
      setResultsError(`Load results error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setResultsLoading(false);
    }
  };

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleReload = () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      if (status() === "Connected" && className()) loadResults(className());
    }, RESULTS_RELOAD_DELAY_MS);
  };
  onCleanup(() => clearTimeout(reloadTimer));

  createEffect(() => {
    const recchng = props.recchngReceived();
    if (!recchng) return;
    // Untracked, re-running on class / stage change would apply the same recchng twice.
    untrack(() => {
      const { rows, reload } = applyRecChngToResults(results(), recchng, workingStage());
      setResults(rows);
      if (reload) scheduleReload();
    });
  });

  createEffect(() => {
    if (status() !== "Connected") return;
    const selectedClass = className();
    if (!selectedClass) return;
    workingStage();
    loadResults(selectedClass);
  });

  return (
    <div class="flex w-full flex-col items-center justify-center">
      <h1 class="mt-7 mb-7 text-3xl font-bold">Results</h1>
      <div class="w-full max-w-7xl space-y-4">
        <div class="flex items-center justify-between">
          <ClassSelector
            className={className}
            setClassName={setClassName}
            setClassDef={setClassDef}
            eventId={() => props.eventId}
            workingStage={workingStage}
          />
          <Button
            variant="outline"
            onClick={() => loadResults(className())}
            disabled={resultsLoading() || !className() || status() !== "Connected"}
          >
            {resultsLoading() ? "Loading..." : "Refresh"}
          </Button>
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
    </div>
  );
}
