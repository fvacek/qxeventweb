import type { Component } from "solid-js"
import { cn } from "~/lib/utils"

interface DateTimeFieldProps {
  label: string
  /** ISO 8601 datetime string with optional UTC offset, e.g. "2025-06-15T09:00:00+02:00" */
  value: string | undefined
  onChange: (isoString: string | undefined) => void
  class?: string
}

/** Splits an ISO datetime string into the date part (YYYY-MM-DD) for the date input. */
function toDatePart(iso: string | undefined): string {
  if (!iso) return ""
  // native Date gives us local-time parts — but the stored string already carries
  // the offset, so we just slice the date portion directly from the string itself.
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : ""
}

/** Extracts HH:MM from an ISO datetime string. */
function toTimePart(iso: string | undefined): string {
  if (!iso) return ""
  const match = iso.match(/T(\d{2}:\d{2})/)
  return match ? match[1] : ""
}

/** Returns the UTC offset suffix from an ISO string, e.g. "+02:00". Falls back to "Z". */
function toOffsetPart(iso: string | undefined): string {
  if (!iso) return "Z"
  const match = iso.match(/(Z|[+-]\d{2}:\d{2})$/)
  return match ? match[1] : "Z"
}

/** Combines date, time and offset parts back into an ISO string. */
function fromParts(date: string, time: string, offset: string): string | undefined {
  if (!date) return undefined
  const t = time || "00:00"
  return `${date}T${t}:00${offset}`
}

const inputClass = "flex h-10 rounded-md border border-border bg-input px-3 py-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50"

const DateTimeField: Component<DateTimeFieldProps> = (props) => {
  const datePart = () => toDatePart(props.value)
  const timePart = () => toTimePart(props.value)
  const offsetPart = () => toOffsetPart(props.value)

  const handleDateChange = (e: Event) => {
    const newDate = (e.currentTarget as HTMLInputElement).value
    props.onChange(fromParts(newDate, timePart(), offsetPart()))
  }

  const handleTimeChange = (e: Event) => {
    const newTime = (e.currentTarget as HTMLInputElement).value
    props.onChange(fromParts(datePart(), newTime, offsetPart()))
  }

  return (
    <div class={cn("flex flex-col gap-1", props.class)}>
      <label class="text-sm font-medium leading-none">{props.label}</label>
      <div class="flex gap-2">
        <input
          type="date"
          value={datePart()}
          onChange={handleDateChange}
          class={cn(inputClass, "flex-1")}
        />
        <input
          type="time"
          value={timePart()}
          onChange={handleTimeChange}
          class={cn(inputClass, "w-32")}
        />
      </div>
    </div>
  )
}

export { DateTimeField }
