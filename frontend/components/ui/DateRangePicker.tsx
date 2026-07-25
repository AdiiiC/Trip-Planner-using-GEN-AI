"use client";

import * as React from "react";
import { format, differenceInCalendarDays } from "date-fns";
import { Calendar as CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  value: DateRange | undefined;
  onChange: (range: DateRange | undefined) => void;
  className?: string;
  numberOfMonths?: number;
  "data-testid"?: string;
}

/**
 * A refined two-month range picker for check-in / check-out flows.
 * Uses react-day-picker v10 in "range" mode inside a Radix Popover.
 */
export function DateRangePicker({
  value,
  onChange,
  className,
  numberOfMonths = 2,
  ...props
}: Props) {
  const from = value?.from;
  const to = value?.to;

  const label = React.useMemo(() => {
    if (!from) return "Select dates";
    if (!to) return format(from, "MMM d, yyyy");
    return `${format(from, "MMM d")} → ${format(to, "MMM d, yyyy")}`;
  }, [from, to]);

  const nights =
    from && to ? Math.max(0, differenceInCalendarDays(to, from)) : 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid={props["data-testid"] ?? "date-range-trigger"}
          className={cn(
            "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 text-left text-sm text-[var(--fg)] transition-colors",
            "hover:border-[var(--border-strong)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-ring)] focus:outline-none",
            !from && "text-[var(--fg-dim)]",
            className
          )}
        >
          <span className="flex items-center gap-2 truncate">
            <CalendarIcon className="w-3.5 h-3.5 text-[var(--fg-muted)] shrink-0" strokeWidth={1.75} />
            {label}
          </span>
          {nights > 0 && (
            <span className="text-[10px] font-mono uppercase tracking-[0.08em] text-[var(--accent-hover)] border border-[var(--accent-ring)] bg-[var(--accent-soft)] rounded-full px-1.5 py-0.5 shrink-0">
              {nights}n
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-3">
          <Calendar
            mode="range"
            selected={value}
            onSelect={onChange}
            numberOfMonths={numberOfMonths}
            defaultMonth={from ?? new Date()}
            disabled={{ before: new Date() }}
            data-testid="date-range-calendar"
          />
        </div>
        <div className="flex items-center justify-between border-t border-[var(--border)] px-3 py-2">
          <span className="text-[11px] text-[var(--fg-muted)] font-mono">
            {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"} selected` : "Pick a check-in date"}
          </span>
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(undefined)}
              data-testid="date-range-clear"
              className="h-7 text-xs"
            >
              Clear
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
