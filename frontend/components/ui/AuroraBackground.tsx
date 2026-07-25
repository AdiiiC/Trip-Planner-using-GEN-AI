"use client";

/**
 * Aurora / mesh-gradient animated background.
 * Fixed, non-interactive, sits behind all content. GPU-friendly (transform + opacity).
 * Automatically static when the user prefers reduced motion (CSS handles it).
 */
export function AuroraBackground() {
  return (
    <div className="aurora-bg" aria-hidden="true">
      <span className="aurora-blob aurora-blob--1" />
      <span className="aurora-blob aurora-blob--2" />
      <span className="aurora-blob aurora-blob--3" />
    </div>
  );
}
