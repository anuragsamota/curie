// The Curie mark: an open orbit forming a "C" around a radium-green nucleus, with one electron at the
// opening. Keep in sync with public/favicon.svg.

import { useId } from "react";

export function LogoMark({ size = 36, animated = false, className = "" }: { size?: number; animated?: boolean; className?: string }) {
  // Unique gradient ids per instance: a gradient defined inside a hidden (display: none) SVG doesn't render elsewhere.
  const id = useId();
  const bg = `${id}-bg`;
  const glow = `${id}-glow`;
  return <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
    <defs>
      <linearGradient id={bg} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="oklch(46% 0.22 283)" />
        <stop offset="1" stopColor="oklch(33% 0.17 292)" />
      </linearGradient>
      <radialGradient id={glow}>
        <stop offset="0" stopColor="oklch(92% 0.2 128)" stopOpacity="0.9" />
        <stop offset="1" stopColor="oklch(92% 0.2 128)" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="40" height="40" rx="12" fill={`url(#${bg})`} />
    <circle cx="20" cy="20" r="9" fill={`url(#${glow})`} className={animated ? "animate-glow" : ""} />
    <g className={animated ? "animate-orbit" : ""} style={{ transformOrigin: "20px 20px" }}>
      <path d="M28.4 13.6 A11 11 0 1 0 28.4 26.4" fill="none" stroke="oklch(91% 0.19 128)" strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="29.2" cy="13" r="2.6" fill="oklch(84% 0.14 66)" />
    </g>
    <circle cx="20" cy="20" r="3.6" fill="oklch(93% 0.19 128)" />
  </svg>;
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return <span className="flex items-center gap-2.5">
    <LogoMark size={34} />
    {!collapsed && <span className="font-display text-[1.45rem] font-bold leading-none tracking-tight">curie</span>}
  </span>;
}
