import { createSignal, createMemo, For } from "solid-js"
import {
  Table,
  TableColumn,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell
} from "./ui/table"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"

interface User {
  id: number
  name: string
  email: string
  role: string
  status: "active" | "inactive" | "pending"
  lastLogin: Date
}

export function TableExample() {
  // Sample data
  const [users, setUsers] = createSignal<User[]>([
    {
      id: 1,
      name: "John Doe",
      email: "john@example.com",
      role: "Admin",
      status: "active",
      lastLogin: new Date("2024-01-15")
    },
    {
      id: 2,
      name: "Jane Smith",
      email: "jane@example.com",
      role: "Editor",
      status: "active",
      lastLogin: new Date("2024-01-14")
    },
    {
      id: 3,
      name: "Bob Johnson",
      email: "bob@example.com",
      role: "Viewer",
      status: "inactive",
      lastLogin: new Date("2024-01-10")
    },
    {
      id: 4,
      name: "Alice Brown",
      email: "alice@example.com",
      role: "Editor",
      status: "pending",
      lastLogin: new Date("2024-01-12")
    }
  ])

  const [loading, setLoading] = createSignal(false)
  const [sortBy, setSortBy] = createSignal<keyof User>("name")
  const [sortOrder, setSortOrder] = createSignal<"asc" | "desc">("asc")

  // Reactive sorted data
  const sortedUsers = createMemo(() => {
    const data = [...users()]
    return data.sort((a, b) => {
      const aVal = a[sortBy()]
      const bVal = b[sortBy()]

      if (aVal < bVal) return sortOrder() === "asc" ? -1 : 1
      if (aVal > bVal) return sortOrder() === "asc" ? 1 : -1
      return 0
    })
  })

  // Table columns configuration with sorting
  const columns: TableColumn<User>[] = [
    {
      key: "name",
      header: "Name",
      sortable: true,
      width: "200px"
    },
    {
      key: "email",
      header: "Email",
      sortable: true,
      width: "250px"
    },
    {
      key: "role",
      header: "Role",
      sortable: true,
      width: "120px"
    },
    {
      key: "status",
      header: "Status",
      sortable: true,
      width: "120px",
      cell: (user) => (
        <Badge
          variant={
            user.status === "active" ? "default" :
            user.status === "pending" ? "secondary" :
            "outline"
          }
        >
          {user.status}
        </Badge>
      )
    },
    {
      key: "lastLogin",
      header: "Last Login",
      align: "center",
      sortable: true,
      sortFn: (a, b) => new Date(a.lastLogin).getTime() - new Date(b.lastLogin).getTime(),
      cell: (user) => user.lastLogin.toLocaleDateString()
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      width: "150px",
      cell: (user) => (
        <div class="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => editUser(user.id)}
          >
            Edit
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => deleteUser(user.id)}
          >
            Delete
          </Button>
        </div>
      )
    }
  ]

  const addUser = () => {
    const newUser: User = {
      id: Math.max(...users().map(u => u.id)) + 1,
      name: `User ${users().length + 1}`,
      email: `user${users().length + 1}@example.com`,
      role: "Viewer",
      status: "pending",
      lastLogin: new Date()
    }
    setUsers([...users(), newUser])
  }

  const editUser = (id: number) => {
    console.log("Edit user:", id)
    // Implement edit functionality
  }

  const deleteUser = (id: number) => {
    setUsers(users().filter(user => user.id !== id))
  }

  const refreshData = async () => {
    setLoading(true)

    // Simulate fetching fresh data (in real app, this would be an API call)
    await new Promise(resolve => setTimeout(resolve, 300))

    // Update data with fresh timestamps and randomized data
    const refreshedUsers = users().map(user => ({
      ...user,
      lastLogin: new Date(),
      // Randomly update some statuses to show data changes
      status: Math.random() > 0.7 ?
        (user.status === "active" ? "pending" : "active") as "active" | "inactive" | "pending" :
        user.status
    }))

    setUsers(refreshedUsers)
    setLoading(false)
  }

  const toggleSort = (key: keyof User) => {
    if (sortBy() === key) {
      setSortOrder(sortOrder() === "asc" ? "desc" : "asc")
    } else {
      setSortBy(key)
      setSortOrder("asc")
    }
  }

  return (
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-2xl font-bold">User Management</h2>
        <div class="flex gap-2">
          <Button onClick={addUser}>Add User</Button>
          <Button variant="outline" onClick={refreshData}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Example 1: Auto-rendered table with sorting and global search */}
      <div class="rounded-md border">
        <Table
          data={users()}
          columns={columns}
          loading={loading()}
          emptyMessage="No users found"
          variant="striped"
          sortable={true}
          globalFilter={true}
          onSortChange={(sort) => console.log("Sort changed:", sort)}
        />
      </div>

      {/* Example 2: Manual table structure */}
      <div class="rounded-md border">
        <Table variant="bordered">
          <caption>Manual Table Example</caption>
          <thead>
            <tr>
              <th class="p-4 text-left">Product</th>
              <th class="p-4 text-right">Price</th>
              <th class="p-4 text-center">Stock</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="p-4">Laptop</td>
              <td class="p-4 text-right">$999</td>
              <td class="p-4 text-center">15</td>
            </tr>
            <tr>
              <td class="p-4">Mouse</td>
              <td class="p-4 text-right">$29</td>
              <td class="p-4 text-center">50</td>
            </tr>
            <tr>
              <td class="p-4">Keyboard</td>
              <td class="p-4 text-right">$79</td>
              <td class="p-4 text-center">25</td>
            </tr>
          </tbody>
        </Table>
      </div>

      {/* Example 3: Using individual table components */}
      <div class="rounded-md border">
        <Table>
          <TableHeader sticky>
            <TableRow>
              <TableHead>Feature</TableHead>
              <TableHead align="center">Basic</TableHead>
              <TableHead align="center">Pro</TableHead>
              <TableHead align="center">Enterprise</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Storage</TableCell>
              <TableCell align="center">10 GB</TableCell>
              <TableCell align="center">100 GB</TableCell>
              <TableCell align="center">1 TB</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Users</TableCell>
              <TableCell align="center">5</TableCell>
              <TableCell align="center">25</TableCell>
              <TableCell align="center">Unlimited</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Support</TableCell>
              <TableCell align="center">Email</TableCell>
              <TableCell align="center">Priority</TableCell>
              <TableCell align="center">24/7 Phone</TableCell>
            </TableRow>
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>Total</TableCell>
              <TableCell align="center">$9/mo</TableCell>
              <TableCell align="center">$29/mo</TableCell>
              <TableCell align="center">$99/mo</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <div class="text-sm text-muted-foreground space-y-1">
        <p>Total users: {users().length}</p>
        <p class="text-xs">
          The table above demonstrates automatic sorting and global search. Try:
        </p>
        <ul class="text-xs list-disc list-inside ml-2 space-y-1">
          <li>Click column headers to sort (ascending → descending → no sort)</li>
          <li>Use the global search box to filter all columns at once</li>
          <li>Try searching for "Admin", "active", or specific names</li>
          <li>Combine sorting and searching together</li>
        </ul>
      </div>
    </div>
  )
}

// Additional helper components for more complex table functionality
export function SelectableTable() {
  const [selectedRows, setSelectedRows] = createSignal<number[]>([])
  const [data] = createSignal([
    { id: 1, name: "Item 1", value: 100 },
    { id: 2, name: "Item 2", value: 200 },
    { id: 3, name: "Item 3", value: 300 }
  ])

  const toggleRow = (id: number) => {
    setSelectedRows(prev =>
      prev.includes(id)
        ? prev.filter(rowId => rowId !== id)
        : [...prev, id]
    )
  }

  const toggleAll = () => {
    setSelectedRows(
      selectedRows().length === data().length
        ? []
        : data().map(item => item.id)
    )
  }

  return (
    <div class="space-y-4">
      <h3 class="text-lg font-semibold">Selectable Table</h3>

      <Table variant="striped">
        <TableHeader>
          <TableRow>
            <TableHead>
              <input
                type="checkbox"
                checked={selectedRows().length === data().length}
                ref={(el) => {
                  if (el) {
                    el.indeterminate = selectedRows().length > 0 && selectedRows().length < data().length
                  }
                }}
                onChange={toggleAll}
              />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead align="right">Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <For each={data()}>
            {(item) => (
              <TableRow
                selected={selectedRows().includes(item.id)}
                onClick={() => toggleRow(item.id)}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    checked={selectedRows().includes(item.id)}
                    onChange={() => toggleRow(item.id)}
                  />
                </TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell align="right">${item.value}</TableCell>
              </TableRow>
            )}
          </For>
        </TableBody>
      </Table>

      <p class="text-sm text-muted-foreground">
        Selected: {selectedRows().length} of {data().length} items
      </p>
    </div>
  )
}
