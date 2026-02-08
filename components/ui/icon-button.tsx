import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const iconButtonVariants = cva(
  "inline-flex h-9 w-9 items-center justify-center rounded-md border border-transparent text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        ghost: "hover:bg-surface-2",
        destructive: "text-destructive hover:bg-destructive/10",
        subtle: "border-border/70 bg-surface-2 text-foreground hover:bg-surface-2/80",
      },
    },
    defaultVariants: {
      variant: "ghost",
    },
  }
)

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof iconButtonVariants> {}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, variant, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonVariants({ variant }), className)}
      {...props}
    />
  )
)
IconButton.displayName = "IconButton"

export { IconButton }
