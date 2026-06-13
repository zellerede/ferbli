# Ferbli

Monorepo for a **German 32-card** table game: shared **TypeScript** rules, **authoritative WebSocket server**, **Vite + React** web client, and **Capacitor** config for Android.

## Prerequisites

- **Node.js 20+** and **npm 7+** (Node 20 ships with npm 10). Monorepo scripts use `npm run … --workspace=…`, which needs npm 7+. Local packages are linked with `file:` paths so `npm install` works even when `workspace:*` fails on some setups.
- Run **`npm install` from the repository root** (the folder that contains this `README.md`). Running install only inside `apps/web` or `packages/*` skips the workspace root and often breaks dependency resolution.
- Alternatively use **pnpm** if you restore `pnpm-workspace.yaml` and adjust scripts.

## Quick start

```bash
npm install
./scripts/fetch-cards-sprite.sh   # optional: saves apps/web/public/cards.webp
npm run dev
```

- Web UI: [http://127.0.0.1:5173](http://127.0.0.1:5173) (proxies `ws://127.0.0.1:5173/ws` → game server).
- API / health: [http://127.0.0.1:3333/health](http://127.0.0.1:3333/health).

Production-style preview (no Vite proxy): build the web app, then run the server and open the static build with an explicit WebSocket URL:

```bash
npm run build
npm run start --workspace=@ferbli/server
# serve apps/web/dist with any static server, or:
npx --yes serve apps/web/dist -p 4173
```

Build the web bundle with `VITE_WS_URL` pointing at your server, e.g. `ws://127.0.0.1:3333/ws`.

## Rules (Milestone 1)

- **Deck**: 32 cards — suits *hearts, bells, leaves, acorns*; ranks *ace, king, ober, unter, 10, 9, 8, 7*.
- **Points**: VII–X = face value; **ace** = 11; **king, ober, unter** = 10 each.
- **Hand score**: best sum from **2, 3, or 4 cards of the same suit** (take the best of those subset sizes per suit, then the maximum across suits). If no suit has at least two cards, the score is **0**.
- **Example**: Herz ace + Herz king + Herz nine + Schelle seven → best Herz triple is ace + king + nine = 11 + 10 + 9 = **30**.
- **Table**: up to **6 seats** (humans and/or bots). **Dealer** rotates among seated players with coins. **Blind** is the next seat after the dealer in cyclic seat order among players in the hand; the blind **always pays 1 coin** and stays in.
- **Ante round**: everyone is dealt **4 cards** (2 face-up, 2 face-down). Non-blind players, in turn, **fold** (free) or **enter** (pay **1 coin**). Then all cards are shown and the best score among players still **in the round** wins the **pot**.
- **Ties**: the pot is split evenly; any **remainder coins** go to the **lowest seat number** among tied winners first.

## Layout

| Path | Role |
|------|------|
| [packages/protocol](packages/protocol) | Wire types and `RoomSnapshot` |
| [packages/rules](packages/rules) | Deck, shuffle, scoring, random legal bot ante |
| [apps/server](apps/server) | Fastify + WebSocket rooms |
| [apps/web](apps/web) | Lobby, seats, table UI, card sprites |
| [apps/mobile](apps/mobile) | Capacitor wrapper (`webDir` → `apps/web/dist`) |

## Android (Capacitor)

From the repo root after a web build:

```bash
cd apps/mobile
npm install
npx cap add android    # once, creates apps/mobile/android
npm run build          # builds web + cap sync
npx cap open android
```

On a device or emulator, set **`VITE_WS_URL`** when building the web app so the client can reach your machine’s IP, e.g. `ws://192.168.1.10:3333/ws`, and run the game server on `0.0.0.0:3333`.

## Card sprite

The UI expects **`apps/web/public/cards.webp`**: an **8×4** grid (columns = ranks ace→seven, rows = hearts→acorns). Run `./scripts/fetch-cards-sprite.sh` or supply your own image with the same layout.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Builds protocol/rules packages, then runs server + Vite dev together |
| `npm run build` | Builds protocol → rules → server → web in order |
| `npm run build --workspace=@ferbli/mobile` | After `cap add android`: rebuild web + `cap sync` into `android/` |
| `npm run typecheck` | Typecheck workspaces that define the script |
