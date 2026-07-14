import type { Component } from "solid-js"
import { cn } from "~/lib/utils"

interface DateTimeFieldProps {
  label: string
  /** ISO 8601 datetime string with optional UTC offset, e.g. "2025-06-15T09:00:00+02:00" */
  value: string | undefined
  onChange: (isoString: string | undefined) => void
  class?: string
}

/** Returns local date and time values suitable for native input elements. */
function toLocalParts(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "", time: "" }

  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) return { date: "", time: "" }

  const date = [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, "0"),
    String(value.getDate()).padStart(2, "0"),
  ].join("-")
  const time = [value.getHours(), value.getMinutes()]
    .map(part => String(part).padStart(2, "0"))
    .join(":")

  return { date, time }
}

/** Converts a local date and time entered in the field to a UTC ISO instant. */
function fromParts(date: string, time: string): string | undefined {
  if (!date) return undefined

  const [year, month, day] = date.split("-").map(Number)
  const [hours, minutes] = (time || "00:00").split(":").map(Number)
  const value = new Date(year, month - 1, day, hours, minutes)

  return Number.isNaN(value.getTime()) ? undefined : value.toISOString()
}

const inputClass = "flex h-10 rounded-md border border-border bg-input px-3 py-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50"

const DateTimeField: Component<DateTimeFieldProps> = (props) => {
  const localParts = () => toLocalParts(props.value)
  const datePart = () => localParts().date
  const timePart = () => localParts().time

  const handleDateChange = (e: Event) => {
    const newDate = (e.currentTarget as HTMLInputElement).value
    props.onChange(fromParts(newDate, timePart()))
  }

  const handleTimeChange = (e: Event) => {
    const newTime = (e.currentTarget as HTMLInputElement).value
    props.onChange(fromParts(datePart(), newTime))
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
