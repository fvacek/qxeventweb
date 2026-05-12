import type { Component } from "solid-js"
import { cn } from "~/lib/utils"

interface SwitchFieldProps {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  class?: string
}

const SwitchField: Component<SwitchFieldProps> = (props) => {
  return (
    <label class={cn("flex items-center gap-3 cursor-pointer select-none", props.disabled && "opacity-50 cursor-not-allowed", props.class)}>
      <div
        class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent bg-input transition-colors"
        classList={{ "bg-primary": props.checked }}
        onClick={() => !props.disabled && props.onChange(!props.checked)}
      >
        <span
          class="pointer-events-none block size-5 rounded-full bg-background shadow-lg transition-transform"
          classList={{ "translate-x-5": props.checked, "translate-x-0": !props.checked }}
        />
      </div>
      <span class="text-sm font-medium leading-none">{props.label}</span>
    </label>
  )
}

export { SwitchField }
