import { WsClient } from "libshv-js"
import { createMemo, createSignal, createEffect } from "solid-js"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Table, TableBody, TableCell, TableColumn, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { useWsClient } from "~/context/WsClient"
import { showToast, Toast } from "~/components/ui/toast";

interface Entry {
  id: number
  firstName: string | null
  lastName: string | null
  className: string | null
  siid: number | null
  startTime: number | null
}

function LateEntriesTable() {
  const { wsClient, status } = useWsClient();

  // Sample data
  const [entries, setEntries] = createSignal<Entry[]>([])

  const [loading, setLoading] = createSignal(false)
  const [sortBy, setSortBy] = createSignal<keyof Entry>("lastName")
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
  const columns: TableColumn<Entry>[] = [
    {
        key: "startTime",
        header: "Start Time",
        cell: (entry: Entry) => {
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
        cell: (entry: Entry) => {
          const fullName = [entry.firstName, entry.lastName]
            .filter(name => name !== null && name.trim() !== "")
            .join(" ")
          return <span>{fullName || "—"}</span>
        },
        sortable: true,
        sortFn: (a: Entry, b: Entry) => {
          const aName = [a.firstName, a.lastName].filter(n => n).join(" ")
          const bName = [b.firstName, b.lastName].filter(n => n).join(" ")
          return aName.localeCompare(bName)
        },
        width: "250px"
    },
    {
      key: "className",
      header: "Class",
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
    const newEntry: Entry = {
      id: Math.max(...entries().map(u => u.id)) + 1,
      firstName: `Fanda${entries().length + 1}`,
      lastName: `Vacek${entries().length + 1}`,
      className: "H55",
      siid: null,
      startTime: null,
    }
    setEntries([...entries(), newEntry])
  }

  const editEntry = (id: number) => {
    console.log("Edit entry:", id)
    // Implement edit functionality
  }

  const deleteEntry = (id: number) => {
    setEntries(entries().filter(user => user.id !== id))
  }

  const refreshData = async () => {
    setLoading(true)

    try {
        const client = wsClient();
        if (!client) {
            throw new Error("WebSocket client is not available");
        }
        const result = await client.callRpcMethod("test/sql/hsh2025/sql", "select", ["SELECT * FROM lateentries"]);

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
            const transformedEntries: Entry[] = (result as any).rows.map((row: any[], rowIndex: number) => ({
                id: row[fieldMap.get('id')] || rowIndex + 1,
                firstName: row[fieldMap.get('firstname')] || null,
                lastName: row[fieldMap.get('lastname')] || null,
                className: row[fieldMap.get('classname')] || null,
                startTime: row[fieldMap.get('starttime')] || null,
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
      refreshData();
    }
  });

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">Late Entries</h2>
        <div class="flex gap-2">
          <Button onClick={addEntry}>Add entry</Button>
            <Button variant="outline" onClick={refreshData} disabled={loading()}>
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
