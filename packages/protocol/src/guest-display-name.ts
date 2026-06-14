/** Canonical form for storage and display (trim, collapse spaces, max length). */
export function normalizeGuestDisplayName(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 32);
}

/** Returns a user-visible error message, or null if OK. */
export function validateGuestDisplayName(raw: string): string | null {
  const name = normalizeGuestDisplayName(raw);
  if (name.length < 2) {
    return "Use at least 2 characters (letters, numbers, or spaces).";
  }
  if (name.length > 32) {
    return "Nickname is too long.";
  }
  if (!/^[\p{L}\p{N}][\p{L}\p{N} \-']*$/u.test(name)) {
    return "Start with a letter or number; you may use spaces, hyphens, and apostrophes.";
  }
  return null;
}

/** Key used for uniqueness (case- and compatibility-insensitive). */
export function guestDisplayNameUniquenessKey(
  canonicalDisplayName: string,
): string {
  return canonicalDisplayName.normalize("NFKC").toLowerCase();
}
