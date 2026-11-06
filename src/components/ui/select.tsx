"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { ChevronDown } from "lucide-react"
import { cn } from "cn"

export type SelectOption = { value: string; label: string }

function SelectField({
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  options,
  placeholder = "Choose",
  required,
  disabled,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  className,
}: {
  id?: string
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  required?: boolean
  disabled?: boolean
  "aria-label"?: string
  "aria-invalid"?: boolean
  className?: string
}) {
  return (
    <SelectPrimitive.Root
      name={name}
      value={value}
      defaultValue={defaultValue}
      required={required}
      disabled={disabled}
      onValueChange={(next) => {
        if (typeof next === "string") onValueChange?.(next)
      }}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={ariaInvalid || undefined}
        className={cn(
          "flex h-8 w-full items-center justify-between gap-2 rounded-control border border-input bg-transparent px-2.5 text-left text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner className="z-50 outline-none" sideOffset={4}>
          <SelectPrimitive.Popup className="max-h-72 min-w-(--anchor-width) overflow-auto rounded-control border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-none data-highlighted:bg-muted"
                >
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { SelectField }
