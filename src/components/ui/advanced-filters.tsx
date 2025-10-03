import type { JSX, ValidComponent } from "solid-js"
import { splitProps, createSignal, For, Show } from "solid-js"
import type { PolymorphicProps } from "@kobalte/core/polymorphic"
import { Button } from "./button"
import { cn } from "~/lib/utils"

// Advanced filter types
export interface DateRangeFilter {
  from?: string
  to?: string
}

export interface NumberRangeFilter {
  min?: number
  max?: number
}

export interface MultiSelectFilter {
  values: string[]
}

export interface AdvancedFilterConfig {
  type: "text" | "select" | "multiselect" | "daterange" | "numberrange" | "boolean"
  label: string
  key: string
  placeholder?: string
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
}

export interface AdvancedFilterState {
  [key: string]: any
}

// Advanced Filter Item Component
interface AdvancedFilterItemProps {
  config: AdvancedFilterConfig
  value: any
  onChange: (value: any) => void
}

const AdvancedFilterItem = (props: AdvancedFilterItemProps) => {
  const handleTextChange = (e: Event) => {
    const target = e.target as HTMLInputElement
    props.onChange(target.value || undefined)
  }

  const handleSelectChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    props.onChange(target.value || undefined)
  }

  const handleMultiSelectChange = (value: string, checked: boolean) => {
    const currentValues = props.value?.values || []
    const newValues = checked
      ? [...currentValues, value]
      : currentValues.filter((v: string) => v !== value)
    
    props.onChange(newValues.length > 0 ? { values: newValues } : undefined)
  }

  const handleDateRangeChange = (field: "from" | "to", value: string) => {
    const current = props.value || {}
    const newValue = { ...current, [field]: value || undefined }
    
    // Remove empty values
    if (!newValue.from && !newValue.to) {
      props.onChange(undefined)
    } else {
      props.onChange(newValue)
    }
  }

  const handleNumberRangeChange = (field: "min" | "max", value: string) => {
    const current = props.value || {}
    const numValue = value === "" ? undefined : Number(value)
    const newValue = { ...current, [field]: numValue }
    
    // Remove empty values
    if (newValue.min === undefined && newValue.max === undefined) {
      props.onChange(undefined)
    } else {
      props.onChange(newValue)
    }
  }

  const handleBooleanChange = (e: Event) => {
    const target = e.target as HTMLSelectElement
    const value = target.value
    if (value === "") {
      props.onChange(undefined)
    } else {
      props.onChange(value === "true")
    }
  }

  return (
    <div class="space-y-2">
      <label class="text-sm font-medium text-foreground">
        {props.config.label}
      </label>
      
      <Show when={props.config.type === "text"}>
        <input
          type="text"
          value={props.value || ""}
          onInput={handleTextChange}
          placeholder={props.config.placeholder || `Filter ${props.config.label.toLowerCase()}...`}
          class="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        />
      </Show>

      <Show when={props.config.type === "select"}>
        <select
          value={props.value || ""}
          onChange={handleSelectChange}
          class="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        >
          <option value="">All</option>
          <For each={props.config.options || []}>
            {(option) => (
              <option value={option.value}>{option.label}</option>
            )}
          </For>
        </select>
      </Show>

      <Show when={props.config.type === "multiselect"}>
        <div class="space-y-2 max-h-48 overflow-y-auto border border-border rounded-md p-2">
          <For each={props.config.options || []}>
            {(option) => (
              <label class="flex items-center space-x-2 text-sm">
                <input
                  type="checkbox"
                  checked={props.value?.values?.includes(option.value) || false}
                  onChange={(e) => handleMultiSelectChange(option.value, e.target.checked)}
                  class="rounded border-border"
                />
                <span>{option.label}</span>
              </label>
            )}
          </For>
        </div>
      </Show>

      <Show when={props.config.type === "daterange"}>
        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={props.value?.from || ""}
              onChange={(e) => handleDateRangeChange("from", e.target.value)}
              placeholder="From"
              class="px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            <input
              type="date"
              value={props.value?.to || ""}
              onChange={(e) => handleDateRangeChange("to", e.target.value)}
              placeholder="To"
              class="px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
        </div>
      </Show>

      <Show when={props.config.type === "numberrange"}>
        <div class="space-y-2">
          <div class="grid grid-cols-2 gap-2">
            <input
              type="number"
              value={props.value?.min ?? ""}
              onChange={(e) => handleNumberRangeChange("min", e.target.value)}
              placeholder="Min"
              min={props.config.min}
              max={props.config.max}
              step={props.config.step}
              class="px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
            <input
              type="number"
              value={props.value?.max ?? ""}
              onChange={(e) => handleNumberRangeChange("max", e.target.value)}
              placeholder="Max"
              min={props.config.min}
              max={props.config.max}
              step={props.config.step}
              class="px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
            />
          </div>
        </div>
      </Show>

      <Show when={props.config.type === "boolean"}>
        <select
          value={props.value === undefined ? "" : String(props.value)}
          onChange={handleBooleanChange}
          class="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
        >
          <option value="">All</option>
          <option value="true">Yes</option>
          <option value="false">No</option>
        </select>
      </Show>
    </div>
  )
}

// Advanced Filters Panel Component
interface AdvancedFiltersProps<T extends ValidComponent = "div"> {
  class?: string | undefined
  children?: JSX.Element
  filters: AdvancedFilterConfig[]
  values: AdvancedFilterState
  onChange: (values: AdvancedFilterState) => void
  onClear?: () => void
  title?: string
  collapsible?: boolean
  defaultExpanded?: boolean
}

const AdvancedFilters = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, AdvancedFiltersProps<T>>
) => {
  const [local, others] = splitProps(props as AdvancedFiltersProps, [
    "class",
    "children",
    "filters",
    "values",
    "onChange",
    "onClear",
    "title",
    "collapsible",
    "defaultExpanded"
  ])

  const [expanded, setExpanded] = createSignal(local.defaultExpanded ?? true)

  const handleFilterChange = (key: string, value: any) => {
    const newValues = { ...local.values }
    
    if (value === undefined || value === null || value === "") {
      delete newValues[key]
    } else {
      newValues[key] = value
    }
    
    local.onChange(newValues)
  }

  const handleClearAll = () => {
    local.onChange({})
    local.onClear?.()
  }

  const activeFilterCount = Object.keys(local.values).length

  return (
    <div class={cn("border border-border rounded-lg", local.class)} {...others}>
      <Show when={local.title || local.collapsible}>
        <div class="flex items-center justify-between p-4 border-b border-border">
          <div class="flex items-center space-x-2">
            <Show when={local.collapsible}>
              <button
                onClick={() => setExpanded(!expanded())}
                class="text-muted-foreground hover:text-foreground"
              >
                {expanded() ? "−" : "+"}
              </button>
            </Show>
            <h3 class="font-medium">
              {local.title || "Filters"}
              <Show when={activeFilterCount > 0}>
                <span class="ml-2 text-xs bg-primary text-primary-foreground px-2 py-1 rounded-full">
                  {activeFilterCount}
                </span>
              </Show>
            </h3>
          </div>
          <Show when={activeFilterCount > 0}>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
            >
              Clear All
            </Button>
          </Show>
        </div>
      </Show>

      <Show when={expanded()}>
        <div class="p-4 space-y-4">
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <For each={local.filters}>
              {(filter) => (
                <AdvancedFilterItem
                  config={filter}
                  value={local.values[filter.key]}
                  onChange={(value) => handleFilterChange(filter.key, value)}
                />
              )}
            </For>
          </div>
          
          {local.children}
        </div>
      </Show>
    </div>
  )
}

// Filter utility functions
export const filterData = <T extends Record<string, any>>(
  data: T[],
  filters: AdvancedFilterState,
  configs: AdvancedFilterConfig[]
): T[] => {
  return data.filter(item => {
    for (const [key, filterValue] of Object.entries(filters)) {
      if (filterValue === undefined || filterValue === null) continue
      
      const config = configs.find(c => c.key === key)
      if (!config) continue
      
      const itemValue = item[key]
      
      switch (config.type) {
        case "text":
          if (typeof itemValue !== "string" || 
              !itemValue.toLowerCase().includes(String(filterValue).toLowerCase())) {
            return false
          }
          break
          
        case "select":
          if (itemValue !== filterValue) return false
          break
          
        case "multiselect":
          if (!filterValue.values?.includes(itemValue)) return false
          break
          
        case "daterange":
          const itemDate = new Date(itemValue)
          if (filterValue.from && itemDate < new Date(filterValue.from)) return false
          if (filterValue.to && itemDate > new Date(filterValue.to)) return false
          break
          
        case "numberrange":
          const numValue = Number(itemValue)
          if (isNaN(numValue)) return false
          if (filterValue.min !== undefined && numValue < filterValue.min) return false
          if (filterValue.max !== undefined && numValue > filterValue.max) return false
          break
          
        case "boolean":
          if (Boolean(itemValue) !== Boolean(filterValue)) return false
          break
      }
    }
    
    return true
  })
}

// Export components and utilities
export {
  AdvancedFilters,
  AdvancedFilterItem
}

export type {
  AdvancedFiltersProps,
  AdvancedFilterItemProps
}