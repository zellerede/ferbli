import {
  normalizeGuestDisplayName,
  validateGuestDisplayName,
} from "@ferbli/protocol";

const STORAGE_KEY = "ferbli.playerSession";
const SCHEMA_VERSION = 1;

export type GuestPlayerSession = {
  kind: "guest";
  displayName: string;
};

export type PlayerSession = GuestPlayerSession;

export const normalizeNickname = normalizeGuestDisplayName;
export const validateNickname = validateGuestDisplayName;

function safeParse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function loadPlayerSession(): PlayerSession | null {
  const data = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  if (o.v !== SCHEMA_VERSION || o.kind !== "guest") return null;
  if (typeof o.displayName !== "string") return null;
  const err = validateGuestDisplayName(o.displayName);
  if (err) return null;
  return {
    kind: "guest",
    displayName: normalizeGuestDisplayName(o.displayName),
  };
}

export function saveGuestSession(displayName: string): void {
  const name = normalizeGuestDisplayName(displayName);
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      v: SCHEMA_VERSION,
      kind: "guest",
      displayName: name,
    }),
  );
}

export function clearPlayerSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Prefill the login field when there is no valid saved session (e.g. invalid or old data). */
export function getNicknameDraftForForm(): string {
  const data = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!data || typeof data !== "object") return "";
  const o = data as Record<string, unknown>;
  return typeof o.displayName === "string" ? o.displayName : "";
}
