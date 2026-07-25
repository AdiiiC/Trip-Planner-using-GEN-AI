"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, type DayPickerProps } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

/**
 * shadcn-style Calendar built on react-day-picker v10.
 * Themed with our zinc + emerald tokens for both light & dark modes.
 */
export type CalendarProps = DayPickerProps;

function Calendar({ className, classNames, ...props }: CalendarProps) {
  return (
    <DayPicker
      className={cn("rdp-emerald p-1 text-sm", className)}
      classNames={{
        months: "flex flex-col sm:flex-row gap-6",
        month: "space-y-3",
        month_caption: "flex justify-center items-center h-8 relative",
        caption_label: "text-sm font-medium tracking-tight text-[var(--fg)] font-display",
        nav: "flex items-center gap-1 absolute inset-x-1 top-0 justify-between",
        button_previous:
          "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] transition-colors",
        button_next:
          "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface-2)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] transition-colors",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 h-8 flex items-center justify-center text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--fg-dim)]",
        week: "flex w-full mt-1",
        day: "w-9 h-9 relative p-0 text-center",
        day_button:
          "w-9 h-9 rounded-md text-sm text-[var(--fg)] hover:bg-[var(--surface-2)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-30 disabled:pointer-events-none",
        today: "font-semibold text-[var(--accent-hover)]",
        selected:
          "bg-[var(--accent)] text-[var(--accent-fg)] hover:bg-[var(--accent-hover)] hover:text-[var(--accent-fg)] rounded-md",
        outside: "text-[var(--fg-dim)] opacity-40",
        disabled: "text-[var(--fg-dim)] opacity-30",
        hidden: "invisible",
        range_start:
          "bg-[var(--accent)] text-[var(--accent-fg)] rounded-l-md rounded-r-none",
        range_end:
          "bg-[var(--accent)] text-[var(--accent-fg)] rounded-r-md rounded-l-none",
        range_middle:
          "bg-[var(--accent-soft)] text-[var(--fg)] rounded-none",
        ...classNames,
      }}
      components={{
        Chevron: (props) => {
          if (props.orientation === "left") return <ChevronLeft className="w-4 h-4" strokeWidth={1.75} />;
          return <ChevronRight className="w-4 h-4" strokeWidth={1.75} />;
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
