import { WsClient } from "libshv-js"
import { createMemo, createSignal } from "solid-js"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Table, TableBody, TableCell, TableColumn, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table"
import { useWsClient } from "~/context/WsClient"

interface Entry {
  id: number
  firstName: string | null
  lastName: string | null
  siid: number | null
  startTime: number | null
}

function LateEntriesTable() {
  // Sample data
  const [entries, setEntries] = createSignal<Entry[]>([
    {
      id: 1,
      firstName: "John",
      lastName: "Doe",
      siid: null,
      startTime: null,
    },
    {
      id: 1,
      firstName: "Fanda",
      lastName: "Vacek",
      siid: 4567,
      startTime: 1970,
    },
  ])

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

    const { wsClient } = useWsClient();

    try {
        const client = wsClient();
        if (!client) {
            throw new Error("WebSocket client is not available");
        }
        const result = await client.callRpcMethod("test/sql/hsh2025/sql", "select", ["SELECT * FROM lateentries"]);
        console.log("RPC result:", result);

        if (result instanceof Error) {
            console.error("RPC error:", result);
            return;
        }

        if (result) {
            // Process successful result
            console.log("Data received:", result);
            // Transform the data if needed and update entries
            // setEntries(transformedData);
        }
    } catch (error) {
        console.error("RPC call failed:", error);
    }

    // // Simulate fetching fresh data (in real app, this would be an API call)
    // await new Promise(resolve => setTimeout(resolve, 300))

    // Update data with fresh timestamps and randomized data
    const refreshedEntries = entries().map(entry => ({
      ...entry,
    }))

    setEntries(refreshedEntries)
    setLoading(false)
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">Late Entries</h2>
        <div class="flex gap-2">
          <Button onClick={addEntry}>Add entry</Button>
          <Button variant="outline" onClick={refreshData}>
            Refresh
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
