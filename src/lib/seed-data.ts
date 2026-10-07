import type { ApplicationStatus } from "@/lib/status";

/** Small seeded random number generator, so the demo data is the same on every run. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randInt(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

const FUNNEL: ApplicationStatus[] = ["SAVED", "APPLIED", "INTERVIEW", "OFFER"];

/** A believable sequence of statuses that ends at `final`, starting from SAVED. */
export function statusPath(final: ApplicationStatus, rng: () => number): ApplicationStatus[] {
  const funnelIndex = FUNNEL.indexOf(final);
  if (funnelIndex >= 0) return FUNNEL.slice(0, funnelIndex + 1);
  // Rejections come after applying; withdrawals can happen at any stage before an offer.
  const lastStage = final === "REJECTED" ? randInt(rng, 1, 2) : randInt(rng, 0, 2);
  return [...FUNNEL.slice(0, lastStage + 1), final];
}
