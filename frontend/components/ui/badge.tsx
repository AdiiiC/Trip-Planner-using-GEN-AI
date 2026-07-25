import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors focus:outline-none",
  {
    variants: {
      variant: {
        default:
          "border-[var(--accent-ring)] bg-[var(--accent-soft)] text-[var(--accent-hover)]",
        secondary:
          "border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-muted)]",
        outline:
          "border-[var(--border-strong)] text-[var(--fg-muted)]",
        solid:
          "border-transparent bg-[var(--fg)] text-[var(--bg)]",
        destructive:
          "border-rose-500/30 bg-rose-500/10 text-rose-400",
        warning:
          "border-amber-500/30 bg-amber-500/10 text-amber-400",
        success:
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
