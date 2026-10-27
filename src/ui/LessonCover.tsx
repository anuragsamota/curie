// Generated cover art: each lesson gets a stable hue and orbit arrangement derived from its id.

function hash(text: string): number {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

export function LessonCover({ seed, title, className = "" }: { seed: string; title: string; className?: string }) {
  const h = hash(seed);
  const hue = h % 360;
  const tilt = (h >> 9) % 180;
  const orbits = 2 + ((h >> 4) % 2);
  const initial = title.trim().charAt(0).toUpperCase() || "C";
  return <div
    aria-hidden="true"
    className={`relative overflow-hidden ${className}`}
    style={{ background: `radial-gradient(120% 90% at 85% 10%, oklch(78% 0.13 ${hue + 40}) 0%, transparent 55%), linear-gradient(135deg, oklch(55% 0.17 ${hue}), oklch(36% 0.14 ${hue + 30}))` }}
  >
    <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 size-full">
      <g transform="translate(150 60)" fill="none" stroke="white" strokeOpacity="0.32" strokeWidth="1.4">
        {Array.from({ length: orbits }, (_, i) => <ellipse key={i} rx="58" ry="20" transform={`rotate(${tilt + i * (180 / orbits)})`} />)}
        <circle r="7" fill={`oklch(92% 0.18 ${(hue + 150) % 360})`} stroke="none" fillOpacity="0.9" />
        <circle cx="58" r="3.4" fill="white" stroke="none" fillOpacity="0.85" transform={`rotate(${tilt})`} />
      </g>
    </svg>
    <span className="font-display absolute bottom-2 left-4 text-6xl font-extrabold leading-none text-white/90 drop-shadow-sm">{initial}</span>
  </div>;
}
