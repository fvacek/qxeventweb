import type { Component } from "solid-js"
import { cn } from "~/lib/utils"

interface DateTimeFieldProps {
  label: string
  /** Local date `YYYY-MM-DD` */
  date: string | undefined
  /** Local time `HH:MM:SS` */
  time: string | undefined
  onDateChange: (date: string | undefined) => void
  onTimeChange: (time: string | undefined) => void
  class?: string
}

/** `HH:MM:SS` from the native time input value `HH:MM[:SS]`, `undefined` if empty. */
export function normalizeTime(time: string): string | undefined {
  if (!time) return undefined
  return /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
}

const inputClass = "flex h-10 rounded-md border border-border bg-input px-3 py-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-50"

/** Local date and time edited as plain strings, no time zone conversion. */
const DateTimeField: Component<DateTimeFieldProps> = (props) => {
  return (
    <div class={cn("flex flex-col gap-1", props.class)}>
      <label class="text-sm font-medium leading-none">{props.label}</label>
      <div class="flex gap-2">
        <input
          type="date"
          value={props.date ?? ""}
          onChange={(e) => props.onDateChange(e.currentTarget.value || undefined)}
          class={cn(inputClass, "flex-1")}
        />
        <input
          type="time"
          step="1"
          value={props.time ?? ""}
          onChange={(e) => props.onTimeChange(normalizeTime(e.currentTarget.value))}
          class={cn(inputClass, "w-36")}
        />
      </div>
    </div>
  )
}

export { DateTimeField }
