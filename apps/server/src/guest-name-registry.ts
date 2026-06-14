import {
  guestDisplayNameUniquenessKey,
  normalizeGuestDisplayName,
  validateGuestDisplayName,
} from "@ferbli/protocol";

/**
 * Guest display names unique among live WebSocket connections
 * (case- and compatibility-normalized).
 */
export class GuestNameRegistry {
  private readonly keyToConnection = new Map<string, string>();
  private readonly connectionToKey = new Map<string, string>();

  /** Returns an error message, or null on success. */
  claim(connectionId: string, rawDisplayName: string): string | null {
    const err = validateGuestDisplayName(rawDisplayName);
    if (err) return err;

    const display = normalizeGuestDisplayName(rawDisplayName);
    const key = guestDisplayNameUniquenessKey(display);

    const holder = this.keyToConnection.get(key);
    if (holder && holder !== connectionId) {
      return "That nickname is already in use (guest names must be unique).";
    }

    const prevKey = this.connectionToKey.get(connectionId);
    if (prevKey === key) {
      return null;
    }

    if (prevKey !== undefined) {
      this.keyToConnection.delete(prevKey);
    }
    this.keyToConnection.set(key, connectionId);
    this.connectionToKey.set(connectionId, key);
    return null;
  }

  release(connectionId: string): void {
    const key = this.connectionToKey.get(connectionId);
    if (key === undefined) return;
    this.keyToConnection.delete(key);
    this.connectionToKey.delete(connectionId);
  }
}
