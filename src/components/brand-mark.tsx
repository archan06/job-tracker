/** The Landed mark, "Touchdown": a flight path landing on the horizon. Inherits color from its parent. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden>
      <path d="M4.5 5.5Q12.5 6 15.5 17.2" strokeWidth={2.2} />
      <path d="M3.75 19h16.5" strokeWidth={2.2} />
      <circle cx="15.6" cy="17.4" r="1.9" fill="currentColor" stroke="none" />
    </svg>
  );
}
