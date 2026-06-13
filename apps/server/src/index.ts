import { randomBytes, randomInt, randomUUID } from "node:crypto";
import Fastify from "fastify";
import websocket from "@fastify/websocket";
import type { ClientMessage, LobbyRoomSummary } from "@ferbli/protocol";
import type { SendFn } from "./room.js";
import { Room } from "./room.js";
import { randomRoomSlug } from "./room-names.js";

type WsRawMessage = string | Buffer | ArrayBuffer | Buffer[];

const rooms = new Map<string, Room>();

function allocateNewRoomCode(): string {
  for (let i = 0; i < 120; i++) {
    const code = randomRoomSlug();
    if (!rooms.has(code)) return code;
  }
  for (let i = 0; i < 40; i++) {
    const code = `${randomRoomSlug()}-${randomInt(100, 999)}`;
    if (!rooms.has(code)) return code;
  }
  return `table_${randomBytes(4).toString("hex")}`;
}

function normalizeCode(code: string): string {
  return code
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_+/g, "-")
    .replace(/-+/g, "-");
}

function buildLobbySummaries(): LobbyRoomSummary[] {
  const out: LobbyRoomSummary[] = [];
  for (const [code, r] of rooms) {
    out.push({
      roomCode: code,
      humanNames: r.humanSeatDisplayNames(),
    });
  }
  out.sort((a, b) => a.roomCode.localeCompare(b.roomCode));
  return out;
}

export async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(websocket);

  app.get("/health", async () => ({ ok: true }));

  app.get("/ws", { websocket: true }, (socket, request) => {
    const connectionId = randomUUID();
    let room: Room | null = null;
    const log = request.log;

    const send: SendFn = (msg) => {
      try {
        socket.send(String(msg));
      } catch {
        /* socket may be closing */
      }
    };

    send(JSON.stringify({ type: "welcome", connectionId }));

    socket.on("message", (raw: WsRawMessage) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(String(raw)) as ClientMessage;
      } catch {
        send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
        return;
      }

      if (!msg || typeof msg !== "object" || !("type" in msg)) {
        send(JSON.stringify({ type: "error", message: "Invalid message" }));
        return;
      }

      if (msg.type !== "hello") {
        log.info({ wsIn: msg.type, connectionId });
      }

      if (msg.type === "hello") {
        return;
      }

      if (msg.type === "list_rooms") {
        send(JSON.stringify({ type: "room_list", rooms: buildLobbySummaries() }));
        return;
      }

      if (msg.type === "create_room") {
        if (room) {
          room.removeConnection(connectionId);
          if (room.connections.size === 0) {
            rooms.delete(room.code);
          } else {
            room.broadcast();
          }
        }
        const code = allocateNewRoomCode();
        const r = new Room(code, connectionId);
        rooms.set(code, r);
        room = r;
        r.addConnection(connectionId, send);
        const seatErr = r.claimSeat(connectionId, 0, msg.displayName);
        if (seatErr) {
          log.warn({ seatErr, connectionId }, "host auto-seat at 1 failed");
        }
        r.broadcast();
        return;
      }

      if (msg.type === "join_room") {
        const code = normalizeCode(msg.roomCode);
        const r = rooms.get(code);
        if (!r) {
          send(JSON.stringify({ type: "error", message: "Room not found" }));
          return;
        }
        if (room && room !== r) {
          room.removeConnection(connectionId);
          if (room.connections.size === 0) {
            rooms.delete(room.code);
          } else {
            room.broadcast();
          }
        }
        room = r;
        r.addConnection(connectionId, send);
        r.broadcast();
        return;
      }

      if (msg.type === "leave_room") {
        if (!room) return;
        room.removeConnection(connectionId);
        if (room.connections.size === 0) {
          rooms.delete(room.code);
        } else {
          room.broadcast();
        }
        room = null;
        return;
      }

      if (!room) {
        send(JSON.stringify({ type: "error", message: "Join a room first" }));
        return;
      }

      const err = room.handleMessage(connectionId, msg);
      if (err) {
        send(JSON.stringify({ type: "error", message: err }));
        return;
      }
    });

    socket.on("close", () => {
      if (!room) return;
      room.removeConnection(connectionId);
      if (room.connections.size === 0) {
        rooms.delete(room.code);
      } else {
        room.broadcast();
      }
      room = null;
    });
  });

  return app;
}

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildServer();
await app.listen({ port, host });
console.log(`ferbli server listening on http://${host}:${port}`);
