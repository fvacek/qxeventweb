import { Component } from "solid-js"
import { TableExample, SelectableTable } from "~/components/TableExample"
import { AdvancedTableExample, SimpleAdvancedTable } from "~/components/AdvancedTableExample"

const TableDemo: Component = () => {
  return (
    <div class="w-full">
      <div class="container mx-auto p-6 space-y-8">
        <div class="space-y-2">
          <h1 class="text-3xl font-bold tracking-tight">Table Component Demo</h1>
          <p class="text-muted-foreground">
            Showcase of the reactive table component with various features and use cases.
          </p>
        </div>

      <div class="space-y-8">
        {/* Main table example */}
        <section class="space-y-4">
          <TableExample />
        </section>

        {/* Advanced table example */}
        <section class="space-y-4">
          <AdvancedTableExample />
        </section>

        {/* Selectable table example */}
        <section class="space-y-4">
          <SelectableTable />
        </section>

        {/* Simple advanced filtering example */}
        <section class="space-y-4">
          <SimpleAdvancedTable />
        </section>

        {/* Features overview */}
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Features</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">🚀 Reactive Data</h4>
              <p class="text-sm text-muted-foreground">
                Automatically updates when data changes using SolidJS reactivity
              </p>
            </div>
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">🔄 Smart Sorting</h4>
              <p class="text-sm text-muted-foreground">
                Click headers to sort with custom sort functions and visual indicators
              </p>
            </div>
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">🔍 Global Search</h4>
              <p class="text-sm text-muted-foreground">
                Fulltext search across all table columns simultaneously
              </p>
            </div>
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">🎨 Multiple Variants</h4>
              <p class="text-sm text-muted-foreground">
                Default, striped, and bordered table styles
              </p>
            </div>
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">🧩 Custom Cells</h4>
              <p class="text-sm text-muted-foreground">
                Render custom components in table cells with badges and buttons
              </p>
            </div>
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">⏳ Loading States</h4>
              <p class="text-sm text-muted-foreground">
                Built-in loading and empty state handling
              </p>
            </div>
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">✅ Selectable Rows</h4>
              <p class="text-sm text-muted-foreground">
                Single and multi-row selection support
              </p>
            </div>
            <div class="p-4 border rounded-lg space-y-2">
              <h4 class="font-medium">📌 Sticky Headers</h4>
              <p class="text-sm text-muted-foreground">
                Headers that stay visible during scrolling
              </p>
            </div>
          </div>
        </section>

        {/* Usage examples */}
        <section class="space-y-4">
          <h3 class="text-xl font-semibold">Usage Examples</h3>
          <div class="space-y-4">
            <div class="p-4 bg-muted/50 rounded-lg">
              <h4 class="font-medium mb-2">Automatic Rendering with Sorting & Global Search</h4>
              <pre class="text-sm overflow-x-auto">
                <code>{`<Table 
  data={users()} 
  columns={columns}
  variant="striped"
  sortable={true}
  globalFilter={true}
  onSortChange={(sort) => console.log(sort)}
/>`}</code>
              </pre>
            </div>
            <div class="p-4 bg-muted/50 rounded-lg">
              <h4 class="font-medium mb-2">Advanced Filtering Panel</h4>
              <pre class="text-sm overflow-x-auto">
                <code>{`<AdvancedFilters
  filters={filterConfigs}
  values={filters()}
  onChange={setFilters}
  collapsible={true}
  title="Advanced Filters"
/>
<Table data={filteredData()} columns={columns} />`}</code>
              </pre>
            </div>
            <div class="p-4 bg-muted/50 rounded-lg">
              <h4 class="font-medium mb-2">Column Configuration with Filters</h4>
              <pre class="text-sm overflow-x-auto">
                <code>{`const columns: TableColumn<User>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    width: "200px"
  },
  {
    key: "status",
    header: "Status",
    sortable: true,
    cell: (user) => (
      <Badge variant={user.status === "active" ? "default" : "secondary"}>
        {user.status}
      </Badge>
    )
  }
]`}</code>
              </pre>
            </div>
          </div>
        </section>
        </div>
      </div>
    </div>
  )
}

export default TableDemo