"use client";

import { useEffect, useRef, useState } from "react";
import { animate } from "framer-motion";
import { prefersReducedMotion } from "@/lib/motion";

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
  className?: string;
}

/**
 * Animated number that counts up from the previous value to the new value.
 * Respects prefers-reduced-motion (snaps instantly when set).
 */
export function CountUp({
  value,
  duration = 0.8,
  decimals = 0,
  prefix = "",
  suffix = "",
  format,
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setDisplay(value);
      prev.current = value;
      return;
    }
    const controls = animate(prev.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  const text = format
    ? format(display)
    : `${prefix}${display.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

  return <span className={className}>{text}</span>;
}
