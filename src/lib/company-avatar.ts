const FIRST_LETTER = /[\p{L}\p{N}]/u;

/** Up to two letters for the fallback avatar: "Acme Corp" → "AC", "stripe" → "S". */
export function initials(company: string): string {
  const letters: string[] = [];
  for (const word of company.trim().split(/\s+/)) {
    const letter = word.match(FIRST_LETTER)?.[0];
    if (letter) letters.push(letter.toUpperCase());
    if (letters.length === 2) break;
  }
  return letters.join("") || "?";
}

export const AVATAR_COLORS = 8;

/** A stable 1-8 color slot for a company name (FNV-1a), so the same company always gets the same color. */
export function avatarColor(company: string): number {
  let hash = 0x811c9dc5;
  for (const char of company.trim().toLowerCase()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return ((hash >>> 0) % AVATAR_COLORS) + 1;
}
