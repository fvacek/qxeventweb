# Reactive Table Component

A comprehensive, reactive table component built with SolidJS, Kobalte Core, and Tailwind CSS for the qxevent project.

## 🚀 Quick Start

```tsx
import { Table, TableColumn } from "~/components/ui/table"

// Define your data type
interface User {
  id: number
  name: string
  email: string
  status: "active" | "inactive"
}

// Define columns
const columns: TableColumn<User>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "email", header: "Email", sortable: true },
  { 
    key: "status", 
    header: "Status",
    sortable: true,
    cell: (user) => <Badge variant={user.status === "active" ? "default" : "secondary"}>{user.status}</Badge>
  }
]

// Use the table
function UserTable() {
  const [users, setUsers] = createSignal<User[]>([...])

  return (
    <Table 
      data={users()} 
      columns={columns}
      variant="striped"
      sortable={true}
      globalFilter={true}
      loading={false}
      emptyMessage="No users found"
      onSortChange={(sort) => console.log("Sort:", sort)}
    />
  )
}
```

## 📁 Files Created

- `src/components/ui/table.tsx` - Main table component with all sub-components
- `src/components/TableExample.tsx` - Comprehensive examples and demos
- `src/routes/TableDemo.tsx` - Demo page showcasing all features
- `src/components/ui/table.md` - Detailed documentation

## ✨ Features

- **Reactive Data**: Automatically updates when data changes
- **Smart Sorting**: Click headers to sort with visual indicators and custom functions
- **Global Search**: Fulltext search across all columns simultaneously
- **Flexible API**: Auto-render with data/columns or manual composition
- **Multiple Variants**: Default, striped, bordered styles
- **Custom Cells**: Render any SolidJS component in cells
- **Loading States**: Built-in loading and empty state handling
- **Selectable Rows**: Single/multi-row selection support
- **Sticky Headers**: Headers stay visible during scroll
- **Responsive**: Horizontal scrolling for overflow
- **Accessible**: Semantic HTML with proper ARIA attributes
- **TypeScript**: Full type safety throughout

## 🎨 Variants

- `default` - Clean, minimal styling
- `striped` - Alternating row colors
- `bordered` - Borders around cells

## 🧩 Components

- `Table` - Root table container
- `TableHeader` - Header section (supports sticky)
- `TableBody` - Body section for data rows
- `TableFooter` - Footer section
- `TableRow` - Individual row (supports selection, click handlers)
- `TableHead` - Header cell
- `TableCell` - Data cell
- `TableCaption` - Accessibility caption

## 📖 Usage Modes

### 1. Automatic Rendering
Pass `data` and `columns` props for quick setup:

```tsx
<Table 
  data={items()} 
  columns={columnConfig}
  variant="striped"
  sortable={true}
  globalFilter={true}
/>
```

### 2. Manual Composition
Use individual components for full control:

```tsx
<Table>
  <TableHeader sticky>
    <TableRow>
      <TableHead>Column 1</TableHead>
      <TableHead align="center">Column 2</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <For each={data()}>
      {(item) => (
        <TableRow onClick={() => handleRowClick(item)}>
          <TableCell>{item.name}</TableCell>
          <TableCell align="center">{item.value}</TableCell>
        </TableRow>
      )}
    </For>
  </TableBody>
</Table>
```

## 🎯 View the Demo

Run the project and navigate to `/table-demo` to see all features in action.

## 🔧 Customization

The table uses Tailwind CSS classes and can be customized via:
- `class` prop on any component
- CSS custom properties for theming
- Variant system for predefined styles
- Custom sort functions for complex data types
- Global search across all column data

## ♿ Accessibility

- Semantic HTML elements (`<table>`, `<thead>`, `<tbody>`, etc.)
- Proper ARIA attributes
- Keyboard navigation support
- Screen reader friendly

## 🚀 Performance

- Reactive updates only when data changes
- Uses SolidJS fine-grained reactivity
- Minimal re-renders with `createMemo()` for computed data
- Efficient sorting and search operations
- Optimized global search with memoization
- Efficient DOM updates

## 📝 Notes

- Built following existing project patterns (CVA, Kobalte, Tailwind)
- Fully typed with TypeScript
- Consistent with other UI components in the project
- Simplified interface with global search instead of per-column filtering
- Advanced filtering available via separate AdvancedFilters component
- Production-ready with comprehensive error handling