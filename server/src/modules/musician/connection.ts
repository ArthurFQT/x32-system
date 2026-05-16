import { Server, Socket } from "socket.io";
import { ADMIN_API_KEY, tokenRoom } from "../../config/constants";
import { TokenService } from "../token/service";
import { logAction } from "../../shared/logger";

export function setupMusicianAuth(io: Server) {
  io.use((socket, next) => {
    const auth = (socket.handshake.auth ?? {}) as {
      role?: string;
      token?: string;
      bridgeSecret?: string;
      bridgeName?: string;
    };

    if (auth.role !== "musician") {
      return next();
    }

    const tokenId = typeof auth.token === "string" ? auth.token.trim() : "";
    if (!tokenId) {
      logAction("SOCKET_AUTH_FAILED", {
        role: "musician",
        reason: "TOKEN_MISSING",
        socketId: socket.id,
      });
      next(new Error("TOKEN_MISSING"));
      return;
    }

    const validation = TokenService.validateTokenNow(tokenId);
    if (!validation.ok) {
      logAction("SOCKET_AUTH_FAILED", {
        role: "musician",
        reason: validation.error,
        token: tokenId,
        socketId: socket.id,
      });
      next(new Error(validation.error));
      return;
    }

    socket.data.role = "musician";
    socket.data.tokenId = tokenId;
    socket.data.user = validation.token.user;
    next();
  });
}

export function blockTokenSession(
  io: Server,
  token: string,
  reason: "revoked" | "expired",
): void {
  io.to(tokenRoom(token)).emit("session:blocked", { reason });

  const socketsInRoom = io.sockets.adapter.rooms.get(tokenRoom(token));
  if (!socketsInRoom) {
    return;
  }

  for (const socketId of socketsInRoom) {
    const socket = io.sockets.sockets.get(socketId);
    socket?.disconnect(true);
  }
}

export function connectedMusicianCount(io: Server): number {
  let count = 0;

  for (const socket of io.sockets.sockets.values()) {
    if (socket.data.role === "musician") {
      count += 1;
    }
  }

  return count;
}
