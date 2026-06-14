import { useState } from "react";
import { validateNickname, type PlayerSession } from "./player-session.js";

type GuestReserveResult =
  | { ok: true; displayName: string }
  | { ok: false; message: string };

type Props = {
  /** When set, used as initial input (e.g. last guest name). */
  initialNickname: string;
  /** True once the WebSocket has received `welcome`. */
  socketReady: boolean;
  reserveGuestDisplayName: (raw: string) => Promise<GuestReserveResult>;
  onGuestContinue: (session: PlayerSession) => void;
};

export function LoginScreen({
  initialNickname,
  socketReady,
  reserveGuestDisplayName,
  onGuestContinue,
}: Props) {
  const [nickname, setNickname] = useState(initialNickname);
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submitGuest = async () => {
    const err = validateNickname(nickname);
    if (err) {
      setLocalError(err);
      return;
    }
    if (!socketReady) {
      setLocalError("Still connecting to the server…");
      return;
    }
    setBusy(true);
    setLocalError(null);
    const r = await reserveGuestDisplayName(nickname);
    setBusy(false);
    if (!r.ok) {
      setLocalError(r.message);
      return;
    }
    onGuestContinue({
      kind: "guest",
      displayName: r.displayName,
    });
  };

  return (
    <div className="app">
      <h1>Ferbli</h1>
      <p className="muted">
        Sign in to play. Guest nicknames are stored on this device only; later
        you can link a Google account (e.g. from the Android app). You cannot
        enter the lobby until the server accepts your guest nickname (unique
        among connected players, case-insensitive).
      </p>

      <div className="panel login-panel">
        <h2 className="login-panel-title">Continue as guest</h2>
        <p className="muted login-panel-lead">
          Choose a nickname that other players will see at the table. Duplicates
          such as <code>alex</code> and <code>Alex</code> count as the same name.
        </p>
        <div className="row login-nickname-row">
          <label className="login-nickname-label">
            Nickname
            <input
              className="login-nickname-input"
              autoComplete="username"
              maxLength={40}
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                setLocalError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitGuest();
              }}
              placeholder="e.g. calm-otter"
              disabled={busy}
            />
          </label>
        </div>
        {localError ? <p className="error login-error">{localError}</p> : null}
        <div className="row" style={{ marginTop: "0.75rem" }}>
          <button type="button" onClick={() => void submitGuest()} disabled={busy || !socketReady}>
            {socketReady ? "Continue to lobby" : "Connecting…"}
          </button>
        </div>
      </div>

      <div className="panel login-panel login-panel-secondary">
        <h2 className="login-panel-title">Google</h2>
        <p className="muted login-panel-lead">
          Sign in with Google will connect your progress across devices. Not
          wired up on the web build yet.
        </p>
        <button type="button" className="login-google-placeholder" disabled>
          Sign in with Google (coming soon)
        </button>
      </div>
    </div>
  );
}
