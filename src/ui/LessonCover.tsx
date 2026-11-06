import { useEffect, useState } from "react";

// A lesson's cover image when it has one; otherwise quiet generated art: a muted gradient from a curated
// palette with thin concentric orbits, all derived from the lesson's id so it never changes.

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

/** Hues that sit well next to the brand blue: blue, violet, teal, green, coral, amber, rose, sky. */
const HUES = [266, 292, 196, 158, 32, 70, 352, 236];

export function LessonCover({ seed, title, image, className = "" }: { seed: string; title: string; image?: string; className?: string }) {
  if (image) return <div aria-hidden="true" className={`relative overflow-hidden bg-base-300 ${className}`}><img src={image} alt="" className="absolute inset-0 size-full object-cover" draggable={false} /></div>;
  const h = hash(seed);
  const hue = HUES[h % HUES.length];
  const cx = 130 + ((h >> 5) % 50);
  const cy = 40 + ((h >> 11) % 50);
  const electron = ((h >> 15) % 360) * (Math.PI / 180);
  const initial = title.trim().charAt(0).toUpperCase() || "C";
  return <div
    aria-hidden="true"
    className={`relative overflow-hidden ${className}`}
    style={{ background: `linear-gradient(150deg, oklch(66% 0.11 ${hue}) 0%, oklch(52% 0.13 ${hue + 18}) 100%)` }}
  >
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
      <g fill="none" stroke="white" strokeWidth="1">
        {[22, 40, 58, 76].map((r, i) => <circle key={r} cx={cx} cy={cy} r={r} strokeOpacity={0.3 - i * 0.06} />)}
      </g>
      <circle cx={cx + 40 * Math.cos(electron)} cy={cy + 40 * Math.sin(electron)} r="3" fill="white" fillOpacity="0.9" />
      <circle cx={cx} cy={cy} r="5" fill="white" fillOpacity="0.85" />
    </svg>
    <span className="font-display absolute bottom-2.5 left-3.5 text-4xl font-semibold leading-none tracking-tight text-white/90">{initial}</span>
  </div>;
}

/** An object URL for a blob, revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob?: Blob) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!blob) return setUrl(undefined);
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);
  return url;
}

/** The wide cover image at the top of a lesson. */
export function CoverBanner({ image, className = "" }: { image?: Blob; className?: string }) {
  const url = useObjectUrl(image);
  if (!url) return null;
  return <img src={url} alt="" draggable={false} className={`aspect-[16/7] w-full rounded-2xl object-cover ${className}`} />;
}
