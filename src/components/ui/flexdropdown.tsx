import { createSignal, For, JSX } from "solid-js";
import { Button } from "~/components/ui/button";

interface FlexDropdownProps {
  value: string;
  options: string[];
  onSelect: (option: string) => void;
  placeholder?: string;
  disabled?: boolean;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link" | "destructive";
  size?: "default" | "sm" | "lg" | "icon";
  class?: string;
  fullWidth?: boolean;
}

export function FlexDropdown(props: FlexDropdownProps) {
  const [isOpen, setIsOpen] = createSignal(false);

  const popupClasses = props.fullWidth 
    ? "absolute top-full z-50 mt-1 bg-background border rounded-md shadow-lg p-2 max-w-none! min-w-0! left-0! right-0! w-[calc(100vw-2rem)]! md:w-[calc(100vw-4rem)]! lg:w-[calc(min(56rem,100vw-4rem))]!"
    : "absolute top-full left-0 z-50 mt-1 min-w-full bg-background border rounded-md shadow-lg p-2";

  return (
    <div class={`relative ${props.class || ""}`}>
      <Button
        variant={props.variant || "default"}
        size={props.size || "default"}
        onClick={() => setIsOpen(!isOpen())}
        disabled={props.disabled}
        class="min-w-24"
      >
        {props.value || props.placeholder || "Select..."}
        <svg
          class="ml-2 h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </Button>
      
      {isOpen() && (
        <div class={popupClasses}>
          <div class="flex flex-wrap gap-2">
            <For each={props.options}>
              {(option) => (
                <Button
                  variant={props.value === option ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    props.onSelect(option);
                    setIsOpen(false);
                  }}
                >
                  {option}
                </Button>
              )}
            </For>
          </div>
        </div>
      )}
      
      {/* Click outside to close dropdown */}
      {isOpen() && (
        <div
          class="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}