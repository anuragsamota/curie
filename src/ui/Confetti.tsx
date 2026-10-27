import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const COLORS = ["var(--color-primary)", "var(--color-secondary)", "var(--color-accent)", "var(--color-info)", "var(--color-success)"];
const DURATION = 1800;

/**
 * A one-shot burst of confetti from a point in the viewport. It renders in a fixed overlay and removes
 * itself when done, so falling pieces never extend the page's scroll height. Remount to replay.
 */
export function Confetti({ x, y, pieces = 44 }: { x: number; y: number; pieces?: number }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), DURATION);
    return () => clearTimeout(timer);
  }, []);
  const bits = useMemo(() => Array.from({ length: pieces }, (_, i) => {
    const angle = (Math.PI * 2 * i) / pieces + Math.random() * 0.4;
    const distance = 120 + Math.random() * 180;
    return {
      dx: `${Math.cos(angle) * distance}px`,
      dy: `${Math.sin(angle) * distance * 0.7 + 120}px`,
      rot: `${Math.random() * 720 - 360}deg`,
      color: COLORS[i % COLORS.length],
      delay: `${Math.random() * 120}ms`,
      shape: i % 3 === 0 ? "9999px" : "2px",
      size: 6 + Math.random() * 6,
    };
  }), [pieces]);

  if (done) return null;
  return createPortal(<div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] overflow-hidden">
    <div className="absolute" style={{ left: x, top: y }}>
      {bits.map((bit, i) => <span key={i} className="absolute block" style={{
        width: bit.size, height: bit.size * 0.6, background: bit.color, borderRadius: bit.shape,
        animation: `confetti-fall 1.6s cubic-bezier(0.2, 0.7, 0.4, 1) ${bit.delay} both`,
        "--dx": bit.dx, "--dy": bit.dy, "--rot": bit.rot,
      } as React.CSSProperties} />)}
    </div>
  </div>, document.body);
}
