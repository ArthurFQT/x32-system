import { Server, Socket } from "socket.io";
import { BRIDGE_ROOM } from "../../config/constants";
import { logAction } from "../../shared/logger";
import { BRIDGE_SECRET } from "../../config/constants";

export function setupBridgeHandlers(io: Server) {
  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as {
      role?: string;
      token?: string;
      bridgeSecret?: string;
      bridgeName?: string;
    };

    if (auth.role !== "bridge") {
      return next();
    }

    if (BRIDGE_SECRET && auth.bridgeSecret !== BRIDGE_SECRET) {
      logAction("SOCKET_AUTH_FAILED", {
        role: "bridge",
        reason: "BRIDGE_SECRET_INVALID",
        socketId: socket.id,
      });
      next(new Error("BRIDGE_SECRET_INVALID"));
      return;
    }

    socket.data.role = "bridge";
    socket.data.bridgeName = auth.bridgeName ?? "bridge-local";
    next();
  });

  io.on("connection", (socket) => {
    if (socket.data.role !== "bridge") {
      return;
    }

    socket.join(BRIDGE_ROOM);
    broadcastBridgeStatus(io);

    socket.on("disconnect", () => {
      broadcastBridgeStatus(io);
    });
  });
}

export function broadcastBridgeStatus(io: Server): void {
  const count = io.sockets.adapter.rooms.get(BRIDGE_ROOM)?.size ?? 0;
  io.emit("bridge:status", { connected: count > 0 });
}
