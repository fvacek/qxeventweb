import { RpcValue, WsClient } from "libshv-js"
import { createMemo, createSignal, createEffect, For } from "solid-js"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Table, TableBody, TableCell, TableColumn, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { useWsClient } from "~/context/WsClient"
import { showToast, Toast } from "~/components/ui/toast";
import { useStage } from "~/context/StageContext";
import { useAppConfig } from "~/context/AppConfig"

interface Run {
  runId: number
  className: string | null
  firstName: string | null
  lastName: string | null
  registration: string | null
  siId: number | null
  startTime: number | null
}

function LateEntriesTable(props: { className: () => string }) {
  const { wsClient, status } = useWsClient();
  const { currentStage } = useStage();
  const appConfig = useAppConfig();

  // Sample data
  const [runs, setRuns] = createSignal<Run[]>([])

  const [loading, setLoading] = createSignal(false)
  const [sortBy, setSortBy] = createSignal<keyof Run>("lastName")
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc")

  // Reactive sorted data
  const sortedEntries = createMemo(() => {
    const data = [...runs()]
    return data.sort((a, b) => {
      const aVal = a[sortBy()]
      const bVal = b[sortBy()]

      // Handle null values - put nulls at the beginnig
      if (aVal === null && bVal === null) return 0
      if (aVal === null) return sortOrder() === "asc" ? -1 : 1
      if (bVal === null) return sortOrder() === "asc" ? 1 : -1

      if (aVal < bVal) return sortOrder() === "asc" ? -1 : 1
      if (aVal > bVal) return sortOrder() === "asc" ? 1 : -1
      return 0
    })
  })

  // Table columns configuration with sorting
  const columns: TableColumn<Run>[] = [
    {
        key: "startTime",
        header: "Start Time",
        cell: (entry: Run) => {
          if (entry.startTime === null) {
            return <span>—</span>
          }
          const date = new Date(entry.startTime * 1000)
          return <span>{date.toISOString()}</span>
        },
        sortable: true,
        width: "250px"
    },
    {
        key: "name",
        header: "Name",
        cell: (entry: Run) => {
          const fullName = [entry.firstName, entry.lastName]
            .filter(name => name !== null && name.trim() !== "")
            .join(" ")
          return <span>{fullName || "—"}</span>
        },
        sortable: true,
        sortFn: (a: Run, b: Run) => {
          const aName = [a.firstName, a.lastName].filter(n => n).join(" ")
          const bName = [b.firstName, b.lastName].filter(n => n).join(" ")
          return aName.localeCompare(bName)
        },
        width: "250px"
    },
    {
      key: "registration",
      header: "Registration",
      sortable: true,
      width: "100px"
    },
    {
      key: "siid",
      header: "SI",
      sortable: true,
      width: "250px"
    },
  ]

  const addEntry = () => {
    const newEntry: Run = {
        runId: Math.max(...runs().map(u => u.runId)) + 1,
        firstName: `Fanda${runs().length + 1}`,
        lastName: `Vacek${runs().length + 1}`,
        className: "H55",
        siId: null,
        startTime: null,
        registration: "CHT7001"
    }
    setRuns([...runs(), newEntry])
  }

  const editEntry = (id: number) => {
    console.log("Edit entry:", id)
    // Implement edit functionality
  }

  const deleteEntry = (id: number) => {
    setRuns(runs().filter(user => user.runId !== id))
  }

  const callRpcMethod = async (shvPath: string, method: string, params?: RpcValue): Promise<RpcValue> => {
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
  }

  const reloadTable = async () => {
    setLoading(true)

    try {
        const runs_result = await callRpcMethod(
            appConfig.eventPath, "select",
            [`SELECT *, classes.name AS class_name
                FROM runs
                INNER JOIN competitors ON runs.competitorid = competitors.id
                INNER JOIN classes ON competitors.classid = classes.id AND classes.name = '${props.className()}'
                WHERE runs.stageid = ${currentStage()}`]);


        if (runs_result && typeof runs_result === 'object' && runs_result !== null && 'rows' in runs_result && 'fields' in runs_result) {
            console.log("Data received:", runs_result);

            // Find field indices
            const fieldMap = new Map();
            (runs_result as any).fields.forEach((field: { name: string }, index: number) => {
                fieldMap.set(field.name, index);
            });

            // Transform rows to Entry objects
            const transformedEntries: Run[] = (runs_result as any).rows.map((row: any[], rowIndex: number) => ({
                id: row[fieldMap.get('id')] || rowIndex + 1,
                className: row[fieldMap.get('class_name')] || null,
                firstName: row[fieldMap.get('firstname')] || null,
                lastName: row[fieldMap.get('lastname')] || null,
                startTime: row[fieldMap.get('starttime')] || null,
                registration: row[fieldMap.get('registration')] || null,
                siid: row[fieldMap.get('siid')] || null,
            }));

            setRuns(transformedEntries);
        }
    } catch (error) {
        console.error("RPC call failed:", error);
        showToast({
            title: "Reload table error",
            description: (error as Error).message,
            variant: "destructive"
        })
    }
    setLoading(false);

    // Update data with fresh timestamps and randomized data
    const refreshedEntries = runs().map(entry => ({
      ...entry,
    }))

    setRuns(refreshedEntries)
    setLoading(false)
  }



    // Watch for WebSocket status changes and reload data when connected
    createEffect(() => {
        if (!!props.className()) {
            console.log("Class name changed - reloading late entries data");
            reloadTable();
        }
    });

  return (
    <div>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-2xl font-bold">{props.className()}</h2>
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
          onSortChange={(sort) => console.log("Sort changed:", sort)}
        />
      </div>
    </div>
  )
}

function ClassSelector(props: { className: () => string, setClassName: (name: string) => void }) {
  const { wsClient, status } = useWsClient();
  const { currentStage } = useStage();
  const appConfig = useAppConfig();

  const [classes, setClasses] = createSignal<string[]>([])

  const callRpcMethod = async (shvPath: string, method: string, params?: RpcValue): Promise<RpcValue> => {
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
  }

  async function loadClasses() {
        try {
            const classes_result = await callRpcMethod(
                appConfig.eventPath, "select",
                [`SELECT classes.name AS class_name FROM classes, classdefs
                  WHERE classdefs.classid = classes.id AND classdefs.stageid = ${currentStage()}
                  ORDER BY classes.name`]);
            const classNames: string[] = (classes_result as any).rows.map((row: any[], rowIndex: number) => (
                row[0]
            ));
            setClasses(classNames);

        } catch (error) {
            console.error("RPC call failed:", error);
            showToast({
                title: "Load classes error",
                description: (error as Error).message,
                variant: "destructive"
            })
        }
    }

    // Watch for WebSocket status changes and load classes when connected
    createEffect(() => {
        if (status() === "Connected") {
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
  )
}

const LateEntries = () => {
    const [className, setClassName] = createSignal("")

    return (
        <div class="flex w-full flex-col items-center justify-center">
            <h1 class="text-3xl font-bold">Late Entries</h1>
            <div class="w-full max-w-7xl space-y-4">
                <ClassSelector className={className} setClassName={setClassName} />
                <LateEntriesTable className={className} />
            </div>
        </div>
    )
}

export default LateEntries
