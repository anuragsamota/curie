// The Curie mark: an open orbit that reads as a lowercase "c", with one electron closing the gap.
// Flat colours so it stays crisp at 16 px. Keep in sync with public/favicon.svg and src-tauri/icons/source.svg.

export const LOGO_COLORS = { tile: "oklch(50% 0.2 266)", orbit: "#ffffff", electron: "oklch(86% 0.13 168)" };

/** The arc runs from 45° to 315° (gap on the right); the electron sits at 0°. */
const ORBIT = "M27.42 12.58 A10.5 10.5 0 1 0 27.42 27.42";

export function LogoMark({ size = 36, animated = false, className = "" }: { size?: number; animated?: boolean; className?: string }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" className={className} aria-hidden="true">
    <rect width="40" height="40" rx="11" fill={LOGO_COLORS.tile} />
    <path d={ORBIT} fill="none" stroke={LOGO_COLORS.orbit} strokeWidth="4.2" strokeLinecap="round" />
    {/* Animated, the electron circles the orbit; still, it closes the "c". */}
    <g className={animated ? "animate-electron" : ""} style={{ transformOrigin: "20px 20px" }}>
      <circle cx="30.5" cy="20" r="2.7" fill={LOGO_COLORS.electron} />
    </g>
  </svg>;
}

export function Logo({ collapsed = false }: { collapsed?: boolean }) {
  return <span className="flex items-center gap-2">
    <LogoMark size={30} />
    {!collapsed && <span className="font-display text-[1.3rem] font-semibold leading-none tracking-[-0.04em]">curie</span>}
  </span>;
}
