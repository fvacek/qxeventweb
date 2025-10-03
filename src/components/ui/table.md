# Reactive Table Component

A comprehensive, reactive table component built with SolidJS, Kobalte Core, and Tailwind CSS. This component provides both automatic data rendering and manual composition patterns with sorting and global search capabilities.

## Features

- 🚀 **Reactive**: Automatically updates when data changes
- 🔄 **Smart Sorting**: Click headers to sort with custom sort functions and visual indicators
- 🔍 **Global Search**: Fulltext search across all columns simultaneously
- 🎨 **Customizable**: Multiple variants and styling options
- ♿ **Accessible**: Built with accessibility in mind
- 🔧 **Flexible**: Both automatic and manual rendering modes
- 📱 **Responsive**: Includes overflow handling
- 🎯 **TypeScript**: Full type safety
- 🧩 **Composable**: Individual components for custom layouts

## Installation

The table component is already included in this project. Import it from:

```tsx
import { Table, TableColumn } from "~/components/ui/table"
```

## Basic Usage

### Automatic Rendering with Sorting and Global Search

The easiest way to use the table is with the `data` and `columns` props:

```tsx
import { Table, TableColumn } from "~/components/ui/table"

interface User {
  id: number
  name: string
  email: string
  status: "active" | "inactive"
  createdAt: Date
}

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
    key: "status", 
    header: "Status",
    sortable: true,
    width: "120px",
    cell: (user) => (
      <Badge variant={user.status === "active" ? "default" : "secondary"}>
        {user.status}
      </Badge>
    )
  },
  {
    key: "createdAt",
    header: "Created",
    sortable: true,
    sortFn: (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    cell: (user) => user.createdAt.toLocaleDateString()
  }
]

function MyTable() {
  const [users, setUsers] = createSignal<User[]>([
    { 
      id: 1, 
      name: "John Doe", 
      email: "john@example.com", 
      status: "active",
      createdAt: new Date()
    }
  ])

  return (
    <Table 
      data={users()} 
      columns={columns}
      variant="striped"
      sortable={true}
      globalFilter={true}
      onSortChange={(sort) => console.log("Sort:", sort)}
    />
  )
}
```

### Manual Composition

For more control, use individual components:

```tsx
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
      <TableHead>Email</TableHead>
      <TableHead align="center">Actions</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <For each={users()}>
      {(user) => (
        <TableRow>
          <TableCell>{user.name}</TableCell>
          <TableCell>{user.email}</TableCell>
          <TableCell align="center">
            <Button size="sm">Edit</Button>
          </TableCell>
        </TableRow>
      )}
    </For>
  </TableBody>
</Table>
```

## Components

### Table (Root)

The main table component that wraps everything.

#### Props

- `variant?: "default" | "striped" | "bordered"` - Table styling variant
- `size?: "default" | "sm" | "lg"` - Text size
- `data?: T[]` - Array of data items for automatic rendering
- `columns?: TableColumn<T>[]` - Column configuration for automatic rendering
- `loading?: boolean` - Shows loading state
- `emptyMessage?: string` - Message when no data is available
- `sortable?: boolean` - Enable sorting for all columns (can be overridden per column)
- `globalFilter?: boolean` - Enable global search across all columns
- `onSortChange?: (sort: SortState | null) => void` - Callback when sort changes
- `initialSort?: SortState` - Initial sort state
- `class?: string` - Additional CSS classes

#### Variants

- `default` - Basic table with minimal styling
- `striped` - Alternating row background colors
- `bordered` - Table with borders around cells

### TableColumn<T>

Configuration object for automatic table rendering:

```tsx
interface TableColumn<T> {
  key: string                    // Property key from data object
  header: string | JSX.Element   // Column header content
  cell?: (item: T, index: number) => JSX.Element  // Custom cell renderer
  sortable?: boolean             // Enable sorting for this column
  sortFn?: (a: T, b: T) => number // Custom sort function
  width?: string                 // Column width (CSS value)
  align?: "left" | "center" | "right"  // Text alignment
}

interface SortState {
  column: string                 // Column key being sorted
  direction: "asc" | "desc"     // Sort direction
}
```

### TableHeader

Container for table headers. Use with `TableRow` and `TableHead`.

#### Props

- `sticky?: boolean` - Makes header sticky on scroll
- `class?: string` - Additional CSS classes

### TableBody

Container for table data rows.

#### Props

- `class?: string` - Additional CSS classes

### TableFooter

Container for table footer content.

#### Props

- `class?: string` - Additional CSS classes

### TableRow

Individual table row component.

#### Props

- `onClick?: () => void` - Row click handler
- `selected?: boolean` - Highlight row as selected
- `class?: string` - Additional CSS classes

### TableHead

Table header cell component.

#### Props

- `align?: "left" | "center" | "right"` - Text alignment
- `class?: string` - Additional CSS classes

### TableCell

Table data cell component.

#### Props

- `align?: "left" | "center" | "right"` - Text alignment
- `class?: string` - Additional CSS classes

### TableCaption

Table caption component for accessibility.

#### Props

- `class?: string` - Additional CSS classes

## Advanced Examples

### Loading State

```tsx
<Table 
  data={users()} 
  columns={columns}
  loading={isLoading()}
/>
```

### Empty State

```tsx
<Table 
  data={[]} 
  columns={columns}
  emptyMessage="No users found. Try adjusting your search."
/>
```

### Sorting Configuration

```tsx
const columns: TableColumn<User>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true  // Enable default sorting
  },
  {
    key: "createdAt",
    header: "Created Date",
    sortable: true,
    sortFn: (a, b) => a.createdAt.getTime() - b.createdAt.getTime() // Custom sort
  }
]

// Enable sorting and global search
<Table 
  data={data()} 
  columns={columns}
  sortable={true}
  globalFilter={true}
  initialSort={{ column: "name", direction: "asc" }}
  onSortChange={(sort) => console.log("Sort changed:", sort)}
/>
```

### Advanced Filtering with External Panel

For more complex filtering needs, use the `AdvancedFilters` component:

```tsx
import { AdvancedFilters, filterData } from "~/components/ui/advanced-filters"

const filterConfigs = [
  {
    key: "name",
    label: "Product Name",
    type: "text" as const
  },
  {
    key: "category",
    label: "Category",
    type: "select" as const,
    options: [
      { value: "electronics", label: "Electronics" },
      { value: "clothing", label: "Clothing" }
    ]
  },
  {
    key: "price",
    label: "Price Range",
    type: "numberrange" as const,
    min: 0,
    max: 1000
  },
  {
    key: "releaseDate",
    label: "Release Date",
    type: "daterange" as const
  }
]

function AdvancedTableExample() {
  const [filters, setFilters] = createSignal({})
  const filteredData = createMemo(() => filterData(rawData(), filters(), filterConfigs))

  return (
    <div class="space-y-4">
      <AdvancedFilters
        filters={filterConfigs}
        values={filters()}
        onChange={setFilters}
        collapsible={true}
        title="Advanced Filters"
      />
      <Table data={filteredData()} columns={columns} />
    </div>
  )
}
```

### Custom Cell Rendering

```tsx
const columns: TableColumn<User>[] = [
  {
    key: "avatar",
    header: "Photo",
    cell: (user) => (
      <img 
        src={user.avatarUrl} 
        alt={user.name}
        class="w-8 h-8 rounded-full"
      />
    )
  },
  {
    key: "actions",
    header: "Actions",
    align: "center",
    cell: (user, index) => (
      <div class="flex gap-2">
        <Button size="sm" onClick={() => editUser(user.id)}>
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
```

### Selectable Rows

```tsx
function SelectableTable() {
  const [selectedRows, setSelectedRows] = createSignal<number[]>([])
  
  const toggleRow = (id: number) => {
    setSelectedRows(prev => 
      prev.includes(id) 
        ? prev.filter(rowId => rowId !== id)
        : [...prev, id]
    )
  }

  return (
    <Table>
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
                />
              </TableCell>
              <TableCell>{item.name}</TableCell>
            </TableRow>
          )}
        </For>
      </TableBody>
    </Table>
  )
}
```

### Sticky Header

```tsx
<Table>
  <TableHeader sticky>
    <TableRow>
      <TableHead>Column 1</TableHead>
      <TableHead>Column 2</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    {/* Long list of rows */}
  </TableBody>
</Table>
```

### Responsive Design

The table automatically includes horizontal scrolling for overflow:

```tsx
<div class="rounded-md border">
  <Table>
    {/* Table content */}
  </Table>
</div>
```

## Styling

The table uses Tailwind CSS classes and CSS custom properties for theming. Key classes include:

- `border-border` - Border colors
- `bg-background` - Background colors
- `text-foreground` - Text colors
- `bg-muted` - Muted background for hover/selected states

### Custom Styling

You can override styles using the `class` prop:

```tsx
<Table class="text-xs border-red-200">
  <TableRow class="hover:bg-blue-50">
    <TableCell class="font-bold text-blue-600">
      Custom styled cell
    </TableCell>
  </TableRow>
</Table>
```

## Performance Considerations

- Use `createMemo()` for computed data like sorting or global filtering
- For large datasets, consider implementing virtual scrolling or server-side filtering
- The table rerenders reactively when data changes, so keep data immutable
- Sorting and global search operations are optimized with memoization

```tsx
// Good: Creates new array for sorting
const sortedData = createMemo(() => [...data()].sort(compareFn))

// Good: Memoized filtering
const filteredData = createMemo(() => 
  data().filter(item => 
    item.name.toLowerCase().includes(searchTerm().toLowerCase())
  )
)

// Good: Combined sorting and global search
const processedData = createMemo(() => {
  let result = data()
  
  // Apply global search first
  if (globalSearch()) {
    result = result.filter(item => 
      Object.values(item).join(' ').toLowerCase().includes(globalSearch())
    )
  }
  
  // Then sort
  if (sortState()) {
    result = [...result].sort(/* sort logic */)
  }
  
  return result
})

// Bad: Mutates original array
const sortedData = createMemo(() => data().sort(compareFn))
```

### Search Performance Tips

- Use debouncing for global search to avoid excessive re-filtering
- Consider server-side filtering for very large datasets
- Use indexed search for complex queries

```tsx
import { debounce } from "~/lib/utils"

const [searchTerm, setSearchTerm] = createSignal("")
const debouncedSearch = createMemo(() => debounce(searchTerm, 300))

const filteredData = createMemo(() => 
  data().filter(item => 
    Object.values(item).join(' ').toLowerCase().includes(debouncedSearch().toLowerCase())
  )
)
```

## Accessibility

The table components include proper semantic HTML and ARIA attributes:

- Uses semantic `<table>`, `<thead>`, `<tbody>`, `<tr>`, `<th>`, `<td>` elements
- Supports `<caption>` for table descriptions
- Proper focus management for interactive elements
- Screen reader friendly structure

## Browser Support

The table component works in all modern browsers that support:
- CSS Grid and Flexbox
- CSS Custom Properties
- ES2015+ JavaScript features

## Migration from Other Libraries

### From HTML Tables

Replace standard HTML table elements with the component equivalents:

```tsx
// Before
<table>
  <thead>
    <tr><th>Name</th></tr>
  </thead>
</table>

// After
<Table>
  <TableHeader>
    <TableRow>
      <TableHead>Name</TableHead>
    </TableRow>
  </TableHeader>
</Table>
```

### From Other Component Libraries

The API is similar to popular table libraries like Tanstack Table or Ant Design Table, making migration straightforward.

## Global Search

The global search feature searches across all columns simultaneously using a simple text input:

```tsx
<Table 
  data={data()} 
  columns={columns}
  globalFilter={true}
/>
```

This creates a search input above the table that filters rows where any column value contains the search term (case-insensitive).

## Best Practices

1. **Column Configuration**: Always specify `sortable` explicitly for clarity
2. **Custom Sort Functions**: Use `sortFn` for complex data types like dates or nested objects
3. **Global Search**: Enable `globalFilter` for fulltext search across all columns
4. **Performance**: Use `createMemo()` for expensive computations
5. **Accessibility**: Include proper `aria-label` attributes for custom cells
6. **Type Safety**: Leverage TypeScript interfaces for better development experience

## Common Patterns

### Server-Side Integration
```tsx
function ServerSideTable() {
  const [sort, setSort] = createSignal<SortState | null>(null)
  const [search, setSearch] = createSignal<string>("")
  
  // Trigger API call when sort/search changes
  createEffect(() => {
    fetchData({ 
      sort: sort(), 
      search: search(),
      page: currentPage() 
    })
  })
  
  return (
    <Table
      data={serverData()}
      columns={columns}
      loading={isLoading()}
      onSortChange={setSort}
      globalFilter={true}
    />
  )
}
```

### Persistent Search and Sort
```tsx
function PersistentSearchTable() {
  const [sort, setSort] = createSignal(
    JSON.parse(localStorage.getItem('tableSort') || 'null')
  )
  
  createEffect(() => {
    localStorage.setItem('tableSort', JSON.stringify(sort()))
  })
  
  return (
    <Table 
      onSortChange={setSort}
      initialSort={sort()}
      globalFilter={true}
    />
  )
}
```