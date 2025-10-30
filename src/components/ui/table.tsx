import type { JSX, ValidComponent } from "solid-js"
import { splitProps, For, createMemo, createSignal, Accessor } from "solid-js"

import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import type { VariantProps } from "class-variance-authority"
import { cva } from "class-variance-authority"

import { cn } from "~/lib/utils"

const tableVariants = cva(
  "w-full caption-bottom text-sm",
  {
    variants: {
      variant: {
        default: "border-collapse",
        striped: "border-collapse [&>tbody>tr:nth-child(even)]:bg-muted/50",
        bordered: "border-collapse border border-border",
      },
      size: {
        default: "",
        sm: "text-xs",
        lg: "text-base",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
)

const tableHeaderVariants = cva(
  "border-b text-left font-medium text-muted-foreground [&:has([role=checkbox])]:pl-3",
  {
    variants: {
      sticky: {
        true: "sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        false: ""
      }
    },
    defaultVariants: {
      sticky: false
    }
  }
)

const tableCellVariants = cva(
  "px-2 py-3 align-middle [&:has([role=checkbox])]:pl-3",
  {
    variants: {
      align: {
        left: "text-left",
        center: "text-center",
        right: "text-right"
      }
    },
    defaultVariants: {
      align: "left"
    }
  }
)

const sortButtonVariants = cva(
  "inline-flex items-center gap-1 hover:bg-muted/50 px-2 py-1 rounded transition-colors",
  {
    variants: {
      active: {
        true: "bg-muted text-foreground",
        false: "text-muted-foreground hover:text-foreground"
      }
    },
    defaultVariants: {
      active: false
    }
  }
)

// Sorting and Filtering Types
interface SortState {
  column: string
  direction: "asc" | "desc"
}

interface FilterState {
  [key: string]: any
}

// Removed FilterType and FilterConfig since we only use global search now

// Table Root Component
type TableProps<T extends ValidComponent = "table"> = {
  class?: string | undefined
  children?: JSX.Element
  data?: any[]
  columns?: TableColumn<any>[]
  loading?: boolean
  emptyMessage?: string
  sortable?: boolean
  globalFilter?: boolean
  onSortChange?: (sort: SortState | null) => void
  initialSort?: SortState
} & VariantProps<typeof tableVariants>

interface TableColumn<T> {
  key: string
  header: string | JSX.Element
  cell?: (item: T, index: number) => JSX.Element
  sortable?: boolean
  sortFn?: (a: T, b: T) => number
  width?: string
  align?: "left" | "center" | "right"
  hidden?: boolean | string
}

// Removed ColumnFilter component since we only use global search

const Table = <T extends ValidComponent = "table">(
  props: PolymorphicProps<T, TableProps<T>>
) => {
  const [local, others] = splitProps(props as TableProps, [
    "variant",
    "size", 
    "class",
    "children",
    "data",
    "columns",
    "loading",
    "emptyMessage",
    "sortable",
    "globalFilter",
    "onSortChange",
    "initialSort"
  ])

  // Internal sorting state and global filter
  const [sortState, setSortState] = createSignal<SortState | null>(local.initialSort || null)
  const [globalFilterValue, setGlobalFilterValue] = createSignal("")

  // If data and columns are provided, render automatically
  const shouldAutoRender = createMemo(() => 
    local.data && local.columns && local.columns.length > 0
  )

  // Sorting function
  const sortedData = createMemo(() => {
    if (!local.data || !sortState()) return local.data || []
    
    const sort = sortState()!
    const column = local.columns?.find(col => col.key === sort.column)
    
    return [...local.data].sort((a, b) => {
      if (column?.sortFn) {
        const result = column.sortFn(a, b)
        return sort.direction === "desc" ? -result : result
      }

      let aVal = a[sort.column]
      let bVal = b[sort.column]
      
      // Handle different data types
      if (typeof aVal === "string") aVal = aVal.toLowerCase()
      if (typeof bVal === "string") bVal = bVal.toLowerCase()
      
      if (aVal < bVal) return sort.direction === "asc" ? -1 : 1
      if (aVal > bVal) return sort.direction === "asc" ? 1 : -1
      return 0
    })
  })

  // Global filtering function
  const filteredAndSortedData = createMemo(() => {
    let data = sortedData()
    if (!data) return []
    
    const globalFilter = globalFilterValue().toLowerCase()
    
    // Apply global filter if enabled and has value
    if (globalFilter && local.globalFilter) {
      return data.filter(item => {
        const searchableText = Object.values(item)
          .join(" ")
          .toLowerCase()
        return searchableText.includes(globalFilter)
      })
    }
    
    return data
  })

  // Visible columns computed based on hidden attribute
  const visibleColumns = createMemo(() => {
    if (!local.columns) return []
    return local.columns.filter(column => {
      if (!column.hidden) return true
      if (typeof column.hidden === 'string') {
        // Support responsive classes like "hidden sm:table-cell"
        return false // Will be handled by CSS
      }
      return !column.hidden
    })
  })

  // Sort handler
  const handleSort = (columnKey: string) => {
    const column = local.columns?.find(col => col.key === columnKey)
    if (!column?.sortable && !local.sortable) return
    
    const currentSort = sortState()
    let newSort: SortState | null
    
    if (currentSort?.column === columnKey) {
      newSort = currentSort.direction === "asc" 
        ? { column: columnKey, direction: "desc" }
        : null
    } else {
      newSort = { column: columnKey, direction: "asc" }
    }
    
    setSortState(newSort)
    local.onSortChange?.(newSort)
  }

  return (
    <div class="space-y-4">
      {/* Global filter */}
      {local.globalFilter && shouldAutoRender() && (
        <div class="flex items-center space-x-2">
          <input
            type="text"
            placeholder="Search all columns..."
            value={globalFilterValue()}
            onInput={(e) => setGlobalFilterValue(e.target.value)}
            class="px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          {globalFilterValue() && (
            <button
              onClick={() => setGlobalFilterValue("")}
              class="text-muted-foreground hover:text-foreground text-sm"
            >
              Clear
            </button>
          )}
        </div>
      )}

      <div class="relative w-full overflow-auto">
        <table
          class={cn(tableVariants({ variant: local.variant, size: local.size }), local.class)}
          {...others}
        >
          {shouldAutoRender() ? (
            <>
              <TableHeader>
                <TableRow>
                  <For each={local.columns}>
                    {(column) => {
                      const hiddenClass = typeof column.hidden === 'string' ? column.hidden : 
                                        column.hidden === true ? 'hidden' : ''
                      return (
                        <TableHead 
                          align={column.align}
                          style={column.width ? { width: column.width } : undefined}
                          class={hiddenClass}
                        >
                          <div>
                            {/* Column header with sorting */}
                            {(column.sortable || local.sortable) ? (
                              <button
                                onClick={() => handleSort(column.key)}
                                class={cn(
                                  sortButtonVariants({ 
                                    active: sortState()?.column === column.key 
                                  }),
                                  "flex items-center gap-1"
                                )}
                              >
                                {column.header}
                                {/* Hide sort indicator when column is hidden on mobile */}
                                <span class={cn(
                                  "text-xs",
                                  hiddenClass && "hidden sm:inline"
                                )}>
                                  {sortState()?.column === column.key ? (
                                    sortState()?.direction === "asc" ? "↑" : "↓"
                                  ) : "↕"}
                                </span>
                              </button>
                            ) : (
                              column.header
                            )}
                          </div>
                        </TableHead>
                      )
                    }}
                  </For>
                </TableRow>
              </TableHeader>
              <TableBody>
                {local.loading ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns().length || local.columns!.length} class="h-24 text-center">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredAndSortedData().length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns().length || local.columns!.length} class="h-24 text-center">
                      {local.emptyMessage || "No data available"}
                    </TableCell>
                  </TableRow>
                ) : (
                  <For each={filteredAndSortedData()}>
                    {(item, index) => (
                      <TableRow>
                        <For each={local.columns}>
                          {(column) => {
                            const hiddenClass = typeof column.hidden === 'string' ? column.hidden : 
                                              column.hidden === true ? 'hidden' : ''
                            return (
                              <TableCell align={column.align} class={hiddenClass}>
                                {column.cell 
                                  ? column.cell(item, index()) 
                                  : item[column.key]?.toString() || ""
                                }
                              </TableCell>
                            )
                          }}
                        </For>
                      </TableRow>
                    )}
                  </For>
                )}
              </TableBody>
            </>
          ) : (
            local.children
          )}
        </table>
      </div>
    </div>
  )
}

// Table Header Component
type TableHeaderProps<T extends ValidComponent = "thead"> = {
  class?: string | undefined
  children?: JSX.Element
  sticky?: boolean
}

const TableHeader = <T extends ValidComponent = "thead">(
  props: PolymorphicProps<T, TableHeaderProps<T>>
) => {
  const [local, others] = splitProps(props as TableHeaderProps, ["class", "sticky", "children"])
  return (
    <thead 
      class={cn(tableHeaderVariants({ sticky: local.sticky }), local.class)} 
      {...others}
    >
      {local.children}
    </thead>
  )
}

// Table Body Component
type TableBodyProps<T extends ValidComponent = "tbody"> = {
  class?: string | undefined
  children?: JSX.Element
}

const TableBody = <T extends ValidComponent = "tbody">(
  props: PolymorphicProps<T, TableBodyProps<T>>
) => {
  const [local, others] = splitProps(props as TableBodyProps, ["class", "children"])
  return (
    <tbody class={cn("[&_tr:last-child]:border-0", local.class)} {...others}>
      {local.children}
    </tbody>
  )
}

// Table Footer Component
type TableFooterProps<T extends ValidComponent = "tfoot"> = {
  class?: string | undefined
  children?: JSX.Element
}

const TableFooter = <T extends ValidComponent = "tfoot">(
  props: PolymorphicProps<T, TableFooterProps<T>>
) => {
  const [local, others] = splitProps(props as TableFooterProps, ["class", "children"])
  return (
    <tfoot class={cn("border-t bg-muted/50 font-medium", local.class)} {...others}>
      {local.children}
    </tfoot>
  )
}

// Table Row Component
type TableRowProps<T extends ValidComponent = "tr"> = {
  class?: string | undefined
  children?: JSX.Element
  onClick?: () => void
  selected?: boolean
}

const TableRow = <T extends ValidComponent = "tr">(
  props: PolymorphicProps<T, TableRowProps<T>>
) => {
  const [local, others] = splitProps(props as TableRowProps, [
    "class", 
    "children", 
    "onClick",
    "selected"
  ])
  
  return (
    <tr
      class={cn(
        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
        local.onClick && "cursor-pointer",
        local.selected && "bg-muted",
        local.class
      )}
      onClick={local.onClick}
      data-state={local.selected ? "selected" : undefined}
      {...others}
    >
      {local.children}
    </tr>
  )
}

// Table Head Component
type TableHeadProps<T extends ValidComponent = "th"> = {
  class?: string | undefined
  children?: JSX.Element
} & VariantProps<typeof tableCellVariants>

const TableHead = <T extends ValidComponent = "th">(
  props: PolymorphicProps<T, TableHeadProps<T>>
) => {
  const [local, others] = splitProps(props as TableHeadProps, [
    "class", 
    "children",
    "align"
  ])
  
  return (
    <th
      class={cn(
        "h-10 px-2 text-left align-middle font-bold text-muted-foreground [&:has([role=checkbox])]:pl-3",
        tableCellVariants({ align: local.align }),
        local.class
      )}
      {...others}
    >
      {local.children}
    </th>
  )
}

// Table Cell Component
type TableCellProps<T extends ValidComponent = "td"> = {
  class?: string | undefined
  children?: JSX.Element
} & VariantProps<typeof tableCellVariants>

const TableCell = <T extends ValidComponent = "td">(
  props: PolymorphicProps<T, TableCellProps<T>>
) => {
  const [local, others] = splitProps(props as TableCellProps, [
    "class", 
    "children",
    "align"
  ])
  
  return (
    <td
      class={cn(tableCellVariants({ align: local.align }), local.class)}
      {...others}
    >
      {local.children}
    </td>
  )
}

// Table Caption Component
type TableCaptionProps<T extends ValidComponent = "caption"> = {
  class?: string | undefined
  children?: JSX.Element
}

const TableCaption = <T extends ValidComponent = "caption">(
  props: PolymorphicProps<T, TableCaptionProps<T>>
) => {
  const [local, others] = splitProps(props as TableCaptionProps, ["class", "children"])
  return (
    <caption class={cn("mt-4 text-sm text-muted-foreground", local.class)} {...others}>
      {local.children}
    </caption>
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  tableVariants,
  tableHeaderVariants,
  tableCellVariants,
  sortButtonVariants
}

export type {
  TableProps,
  TableColumn,
  TableHeaderProps,
  TableBodyProps,
  TableFooterProps,
  TableRowProps,
  TableHeadProps,
  TableCellProps,
  TableCaptionProps,
  SortState,
  FilterState
}