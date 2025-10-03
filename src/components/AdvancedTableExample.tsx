import { createSignal, createMemo, For } from "solid-js"
import { 
  Table, 
  TableColumn,
  SortState,
  FilterState
} from "./ui/table"
import { 
  AdvancedFilters,
  AdvancedFilterConfig,
  AdvancedFilterState,
  filterData
} from "./ui/advanced-filters"
import { Button } from "./ui/button"
import { Badge } from "./ui/badge"

interface Product {
  id: number
  name: string
  category: string
  price: number
  stock: number
  rating: number
  inStock: boolean
  releaseDate: Date
  description: string
  tags: string[]
}

export function AdvancedTableExample() {
  // Sample product data
  const [products, setProducts] = createSignal<Product[]>([
    {
      id: 1,
      name: "MacBook Pro",
      category: "Laptops",
      price: 2499,
      stock: 15,
      rating: 4.8,
      inStock: true,
      releaseDate: new Date("2023-10-30"),
      description: "Powerful laptop for professionals",
      tags: ["apple", "laptop", "professional"]
    },
    {
      id: 2,
      name: "iPhone 15",
      category: "Phones",
      price: 999,
      stock: 50,
      rating: 4.7,
      inStock: true,
      releaseDate: new Date("2023-09-22"),
      description: "Latest iPhone with advanced features",
      tags: ["apple", "phone", "mobile"]
    },
    {
      id: 3,
      name: "Samsung Galaxy S24",
      category: "Phones",
      price: 899,
      stock: 0,
      rating: 4.6,
      inStock: false,
      releaseDate: new Date("2024-01-17"),
      description: "Premium Android smartphone",
      tags: ["samsung", "phone", "android"]
    },
    {
      id: 4,
      name: "Dell XPS 13",
      category: "Laptops",
      price: 1299,
      stock: 8,
      rating: 4.5,
      inStock: true,
      releaseDate: new Date("2023-08-15"),
      description: "Compact and powerful ultrabook",
      tags: ["dell", "laptop", "ultrabook"]
    },
    {
      id: 5,
      name: "iPad Pro",
      category: "Tablets",
      price: 1199,
      stock: 25,
      rating: 4.9,
      inStock: true,
      releaseDate: new Date("2023-05-10"),
      description: "Professional tablet for creative work",
      tags: ["apple", "tablet", "creative"]
    },
    {
      id: 6,
      name: "AirPods Pro",
      category: "Audio",
      price: 249,
      stock: 100,
      rating: 4.4,
      inStock: true,
      releaseDate: new Date("2023-09-12"),
      description: "Premium wireless earbuds",
      tags: ["apple", "audio", "wireless"]
    },
    {
      id: 7,
      name: "Sony WH-1000XM5",
      category: "Audio",
      price: 399,
      stock: 12,
      rating: 4.8,
      inStock: true,
      releaseDate: new Date("2023-03-20"),
      description: "Industry-leading noise canceling headphones",
      tags: ["sony", "audio", "headphones"]
    },
    {
      id: 8,
      name: "Microsoft Surface Pro",
      category: "Tablets",
      price: 1599,
      stock: 5,
      rating: 4.3,
      inStock: true,
      releaseDate: new Date("2023-06-18"),
      description: "2-in-1 laptop tablet hybrid",
      tags: ["microsoft", "tablet", "hybrid"]
    }
  ])

  const [loading, setLoading] = createSignal(false)
  const [tableSort, setTableSort] = createSignal<SortState | null>(null)
  const [advancedFilters, setAdvancedFilters] = createSignal<AdvancedFilterState>({})

  // Advanced filter configurations
  const filterConfigs: AdvancedFilterConfig[] = [
    {
      key: "name",
      label: "Product Name",
      type: "text",
      placeholder: "Search product names..."
    },
    {
      key: "category",
      label: "Category",
      type: "select",
      options: [
        { value: "Laptops", label: "Laptops" },
        { value: "Phones", label: "Phones" },
        { value: "Tablets", label: "Tablets" },
        { value: "Audio", label: "Audio" }
      ]
    },
    {
      key: "price",
      label: "Price Range",
      type: "numberrange",
      min: 0,
      max: 5000,
      step: 50
    },
    {
      key: "stock",
      label: "Stock Level",
      type: "numberrange",
      min: 0,
      max: 200,
      step: 1
    },
    {
      key: "rating",
      label: "Rating Range",
      type: "numberrange",
      min: 1,
      max: 5,
      step: 0.1
    },
    {
      key: "inStock",
      label: "In Stock",
      type: "boolean"
    },
    {
      key: "releaseDate",
      label: "Release Date Range",
      type: "daterange"
    },
    {
      key: "tags",
      label: "Tags",
      type: "multiselect",
      options: [
        { value: "apple", label: "Apple" },
        { value: "samsung", label: "Samsung" },
        { value: "dell", label: "Dell" },
        { value: "sony", label: "Sony" },
        { value: "microsoft", label: "Microsoft" },
        { value: "laptop", label: "Laptop" },
        { value: "phone", label: "Phone" },
        { value: "tablet", label: "Tablet" },
        { value: "audio", label: "Audio" },
        { value: "wireless", label: "Wireless" },
        { value: "professional", label: "Professional" },
        { value: "creative", label: "Creative" }
      ]
    }
  ]

  // Apply advanced filters
  const filteredProducts = createMemo(() => {
    const advancedFilteredData = filterData(products(), advancedFilters(), filterConfigs)
    
    // Apply custom tag filtering for multiselect
    const tagFilter = advancedFilters().tags
    if (tagFilter?.values?.length > 0) {
      return advancedFilteredData.filter(product => 
        tagFilter.values.some((tag: string) => product.tags.includes(tag))
      )
    }
    
    return advancedFilteredData
  })

  // Table columns configuration with sorting only
  const columns: TableColumn<Product>[] = [
    {
      key: "name",
      header: "Product",
      sortable: true,
      width: "250px",
      cell: (product) => (
        <div class="space-y-1">
          <div class="font-medium">{product.name}</div>
          <div class="text-xs text-muted-foreground truncate max-w-[200px]">
            {product.description}
          </div>
        </div>
      )
    },
    {
      key: "category",
      header: "Category",
      sortable: true,
      width: "120px",
      cell: (product) => (
        <Badge variant="outline">
          {product.category}
        </Badge>
      )
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      sortable: true,
      width: "100px",
      cell: (product) => `$${product.price.toLocaleString()}`
    },
    {
      key: "stock",
      header: "Stock",
      align: "center",
      sortable: true,
      width: "80px",
      cell: (product) => (
        <span class={product.stock === 0 ? "text-destructive" : product.stock < 10 ? "text-orange-600" : ""}>
          {product.stock}
        </span>
      )
    },
    {
      key: "rating",
      header: "Rating",
      align: "center",
      sortable: true,
      width: "80px",
      cell: (product) => (
        <div class="flex items-center gap-1">
          <span>⭐</span>
          <span>{product.rating}</span>
        </div>
      )
    },
    {
      key: "inStock",
      header: "Status",
      sortable: true,
      width: "100px",
      cell: (product) => (
        <Badge variant={product.inStock ? "default" : "error"}>
          {product.inStock ? "In Stock" : "Out of Stock"}
        </Badge>
      )
    },
    {
      key: "releaseDate",
      header: "Release Date",
      align: "center",
      sortable: true,
      width: "120px",
      sortFn: (a, b) => a.releaseDate.getTime() - b.releaseDate.getTime(),
      cell: (product) => product.releaseDate.toLocaleDateString()
    },
    {
      key: "actions",
      header: "Actions",
      align: "center",
      width: "120px",
      cell: (product) => (
        <div class="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => editProduct(product.id)}>
            Edit
          </Button>
          <Button size="sm" variant="destructive" onClick={() => deleteProduct(product.id)}>
            Delete
          </Button>
        </div>
      )
    }
  ]

  const addProduct = () => {
    const newProduct: Product = {
      id: Math.max(...products().map(p => p.id)) + 1,
      name: `Product ${products().length + 1}`,
      category: "Laptops",
      price: Math.floor(Math.random() * 2000) + 500,
      stock: Math.floor(Math.random() * 50),
      rating: Math.round((Math.random() * 2 + 3) * 10) / 10,
      inStock: Math.random() > 0.2,
      releaseDate: new Date(),
      description: "New product description",
      tags: ["new", "product"]
    }
    setProducts([...products(), newProduct])
  }

  const editProduct = (id: number) => {
    console.log("Edit product:", id)
  }

  const deleteProduct = (id: number) => {
    setProducts(products().filter(product => product.id !== id))
  }

  const refreshData = async () => {
    setLoading(true)
    
    // Simulate fetching fresh data (in real app, this would be an API call)
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Update data with fresh timestamps and randomized changes
    const refreshedProducts = products().map(product => ({
      ...product,
      releaseDate: new Date(),
      // Randomly update stock levels to show data changes
      stock: Math.max(0, product.stock + Math.floor(Math.random() * 21) - 10),
      // Occasionally toggle in-stock status
      inStock: Math.random() > 0.8 ? !product.inStock : product.inStock,
      // Small random price adjustments
      price: Math.max(50, product.price + Math.floor(Math.random() * 201) - 100)
    }))
    
    setProducts(refreshedProducts)
    setLoading(false)
  }

  const exportData = () => {
    const dataToExport = filteredProducts()
    console.log("Exporting filtered data:", dataToExport)
    // Implement actual export logic here
  }

  return (
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-3xl font-bold">Advanced Product Table</h2>
          <p class="text-muted-foreground mt-1">
            Comprehensive table with advanced filtering, sorting, and data management
          </p>
        </div>
        <div class="flex gap-2">
          <Button onClick={addProduct}>Add Product</Button>
          <Button variant="outline" onClick={refreshData}>
            Refresh
          </Button>
          <Button variant="outline" onClick={exportData}>
            Export Filtered
          </Button>
        </div>
      </div>

      {/* Advanced Filters Panel */}
      <AdvancedFilters
        title="Advanced Filters"
        filters={filterConfigs}
        values={advancedFilters()}
        onChange={setAdvancedFilters}
        collapsible={true}
        defaultExpanded={false}
      />

      {/* Results Summary */}
      <div class="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 px-4 py-2 rounded-lg">
        <div class="flex items-center gap-4">
          <span>
            Showing <strong>{filteredProducts().length}</strong> of <strong>{products().length}</strong> products
          </span>
          {Object.keys(advancedFilters()).length > 0 && (
            <span>
              <strong>{Object.keys(advancedFilters()).length}</strong> active filter{Object.keys(advancedFilters()).length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {tableSort() && (
          <span>
            Sorted by <strong>{tableSort()!.column}</strong> ({tableSort()!.direction})
          </span>
        )}
      </div>

      {/* Main Table */}
      <div class="rounded-md border">
        <Table
          data={filteredProducts()}
          columns={columns}
          loading={loading()}
          emptyMessage="No products match your criteria"
          variant="default"
          sortable={true}
          globalFilter={true}
          onSortChange={setTableSort}
        />
      </div>

      {/* Feature Highlights */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
        <div class="p-4 border rounded-lg space-y-2">
          <h4 class="font-medium">Advanced Filtering Panel</h4>
          <ul class="text-muted-foreground space-y-1 text-xs">
            <li>• Text search with partial matching</li>
            <li>• Dropdown selection filters</li>
            <li>• Number range filters (price, stock, rating)</li>
            <li>• Date range filtering</li>
            <li>• Boolean filters (in stock/out of stock)</li>
            <li>• Multi-select tag filtering</li>
          </ul>
        </div>
        
        <div class="p-4 border rounded-lg space-y-2">
          <h4 class="font-medium">Sorting & Global Search</h4>
          <ul class="text-muted-foreground space-y-1 text-xs">
            <li>• Click column headers to sort</li>
            <li>• Custom sort functions for dates</li>
            <li>• Visual sort indicators</li>
            <li>• Global fulltext search across all columns</li>
            <li>• Custom cell rendering with badges</li>
            <li>• Responsive column widths</li>
          </ul>
        </div>
        
        <div class="p-4 border rounded-lg space-y-2">
          <h4 class="font-medium">Data Management</h4>
          <ul class="text-muted-foreground space-y-1 text-xs">
            <li>• Add new products dynamically</li>
            <li>• Delete products with confirmation</li>
            <li>• Loading states during operations</li>
            <li>• Export filtered results</li>
            <li>• Real-time filter result counts</li>
            <li>• Collapsible filter panels</li>
          </ul>
        </div>
      </div>

      {/* Usage Instructions */}
      <div class="border rounded-lg p-4 bg-muted/20">
        <h3 class="font-medium mb-3">Try These Features:</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
          <div>
            <strong>Advanced Filtering Panel:</strong>
            <ul class="mt-1 space-y-1 text-xs list-disc list-inside ml-2">
              <li>Set price range between $500-$1500</li>
              <li>Filter by specific categories</li>
              <li>Show only in-stock items</li>
              <li>Filter by multiple tags (Apple + Phone)</li>
              <li>Set date range for recent releases</li>
            </ul>
          </div>
          <div>
            <strong>Table Sorting & Global Search:</strong>
            <ul class="mt-1 space-y-1 text-xs list-disc list-inside ml-2">
              <li>Sort by price (highest to lowest)</li>
              <li>Sort by rating or stock levels</li>
              <li>Use global search for "Pro"</li>
              <li>Combine advanced filters with sorting</li>
              <li>Search across all columns simultaneously</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}

// Simplified version for basic use cases
export function SimpleAdvancedTable() {
  const [data] = createSignal([
    { id: 1, name: "Item A", price: 100, category: "Category 1", active: true },
    { id: 2, name: "Item B", price: 200, category: "Category 2", active: false },
    { id: 3, name: "Item C", price: 300, category: "Category 1", active: true }
  ])

  const simpleFilters: AdvancedFilterConfig[] = [
    {
      key: "name",
      label: "Name",
      type: "text"
    },
    {
      key: "category",
      label: "Category", 
      type: "select",
      options: [
        { value: "Category 1", label: "Category 1" },
        { value: "Category 2", label: "Category 2" }
      ]
    },
    {
      key: "price",
      label: "Price Range",
      type: "numberrange",
      min: 0,
      max: 500
    },
    {
      key: "active",
      label: "Active",
      type: "boolean"
    }
  ]

  const [filters, setFilters] = createSignal<AdvancedFilterState>({})
  
  const filteredData = createMemo(() => 
    filterData(data(), filters(), simpleFilters)
  )

  const columns: TableColumn<any>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "price", header: "Price", sortable: true, align: "right" },
    { key: "category", header: "Category", sortable: true },
    { 
      key: "active", 
      header: "Status", 
      cell: (item) => (
        <Badge variant={item.active ? "default" : "secondary"}>
          {item.active ? "Active" : "Inactive"}
        </Badge>
      )
    }
  ]

  return (
    <div class="space-y-4">
      <h3 class="text-xl font-semibold">Simple Advanced Filtering</h3>
      
      <AdvancedFilters
        filters={simpleFilters}
        values={filters()}
        onChange={setFilters}
        collapsible={true}
        defaultExpanded={true}
      />
      
      <div class="rounded-md border">
        <Table
          data={filteredData()}
          columns={columns}
          variant="striped"
          sortable={true}
        />
      </div>
    </div>
  )
}