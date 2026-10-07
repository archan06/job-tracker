"use client";

import { useState } from "react";
import { avatarColor, initials } from "@/lib/company-avatar";
import { logoUrl } from "@/lib/logo";

const SIZES = { sm: 20, md: 24, lg: 40 } as const;

type Props = { company: string; domain: string | null; size: keyof typeof SIZES; className?: string };

/** The company's logo, or a colored initials circle when there's no domain or the logo doesn't load. Decorative: the name is always shown beside it. */
export function CompanyLogo({ company, domain, size, className = "" }: Props) {
  const px = SIZES[size];
  const src = domain ? logoUrl(domain, px) : null;
  // Remember which URL failed, so a new domain gets a fresh try.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== null && failedSrc !== src;
  const slot = avatarColor(company);

  return (
    <span
      data-testid="company-logo"
      data-domain={domain ?? ""}
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold select-none ${className}`}
      style={{
        width: px,
        height: px,
        fontSize: Math.round(px * 0.42),
        background: showImage ? "white" : `var(--avatar-${slot}-bg)`,
        color: `var(--avatar-${slot}-fg)`,
      }}
    >
      {showImage ? (
        // The CDN already resizes, so next/image's optimizer would only add a hop.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" width={px} height={px} loading="lazy" decoding="async" className="size-full object-contain" onError={() => setFailedSrc(src)} />
      ) : (
        initials(company)
      )}
    </span>
  );
}
