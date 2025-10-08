import { WsClient } from "libshv-js"
import { createMemo, createSignal, createEffect } from "solid-js"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Table, TableBody, TableCell, TableColumn, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { useWsClient } from "~/context/WsClient"
import { showToast, Toast } from "~/components/ui/toast";
import { useStage } from "~/context/StageContext";

interface Run {
  runId: number
  className: string | null
  firstName: string | null
  lastName: string | null
  registration: string | null
  siId: number | null
  startTime: number | null
}

function LateEntriesTable() {
  const { wsClient, status } = useWsClient();
  const { currentStage } = useStage();

  // Sample data
  const [entries, setEntries] = createSignal<Run[]>([])

  const [loading, setLoading] = createSignal(false)
  const [sortBy, setSortBy] = createSignal<keyof Run>("lastName")
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc")

  // Reactive sorted data
  const sortedEntries = createMemo(() => {
    const data = [...entries()]
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
        runId: Math.max(...entries().map(u => u.runId)) + 1,
        firstName: `Fanda${entries().length + 1}`,
        lastName: `Vacek${entries().length + 1}`,
        className: "H55",
        siId: null,
        startTime: null,
        registration: "CHT7001"
    }
    setEntries([...entries(), newEntry])
  }

  const editEntry = (id: number) => {
    console.log("Edit entry:", id)
    // Implement edit functionality
  }

  const deleteEntry = (id: number) => {
    setEntries(entries().filter(user => user.runId !== id))
  }

  const reloadTable = async () => {
    setLoading(true)

    try {
        const client = wsClient();
        if (!client) {
            throw new Error("WebSocket client is not available");
        }
        const result = await client.callRpcMethod(
            "test/sql/hsh2025/sql", "select",
            [`SELECT *, classes.name AS class_name
                FROM runs
                LEFT JOIN competitors ON runs.competitorid = competitors.id
                LEFT JOIN classes ON competitors.classid = classes.id
                WHERE runs.stageid = ${currentStage()}`]);

        if (result instanceof Error) {
            console.error("RPC error:", result);
            throw Error(result.message);
        }

        if (result && typeof result === 'object' && result !== null && 'rows' in result && 'fields' in result) {
            console.log("Data received:", result);

            // Find field indices
            const fieldMap = new Map();
            (result as any).fields.forEach((field: { name: string }, index: number) => {
                fieldMap.set(field.name, index);
            });

            // Transform rows to Entry objects
            const transformedEntries: Run[] = (result as any).rows.map((row: any[], rowIndex: number) => ({
                id: row[fieldMap.get('id')] || rowIndex + 1,
                className: row[fieldMap.get('class_name')] || null,
                firstName: row[fieldMap.get('firstname')] || null,
                lastName: row[fieldMap.get('lastname')] || null,
                startTime: row[fieldMap.get('starttime')] || null,
                registration: row[fieldMap.get('registration')] || null,
                siid: row[fieldMap.get('siid')] || null,
            }));

            setEntries(transformedEntries);
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

    // // Simulate fetching fresh data (in real app, this would be an API call)
    // await new Promise(resolve => setTimeout(resolve, 300))

    // Update data with fresh timestamps and randomized data
    const refreshedEntries = entries().map(entry => ({
      ...entry,
    }))

    setEntries(refreshedEntries)
    setLoading(false)
  }

  // Watch for WebSocket status changes and reload data when connected
  createEffect(() => {
    if (status() === "Connected") {
      console.log("WebSocket connected - reloading late entries data");
      reloadTable();
    }
  });

  createEffect(() => {
    reloadTable();
  });

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">Late Entries</h2>
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
          data={entries()}
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

const LateEntries = () => {
    return (
        <div class="flex w-full flex-col items-center justify-center">
            <h1 class="text-3xl font-bold">Late Entries</h1>
            <LateEntriesTable />
        </div>
    )
}

export default LateEntries
