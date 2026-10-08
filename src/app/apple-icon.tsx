import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// The same mark and tile as icon.svg. iOS rounds the corners itself, so the square is full-bleed.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #1e3a8a 0%, #2563eb 100%)",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeLinecap="round">
          <path d="M4.5 5.5Q12.5 6 15.5 17.2" strokeWidth={2.2} />
          <path d="M3.75 19h16.5" strokeWidth={2.2} />
          <circle cx="15.6" cy="17.4" r="1.9" fill="#fff" stroke="none" />
        </svg>
      </div>
    ),
    size,
  );
}
