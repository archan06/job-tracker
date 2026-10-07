/** The Landed mark: a check landing on the horizon. Inherits color from its parent. */
export function BrandMark({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5h16" />
      <path d="M6.5 11.5l3.75 3.75L18 7.5" />
    </svg>
  );
}
