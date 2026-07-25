"use client";

/**
 * Shared Framer Motion variants + reduced-motion aware helpers.
 * Import these instead of re-declaring animation objects in every component.
 */
import type { Variants, Transition } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 380, damping: 30 };
export const springSoft: Transition = { type: "spring", stiffness: 260, damping: 24 };

/** Container that staggers its children on mount. */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.05 },
  },
};

/** A single item that fades + rises into place. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: springSoft },
};

/** Scale-in for cards / badges. */
export const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  show: { opacity: 1, scale: 1, transition: spring },
};

/** Tactile button interactions. */
export const tap = { scale: 0.97 };
export const hoverLift = { y: -3, transition: spring };

/** True when the user prefers reduced motion (SSR-safe). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
