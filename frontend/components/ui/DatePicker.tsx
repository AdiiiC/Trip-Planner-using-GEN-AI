"use client";

import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  className?: string;
  placeholder?: string;
  minDate?: Date;
  disabled?: boolean;
  compact?: boolean;
  "data-testid"?: string;
}

/**
 * Emerald-themed single date picker, matching DateRangePicker's aesthetic.
 * Used for one-way flights and multi-city arrival dates.
 */
export function DatePicker({
  value,
  onChange,
  className,
  placeholder = "Select a date",
  minDate,
  disabled,
  compact = false,
  ...props
}: Props) {
  const label = value ? format(value, "MMM d, yyyy") : placeholder;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          data-testid={props["data-testid"] ?? "date-picker-trigger"}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 text-left text-[var(--fg)] transition-colors",
            "hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] focus:outline-none",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            compact ? "h-8 text-xs" : "h-9 text-sm",
            !value && "text-[var(--fg-dim)]",
            className
          )}
        >
          <CalendarIcon
            className={cn(
              "text-[var(--fg-muted)] shrink-0",
              compact ? "w-3 h-3" : "w-3.5 h-3.5"
            )}
            strokeWidth={1.75}
          />
          <span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <Calendar
            mode="single"
            selected={value}
            onSelect={onChange}
            defaultMonth={value ?? new Date()}
            disabled={minDate ? { before: minDate } : undefined}
            data-testid="date-picker-calendar"
          />
        </div>
        {value && (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
            <span className="text-[11px] text-[var(--fg-muted)] font-mono">
              {format(value, "EEEE")}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(undefined)}
              data-testid="date-picker-clear"
              className="h-7 text-xs"
            >
              Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
