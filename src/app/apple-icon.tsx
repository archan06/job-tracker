import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The same mark as icon.svg. iOS rounds the corners itself, so the square is full-bleed.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#2563eb" }}>
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19.5h16" />
          <path d="M6.5 11.5l3.75 3.75L18 7.5" />
        </svg>
      </div>
    ),
    size,
  );
}
