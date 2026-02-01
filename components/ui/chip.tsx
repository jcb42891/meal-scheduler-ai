import * as React from "react"

import { cn } from "@/lib/utils"

export type ChipProps = React.HTMLAttributes<HTMLSpanElement>

const Chip = React.forwardRef<HTMLSpanElement, ChipProps>(
  ({ className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        className
      )}
      {...props}
    />
  )
)
Chip.displayName = "Chip"

export { Chip }
