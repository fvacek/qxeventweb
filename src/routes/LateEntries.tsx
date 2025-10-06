import { createMemo, createSignal } from "solid-js"
import { Badge } from "~/components/ui/badge"
import { Button } from "~/components/ui/button"
import { Table, TableBody, TableCell, TableColumn, TableFooter, TableHead, TableHeader, TableRow } from "~/components/ui/table"

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
        sortable: true,
        width: "200px"
    },
    {
        key: "firstName",
        header: "First Name",
        sortable: true,
        width: "200px"
    },
    {
      key: "lastName",
      header: "Last Name",
      sortable: true,
      width: "200px"
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
