"use client"

import type { ComponentProps } from "react"
import { cn } from "cn"

function FileInput({
  className,
  label = "Choose file",
  ...props
}: ComponentProps<"input"> & { label?: string }) {
  return (
    <label
      className={cn(
        "inline-flex h-7 cursor-pointer items-center rounded-control border border-border bg-background px-2.5 text-[0.8rem] hover:bg-muted",
        props.disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <input {...props} type="file" className="sr-only" />
      {label}
    </label>
  )
}

export { FileInput }
